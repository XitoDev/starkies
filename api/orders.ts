import { createHash, randomBytes } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { BOX_PRESENTATIONS, CATALOG_PRODUCTS, DELIVERY_ZONES } from '../apps/catalog/src/app/pages/catalog/catalog.data';

type HeaderValue = string | string[] | undefined;
interface ApiRequest {
  method?: string;
  headers: Record<string, HeaderValue>;
  body?: unknown;
}
interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}
interface ValidatedOrder {
  name: string;
  phone: string;
  zoneId: string;
  address: string;
  deliveryDate: string;
  cookieName: string;
  notes: string;
  boxes: { presentationId: string; items: Record<string, number> }[];
}
class HttpError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ORDERS = 8;
const BUSINESS_PATH = ['businesses', 'starkies'] as const;

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ message: 'Método no permitido.' });
    return;
  }

  try {
    assertAllowedOrigin(headerValue(req.headers['origin']));
    const payload = parsePayload(req.body);
    const order = validateAndBuildOrder(payload);
    const db = getDatabase();
    const now = Date.now();
    const createdAt = new Date(now).toISOString();
    const orderId = 'SK-' + todayInEcuador().replaceAll('-', '') + '-' + randomBytes(3).toString('hex').toUpperCase();
    const metadataRef = db.doc([...BUSINESS_PATH, 'system', 'stateMeta'].join('/'));
    const orderRef = db.doc([...BUSINESS_PATH, 'collections', 'orders', 'records', orderId].join('/'));
    const rateLimitKey = createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 40);
    const rateLimitRef = db.collection('publicOrderRateLimits').doc(rateLimitKey);

    const orderRecord = {
      id: orderId,
      code: orderId,
      customer: order.name,
      phone: order.phone,
      address: order.zoneId === '6' ? 'Retiro en tienda' : order.zoneName + ' — ' + order.address,
      zone: order.zoneName,
      date: order.deliveryDate,
      deliveryDate: order.deliveryDate,
      created: createdAt,
      createdAt,
      cookieName: order.cookieName || order.name,
      notes: order.notes,
      status: 'PENDING',
      total: order.total,
      lines: order.lines,
      orderChannel: 'public-web',
    };

    await db.runTransaction(async transaction => {
      const [metadataSnapshot, existingOrder, rateSnapshot] = await Promise.all([
        transaction.get(metadataRef),
        transaction.get(orderRef),
        transaction.get(rateLimitRef),
      ]);

      if (!metadataSnapshot.exists() || metadataSnapshot.data()?.['status'] !== 'complete') {
        throw new HttpError(503, 'Los pedidos en línea se están configurando. Por ahora, puedes terminar tu pedido por WhatsApp.');
      }
      if (existingOrder.exists) {
        throw new HttpError(409, 'No pudimos confirmar un código de pedido único. Inténtalo nuevamente.');
      }

      const previous = rateSnapshot.data() ?? {};
      const previousWindow = Number(previous['windowStart'] ?? 0);
      const inCurrentWindow = now >= previousWindow && now - previousWindow < RATE_LIMIT_WINDOW_MS;
      const nextCount = inCurrentWindow ? Number(previous['count'] ?? 0) + 1 : 1;
      if (nextCount > RATE_LIMIT_MAX_ORDERS) {
        throw new HttpError(429, 'Se alcanzó el límite temporal de pedidos desde esta conexión. Inténtalo más tarde o escríbenos por WhatsApp.');
      }

      const metadata = metadataSnapshot.data() ?? {};
      const arrayKeys = Array.isArray(metadata['arrayKeys']) ? metadata['arrayKeys'] as string[] : [];
      const stateKeys = Array.isArray(metadata['stateKeys']) ? metadata['stateKeys'] as string[] : [];
      const recordCounts = typeof metadata['recordCounts'] === 'object' && metadata['recordCounts'] !== null
        ? metadata['recordCounts'] as Record<string, unknown>
        : {};

      transaction.set(rateLimitRef, {
        windowStart: inCurrentWindow ? previousWindow : now,
        count: nextCount,
        updatedAt: createdAt,
      });
      transaction.set(orderRef, { index: now, value: orderRecord });
      transaction.set(metadataRef, {
        arrayKeys: Array.from(new Set([...arrayKeys, 'orders'])),
        stateKeys: Array.from(new Set([...stateKeys, 'orders'])),
        recordCounts: {
          ...recordCounts,
          orders: Number(recordCounts['orders'] ?? 0) + 1,
        },
      }, { merge: true });
    });

    res.status(201).json({ ok: true, orderId, total: order.total });
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }
    console.error('Public order creation failed:', error);
    res.status(500).json({ message: 'No pudimos registrar tu pedido en este momento. Puedes terminarlo por WhatsApp.' });
  }
}

