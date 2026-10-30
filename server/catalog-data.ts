import type { Firestore } from 'firebase-admin/firestore';
// Keep the explicit .js specifier: Vercel runs this API as native Node ESM.
import { BOX_PRESENTATIONS, DEFAULT_DELIVERY_ZONES, rankCatalogProducts } from '../apps/catalog/src/app/pages/catalog/catalog.data.js';
import { isPromotionActive } from '../apps/catalog/src/app/pages/catalog/promotion-engine.js';
import { resolveLegacyProductImage } from '../scripts/lib/legacy-product-image-resolver.mjs';
import type { PromotionMechanic, PromotionMechanicType, PublicPromotion } from '../apps/catalog/src/app/pages/catalog/catalog.models.js';

// Keep this small resolver local to the API entrypoint. Vercel's native Node ESM
// runtime was loading a stale/non-matching JS module for the shared TS-only file,
// which prevented the entire public catalog function from starting.
const LEGACY_PRODUCT_IMAGE_FILES: Readonly<Record<string, string>> = {
  '02885ca5-c58c-48a7-b116-cd614290c697': '02885ca5-c58c-48a7-b116-cd614290c697.png',
  '0794f338-588b-460d-b002-ee4e614826c9': '0794f338-588b-460d-b002-ee4e614826c9.png',
  '0a783c0b-8993-41a0-b986-b03b57674ca9': '0a783c0b-8993-41a0-b986-b03b57674ca9-ade40aeb-b2ff-4c3e-8ec6-fe9364df1485.png',
  '1b601e8d-17da-4f66-909d-5324bce3acfe': '1b601e8d-17da-4f66-909d-5324bce3acfe-c28bc795-6020-411e-9b87-5f179c0c7019.png',
  '202edec5-9b83-4e9b-a466-c32bd1a05d44': '202edec5-9b83-4e9b-a466-c32bd1a05d44.jpg',
  '5954e0af-d58c-40ce-a79d-cbcff10c7b78': '5954e0af-d58c-40ce-a79d-cbcff10c7b78.png',
  '5cbf3e5f-edb0-490b-b544-8741ba6cffe7': '5cbf3e5f-edb0-490b-b544-8741ba6cffe7.png',
  '6539b2bd-5e58-4485-8ff9-b625d1aa6147': '6539b2bd-5e58-4485-8ff9-b625d1aa6147.jpg',
  '85e499f3-37c9-4701-bf89-5176007ce546': '85e499f3-37c9-4701-bf89-5176007ce546.png',
  '93492b6c-f402-4ca3-9ccd-9dfbd957c40a': '93492b6c-f402-4ca3-9ccd-9dfbd957c40a-55f6444e-79a8-4dcb-b5a0-78dfd3cf18be.png',
  '99e32e0c-61fb-41b1-8018-fa18ef655750': '99e32e0c-61fb-41b1-8018-fa18ef655750.png',
  'e9005152-d579-444f-905f-a06a5ad3d74b': 'e9005152-d579-444f-905f-a06a5ad3d74b.jpg',
  'f126ae46-9eee-4ac2-8cff-d2f954d708e9': 'f126ae46-9eee-4ac2-8cff-d2f954d708e9.png',
};
const LEGACY_PRODUCT_IMAGE_CDN_BASE =
  'https://cdn.jsdelivr.net/gh/XitoDev/starkies@85d0471f159ead399e104254ee7af1890e7d502f/public/images/products/';

function resolvePublicProductImage(imagePath: string, fallbackId: string): string | undefined {
  return resolveLegacyProductImage(imagePath, fallbackId, LEGACY_PRODUCT_IMAGE_FILES, LEGACY_PRODUCT_IMAGE_CDN_BASE);
}

export interface PublicProduct {
  id: string;
  name: string;
  category: string;
  description: string;
  tag?: string;
  price: number;
  isNy: boolean;
  stock: boolean;
  image?: string;
}
export interface PublicDeliveryZone { id: string; name: string; fee: number; }
export interface PublicCatalog {
  products: PublicProduct[];
  zones: PublicDeliveryZone[];
  presentations: typeof BOX_PRESENTATIONS;
  promotions: PublicPromotion[];
}

function publicImage(value: string, productId: string): string | undefined {
  if (!value) return undefined;
  return resolvePublicProductImage(value, productId);
}


