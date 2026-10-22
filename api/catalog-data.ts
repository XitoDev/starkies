import type { Firestore } from 'firebase-admin/firestore';
// Keep the explicit .js specifier: Vercel runs this API as native Node ESM.
import { BOX_PRESENTATIONS, DEFAULT_DELIVERY_ZONES, rankCatalogProducts } from '../apps/catalog/src/app/pages/catalog/catalog.data.js';

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
}

const LEGACY_RECIPE_IMAGE_FILES: Readonly<Record<string, string>> = {
  '6539b2bd-5e58-4485-8ff9-b625d1aa6147': 'recipe-6539b2bd-5e58-4485-8ff9-b625d1aa6147.jpg',
  '202edec5-9b83-4e9b-a466-c32bd1a05d44': 'recipe-202edec5-9b83-4e9b-a466-c32bd1a05d44.jpg',
  '85e499f3-37c9-4701-bf89-5176007ce546': 'recipe-85e499f3-37c9-4701-bf89-5176007ce546.png',
  '02885ca5-c58c-48a7-b116-cd614290c697': 'recipe-02885ca5-c58c-48a7-b116-cd614290c697.png',
  'f126ae46-9eee-4ac2-8cff-d2f9543d708e9': 'recipe-f126ae46-9eee-4ac2-8cff-d2f9543d708e9.png',
  '5cbf3e5f-edb0-490b-b544-8741ba6cffe7': 'recipe-5cbf3e5f-edb0-490b-b544-8741ba6cffe7.png',
  '99e32e0c-61fb-41b1-8018-fa18ef655750': 'recipe-99e32e0c-61fb-41b1-8018-fa18ef655750.png',
  '0794f338-588b-460d-b002-ee4e614826c9': 'recipe-0794f338-588b-460d-b002-ee4e614826c9.png',
  '5954e0af-d58c-40ce-a79d-cbcff10c7b78': 'recipe-5954e0af-d58c-40ce-a79d-cbcff10c7b78.png',
  'e9005152-d579-444f-905f-a06a5ad3d74b': 'recipe-e9005152-d579-444f-905f-a06a5ad3d74b.jpg',
};
const LEGACY_RECIPE_IMAGE_CDN_BASE =
  'https://cdn.jsdelivr.net/gh/XitoDev/starkies@eed4ced5756232d2957340e18b86d18877e833ae/public/images/';
function resolveLegacyRecipeImage(imagePath: string, fallbackId: string): string | undefined {
  if (!imagePath) return undefined;
  if (!imagePath.startsWith('/api/recipe-image')) return imagePath;
  let imageId = fallbackId;
  try { imageId = new URL(imagePath, 'https://starkies.lat').searchParams.get('id') || imageId; } catch { /* use fallback */ }
  const fileName = LEGACY_RECIPE_IMAGE_FILES[imageId];
  return fileName ? LEGACY_RECIPE_IMAGE_CDN_BASE + encodeURIComponent(fileName) : undefined;
}

function publicImage(value: string, recipeId: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('/api/recipe-image')) return resolveLegacyRecipeImage(value, recipeId);
  return value;
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
  const [publicSnapshot, settingsSnapshot, metaSnapshot, salesSnapshot] = await Promise.all([
    db.collection('publicCatalog').orderBy('sortIndex', 'asc').get(),
    db.doc('publicCatalog/catalog-settings').get(),
    db.doc('system/stateMeta').get(),
    db.collection('productSalesStats').get(),
  ]);
  if (!metaSnapshot.exists || metaSnapshot.data()?.['status'] !== 'complete') {
    throw new Error('El catálogo del negocio todavía no está disponible.');
  }

  const products: PublicProduct[] = publicSnapshot.docs.flatMap(document => {
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
  return {
    products: rankedProducts,
    zones: zones.length ? zones : DEFAULT_DELIVERY_ZONES,
    presentations: BOX_PRESENTATIONS,
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