function getDatabase() {
  const raw = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
  if (!raw) {
    throw new HttpError(503, 'Los pedidos en línea se están configurando. Por ahora, puedes terminar tu pedido por WhatsApp.');
  }

  let account: { project_id?: string; client_email?: string; private_key?: string };
  try {
    account = JSON.parse(raw) as typeof account;
  } catch {
    throw new HttpError(503, 'La configuración de pedidos no está completa. Por ahora, puedes terminar tu pedido por WhatsApp.');
  }
  if (account.project_id !== 'starkies' || !account.client_email || !account.private_key) {
    throw new HttpError(503, 'La configuración de pedidos no está completa. Por ahora, puedes terminar tu pedido por WhatsApp.');
  }

  const appName = 'starkies-public-orders';
  const app = getApps().find(candidate => candidate.name === appName)
    ?? initializeApp({
      credential: cert({
        projectId: account.project_id,
        clientEmail: account.client_email,
        privateKey: account.private_key.replace(/\\n/g, '\n'),
      }),
    }, appName);
  return getFirestore(app);
}

function assertAllowedOrigin(origin: string | undefined): void {
  if (!origin) return;
  let hostname: string;
  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    throw new HttpError(403, 'Origen no permitido.');
  }

  const allowed = hostname === 'starkies.lat'
    || hostname === 'www.starkies.lat'
    || hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname.endsWith('.vercel.app');
  if (!allowed) throw new HttpError(403, 'Origen no permitido.');
}

