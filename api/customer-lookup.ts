import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';

interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}
interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}
interface CustomerRecord {
  id?: unknown;
  name?: unknown;
  phone?: unknown;
  address?: unknown;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Origin');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ message: 'Método no permitido.' });
    return;
  }

  try {
    assertAllowedOrigin(headerValue(req.headers['origin']));
    const body = isRecord(req.body) ? req.body : {};
    const phone = typeof body['phone'] === 'string' ? body['phone'].trim() : '';
    const normalized = normalizePhone(phone);
    if (normalized.length < 7 || normalized.length > 15) {
      res.status(400).json({ message: 'Ingresa un teléfono válido.' });
      return;
    }

    const snapshot = await getDatabase().collection('businesses/starkies/collections/customers/records').get();
    const match = snapshot.docs.find(doc => {
      const value = doc.data()['value'] as CustomerRecord | undefined;
      return value && normalizePhone(String(value.phone ?? '')) === normalized;
    });
    if (!match) {
      res.status(200).json({ found: false });
      return;
    }
    const value = match.data()['value'] as CustomerRecord;
    res.status(200).json({
      found: true,
      name: typeof value.name === 'string' ? value.name : '',
      address: typeof value.address === 'string' && value.address !== 'Retiro en tienda' ? value.address : '',
    });
  } catch (error) {
    console.error('Customer lookup failed:', error);
    res.status(500).json({ message: 'No pudimos consultar los datos guardados.' });
  }
}

function getDatabase() {
  const raw = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
  if (!raw) throw new Error('Missing Firebase service account configuration');
  const account = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string };
  if (account.project_id !== 'starkies' || !account.client_email || !account.private_key) throw new Error('Invalid Firebase service account configuration');
  const appName = 'starkies-public-customer-lookup';
  const app = getApps().find(candidate => candidate.name === appName) ?? initializeApp({
    credential: cert({ projectId: account.project_id, clientEmail: account.client_email, privateKey: account.private_key.replace(/\\n/g, '\n') }),
  }, appName);
  return getFirestore(app);
}
function normalizePhone(value: string): string { return value.replace(/\\D/g, '').replace(/^593/, '0'); }
function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function assertAllowedOrigin(origin: string): void {
  if (!origin) return;
  let hostname: string;
  try { hostname = new URL(origin).hostname.toLowerCase(); }
  catch { throw new Error('Invalid origin'); }
  if (!(hostname === 'starkies.lat' || hostname === 'www.starkies.lat' || hostname === 'localhost' || hostname === '127.0.0.1' || (hostname.startsWith('starkies') && hostname.endsWith('.vercel.app')))) {
    throw new Error('Origin not allowed');
  }
}
