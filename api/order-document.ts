import { createHmac, timingSafeEqual } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
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
interface OrderLine { id?: unknown; name?: unknown; qty?: unknown; quantity?: unknown; price?: unknown; }
interface OrderBoxItem { name?: unknown; quantity?: unknown; }
interface OrderBox { presentationName?: unknown; title?: unknown; price?: unknown; items?: unknown; }
export interface StoredOrder {
  id?: unknown;
  code?: unknown;
  customerId?: unknown;
  customer?: unknown;
  phone?: unknown;
  address?: unknown;
  deliveryAddress?: unknown;
  deliveryMethod?: unknown;
  zone?: unknown;
  deliveryDate?: unknown;
  date?: unknown;
  createdAt?: unknown;
  created?: unknown;
  cookieName?: unknown;
  notes?: unknown;
  total?: unknown;
  discount?: unknown;
  promotion?: unknown;
  lines?: unknown;
  boxes?: unknown;
  deliveryFee?: unknown;
  shippingFee?: unknown;
  isPaid?: unknown;
  paymentMethod?: unknown;
  status?: unknown;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  const host = headerValue(req.headers['host'] ?? req.headers['x-forwarded-host']) || 'starkies.lat';
  const requestUrl = new URL(req.url ?? '/', 'https://' + host);
  if (requestUrl.searchParams.get('mode') === 'admin') {
    await handleAdminOrderDocument(req, res, requestUrl);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ message: 'Método no permitido.' });
    return;
  }

  try {
    const url = requestUrl;
    const token = url.searchParams.get('token') ?? '';
    const verified = verifyToken(token, getSigningKey());
    if (!verified) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.status(403);
      res.send('Este enlace del pedido no es válido o ha caducado. Solicita a StarKies un nuevo enlace.');
      return;
    }

    const orderRef = getDatabase().doc(['orders', verified.orderId].join('/'));
    const snapshot = await orderRef.get();
    if (!snapshot.exists) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.status(404);
      res.send('No encontramos este pedido.');
      return;
    }

    const record = snapshot.data() as StoredOrder | undefined;
    if (!record) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.status(404);
      res.send('No encontramos los detalles de este pedido.');
      return;
    }

    const customerId = typeof record.customerId === 'string' ? record.customerId : '';
    const customerSnapshot = customerId ? await getDatabase().doc('customers/' + customerId).get() : null;
    const customer = customerSnapshot?.exists ? customerSnapshot.data() : undefined;
    const pdfRecord: StoredOrder = {
      ...record,
      customer: typeof record.customer === 'string' && record.customer.trim() ? record.customer : customer?.['name'],
      phone: typeof record.phone === 'string' && record.phone.trim() ? record.phone : customer?.['phone'],
      address: typeof record.deliveryAddress === 'string' && record.deliveryAddress.trim()
        ? record.deliveryAddress
        : typeof record.address === 'string' && record.address.trim() ? record.address : customer?.['address'],
      deliveryFee: record.shippingFee ?? record.deliveryFee,
    };
    const pdf = buildOrderPdf(pdfRecord, verified.orderId);
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


async function handleAdminOrderDocument(req: ApiRequest, res: ApiResponse, url: URL): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ message: 'Método no permitido.' });
    return;
  }

  try {
    const authorization = headerValue(req.headers['authorization']);
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!match) {
      res.status(401).json({ message: 'Inicia sesión para descargar el PDF.' });
      return;
    }

    const app = getAdminApp();
    const decoded = await getAuth(app).verifyIdToken(match[1]);
    const database = getFirestore(app);
    const admin = await database.doc('adminUsers/' + decoded.uid).get();
    if (!admin.exists) {
      res.status(403).json({ message: 'No tienes permiso para descargar este documento.' });
      return;
    }

    const orderId = url.searchParams.get('orderId') ?? '';
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(orderId)) {
      res.status(400).json({ message: 'Identificador de pedido no válido.' });
      return;
    }

    const snapshot = await database.doc(['orders', orderId].join('/')).get();
    if (!snapshot.exists) {
      res.status(404).json({ message: 'No encontramos este pedido.' });
      return;
    }

    const record = snapshot.data() as StoredOrder | undefined;
    if (!record) {
      res.status(404).json({ message: 'No encontramos los detalles de este pedido.' });
      return;
    }

    const customerId = typeof record.customerId === 'string' ? record.customerId : '';
    const customerSnapshot = customerId ? await database.doc('customers/' + customerId).get() : null;
    const customer = customerSnapshot?.exists ? customerSnapshot.data() : undefined;
    const pdfRecord: StoredOrder = {
      ...record,
      customer: typeof record.customer === 'string' && record.customer.trim() ? record.customer : customer?.['name'],
      phone: typeof record.phone === 'string' && record.phone.trim() ? record.phone : customer?.['phone'],
      address: typeof record.deliveryAddress === 'string' && record.deliveryAddress.trim()
        ? record.deliveryAddress
        : typeof record.address === 'string' && record.address.trim() ? record.address : customer?.['address'],
      deliveryFee: record.shippingFee ?? record.deliveryFee,
    };

    const pdf = buildOrderPdf(pdfRecord, orderId);
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

