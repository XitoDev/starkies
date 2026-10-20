import { createHmac, timingSafeEqual } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

interface ApiRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}
interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  send(body: Buffer | string): void;
  end(body?: Buffer | string): void;
  json(body: unknown): void;
}
interface OrderLine { name?: unknown; qty?: unknown; price?: unknown; }
interface StoredOrder {
  id?: unknown;
  code?: unknown;
  customer?: unknown;
  phone?: unknown;
  address?: unknown;
  zone?: unknown;
  deliveryDate?: unknown;
  date?: unknown;
  createdAt?: unknown;
  created?: unknown;
  cookieName?: unknown;
  notes?: unknown;
  total?: unknown;
  lines?: unknown;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ message: 'Método no permitido.' });
    return;
  }

  try {
    const url = new URL(req.url ?? '/', 'https://' + headerValue(req.headers['host'] ?? req.headers['x-forwarded-host']) || 'https://starkies.lat');
    const token = url.searchParams.get('token') ?? '';
    const verified = verifyToken(token, getSigningKey());
    if (!verified) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.status(403);
      res.send('Este enlace del pedido no es válido o ha caducado. Solicita a StarKies un nuevo enlace.');
      return;
    }

    const orderRef = getDatabase().doc(['businesses', 'starkies', 'collections', 'orders', 'records', verified.orderId].join('/'));
    const snapshot = await orderRef.get();
    if (!snapshot.exists) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.status(404);
      res.send('No encontramos este pedido.');
      return;
    }

    const record = snapshot.data()?.['value'] as StoredOrder | undefined;
    if (!record) {
      res.status(404).setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send('No encontramos los detalles de este pedido.');
      return;
    }

    const pdf = buildOrderPdf(record, verified.orderId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="pedido-' + safeFilename(verified.orderId) + '.pdf"');
    res.setHeader('Content-Length', String(pdf.length));
    if (req.method === 'HEAD') { res.status(200).end(); return; }
    res.status(200).send(pdf);
  } catch (error) {
    console.error('Order document generation failed:', error);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(500);
    res.send('No pudimos generar el PDF de este pedido en este momento.');
  }
}

function getSigningKey(): string {
  const raw = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
  if (!raw) throw new Error('Missing Firebase service account configuration');
  const account = JSON.parse(raw) as { project_id?: string; private_key?: string };
  if (account.project_id !== 'starkies' || !account.private_key) throw new Error('Invalid Firebase service account configuration');
  return account.private_key;
}

function verifyToken(token: string, signingKey: string): { orderId: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [orderId, expiryRaw, suppliedSignature] = parts;
  if (!/^SK-\d{8}-[A-F0-9]{6}$/.test(orderId) || !/^\d{13}$/.test(expiryRaw) || !/^[a-f0-9]{64}$/.test(suppliedSignature)) return null;
  const expiry = Number(expiryRaw);
  if (!Number.isSafeInteger(expiry) || expiry <= Date.now() || expiry > Date.now() + 8 * 24 * 60 * 60 * 1000) return null;
  const payload = orderId + '.' + expiryRaw;
  const expected = createHmac('sha256', signingKey).update(payload).digest();
  const supplied = Buffer.from(suppliedSignature, 'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  return { orderId };
}

function getDatabase() {
  const raw = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
  if (!raw) throw new Error('Missing Firebase service account configuration');
  const account = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string };
  if (account.project_id !== 'starkies' || !account.client_email || !account.private_key) throw new Error('Invalid Firebase service account configuration');
  const appName = 'starkies-order-documents';
  const app = getApps().find(candidate => candidate.name === appName) ?? initializeApp({
    credential: cert({
      projectId: account.project_id,
      clientEmail: account.client_email,
      privateKey: account.private_key.replace(/\\n/g, '\n'),
    }),
  }, appName);
  return getFirestore(app);
}

function buildOrderPdf(order: StoredOrder, orderId: string): Buffer {
  const lines: string[] = [
    'STARKIES - DETALLE DE PEDIDO',
    '',
    'Pedido: ' + orderId,
    'Cliente: ' + text(order.customer),
    'Telefono: ' + text(order.phone),
    'Sector: ' + text(order.zone),
    'Direccion: ' + text(order.address),
    'Fecha de entrega: ' + text(order.deliveryDate ?? order.date),
    'Nombre en la caja: ' + text(order.cookieName),
    '',
    'DETALLE',
  ];
  const orderLines = Array.isArray(order.lines) ? order.lines as OrderLine[] : [];
  for (const item of orderLines) {
    const qty = Number(item.qty ?? 0);
    const price = Number(item.price ?? 0);
    lines.push(text(item.name) + '  x' + qty + '  $' + (price * qty).toFixed(2));
  }
  lines.push('', 'TOTAL: $' + Number(order.total ?? 0).toFixed(2));
  if (text(order.notes)) lines.push('', 'Notas: ' + text(order.notes));
  lines.push('', 'Gracias por elegir StarKies.', 'Confirma los detalles de entrega por WhatsApp.');
  const wrapped = lines.flatMap(line => wrapLine(line, 88));
  const commands = ['BT /F1 18 Tf 48 754 Td (' + pdfEscape(wrapped[0] ?? 'STARKIES') + ') Tj ET'];
  let y = 724;
  for (const line of wrapped.slice(1)) {
    if (y < 42) break;
    const fontSize = line === 'DETALLE' || line.startsWith('TOTAL:') ? 12 : 10;
    commands.push('BT /F1 ' + fontSize + ' Tf 48 ' + y + ' Td (' + pdfEscape(line) + ') Tj ET');
    y -= fontSize === 12 ? 20 : 15;
  }
  const stream = commands.join('\n') + '\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Length ' + Buffer.byteLength(stream, 'ascii') + ' >>\nstream\n' + stream + 'endstream',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += (i + 1) + ' 0 obj\n' + objects[i] + '\nendobj\n';
  }
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF';
  return Buffer.from(pdf, 'ascii');
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '-';
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '').trim() || '-';
}
function wrapLine(value: string, max: number): string[] {
  if (!value) return [''];
  const words = value.split(/\s+/);
  const result: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && (current + ' ' + word).length > max) { result.push(current); current = word; }
    else current = current ? current + ' ' + word : word;
  }
  if (current) result.push(current);
  return result;
}
function pdfEscape(value: string): string {
  return text(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
function safeFilename(value: string): string { return value.replace(/[^A-Za-z0-9-]/g, ''); }
function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}
