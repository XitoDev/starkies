import { randomUUID } from 'node:crypto';
import { fetchLegacyImage } from '../scripts/lib/legacy-image-source.mjs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
  getR2Config,
  imageObjectKey,
  imagePublicUrl,
  isWebpBuffer,
  putR2Object,
  deleteR2Object,
  sha256Hex,
} from '../scripts/lib/r2-storage.mjs';

type HeaderValue = string | string[] | undefined;
interface ApiRequest { method?: string; headers: Record<string, HeaderValue>; body?: unknown; }
interface ApiResponse { status(code: number): ApiResponse; setHeader(name: string, value: string): void; json(body: unknown): void; }
type UploadKind = 'product' | 'promotion';
const MAX_WEBP_BYTES = 3 * 1024 * 1024;
const ALLOWED_ORIGINS = new Set(['https://starkies.vercel.app', 'https://admin.starkies.lat']);

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ message: 'Método no permitido.' });
    return;
  }
  try {
    const origin = first(req.headers['origin']);
    if (!origin || !ALLOWED_ORIGINS.has(origin)) throw new HttpError(403, 'Origen no autorizado.');
    const { db, auth } = getFirebaseAdmin();
    await authenticateAdmin(req, auth, db);

    const body = asRecord(req.body);
    if (body['action'] === 'connection-check') {
      await verifyR2Connection();
      res.status(200).json({ success: true, write: true, read: true, delete: true, message: 'Conexión con Cloudflare R2 verificada: escritura privada, lectura pública mediante images.starkies.lat y eliminación correctas.' });
      return;
    }
    if (body['action'] === 'fetch-legacy-source') {
      const image = await fetchLegacyImage(stringValue(body['sourceUrl']));
      res.status(200).json({ contentType: image.contentType, imageBase64: image.bytes.toString('base64') });
      return;
    }
    const kind = body['kind'] as UploadKind;
    const recordId = stringValue(body['recordId']);
    const contentType = stringValue(body['contentType']);
    const base64 = stringValue(body['imageBase64']);
    if (!['product', 'promotion'].includes(kind) || !/^[a-zA-Z0-9_-]{1,100}$/.test(recordId)) {
      throw new HttpError(400, 'Datos de imagen no válidos.');
    }
    if (contentType !== 'image/webp' || !base64 || !/^[A-Za-z0-9+/]+=*$/.test(base64)) {
      throw new HttpError(400, 'La imagen debe estar convertida a WebP antes de publicarse.');
    }
    const bytes = Buffer.from(base64, 'base64');
    if (!bytes.length || bytes.length > MAX_WEBP_BYTES) {
      throw new HttpError(413, 'La imagen WebP debe pesar 3 MB o menos.');
    }
    if (!isWebpBuffer(bytes)) throw new HttpError(400, 'El contenido recibido no es una imagen WebP válida.');

    const config = getR2Config();
    const hash = sha256Hex(bytes);
    const key = imageObjectKey(hash);
    const imageUrl = imagePublicUrl(config.publicBaseUrl, key);
    const assetRef = db.collection('imageAssets').doc(hash);
    const existing = await assetRef.get();
    if (existing.exists) {
      const current = existing.data() ?? {};
      if (current['status'] === 'deleting') {
        throw new HttpError(409, 'Esta imagen está terminando una eliminación segura. Vuelve a intentarlo en unos segundos.');
      }
      res.status(200).json({ imageUrl: stringValue(current['url']) || imageUrl, sha256: hash, format: 'webp', reused: true });
      return;
    }

    await putR2Object(key, bytes, 'image/webp');
    await db.runTransaction(async transaction => {
      const latest = await transaction.get(assetRef);
      if (latest.exists) {
        if (latest.data()?.['status'] === 'deleting') {
          throw new HttpError(409, 'Esta imagen está terminando una eliminación segura. Vuelve a intentarlo en unos segundos.');
        }
        return;
      }
      const now = new Date().toISOString();
      transaction.create(assetRef, {
        sha256: hash,
        key,
        url: imageUrl,
        format: 'webp',
        contentType: 'image/webp',
        size: bytes.length,
        references: [],
        refCount: 0,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        uploadedFor: kind + ':' + recordId,
      });
    });

    res.status(200).json({ imageUrl, sha256: hash, format: 'webp', reused: false });
  } catch (error) {
    const status = error instanceof HttpError ? error.statusCode : 500;
    if (status === 500) console.error('Image upload endpoint failed:', error);
    res.status(status).json({ message: error instanceof Error ? error.message : 'No se pudo publicar la imagen en Cloudflare R2.' });
  }
}

async function verifyR2Connection(): Promise<void> {
  const config = getR2Config();
  const key = 'healthchecks/' + randomUUID() + '.txt';
  const payload = Buffer.from('StarKies R2 connection check');
  let uploaded = false;
  let verificationError: unknown;

  try {
    await putR2Object(key, payload, 'text/plain');
    uploaded = true;

    const publicUrl = imagePublicUrl(config.publicBaseUrl, key);
    const response = await fetch(publicUrl, { headers: { 'Cache-Control': 'no-cache' } });
    if (!response.ok) {
      throw new Error(
        'R2 aceptó la escritura, pero el dominio público respondió HTTP ' + response.status
        + '. Revisa que el acceso público del bucket y el dominio images.starkies.lat estén habilitados.'
      );
    }

    const downloaded = Buffer.from(await response.arrayBuffer());
    if (!downloaded.equals(payload)) {
      throw new Error('R2 permitió leer el objeto, pero el contenido recibido no coincide con el archivo de prueba.');
    }
  } catch (error) {
    verificationError = error;
  }

  if (uploaded) {
    try {
      await deleteR2Object(key);
    } catch (error) {
      console.error('R2 connection check could not remove its temporary object:', error);
      throw new Error(
        'La prueba creó el objeto temporal, pero no pudo eliminarlo: '
        + (error instanceof Error ? error.message : 'error desconocido')
      );
    }
  }

  if (verificationError) throw verificationError;
}

class HttpError extends Error { constructor(readonly statusCode: number, message: string) { super(message); } }
function first(value: HeaderValue): string | undefined { return Array.isArray(value) ? value[0] : value; }
function asRecord(value: unknown): Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringValue(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }

function getFirebaseAdmin() {
  const raw = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
  if (!raw) throw new HttpError(503, 'Falta configurar la cuenta de servicio de Firebase en Vercel.');
  const account = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string };
  if (account.project_id !== 'starkies' || !account.client_email || !account.private_key) throw new HttpError(503, 'La cuenta de servicio de Firebase no es válida.');
  const appName = 'starkies-r2-image-service';
  const app = getApps().find(candidate => candidate.name === appName) ?? initializeApp({
    credential: cert({ projectId: account.project_id, clientEmail: account.client_email, privateKey: account.private_key.replace(/\\n/g, '\n') }),
  }, appName);
  return { auth: getAuth(app), db: getFirestore(app) };
}

async function authenticateAdmin(req: ApiRequest, auth: ReturnType<typeof getAuth>, db: ReturnType<typeof getFirestore>) {
  const token = first(req.headers['authorization'])?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Inicia sesión para subir imágenes.');
  const decoded = await auth.verifyIdToken(token);
  const adminDoc = await db.doc('adminUsers/' + decoded.uid).get();
  if (!adminDoc.exists) throw new HttpError(403, 'Tu cuenta no tiene permisos de administración.');
  return decoded;
}