function parsePayload(body: unknown): ValidatedOrder {
  let candidate = body;
  if (typeof candidate === 'string') {
    try { candidate = JSON.parse(candidate) as unknown; }
    catch { throw new HttpError(400, 'El formulario de pedido no tiene un formato válido.'); }
  }
  if (!isRecord(candidate)) throw new HttpError(400, 'El formulario de pedido no tiene un formato válido.');
  if (typeof candidate['website'] === 'string' && candidate['website'].trim()) {
    throw new HttpError(400, 'No se pudo validar el formulario. Actualiza la página e inténtalo nuevamente.');
  }

  const name = stringField(candidate, 'name', 2, 80);
  const phone = stringField(candidate, 'phone', 7, 24);
  if (!/^[+0-9().\s-]+$/.test(phone) || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15) {
    throw new HttpError(400, 'Ingresa un número de teléfono válido.');
  }
  const zoneId = stringField(candidate, 'zoneId', 1, 20);
  const zone = DELIVERY_ZONES.find(item => item.id === zoneId);
  if (!zone) throw new HttpError(400, 'Selecciona una zona de entrega válida.');

  const address = typeof candidate['address'] === 'string' ? candidate['address'].trim() : '';
  if (zoneId !== '6' && (address.length < 5 || address.length > 250)) {
    throw new HttpError(400, 'Ingresa una dirección de entrega de entre 5 y 250 caracteres.');
  }

  const deliveryDate = stringField(candidate, 'deliveryDate', 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
    throw new HttpError(400, 'Selecciona una fecha de entrega válida.');
  }
  const parsedDate = new Date(deliveryDate + 'T00:00:00Z');
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== deliveryDate) {
    throw new HttpError(400, 'Selecciona una fecha de entrega válida.');
  }
  if (deliveryDate < todayInEcuador()) {
    throw new HttpError(400, 'La fecha de entrega no puede estar en el pasado.');
  }

  const cookieName = optionalString(candidate['cookieName'], 80);
  const notes = optionalString(candidate['notes'], 500);
  if (!Array.isArray(candidate['boxes']) || candidate['boxes'].length < 1 || candidate['boxes'].length > 10) {
    throw new HttpError(400, 'El pedido debe incluir entre 1 y 10 cajas.');
  }

  const boxes = candidate['boxes'].map(rawBox => {
    if (!isRecord(rawBox)) throw new HttpError(400, 'Una de las cajas no tiene un formato válido.');
    const presentationId = stringField(rawBox, 'presentationId', 1, 40);
    const presentation = BOX_PRESENTATIONS.find(item => item.id === presentationId);
    if (!presentation) throw new HttpError(400, 'Selecciona una presentación de caja válida.');
    if (!isRecord(rawBox['items'])) throw new HttpError(400, 'El detalle de una caja no tiene un formato válido.');

    const items: Record<string, number> = {};
    let classicCount = 0;
    let nyCount = 0;
    let lineTotalCents = 0;
    for (const [productId, rawQuantity] of Object.entries(rawBox['items'])) {
      const product = CATALOG_PRODUCTS.find(item => item.id === productId);
      if (!product || !product.stock) throw new HttpError(400, 'Uno de los sabores ya no está disponible.');
      if (typeof rawQuantity !== 'number' || !Number.isInteger(rawQuantity) || rawQuantity < 1 || rawQuantity > 10) {
        throw new HttpError(400, 'La cantidad de uno de los sabores no es válida.');
      }
      items[productId] = rawQuantity;
      if (product.isNy) nyCount += rawQuantity;
      else classicCount += rawQuantity;
      lineTotalCents += Math.round(product.price * 100) * rawQuantity;
    }

    if (classicCount !== presentation.reqClasicas || nyCount !== presentation.reqNY) {
      throw new HttpError(400, 'La composición de una de las cajas no coincide con la presentación seleccionada.');
    }
    if (Math.abs(lineTotalCents - Math.round(presentation.price * 100)) > 1) {
      throw new HttpError(400, 'El precio de una de las cajas cambió. Actualiza la página antes de confirmar.');
    }
    return { presentationId, items };
  });

  return { name, phone, zoneId, address, deliveryDate, cookieName, notes, boxes };
}

function validateAndBuildOrder(payload: ValidatedOrder) {
  const zone = DELIVERY_ZONES.find(item => item.id === payload.zoneId)!;
  const lineItems = new Map<string, { id: string; name: string; qty: number; price: number }>();
  let boxTotalCents = 0;

  for (const box of payload.boxes) {
    const presentation = BOX_PRESENTATIONS.find(item => item.id === box.presentationId)!;
    boxTotalCents += Math.round(presentation.price * 100);
    for (const [productId, quantity] of Object.entries(box.items)) {
      const product = CATALOG_PRODUCTS.find(item => item.id === productId)!;
      const line = lineItems.get(productId) ?? {
        id: product.id,
        name: product.name,
        qty: 0,
        price: product.price,
      };
      line.qty += quantity;
      lineItems.set(productId, line);
    }
  }

  const lines = Array.from(lineItems.values());
  if (zone.fee > 0) {
    lines.push({ id: 'shipping', name: 'Envío — ' + zone.name, qty: 1, price: zone.fee });
  }
  const totalCents = boxTotalCents + Math.round(zone.fee * 100);
  return {
    ...payload,
    zoneName: zone.name,
    total: totalCents / 100,
    lines,
  };
}

function stringField(record: Record<string, unknown>, key: string, min: number, max: number): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new HttpError(400, 'Revisa el campo "' + key + '" e inténtalo nuevamente.');
  }
  return value.trim();
}

function optionalString(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function headerValue(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function clientIp(req: ApiRequest): string {
  const forwarded = headerValue(req.headers['x-forwarded-for']);
  if (forwarded) return forwarded.split(',')[0].trim();
  return headerValue(req.headers['x-real-ip']) ?? 'unknown';
}

function todayInEcuador(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values['year'] + '-' + values['month'] + '-' + values['day'];
}
