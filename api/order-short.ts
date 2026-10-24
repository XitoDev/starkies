import { createHmac, timingSafeEqual } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

interface ApiRequest { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; }
interface ApiResponse { status(code: number): ApiResponse; setHeader(name: string, value: string): void; send(body: Buffer | string): void; end(body?: Buffer | string): void; json(body: unknown): void; }
interface StoredShortLink { documentToken?: unknown; documentExpiresAt?: unknown; id?: unknown; }

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD'); res.status(405).json({ message: 'Método no permitido.' }); return;
  }
  try {
    const url = new URL(req.url ?? '/', 'https://starkies.lat');
    const code = url.searchParams.get('code') ?? '';
    if (!/^[A-Za-z0-9_-]{8}$/.test(code)) { res.status(404).send('No encontramos este enlace de pedido.'); return; }
    const matches = await getDatabase().collection('orders')
      .where('documentShortCode', '==', code).limit(1).get();
    if (matches.empty) { res.status(404).send('No encontramos este enlace de pedido.'); return; }
    const doc = matches.docs[0];
    const order = doc.data() as StoredShortLink | undefined;
    const token = typeof order?.documentToken === 'string' ? order.documentToken : '';
    const expiry = Number(order?.documentExpiresAt ?? 0);
    const verified = verifyToken(token, getSigningKey());
    if (!verified || verified.orderId !== doc.id || !Number.isSafeInteger(expiry) || expiry <= Date.now() || expiry !== Number(token.split('.')[1])) {
      res.status(403).send('Este enlace del pedido no es válido o ha caducado. Solicita a StarKies un nuevo enlace.');
      return;
    }
    const userAgent = headerValue(req.headers['user-agent']);
    if (isSocialPreviewBot(userAgent)) {
      const canonicalUrl = 'https://starkies.lat/p/' + encodeURIComponent(code);
      const title = '¡Tu pedido de StarKies!';
      const description = 'Consulta los datos de tu pedido.';
      const html = '<!doctype html><html lang="es"><head><meta charset="utf-8">'
        + '<meta name="viewport" content="width=device-width,initial-scale=1">'
        + '<title>' + escapeHtml(title) + '</title>'
        + '<meta name="description" content="' + escapeHtml(description) + '">'
        + '<meta name="robots" content="noindex,nofollow">'
        + '<link rel="canonical" href="' + canonicalUrl + '">'
        + '<meta property="og:type" content="website">'
        + '<meta property="og:site_name" content="StarKies">'
        + '<meta property="og:locale" content="es_EC">'
        + '<meta property="og:title" content="' + escapeHtml(title) + '">'
        + '<meta property="og:description" content="' + escapeHtml(description) + '">'
        + '<meta property="og:url" content="' + canonicalUrl + '">'
        + '<meta property="og:image" content="https://starkies.lat/images/starkies-brownie-cookie.svg">'
        + '<meta property="og:image:alt" content="Galleta Brownie Classic de StarKies">'
        + '<meta name="twitter:card" content="summary_large_image">'
        + '<meta name="twitter:title" content="' + escapeHtml(title) + '">'
        + '<meta name="twitter:description" content="' + escapeHtml(description) + '">'
        + '</head><body><main><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(description) + '</p>'
        + '<p>Este enlace permite consultar el documento del pedido.</p></main></body></html>';
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Length', String(Buffer.byteLength(html)));
      res.status(200);
      if (req.method === 'HEAD') { res.end(); return; }
      res.send(html);
      return;
    }
    res.setHeader('Location', '/api/order-document?token=' + encodeURIComponent(token));
    res.status(302).end();
  } catch (error) {
    console.error('Short order link failed:', error);
    res.status(500).json({ message: 'No pudimos abrir el PDF de este pedido.' });
  }
}
function verifyToken(token: string, signingKey: string): { orderId: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [orderId, expiryRaw, suppliedSignature] = parts;
  if (!/^SK-\d{8}-[A-F0-9]{6}$/.test(orderId) || !/^\d{13}$/.test(expiryRaw) || !/^[a-f0-9]{64}$/.test(suppliedSignature)) return null;
  const expiry = Number(expiryRaw);
  if (!Number.isSafeInteger(expiry) || expiry <= Date.now() || expiry > Date.now() + 3 * 24 * 60 * 60 * 1000) return null;
  const expected = createHmac('sha256', signingKey).update(orderId + '.' + expiryRaw).digest();
  const supplied = Buffer.from(suppliedSignature, 'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  return { orderId };
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

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}
function isSocialPreviewBot(userAgent: string): boolean {
  return /WhatsApp|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|TelegramBot|Slackbot|Discordbot|Pinterestbot/i.test(userAgent);
}
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