function getAdminApp() {
  const raw = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
  if (!raw) throw new Error('Missing Firebase service account configuration');
  const account = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string };
  if (account.project_id !== 'starkies' || !account.client_email || !account.private_key) {
    throw new Error('Invalid Firebase service account configuration');
  }
  const name = 'starkies-admin-pdf-auth';
  return getApps().find(app => app.name === name) ?? initializeApp({
    credential: cert({
      projectId: account.project_id,
      clientEmail: account.client_email,
      privateKey: account.private_key.replace(/\\n/g, '\n'),
    }),
  }, name);
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
  if (!Number.isSafeInteger(expiry) || expiry <= Date.now() || expiry > Date.now() + 3 * 24 * 60 * 60 * 1000) return null;
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

export function buildOrderPdf(order: StoredOrder, orderId: string): Buffer {
  const commands: string[] = [];
  const purple = '0.47 0.35 0.67';
  const dark = '0.20 0.18 0.25';
  const muted = '0.43 0.41 0.47';
  const pale = '0.95 0.93 0.98';
  const line = '0.86 0.83 0.90';
  const money = (value: unknown) => '$' + Number(value ?? 0).toFixed(2);
  const drawText = (value: unknown, x: number, y: number, size = 10, font = 'F1', color = dark) => {
    commands.push('BT /' + font + ' ' + size + ' Tf ' + color + ' rg 1 0 0 1 ' + x + ' ' + y + ' Tm (' + pdfEscape(text(value)) + ') Tj ET');
  };
  const rect = (x: number, y: number, w: number, h: number, fill: string, stroke?: string) => {
    commands.push('q ' + fill + ' rg ' + (stroke ? stroke + ' RG 0.7 w ' : '') + x + ' ' + y + ' ' + w + ' ' + h + ' re ' + (stroke ? 'B' : 'f') + ' Q');
  };
  const rule = (x1: number, y: number, x2: number, color = line) => commands.push('q ' + color + ' RG 0.7 w ' + x1 + ' ' + y + ' m ' + x2 + ' ' + y + ' l S Q');
  const safeDate = order.deliveryDate ?? order.date ?? order.createdAt ?? order.created ?? new Date().toISOString().slice(0, 10);

  // Branded lilac header inspired by the existing StarKies customer order PDF.
  rect(0, 690, 595, 152, pale);
  rect(0, 690, 8, 152, purple);
  drawText('StarKies.', 42, 800, 23, 'F2', purple);
  drawText('L A   E S T R E L L A   E R E S   T Ú', 43, 784, 6, 'F1', muted);
  drawText(formatDate(order.createdAt ?? order.created ?? safeDate), 440, 803, 9, 'F1', muted);
  drawText('PEDIDO', 42, 758, 17, 'F2', dark);
  rect(385, 747, 168, 27, '0.90 0.86 0.95');
  drawText(statusLabel(order.status), 397, 757, 9, 'F2', purple);
  drawText('Orden: ' + orderId, 42, 727, 10, 'F2', dark);

  // Customer details in a compact two-column card.
  rect(42, 584, 511, 115, '1 1 1', line);
  drawText('Cliente', 56, 675, 8, 'F2', muted);
  drawText(order.customer ?? order.customerId ?? 'Cliente desconocido', 56, 658, 10, 'F2');
  drawText('En la caja', 310, 675, 8, 'F2', muted);
  drawText(order.cookieName || 'N/A', 310, 658, 10);
  drawText('Teléfono', 56, 631, 8, 'F2', muted);
  drawText(order.phone, 56, 614, 10);
  drawText('Sector / punto', 310, 631, 8, 'F2', muted);
  drawText(String(order.deliveryAddress ?? '').trim() || String(order.zone ?? '').trim() || String(order.deliveryMethod ?? '').trim() || order.address, 310, 614, 10);
  drawText(order.zone === 'Retiro en tienda' || order.address === 'Retiro en tienda' ? 'Fecha de retiro' : 'Fecha de entrega', 56, 600, 8, 'F2', muted);
  drawText(formatDate(safeDate), 150, 600, 9);

  let y = 555;
  const boxes = Array.isArray(order.boxes) ? order.boxes as OrderBox[] : [];
  if (boxes.length) {
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      const boxItems = Array.isArray(box.items) ? box.items as OrderBoxItem[] : [];
      const boxPrice = Number(box.price ?? 0);
      const needed = 35 + Math.max(1, boxItems.length) * 14;
      if (y - needed < 125) break;
      rect(42, y - 22, 511, 25, pale);
      drawText('Caja ' + (i + 1) + ' - ' + text(box.presentationName ?? box.title ?? 'Caja StarKies'), 52, y - 13, 9, 'F2', purple);
      drawText(money(boxPrice), 495, y - 13, 9, 'F2', dark);
      y -= 38;
      for (const item of boxItems) {
        drawText(String(Number(item.quantity ?? 0)) + ' ' + text(item.name), 64, y, 9, 'F1', dark);
        y -= 14;
      }
      y -= 4;
    }
  } else {
    // Older orders only stored aggregated product lines, so preserve their details gracefully.
    const orderLines = Array.isArray(order.lines) ? order.lines as OrderLine[] : [];
    rect(42, y - 22, 511, 25, pale);
    drawText('Detalle del pedido', 52, y - 13, 9, 'F2', purple);
    y -= 39;
    for (const item of orderLines) {
      const quantity = Number(item.qty ?? item.quantity ?? 1);
      const price = Number(item.price ?? 0);
      drawText(quantity + ' ' + text(item.name), 64, y, 9);
      drawText(money(price * quantity), 480, y, 9);
      y -= 15;
    }
  }

  const deliveryFee = Number(order.shippingFee ?? order.deliveryFee ?? 0);
  const discount = Math.max(0, Number(order.discount ?? 0));
  const boxSubtotal = boxes.length
    ? boxes.reduce((sum, box) => sum + Number(box.price ?? 0), 0)
    : Math.max(0, Number(order.total ?? 0) + discount - deliveryFee);
  const promotion = typeof order.promotion === 'object' && order.promotion !== null
    ? order.promotion as Record<string, unknown> : {};
  const promotionCode = typeof promotion['code'] === 'string' ? promotion['code'].trim() : '';
  const summaryTop = Math.max(y - 3, 105);
  rule(300, summaryTop + 21, 553);
  drawText('Valor de las cajas', 365, summaryTop + 7, 9, 'F1', muted);
  drawText(money(boxSubtotal), 492, summaryTop + 7, 9, 'F2', dark);
  drawText(promotionCode ? 'Descuento · ' + promotionCode : 'Descuento', 365, summaryTop - 8, 9, 'F1', muted);
  drawText(discount > 0 ? '-' + money(discount) : money(0), 492, summaryTop - 8, 9, 'F2', discount > 0 ? '0.31 0.48 0.36' : dark);
  drawText('Entrega / retiro', 365, summaryTop - 23, 9, 'F1', muted);
  drawText(deliveryFee > 0 ? money(deliveryFee) : 'No tiene costo', 465, summaryTop - 23, 9, 'F2', dark);
  rect(300, summaryTop - 56, 253, 25, pale);
  drawText('Total estimado', 312, summaryTop - 48, 10, 'F2', purple);
  drawText(money(order.total), 492, summaryTop - 48, 11, 'F2', purple);

  const isPickup = String(order.deliveryMethod ?? '').toLowerCase().includes('retiro') || String(order.zone ?? '').toLowerCase().includes('retiro') || String(order.deliveryAddress ?? order.address ?? '').toLowerCase().includes('retiro en tienda');
  rect(42, 76, 511, 48, pale);
  drawText(isPickup ? 'RETIRO' : 'ENTREGA', 56, 106, 9, 'F2', purple);
  drawText(isPickup
    ? 'Coordinaremos por WhatsApp el día y la hora para retirar tu pedido.'
    : 'Coordinaremos por WhatsApp los detalles de entrega de tu pedido.', 56, 89, 8, 'F1', dark);
  drawText('Disponibilidad, entrega y pago por confirmar con StarKies.', 42, 52, 8, 'F1', muted);
  rule(42, 38, 553);
  drawText('StarKies | Página 1 de 1', 422, 22, 8, 'F1', muted);

  const stream = commands.join('\n') + '\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Length ' + Buffer.byteLength(stream, 'latin1') + ' >>\nstream\n' + stream + 'endstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += (i + 1) + ' 0 obj\n' + objects[i] + '\nendobj\n';
  }
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF';
  return Buffer.from(pdf, 'latin1');
}

function statusLabel(value: unknown): string {
  switch (String(value ?? '').toUpperCase()) {
    case 'CONFIRMED': return 'Confirmado';
    case 'DELIVERED': return 'Entregado';
    case 'CANCELLED': return 'Cancelado';
    default: return 'Pendiente de confirmación';
  }
}
function formatDate(value: unknown): string {
  const raw = String(value ?? '');
  const date = new Date(raw.length === 10 ? raw + 'T12:00:00' : raw);
  if (Number.isNaN(date.getTime())) return raw || 'Por confirmar';
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Guayaquil' }).format(date);
}
function text(value: unknown): string {
  if (value === null || value === undefined) return '-';
  return String(value).replace(/[\u0000-\u001F\u007F-\u009F]/g, '').replace(/[^\x20-\xFF]/g, '').trim() || '-';
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
