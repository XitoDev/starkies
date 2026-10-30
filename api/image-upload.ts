import { randomUUID } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

type HeaderValue = string | string[] | undefined;
interface ApiRequest { method?: string; headers: Record<string, HeaderValue>; body?: unknown; }
interface ApiResponse { status(code: number): ApiResponse; setHeader(name: string, value: string): void; json(body: unknown): void; }
type UploadKind = 'recipe' | 'catalog' | 'promotion';
const REPO = 'XitoDev/starkies';
const BRANCH = 'main';
const MAX_BYTES = 3 * 1024 * 1024;
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
    const token = first(req.headers['authorization'])?.replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'Inicia sesión para subir imágenes.');
    const { db, auth } = getFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const adminDoc = await db.doc('adminUsers/' + decoded.uid).get();
    if (!adminDoc.exists) throw new HttpError(403, 'Tu cuenta no tiene permisos de administración.');

    const body = asRecord(req.body);
    const kind = body['kind'] as UploadKind;
    const recordId = stringValue(body['recordId']);
    const contentType = stringValue(body['contentType']);
    const base64 = stringValue(body['imageBase64']);
    if (!['recipe', 'catalog', 'promotion'].includes(kind) || !/^[a-zA-Z0-9_-]{1,100}$/.test(recordId)) {
      throw new HttpError(400, 'Datos de imagen no válidos.');
    }
    const extension = contentType === 'image/jpeg' ? 'jpg'
      : contentType === 'image/png' ? 'png'
      : contentType === 'image/webp' ? 'webp' : '';
    if (!extension || !base64 || !/^[A-Za-z0-9+/]+=*$/.test(base64)) {
      throw new HttpError(400, 'Usa una imagen JPG, PNG o WebP válida.');
    }
    const bytes = Buffer.from(base64, 'base64');
    if (!bytes.length || bytes.length > MAX_BYTES) {
      throw new HttpError(413, 'La imagen debe pesar 3 MB o menos.');
    }
    if (!process.env['GITHUB_IMAGE_UPLOAD_TOKEN']) {
      throw new HttpError(503, 'Falta configurar GITHUB_IMAGE_UPLOAD_TOKEN en Vercel para publicar imágenes en el CDN.');
    }

    const prefix = kind === 'recipe' ? 'recipe' : kind === 'catalog' ? 'catalog' : 'promotion';
    const fileName = `${prefix}-${recordId}-${randomUUID()}.${extension}`;
    const filePath = 'public/images/' + fileName;
    const imageCommit = await githubJson(
      `https://api.github.com/repos/${REPO}/contents/${filePath}`,
      'PUT',
      { message: `feat(${kind === 'recipe' ? 'recipes' : 'catalog'}): add ${kind} image for ${recordId}`, content: bytes.toString('base64'), branch: BRANCH },
    );
    const commitSha = stringValue(asRecord(imageCommit['commit'])['sha']);
    if (!/^[a-f0-9]{40}$/i.test(commitSha)) throw new Error('GitHub no devolvió el commit de la imagen.');

    const imageUrl = `https://cdn.jsdelivr.net/gh/${REPO}@${commitSha}/public/images/${fileName}`;
    await updateImageMap({ key: `${kind}:${recordId}`, fileName, imageUrl, commitSha, contentType, size: bytes.length });
    res.status(200).json({ imageUrl, fileName, commitSha });
  } catch (error) {
    const status = error instanceof HttpError ? error.statusCode : 500;
    if (status === 500) console.error('CDN image upload failed:', error);
    res.status(status).json({ message: error instanceof Error ? error.message : 'No se pudo publicar la imagen en el CDN.' });
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
  const appName = 'starkies-cdn-image-upload';
  const app = getApps().find(candidate => candidate.name === appName) ?? initializeApp({
    credential: cert({ projectId: account.project_id, clientEmail: account.client_email, privateKey: account.private_key.replace(/\\n/g, '\n') }),
  }, appName);
  return { auth: getAuth(app), db: getFirestore(app) };
}

async function githubJson(url: string, method: 'GET' | 'PUT', body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env['GITHUB_IMAGE_UPLOAD_TOKEN']}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const detail = stringValue(data['message']);
    if (response.status === 401 || response.status === 403) throw new HttpError(503, 'GitHub rechazó la publicación. Verifica que GITHUB_IMAGE_UPLOAD_TOKEN tenga permiso Contents: Read and write.');
    if (response.status === 409 || response.status === 422) throw new HttpError(409, 'El repositorio cambió mientras se publicaba la imagen. Inténtalo nuevamente.');
    throw new Error(`GitHub API respondió ${response.status}: ${detail}`);
  }
  return data;
}

async function updateImageMap(entry: Record<string, unknown>): Promise<void> {
  const path = 'public/images/image-map.json';
  let existing: Record<string, unknown> = { version: 1, images: {} };
  let sha: string | undefined;
  try {
    const file = await githubJson(`https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`, 'GET');
    sha = stringValue(file['sha']) || undefined;
    const encoded = stringValue(file['content']).replace(/\s/g, '');
    if (encoded) existing = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch (error) {
    if (!(error instanceof HttpError) && !(error instanceof Error && error.message.includes('404'))) throw error;
  }
  const images = asRecord(existing['images']);
  const key = stringValue(entry['key']);
  delete entry['key'];
  images[key] = entry;
  const content = Buffer.from(JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), images }, null, 2) + '\n').toString('base64');
  await githubJson(`https://api.github.com/repos/${REPO}/contents/${path}`, 'PUT', {
    message: `feat(${key.startsWith('recipe:') ? 'recipes' : 'catalog'}): update CDN image map for ${key}`, content, branch: BRANCH, ...(sha ? { sha } : {}),
  });
}
