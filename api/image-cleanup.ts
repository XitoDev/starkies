import { timingSafeEqual } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { deleteR2Object } from '../scripts/lib/r2-storage.mjs';

interface ApiRequest { method?: string; headers: Record<string, string | string[] | undefined>; }
interface ApiResponse { status(code: number): ApiResponse; setHeader(name: string, value: string): void; json(body: unknown): void; }

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ message: 'Método no permitido.' });
    return;
  }
  try {
    const secret = String(process.env['CRON_SECRET'] ?? '');
    const authorization = first(req.headers['authorization']) ?? '';
    const supplied = authorization.replace(/^Bearer\s+/i, '');
    if (!secret || !safeEqual(supplied, secret)) {
      res.status(401).json({ message: 'No autorizado.' });
      return;
    }
    const db = getFirebaseAdmin();
    const candidates = await db.collection('imageAssets').where('refCount', '==', 0).limit(100).get();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let deleted = 0;
    let deferred = 0;
    for (const candidate of candidates.docs) {
      const data = candidate.data();
      const createdAt = Date.parse(String(data['createdAt'] ?? data['deleteRequestedAt'] ?? ''));
      const isDeleting = data['status'] === 'deleting';
      if (!isDeleting && (!Number.isFinite(createdAt) || createdAt > cutoff)) continue;
      const key = String(data['key'] ?? '');
      if (!/^images\/[a-f0-9]{64}\.webp$/.test(key)) { deferred++; continue; }
      const shouldDelete = await db.runTransaction(async transaction => {
        const latest = await transaction.get(candidate.ref);
        const latestData = latest.data() ?? {};
        const references = Array.isArray(latestData['references']) ? latestData['references'] : [];
        if (!latest.exists || Number(latestData['refCount'] ?? 0) !== 0 || references.length !== 0) return false;
        if (latestData['status'] !== 'deleting') {
          transaction.update(candidate.ref, { status: 'deleting', deleteRequestedAt: new Date().toISOString() });
        }
        return true;
      });
      if (!shouldDelete) continue;
      try {
        await deleteR2Object(key);
        await db.runTransaction(async transaction => {
          const latest = await transaction.get(candidate.ref);
          const latestData = latest.data() ?? {};
          const references = Array.isArray(latestData['references']) ? latestData['references'] : [];
          if (latest.exists && latestData['status'] === 'deleting' && Number(latestData['refCount'] ?? 0) === 0 && references.length === 0) {
            transaction.delete(candidate.ref);
          }
        });
        deleted++;
      } catch (error) {
        deferred++;
        console.error('Could not remove orphaned R2 image ' + candidate.id + ':', error);
      }
    }
    res.status(200).json({ success: true, scanned: candidates.size, deleted, deferred });
  } catch (error) {
    console.error('R2 orphan cleanup failed:', error);
    res.status(500).json({ message: 'No se pudo completar la limpieza de imágenes sin referencias.' });
  }
}

function first(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] ?? '' : value ?? ''; }
function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function getFirebaseAdmin() {
  const raw = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
  if (!raw) throw new Error('Falta configurar la cuenta de servicio de Firebase en Vercel.');
  const account = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string };
  if (account.project_id !== 'starkies' || !account.client_email || !account.private_key) throw new Error('La cuenta de servicio de Firebase no es válida.');
  const appName = 'starkies-r2-image-service';
  const app = getApps().find(candidate => candidate.name === appName) ?? initializeApp({
    credential: cert({ projectId: account.project_id, clientEmail: account.client_email, privateKey: account.private_key.replace(/\\n/g, '\n') }),
  }, appName);
  return getFirestore(app);
}
