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
  const recipesRef = db.collection('recipes');
  const [recipesSnapshot, zonesSnapshot, catalogSettingsSnapshot, legacyZonesSnapshot, metaSnapshot, ordersSnapshot] = await Promise.all([
    recipesRef.orderBy('sortIndex', 'asc').get(),
    db.doc('settings/deliveryZones').get(),
    db.doc('settings/catalogSettings').get(),
    db.collection('deliveryZones').orderBy('sortIndex', 'asc').get(),
    db.doc('system/stateMeta').get(),
    db.collection('productSalesStats').get(),
  ]);
  if (!metaSnapshot.exists || metaSnapshot.data()?.['status'] !== 'complete') {
    throw new Error('El catálogo del negocio todavía no está disponible.');
  }

  const products: PublicProduct[] = recipesSnapshot.docs.flatMap((document) => {
    const recipe = asRecord(document.data());
    const id = stringValue(recipe['id'], document.id);
    const name = stringValue(recipe['name']);
    const category = stringValue(recipe['category'], 'Galletas clásicas');
    const price = numberValue(recipe['price'], Number.NaN);
    if (!id || !name || !Number.isFinite(price) || price < 0 || recipe['archived'] === true || recipe['catalogVisible'] === false) return [];
    const normalizedCategory = category.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    const grams = numberValue(recipe['baseGramsPerCookie'], 0);
    const isNy = normalizedCategory.includes('ny') || normalizedCategory.includes('new york') || grams >= 50;
    // The public catalog owns its image; retain the recipe image as a backward-compatible fallback.
    const image = publicImage(stringValue(recipe['catalogImage'] ?? recipe['image']), id);
    return [{
      id,
      name,
      category: isNy ? 'Galletas NY' : 'Galletas clásicas',
      description: stringValue(recipe['catalogDescription']) || stringValue(recipe['description']),
      ...(stringValue(recipe['catalogLabel']) ? { tag: stringValue(recipe['catalogLabel']) } : {}),
      price,
      isNy,
      stock: true,
      ...(image ? { image } : {}),
    }];
  });

  const salesCounts = new Map<string, number>(ordersSnapshot.docs.map(document => [document.id, numberValue(document.data()['unitsSold'], 0)]));
  const rankedProducts = rankCatalogProducts(products, salesCounts);

  const catalogSettings = asRecord(catalogSettingsSnapshot.data()?.['data']);
  // An empty settings array must not mask valid legacy/catalog settings.
  const zoneCandidates: unknown[] = [
    zonesSnapshot.data()?.['data'],
    catalogSettings['deliveryZones'],
    legacyZonesSnapshot.docs.map(document => { const data = document.data(); const { sortIndex: _sortIndex, ...zone } = data; return zone; }),
  ];
  const zonesValue = zoneCandidates.find(value => Array.isArray(value) && value.length > 0);
  const zones = (Array.isArray(zonesValue) ? zonesValue : []).flatMap((raw, index) => {
    const zone = asRecord(raw);
    const id = stringValue(zone['id'], `zone-${index + 1}`);
    const name = stringValue(zone['name']);
    const fee = numberValue(zone['fee'], Number.NaN);
    return id && name && Number.isFinite(fee) && fee >= 0 ? [{ id, name, fee }] : [];
  });
  if (!zones.length) {
    console.warn('No valid delivery zones were found in business settings; using the same shared defaults as admin.');
    zones.push(...DEFAULT_DELIVERY_ZONES);
  }

  return { products: rankedProducts, zones, presentations: BOX_PRESENTATIONS };
}

/**
 * Maintains a public projection inside the business namespace. Only published
 * products and public delivery settings are copied into this collection.
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
