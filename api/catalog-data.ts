import type { Firestore } from 'firebase-admin/firestore';
// Keep the explicit .js specifier: Vercel runs this API as native Node ESM.
import { BOX_PRESENTATIONS } from '../apps/catalog/src/app/pages/catalog/catalog.data.js';

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

const IMAGE_CDN_BASE = 'https://cdn.jsdelivr.net/gh/XitoDev/starkies@eed4ced5756232d2957340e18b86d18877e833ae/public/images/';
const IMAGE_FILES: Record<string, string> = {
  '6539b2bd-5e58-4485-8ff9-b625d1aa6147': 'recipe-6539b2bd-5e58-4485-8ff9-b625d1aa6147.jpg',
  '202edec5-9b83-4e9b-a466-c32bd1a05d44': 'recipe-202edec5-9b83-4e9b-a466-c32bd1a05d44.jpg',
  '85e499f3-37c9-4701-bf89-5176007ce546': 'recipe-85e499f3-37c9-4701-bf89-5176007ce546.png',
  '02885ca5-c58c-48a7-b116-cd614290c697': 'recipe-02885ca5-c58c-48a7-b116-cd614290c697.png',
  'f126ae46-9eee-4ac2-8cff-d2f954d708e9': 'recipe-f126ae46-9eee-4ac2-8cff-d2f954d708e9.png',
  '5cbf3e5f-edb0-490b-b544-8741ba6cffe7': 'recipe-5cbf3e5f-edb0-490b-b544-8741ba6cffe7.png',
  '99e32e0c-61fb-41b1-8018-fa18ef655750': 'recipe-99e32e0c-61fb-41b1-8018-fa18ef655750.png',
  '0794f338-588b-460d-b002-ee4e614826c9': 'recipe-0794f338-588b-460d-b002-ee4e614826c9.png',
  '5954e0af-d58c-40ce-a79d-cbcff10c7b78': 'recipe-5954e0af-d58c-40ce-a79d-cbcff10c7b78.png',
  'e9005152-d579-444f-905f-a06a5ad3d74b': 'recipe-e9005152-d579-444f-905f-a06a5ad3d74b.jpg',
};

function publicImage(value: string, recipeId: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('/api/recipe-image')) {
    const imageId = new URL(value, 'https://starkies.lat').searchParams.get('id') || recipeId;
    const file = IMAGE_FILES[imageId];
    return file ? IMAGE_CDN_BASE + encodeURIComponent(file) : undefined;
  }
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
  const recipesRef = db.collection('businesses/starkies/collections/recipes/records');
  const [recipesSnapshot, zonesSnapshot, catalogSettingsSnapshot, legacyZonesSnapshot, metaSnapshot] = await Promise.all([
    recipesRef.orderBy('index', 'asc').get(),
    db.doc('businesses/starkies/settings/deliveryZones').get(),
    db.doc('businesses/starkies/settings/catalogSettings').get(),
    db.collection('businesses/starkies/collections/deliveryZones/records').orderBy('index', 'asc').get(),
    db.doc('businesses/starkies/system/stateMeta').get(),
  ]);
  if (!metaSnapshot.exists || metaSnapshot.data()?.['status'] !== 'complete') {
    throw new Error('El catálogo del negocio todavía no está disponible.');
  }

  const products: PublicProduct[] = recipesSnapshot.docs.flatMap((document) => {
    const recipe = asRecord(document.data()['value']);
    const id = stringValue(recipe['id'], document.id);
    const name = stringValue(recipe['name']);
    const category = stringValue(recipe['category'], 'Galletas clásicas');
    const price = numberValue(recipe['price'], Number.NaN);
    if (!id || !name || !Number.isFinite(price) || price < 0 || recipe['archived'] === true || recipe['catalogVisible'] === false) return [];
    const normalizedCategory = category.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    const grams = numberValue(recipe['baseGramsPerCookie'], 0);
    const isNy = normalizedCategory.includes('ny') || normalizedCategory.includes('new york') || grams >= 50;
    const image = publicImage(stringValue(recipe['image']), id);
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

  const catalogSettings = asRecord(catalogSettingsSnapshot.data()?.['value']);
  const zonesValue = zonesSnapshot.data()?.['value']
    ?? catalogSettings['deliveryZones']
    ?? legacyZonesSnapshot.docs.map(document => document.data()['value']);
  if (!Array.isArray(zonesValue)) throw new Error('No hay tarifas de entrega configuradas en el negocio.');
  const zones = zonesValue.flatMap((raw, index) => {
    const zone = asRecord(raw);
    const id = stringValue(zone['id']);
    const name = stringValue(zone['name']);
    const fee = numberValue(zone['fee'], Number.NaN);
    return id && name && Number.isFinite(fee) && fee >= 0 ? [{ id, name, fee }] : [];
  });
  if (!zones.length) throw new Error('No hay zonas de entrega válidas configuradas en el negocio.');

  return { products, zones, presentations: BOX_PRESENTATIONS };
}

/**
 * Maintains a public projection inside the business namespace. Only published
 * products and public delivery settings are copied into this collection.
 */
export async function syncPublicCatalogProjection(db: Firestore, catalog: PublicCatalog): Promise<void> {
  const collectionRef = db.collection('businesses/starkies/collections/catalog/records');
  const current = await collectionRef.get();
  const wantedIds = new Set(catalog.products.map(product => product.id));
  const batch = db.batch();

  for (const document of current.docs) {
    if (document.id !== '__settings__' && !wantedIds.has(document.id)) batch.delete(document.ref);
  }
  catalog.products.forEach((product, index) => {
    batch.set(collectionRef.doc(product.id), { index, value: product });
  });
  batch.set(collectionRef.doc('__settings__'), {
    index: catalog.products.length,
    value: { zones: catalog.zones, presentations: catalog.presentations },
  });
  await batch.commit();
}
