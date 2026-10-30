import { createHash, createHmac, randomBytes } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type DocumentReference, type DocumentSnapshot } from 'firebase-admin/firestore';
import { readPublicCatalog } from '../server/catalog-data.js';
import { calculatePromotionDiscount, isPromotionActive, type PromotionCartBox } from '../apps/catalog/src/app/pages/catalog/promotion-engine.js';

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
  promotionCode: string;
  boxes: { presentationId: string; items: Record<string, number> }[];
}
class HttpError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

const searchTokensFor = (record: Record<string, unknown>): string[] => {
  const values = [record['id'], record['code'], record['name'], record['customer'], record['phone'], record['address']]
    .map(value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/[^a-z0-9]+/g, ' ').trim())
    .filter(Boolean);
  const tokens = new Set<string>();
  for (const value of values) {
    const compact = value.replace(/\s+/g, '');
    for (let i = 2; i <= compact.length; i++) tokens.add(compact.slice(0, i));
    for (const word of value.split(/\s+/).filter(part => part.length >= 2)) {
      for (let i = 2; i <= word.length; i++) tokens.add(word.slice(0, i));
    }
  }
  return [...tokens];
};

const nameSearchTokensFor = (record: Record<string, unknown>): string[] => {
  const name = String(record['name'] ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/[^a-z0-9]+/g, ' ').trim();
  const tokens = new Set<string>();
  for (const word of name.split(/\s+/).filter(part => part.length >= 2)) {
    for (let i = 2; i <= word.length; i++) tokens.add(word.slice(0, i));
  }
  const compact = name.replace(/\s+/g, '');
  for (let i = 2; i <= compact.length; i++) tokens.add(compact.slice(0, i));
  return [...tokens];
};

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ORDERS = 8;
const BUSINESS_PATH = [] as const;

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
    const db = getDatabase();
    const catalog = await readPublicCatalog(db);
    const payload = parsePayload(req.body, catalog);
    let promotionRef: DocumentReference | null = null;
    let promotionRecord: Record<string, unknown> | null = null;
    if (payload.promotionCode) {
      const promotionQuery = await db.collection('promotions').where('code', '==', payload.promotionCode).limit(1).get();
      const promotionDocument = promotionQuery.docs[0];
      if (!promotionDocument) throw new HttpError(400, 'El código promocional no existe o ya no está vigente.');
      promotionRef = promotionDocument.ref;
      promotionRecord = { ...promotionDocument.data(), id: promotionDocument.id };
      if (!isPromotionActive(promotionRecord)) throw new HttpError(400, 'Esta promoción ya no está vigente o alcanzó su límite de usos.');
    }
    const order = validateAndBuildOrder(payload, catalog, promotionRecord);
    const now = Date.now();
    const createdAt = new Date(now).toISOString();
    const orderId = 'SK-' + todayInEcuador().replaceAll('-', '') + '-' + randomBytes(3).toString('hex').toUpperCase();
    const documentExpiresAt = now + 3 * 24 * 60 * 60 * 1000;
    const documentToken = createOrderDocumentToken(orderId, documentExpiresAt, getDocumentSigningKey());
    const documentShortCode = randomBytes(6).toString('base64url');
    const metadataRef = db.doc([...BUSINESS_PATH, 'system', 'stateMeta'].join('/'));
    const orderRef = db.doc('orders/' + orderId);
    const rateLimitKey = createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 40);
    const rateLimitRef = db.collection('publicOrderRateLimits').doc(rateLimitKey);
    const customersCollection = db.collection('customers');
    const normalizedPhone = normalizePhone(order.phone);
    const phoneLookupHash = createHash('sha256').update(normalizedPhone).digest('hex');
    const phoneLookupRef = db.collection('customerPhoneLookup').doc(phoneLookupHash);
    const orderPhoneLookupRef = db.collection('orderPhoneLookup').doc(phoneLookupHash);
    const redemptionRef = promotionRef
      ? db.collection('promotionRedemptions').doc(promotionRef.id + '_' + phoneLookupHash)
      : null;
    const phoneLookupSnapshot = await phoneLookupRef.get();
    const indexedCustomerId = String(phoneLookupSnapshot.data()?.['customerId'] ?? '');
    const customerRef = indexedCustomerId
      ? customersCollection.doc(indexedCustomerId)
      : customersCollection.doc('web-' + createHash('sha256').update(normalizedPhone).digest('hex').slice(0, 20));
    const customerSnapshot = await customerRef.get();
    const matchedCustomer = customerSnapshot.exists ? customerSnapshot : null;
    const customerId = customerRef.id;
    const existingCustomerValue = matchedCustomer?.data() as Record<string, unknown> | undefined;
    const customerRecord = {
      ...(existingCustomerValue ?? {}),
      id: customerId,
      name: order.name,
      phone: order.phone,
      // Keep the first real delivery address as the customer default; later orders retain their own address on the order record.
      address: order.zoneName === 'Retiro en tienda' ? (existingCustomerValue?.['address'] ?? '') : (String(existingCustomerValue?.['address'] ?? '').trim() || order.address),
    };

    const orderRecord = {
      id: orderId,
      code: orderId,
      customerId,
      customer: order.name,
      phone: order.phone,
      address: order.zoneName === 'Retiro en tienda' ? 'Retiro en tienda' : order.zoneName + ' — ' + order.address,
      zone: order.zoneName,
      date: order.deliveryDate,
      deliveryDate: order.deliveryDate,
      created: createdAt,
      createdAt,
      cookieName: order.cookieName || 'N/A',
      documentShortCode,
      documentToken,
      documentExpiresAt,
      notes: order.notes,
      status: 'PENDING',
      total: order.total,
      discount: order.discount,
      promotion: order.promotion,
      promotionCode: order.promotionCode,
      lines: order.lines,
      boxes: order.boxes.map(box => {
        const presentation = catalog.presentations.find(item => item.id === box.presentationId)!;
        return {
          presentationId: presentation.id,
          presentationName: presentation.name,
          price: presentation.price,
          items: Object.entries(box.items).map(([productId, quantity]) => {
            const product = catalog.products.find(item => item.id === productId)!;
            return { id: product.id, name: product.name, quantity };
          }),
        };
      }),
      deliveryFee: catalog.zones.find(item => item.id === order.zoneId)!.fee,
      orderChannel: 'public-web',
    };

    await db.runTransaction(async transaction => {
      const transactionReads = [
        transaction.get(metadataRef),
        transaction.get(orderRef),
        transaction.get(rateLimitRef),
      ];
      if (promotionRef) transactionReads.push(transaction.get(promotionRef));
      if (redemptionRef) transactionReads.push(transaction.get(redemptionRef));
      const snapshots = await Promise.all(transactionReads);
      const metadataSnapshot = snapshots[0]!;
      const existingOrder = snapshots[1]!;
      const rateSnapshot = snapshots[2]!;
      const promotionSnapshot = promotionRef ? snapshots[3] : undefined;
      const redemptionSnapshot = redemptionRef ? snapshots[4] : undefined;

      if (!metadataSnapshot.exists || metadataSnapshot.data()?.['status'] !== 'complete') {
        throw new HttpError(503, 'Los pedidos en línea se están configurando. Por ahora, puedes terminar tu pedido por WhatsApp.');
      }
      if (existingOrder.exists) {
        throw new HttpError(409, 'No pudimos confirmar un código de pedido único. Inténtalo nuevamente.');
      }
      if (promotionRef) {
        if (!promotionSnapshot?.exists) throw new HttpError(409, 'La promoción cambió. Actualiza el catálogo e inténtalo nuevamente.');
        const currentPromotion: Record<string, unknown> = { ...(promotionSnapshot.data() ?? {}), id: promotionRef.id };
        if (String(currentPromotion['code'] ?? '').toLocaleUpperCase('es') !== payload.promotionCode) {
          throw new HttpError(409, 'El código promocional cambió. Actualiza tu pedido antes de confirmar.');
        }
        if (!isPromotionActive(currentPromotion)) throw new HttpError(400, 'Esta promoción ya no está vigente o alcanzó su límite de usos.');
        const currentCalculation = calculatePromotionDiscount(currentPromotion, toPromotionBoxes(payload.boxes, catalog));
        if (currentCalculation.discountAmount <= 0 || Math.abs(currentCalculation.discountAmount - order.discount) > 0.01) {
          throw new HttpError(409, 'Las condiciones de la promoción cambiaron. Actualiza tu pedido antes de confirmar.');
        }
        const maxUses = Math.max(0, Math.floor(Number(currentPromotion['maxUses'] ?? 0)));
        if (maxUses > 0 && Number(currentPromotion['usageCount'] ?? 0) >= maxUses) {
          throw new HttpError(400, 'Esta promoción alcanzó su límite de usos.');
        }
        const customerLimit = Math.max(0, Math.floor(Number(currentPromotion['maxUsesPerCustomer'] ?? 0)));
        if (customerLimit > 0 && Number(redemptionSnapshot?.data()?.['usageCount'] ?? 0) >= customerLimit) {
          throw new HttpError(400, 'Ya alcanzaste el límite de usos de esta promoción.');
        }
      }

      const previous = rateSnapshot.data() ?? {};
      const previousWindow = Number(previous['windowStart'] ?? 0);
      const inCurrentWindow = now >= previousWindow && now - previousWindow < RATE_LIMIT_WINDOW_MS;
      const nextCount = inCurrentWindow ? Number(previous['count'] ?? 0) + 1 : 1;
      if (nextCount > RATE_LIMIT_MAX_ORDERS) {
        throw new HttpError(429, 'Se alcanzó el límite temporal de pedidos desde esta conexión. Inténtalo más tarde o escríbenos por WhatsApp.');
      }

      const demandQuantities = new Map<string, number>();
      for (const line of order.lines) {
        if (line.id && line.id !== 'shipping' && Number.isFinite(line.qty) && line.qty > 0) {
          demandQuantities.set(line.id, (demandQuantities.get(line.id) ?? 0) + line.qty);
        }
      }
      const demandEntries = [...demandQuantities.entries()];
      const demandSnapshots: DocumentSnapshot[] = [];
      for (const [productId] of demandEntries) {
        demandSnapshots.push(await transaction.get(db.collection('productionDemand').doc(productId)));
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
      transaction.set(customerRef, { ...customerRecord, searchTokens: searchTokensFor(customerRecord), nameSearchTokens: nameSearchTokensFor(customerRecord), sortIndex: Number(matchedCustomer?.data()?.['sortIndex'] ?? now) });
      transaction.set(phoneLookupRef, { customerId, normalizedPhone, updatedAt: createdAt });
      transaction.set(orderPhoneLookupRef, { orderId, normalizedPhone, createdAt });
      transaction.set(orderRef, { ...orderRecord, searchTokens: searchTokensFor(orderRecord), sortIndex: now });
      if (promotionRef) {
        transaction.set(promotionRef, { usageCount: FieldValue.increment(1), updatedAt: createdAt }, { merge: true });
        if (redemptionRef) transaction.set(redemptionRef, {
          promotionId: promotionRef.id,
          customerHash: phoneLookupHash,
          usageCount: FieldValue.increment(1),
          lastOrderId: orderId,
          updatedAt: createdAt,
        }, { merge: true });
      }
      demandEntries.forEach(([productId, quantity], index) => {
        const snapshot = demandSnapshots[index];
        transaction.set(db.collection('productionDemand').doc(productId), {
          recipeId: productId,
          pendingUnits: Math.max(0, Number(snapshot.exists ? snapshot.data()?.['pendingUnits'] ?? 0 : 0) + quantity),
          updatedAt: createdAt,
        });
      });
      transaction.set(metadataRef, {
        arrayKeys: Array.from(new Set([...arrayKeys, 'orders'])),
        stateKeys: Array.from(new Set([...stateKeys, 'orders'])),
        recordCounts: {
          ...recordCounts,
          orders: Number(recordCounts['orders'] ?? 0) + 1,
          ...(!matchedCustomer ? { customers: Number(recordCounts['customers'] ?? 0) + 1 } : {}),
        },
        revision: FieldValue.increment(1),
        changedKeys: ['orders', 'customer:' + customerId, 'stats:demand', ...(promotionRef ? ['promotions'] : [])],
      }, { merge: true });
    });

    res.status(201).json({ ok: true, orderId, total: order.total, discount: order.discount, documentShortCode, documentExpiresAt });
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
    || (hostname.startsWith('starkies') && hostname.endsWith('.vercel.app'));
  if (!allowed) throw new HttpError(403, 'Origen no permitido.');
}