function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export async function readPublicCatalog(db: Firestore): Promise<PublicCatalog> {
  // The public endpoint reads only the explicitly published projection. Recipe
  // documents are private business data and must never be serialized to clients.
  const [publicSnapshot, settingsSnapshot, metaSnapshot, salesSnapshot, promotionsSnapshot] = await Promise.all([
    // Do not use Firestore orderBy here: documents without sortIndex are omitted
    // by that query, which made the public catalog look empty after older writes.
    db.collection('publicCatalog').get(),
    db.doc('publicCatalog/catalog-settings').get(),
    db.doc('system/stateMeta').get(),
    db.collection('productSalesStats').get(),
    db.collection('promotions').get(),
  ]);
  if (!metaSnapshot.exists || metaSnapshot.data()?.['status'] !== 'complete') {
    throw new Error('El catálogo del negocio todavía no está disponible.');
  }

  const orderedPublicDocs = [...publicSnapshot.docs].sort((left, right) => {
    const leftIndex = numberValue(asRecord(left.data())['sortIndex'], Number.MAX_SAFE_INTEGER);
    const rightIndex = numberValue(asRecord(right.data())['sortIndex'], Number.MAX_SAFE_INTEGER);
    return leftIndex - rightIndex || left.id.localeCompare(right.id);
  });
  const products: PublicProduct[] = orderedPublicDocs.flatMap(document => {
    if (document.id === 'catalog-settings') return [];
    const item = asRecord(document.data());
    const id = stringValue(item['id'], document.id);
    const name = stringValue(item['name']);
    const category = stringValue(item['category'], 'Galletas clásicas');
    const price = numberValue(item['price'], Number.NaN);
    if (!id || !name || !Number.isFinite(price) || price < 0) return [];
    const normalizedCategory = category.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    const grams = numberValue(item['baseGramsPerCookie'], 0);
    const isNy = item['isNy'] === true || normalizedCategory.includes('ny') || normalizedCategory.includes('new york') || grams >= 50;
    const image = publicImage(stringValue(item['image']), id);
    return [{
      id,
      name,
      category: isNy ? 'Galletas NY' : 'Galletas clásicas',
      description: stringValue(item['description']),
      ...(stringValue(item['tag']) ? { tag: stringValue(item['tag']) } : {}),
      price,
      isNy,
      stock: item['stock'] !== false,
      ...(image ? { image } : {}),
    }];
  });

  const salesCounts = new Map<string, number>(
    salesSnapshot.docs.map(document => [document.id, numberValue(document.data()['unitsSold'], 0)]),
  );
  const rankedProducts = rankCatalogProducts(products, salesCounts);
  const settings = asRecord(settingsSnapshot.data());
  const zones = (Array.isArray(settings['zones']) ? settings['zones'] : []).flatMap((raw, index) => {
    const zone = asRecord(raw);
    const id = stringValue(zone['id'], `zone-${index + 1}`);
    const name = stringValue(zone['name']);
    const fee = numberValue(zone['fee'], Number.NaN);
    return id && name && Number.isFinite(fee) && fee >= 0 ? [{ id, name, fee }] : [];
  });
  const promotions: PublicPromotion[] = promotionsSnapshot.docs.flatMap(document => {
    const item = asRecord(document.data());
    if (!isPromotionActive(item)) return [];
    const mechanic = asRecord(item['mechanic']);
    const type = stringValue(mechanic['type']);
    if (!['buy_x_get_y_discount', 'percentage', 'fixed_amount', 'minimum_subtotal'].includes(type)) return [];
    const code = stringValue(item['code']).toLocaleUpperCase('es');
    const title = stringValue(item['title']);
    const discountValue = numberValue(mechanic['discountValue'], Number.NaN);
    if (!code || !title || !Number.isFinite(discountValue) || discountValue <= 0) return [];
    const productIds = Array.isArray(mechanic['productIds'])
      ? mechanic['productIds'].filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      : [];
    const discountType = stringValue(mechanic['discountType']) === 'fixed' ? 'fixed' : 'percentage';
    const publicMechanic: PromotionMechanic = {
      type: type as PromotionMechanicType,
      productIds,
      requireAllProducts: mechanic['requireAllProducts'] === true,
      ...(stringValue(mechanic['presentationId']) ? { presentationId: stringValue(mechanic['presentationId']) } : {}),
      buyQuantity: Math.max(1, Math.floor(numberValue(mechanic['buyQuantity'], 1))),
      rewardQuantity: Math.max(1, Math.floor(numberValue(mechanic['rewardQuantity'], 1))),
      discountType,
      discountValue,
      minimumSubtotal: Math.max(0, numberValue(mechanic['minimumSubtotal'])),
      maxApplications: Math.max(0, Math.floor(numberValue(mechanic['maxApplications']))),
    };
    const bannerImage = stringValue(item['bannerImage']);
    return [{
      id: document.id,
      title,
      description: stringValue(item['description']),
      code,
      ...(bannerImage ? { bannerImage } : {}),
      showInCatalog: item['showInCatalog'] !== false,
      mechanic: publicMechanic,
    }];
  });

  return {
    products: rankedProducts,
    zones: zones.length ? zones : DEFAULT_DELIVERY_ZONES,
    presentations: BOX_PRESENTATIONS,
    promotions,
  };
}

/**
 * Maintains the root-level public projection. Only published products and
 * explicitly public delivery settings are written to this collection.
 */
export async function syncPublicCatalogProjection(db: Firestore, catalog: PublicCatalog): Promise<void> {
  const collectionRef = db.collection('publicCatalog');
  const current = await collectionRef.get();
  const wantedIds = new Set(catalog.products.map(product => product.id));
  const batch = db.batch();

  for (const document of current.docs) {
    if (document.id !== 'catalog-settings' && !wantedIds.has(document.id)) batch.delete(document.ref);
  }
  catalog.products.forEach((product, index) => {
    // Firestore rejects undefined optional properties. Strip them at the
    // persistence boundary so an untagged cookie cannot break the whole sync.
    const value: PublicProduct = { ...product };
    if (value.tag === undefined || value.tag === '') delete value.tag;
    if (value.image === undefined || value.image === '') delete value.image;
    batch.set(collectionRef.doc(product.id), { ...value, sortIndex: index });
  });
  batch.set(collectionRef.doc('catalog-settings'), {
    id: 'catalog-settings',
    kind: 'settings',
    zones: catalog.zones,
    presentations: catalog.presentations,
    sortIndex: catalog.products.length,
  });
  await batch.commit();
}
