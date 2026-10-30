import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readPublicCatalog } from '../server/catalog-data.js';

interface ApiRequest { method?: string; }
interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ message: 'Método no permitido.' });
    return;
  }
  try {
    const db = getDatabase();
    const catalog = await readPublicCatalog(db);
    res.status(200).json(catalog);
  } catch (error) {
    console.error('Public catalog synchronization failed:', error);
    res.status(503).json({ message: 'El catálogo no está disponible temporalmente.' });
  }
}

function getDatabase() {
  const raw = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
  if (!raw) throw new Error('Missing Firebase service account configuration');
  const account = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string };
  if (account.project_id !== 'starkies' || !account.client_email || !account.private_key) {
    throw new Error('Invalid Firebase service account configuration');
  }
  const appName = 'starkies-public-catalog';
  const app = getApps().find(candidate => candidate.name === appName) ?? initializeApp({
    credential: cert({
      projectId: account.project_id,
      clientEmail: account.client_email,
      privateKey: account.private_key.replace(/\\n/g, '\n'),
    }),
  }, appName);
  return getFirestore(app);
}