function parsePayload(body: unknown, catalog: Awaited<ReturnType<typeof readPublicCatalog>>): ValidatedOrder {
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
  const zone = catalog.zones.find(item => item.id === zoneId);
  if (!zone) throw new HttpError(400, 'Selecciona una zona de entrega válida.');

  const address = typeof candidate['address'] === 'string' ? candidate['address'].trim() : '';
  if (zone.name !== 'Retiro en tienda' && (address.length < 5 || address.length > 250)) {
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
  const promotionCode = optionalString(candidate['promotionCode'], 40).toLocaleUpperCase('es').replace(/\s+/g, '');
  if (!Array.isArray(candidate['boxes']) || candidate['boxes'].length < 1 || candidate['boxes'].length > 10) {
    throw new HttpError(400, 'El pedido debe incluir entre 1 y 10 cajas.');
  }

  const boxes = candidate['boxes'].map(rawBox => {
    if (!isRecord(rawBox)) throw new HttpError(400, 'Una de las cajas no tiene un formato válido.');
    const presentationId = stringField(rawBox, 'presentationId', 1, 40);
    const presentation = catalog.presentations.find(item => item.id === presentationId);
    if (!presentation) throw new HttpError(400, 'Selecciona una presentación de caja válida.');
    if (!isRecord(rawBox['items'])) throw new HttpError(400, 'El detalle de una caja no tiene un formato válido.');

    const items: Record<string, number> = {};
    let classicCount = 0;
    let nyCount = 0;
    let lineTotalCents = 0;
    for (const [productId, rawQuantity] of Object.entries(rawBox['items'])) {
      const product = catalog.products.find(item => item.id === productId);
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

  return { name, phone, zoneId, address, deliveryDate, cookieName, notes, promotionCode, boxes };
}

function validateAndBuildOrder(payload: ValidatedOrder, catalog: Awaited<ReturnType<typeof readPublicCatalog>>, promotion: Record<string, unknown> | null) {
  const zone = catalog.zones.find(item => item.id === payload.zoneId)!;
  const lineItems = new Map<string, { id: string; name: string; qty: number; price: number }>();
  let boxTotalCents = 0;

  for (const box of payload.boxes) {
    const presentation = catalog.presentations.find(item => item.id === box.presentationId)!;
    boxTotalCents += Math.round(presentation.price * 100);
    for (const [productId, quantity] of Object.entries(box.items)) {
      const product = catalog.products.find(item => item.id === productId)!;
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
  const promotionCalculation = promotion
    ? calculatePromotionDiscount(promotion, toPromotionBoxes(payload.boxes, catalog))
    : { discountAmount: 0, eligibleBoxIndexes: [], discountedBoxIndexes: [] };
  const discountCents = Math.max(0, Math.min(boxTotalCents, Math.round(promotionCalculation.discountAmount * 100)));
  if (promotion && discountCents <= 0) throw new HttpError(400, 'Tu pedido no cumple las condiciones de esta promoción.');
  const totalCents = Math.max(0, boxTotalCents + Math.round(zone.fee * 100) - discountCents);
  const promotionSnapshot = promotion ? {
    id: String(promotion['id'] ?? ''),
    name: String(promotion['name'] ?? promotion['title'] ?? 'Promoción'),
    title: String(promotion['title'] ?? promotion['name'] ?? 'Promoción'),
    code: String(promotion['code'] ?? payload.promotionCode),
    discount: discountCents / 100,
  } : null;
  return {
    ...payload,
    zoneName: zone.name,
    discount: discountCents / 100,
    promotion: promotionSnapshot,
    total: totalCents / 100,
    lines,
  };
}

function toPromotionBoxes(
  boxes: ValidatedOrder['boxes'],
  catalog: Awaited<ReturnType<typeof readPublicCatalog>>,
): PromotionCartBox[] {
  return boxes.map(box => {
    const presentation = catalog.presentations.find(item => item.id === box.presentationId);
    return { presentationId: box.presentationId, price: presentation?.price ?? 0, items: box.items };
  });
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
  const realIp = headerValue(req.headers['x-real-ip']);
  if (realIp) return realIp.trim();
  const forwarded = headerValue(req.headers['x-forwarded-for']);
  if (forwarded) {
    const chain = forwarded.split(',').map(value => value.trim()).filter(Boolean);
    if (chain.length) return chain[chain.length - 1];
  }
  return 'unknown';
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


function getDocumentSigningKey(): string {
  const raw = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
  if (!raw) throw new HttpError(503, 'La configuración de documentos de pedidos no está completa.');
  try {
    const account = JSON.parse(raw) as { project_id?: string; private_key?: string };
    if (account.project_id !== 'starkies' || !account.private_key) throw new Error('Invalid service account');
    return account.private_key;
  } catch {
    throw new HttpError(503, 'La configuración de documentos de pedidos no está completa.');
  }
}

function createOrderDocumentToken(orderId: string, expiresAt: number, signingKey: string): string {
  const payload = orderId + '.' + expiresAt;
  const signature = createHmac('sha256', signingKey).update(payload).digest('hex');
  return payload + '.' + signature;
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '').replace(/^593/, '0');
}
