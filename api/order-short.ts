import { createHmac, timingSafeEqual } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

interface ApiRequest { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; }
interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  end(body?: Buffer | string): void;
  json(body: unknown): void;
}
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD'); res.status(405).json({ message: 'Método no permitido.' }); return;
  }
  try {
    const orderUrl = new URL(req.url ?? '/', 'https://starkies.lat');
    const orderId = orderUrl.searchParams.get('orderId') ?? '';
    if (!/^SK-\d{8}-[A-F0-9]{6}$/.test(orderId)) { res.status(404).end('No encontramos este pedido.'); return; }
    const snapshot = await getDatabase().doc(['businesses','starkies','collections','orders','records',orderId].join('/')).get();
    if (!snapshot.exists) { res.status(404).end('No encontramos este pedido.'); return; }
    const expiry = String(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const payload = orderId + '.' + expiry;
    const token = payload + '.' + createHmac('sha256', getSigningKey()).update(payload).digest('hex');
    res.setHeader('Location', '/api/order-document?token=' + encodeURIComponent(token));
    res.status(302).end();
  } catch (error) {
    console.error('Short order link failed:', error);
    res.status(500).json({ message: 'No pudimos abrir el PDF de este pedido.' });
  }
}
function getSigningKey(): string {
  const raw = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
  if (!raw) throw new Error('Missing Firebase service account configuration');
  const account = JSON.parse(raw) as { project_id?: string; private_key?: string };
  if (account.project_id !== 'starkies' || !account.private_key) throw new Error('Invalid Firebase service account configuration');
  return account.private_key;
}
function getDatabase() {
  const raw = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
  if (!raw) throw new Error('Missing Firebase service account configuration');
  const account = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string };
  if (account.project_id !== 'starkies' || !account.client_email || !account.private_key) throw new Error('Invalid Firebase service account configuration');
  const appName = 'starkies-short-order-links';
  const app = getApps().find(candidate => candidate.name === appName) ?? initializeApp({
    credential: cert({ projectId: account.project_id, clientEmail: account.client_email, privateKey: account.private_key.replace(/\\n/g, '\n') }),
  }, appName);
  return getFirestore(app);
}

function verifyToken(token: string, signingKey: string): { orderId: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [orderId, expiryRaw, suppliedSignature] = parts;
  if (!/^SK-\\d{8}-[A-F0-9]{6}$/.test(orderId) || !/^\\d{13}$/.test(expiryRaw) || !/^[a-f0-9]{64}$/.test(suppliedSignature)) return null;
  const expiry = Number(expiryRaw);
  if (!Number.isSafeInteger(expiry) || expiry <= Date.now() || expiry > Date.now() + 3 * 24 * 60 * 60 * 1000) return null;
  const expected = createHmac('sha256', signingKey).update(orderId + '.' + expiryRaw).digest();
  const supplied = Buffer.from(suppliedSignature, 'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  return { orderId };
}
