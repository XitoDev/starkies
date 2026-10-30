import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { deleteR2Object, getR2Config, parseManagedImageUrl } from '../scripts/lib/r2-storage.mjs';

type HeaderValue = string | string[] | undefined;
interface ApiRequest { method?: string; headers: Record<string, HeaderValue>; body?: unknown; }
interface ApiResponse { status(code: number): ApiResponse; setHeader(name: string, value: string): void; json(body: unknown): void; }
type ImageKind = 'product' | 'promotion';
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
    const kind = body['kind'] as ImageKind;
    const recordId = stringValue(body['recordId']);
    const oldImageUrl = stringValue(body['oldImageUrl']);
    const newImageUrl = stringValue(body['newImageUrl']);
    if (!['product', 'promotion'].includes(kind) || !/^[a-zA-Z0-9_-]{1,100}$/.test(recordId)) {
      throw new HttpError(400, 'Datos de referencia de imagen no válidos.');
    }

    const config = getR2Config();
    const oldAsset = parseManagedImageUrl(oldImageUrl, config);
    const newAsset = parseManagedImageUrl(newImageUrl, config);
    const referenceKey = kind + ':' + recordId;
    if (!oldAsset && !newAsset) {
      res.status(200).json({ success: true, deleted: false, reason: 'No hay referencias R2 que sincronizar.' });
      return;
    }

    const oldRef = oldAsset ? db.collection('imageAssets').doc(oldAsset.hash) : null;
    const newRef = newAsset ? db.collection('imageAssets').doc(newAsset.hash) : null;
    let deleteCandidate: { hash: string; key: string } | null = null;

    await db.runTransaction(async transaction => {
      const oldSnapshot = oldRef ? await transaction.get(oldRef) : null;
      const newSnapshot = newRef
        ? (oldRef && newAsset?.hash === oldAsset?.hash ? oldSnapshot : await transaction.get(newRef))
        : null;

      if (newRef && (!newSnapshot || !newSnapshot.exists)) {
        throw new HttpError(409, 'La imagen nueva no existe en el índice de Cloudflare R2. No se eliminará la anterior.');
      }
      if (newSnapshot?.exists && newSnapshot.data()?.['status'] === 'deleting') {
        throw new HttpError(409, 'La imagen nueva está siendo eliminada. Vuelve a subirla e inténtalo nuevamente.');
      }

      if (oldRef && oldSnapshot?.exists && oldAsset?.hash !== newAsset?.hash) {
        const oldData = oldSnapshot.data() ?? {};
        const previous = Array.isArray(oldData['references']) ? oldData['references'].filter((value): value is string => typeof value === 'string') : [];
        const nextReferences = previous.filter(value => value !== referenceKey);
        transaction.update(oldRef, {
          references: nextReferences,
          refCount: nextReferences.length,
          status: nextReferences.length ? 'active' : 'deleting',
          updatedAt: new Date().toISOString(),
          ...(nextReferences.length ? {} : { deleteRequestedAt: new Date().toISOString() }),
        });
        if (!nextReferences.length) deleteCandidate = { hash: oldAsset!.hash, key: oldAsset!.key };
      }

      if (newRef && newSnapshot?.exists) {
        const newData = newSnapshot.data() ?? {};
        const current = Array.isArray(newData['references']) ? newData['references'].filter((value): value is string => typeof value === 'string') : [];
        const nextReferences = current.includes(referenceKey) ? current : [...current, referenceKey];
        transaction.update(newRef, {
          references: nextReferences,
          refCount: nextReferences.length,
          status: 'active',
          updatedAt: new Date().toISOString(),
          lastReferencedAt: new Date().toISOString(),
        });
      }
    });

    let deleted = false;
    let cleanupPending = false;
    if (deleteCandidate) {
      try {
        await deleteR2Object(deleteCandidate.key);
        await db.runTransaction(async transaction => {
          const ref = db.collection('imageAssets').doc(deleteCandidate!.hash);
          const snapshot = await transaction.get(ref);
          const data = snapshot.data() ?? {};
          const references = Array.isArray(data['references']) ? data['references'] : [];
          if (snapshot.exists && data['status'] === 'deleting' && Number(data['refCount'] ?? 0) === 0 && references.length === 0) {
            transaction.delete(ref);
            deleted = true;
          }
        });
      } catch (error) {
        cleanupPending = true;
        console.error('R2 image cleanup deferred:', error);
      }
    }

    res.status(200).json({ success: true, deleted, cleanupPending });
  } catch (error) {
    const status = error instanceof HttpError ? error.statusCode : 500;
    if (status === 500) console.error('R2 image reference sync failed:', error);
    res.status(status).json({ message: error instanceof Error ? error.message : 'No se pudieron sincronizar las referencias de la imagen.' });
  }
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
  const token = first(req.headers['authorization'])?.replace(/^Bearer\\s+/i, '');
  if (!token) throw new HttpError(401, 'Inicia sesión para administrar imágenes.');
  const decoded = await auth.verifyIdToken(token);
  const adminDoc = await db.doc('adminUsers/' + decoded.uid).get();
  if (!adminDoc.exists) throw new HttpError(403, 'Tu cuenta no tiene permisos de administración.');
}
