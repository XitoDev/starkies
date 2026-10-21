import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { buildOrderPdf, StoredOrder } from './order-document.js';

interface ApiRequest { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; }
interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  send(body: Buffer | string): void;
  end(body?: Buffer | string): void;
  json(body: unknown): void;
}
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ message: 'Método no permitido.' });
    return;
  }
  try {
    const authorization = headerValue(req.headers['authorization']);
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!match) { res.status(401).json({ message: 'Inicia sesión para descargar el PDF.' }); return; }
    const decoded = await getAuth(getAdminApp()).verifyIdToken(match[1]);
    const admin = await getDatabase().doc('adminUsers/' + decoded.uid).get();
    if (!admin.exists) { res.status(403).json({ message: 'No tienes permiso para descargar este documento.' }); return; }

    const url = new URL(req.url ?? '/', 'https://starkies.lat');
    const orderId = url.searchParams.get('orderId') ?? '';
    if (!/^SK-\d{8}-[A-F0-9]{6}$/.test(orderId)) { res.status(400).json({ message: 'Identificador de pedido no válido.' }); return; }
    const snapshot = await getDatabase().doc(['businesses','starkies','collections','orders','records',orderId].join('/')).get();
    if (!snapshot.exists) { res.status(404).json({ message: 'No encontramos este pedido.' }); return; }
    const record = snapshot.data()?.['value'] as StoredOrder | undefined;
    if (!record) { res.status(404).json({ message: 'No encontramos los detalles del pedido.' }); return; }
    const pdf = buildOrderPdf(record, orderId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="pedido-' + orderId + '.pdf"');
    res.setHeader('Content-Length', String(pdf.length));
    res.status(200).send(pdf);
  } catch (error) {
    if (error instanceof Error && /Firebase ID token|Decoding Firebase ID token|expired/i.test(error.message)) {
      res.status(401).json({ message: 'Tu sesión ha caducado. Inicia sesión nuevamente.' });
      return;
    }
    console.error('Admin order PDF download failed:', error);
    res.status(500).json({ message: 'No pudimos descargar el PDF de este pedido.' });
  }
}
function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}
function getAdminApp() {
  const raw = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
  if (!raw) throw new Error('Missing Firebase service account configuration');
  const account = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string };
  if (account.project_id !== 'starkies' || !account.client_email || !account.private_key) throw new Error('Invalid Firebase service account configuration');
  const name = 'starkies-admin-pdf-auth';
  return getApps().find(app => app.name === name) ?? initializeApp({
    credential: cert({ projectId: account.project_id, clientEmail: account.client_email, privateKey: account.private_key.replace(/\\n/g, '\n') }),
  }, name);
}
function getDatabase() { return getFirestore(getAdminApp()); }
