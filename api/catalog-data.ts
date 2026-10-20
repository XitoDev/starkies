import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { BOX_PRESENTATIONS } from '../apps/catalog/src/app/pages/catalog/catalog.data';

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
  const [recipesSnapshot, zonesSnapshot, metaSnapshot] = await Promise.all([
    recipesRef.orderBy('index', 'asc').get(),
    db.doc('businesses/starkies/settings/deliveryZones').get(),
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
    const image = stringValue(recipe['image']) || undefined;
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

  const zonesValue = zonesSnapshot.data()?.['value'];
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
