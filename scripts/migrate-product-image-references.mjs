import { access, readFile } from 'node:fs/promises';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { resolveCanonicalImage } from './product-image-migration-utils.mjs';

const APPLY = process.argv.includes('--apply');
const IMAGE_MAP_URL = new URL('../public/images/image-map.json', import.meta.url);
const LEGACY_CATALOG_IMAGE_FIELD = 'catalogImage';

function hasOwn(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

async function loadProductImages(mapEntries) {
  const images = new Map();
  for (const [key, rawValue] of Object.entries(mapEntries)) {
    if (!key.startsWith('product:')) continue;
    const entry = asRecord(rawValue);
    const path = text(entry.path);
    const url = text(entry.url);
    if (!path.startsWith('public/images/products/') || path.slice('public/images/products/'.length).includes('/') || !isProductUrl(url)) {
      throw new Error('La entrada ' + key + ' no apunta a un archivo válido de products/.');
    }
    try {
      await access(new URL('../' + path, import.meta.url));
    } catch {
      throw new Error('La imagen canónica no existe en el repositorio: ' + path + ' (' + key + ').');
    }
    images.set(key.slice('product:'.length), url);
  }
  if (!images.size) throw new Error('No se encontraron imágenes canónicas product:* en public/images/image-map.json.');
  return images;
}


function asRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}
function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function isProductUrl(value) {
  return /\/public\/images\/products\/|\/images\/products\//.test(text(value));
}

async function main() {
  const rawAccount = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
  if (!rawAccount) throw new Error('Define FIREBASE_SERVICE_ACCOUNT_JSON antes de ejecutar la migración.');
  const account = JSON.parse(rawAccount);
  if (account.project_id !== 'starkies' || !account.client_email || !account.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no corresponde al proyecto starkies o está incompleto.');
  }

  const imageMap = JSON.parse(await readFile(IMAGE_MAP_URL, 'utf8'));
  const mapEntries = asRecord(imageMap.images);
  const productImages = await loadProductImages(mapEntries);
  const appName = 'starkies-product-image-migration';
  const app = getApps().find(candidate => candidate.name === appName) ?? initializeApp({
    credential: cert({
      projectId: account.project_id,
      clientEmail: account.client_email,
      privateKey: account.private_key.replace(/\\n/g, '\n'),
    }),
  }, appName);
  const db = getFirestore(app);
  const [recipesSnapshot, draftsSnapshot, publicSnapshot, promotionsSnapshot] = await Promise.all([
    db.collection('recipes').get(),
    db.collection('catalogDrafts').get(),
    db.collection('publicCatalog').get(),
    db.collection('promotions').get(),
  ]);

  const recipes = new Map(recipesSnapshot.docs.map(doc => [doc.id, doc.data()]));
  const drafts = new Map(draftsSnapshot.docs.map(doc => [doc.id, doc.data()]));
  const publicProducts = new Map(publicSnapshot.docs
    .filter(doc => doc.id !== 'catalog-settings')
    .map(doc => [doc.id, doc.data()]));
  const allIds = new Set([...recipes.keys(), ...drafts.keys(), ...publicProducts.keys()]);
  const canonicalById = new Map();
  const unresolved = [];
  const conflicts = [];
  const legacyImageResolutions = [];

  for (const id of allIds) {
    const recipe = asRecord(recipes.get(id));
    const draft = asRecord(drafts.get(id));
    const publicProduct = asRecord(publicProducts.get(id));
    const result = resolveCanonicalImage(recipe, draft, publicProduct, productImages.get(id), productImages);
    if (result.canonical) canonicalById.set(id, result.canonical);
    if (result.unresolved.length) unresolved.push({ id, references: result.unresolved });
    if (result.legacyImageResolutions.length) legacyImageResolutions.push({ id, references: result.legacyImageResolutions });
    if (result.conflicts.length) conflicts.push({
      id,
      selectedSource: result.source,
      canonical: result.canonical,
      otherReferences: result.conflicts,
    });
  }
  const unresolvedIds = new Set(unresolved.map(item => item.id));

  const changes = [];
  for (const doc of recipesSnapshot.docs) {
    if (unresolvedIds.has(doc.id)) continue;
    const data = doc.data();
    const canonical = canonicalById.get(doc.id) ?? '';
    const patch = {};
    if (canonical && text(data['image']) !== canonical) patch['image'] = canonical;
    if (hasOwn(data, LEGACY_CATALOG_IMAGE_FIELD)) patch[LEGACY_CATALOG_IMAGE_FIELD] = FieldValue.delete();
    if (Object.keys(patch).length) changes.push({ collection: 'recipes', id: doc.id, ref: doc.ref, patch });
  }
  for (const doc of draftsSnapshot.docs) {
    if (unresolvedIds.has(doc.id)) continue;
    const data = doc.data();
    const patch = {};
    if (hasOwn(data, 'image')) patch['image'] = FieldValue.delete();
    if (hasOwn(data, LEGACY_CATALOG_IMAGE_FIELD)) patch[LEGACY_CATALOG_IMAGE_FIELD] = FieldValue.delete();
    if (Object.keys(patch).length) changes.push({ collection: 'catalogDrafts', id: doc.id, ref: doc.ref, patch });
  }
  for (const doc of publicSnapshot.docs) {
    if (doc.id === 'catalog-settings' || unresolvedIds.has(doc.id)) continue;
    const data = doc.data();
    const canonical = canonicalById.get(doc.id) ?? '';
    const patch = {};
    if (canonical && text(data['image']) !== canonical) patch['image'] = canonical;
    if (hasOwn(data, LEGACY_CATALOG_IMAGE_FIELD)) patch[LEGACY_CATALOG_IMAGE_FIELD] = FieldValue.delete();
    if (Object.keys(patch).length) changes.push({ collection: 'publicCatalog', id: doc.id, ref: doc.ref, patch });
  }

  const promotionImages = new Map(Object.entries(mapEntries)
    .filter(([key, value]) => key.startsWith('promotion:')
      && /\/public\/images\/promotions\//.test(text(asRecord(value).url)))
    .map(([key, value]) => [key.slice('promotion:'.length), text(asRecord(value).url)]));
  for (const doc of promotionsSnapshot.docs) {
    const mapped = promotionImages.get(doc.id);
    if (mapped && text(doc.data()['bannerImage']) !== mapped) {
      changes.push({ collection: 'promotions', id: doc.id, ref: doc.ref, patch: { bannerImage: mapped } });
    }
  }

  const summary = {
    mode: APPLY ? 'apply' : 'dry-run',
    mappedProducts: productImages.size,
    scanned: {
      recipes: recipesSnapshot.size,
      catalogDrafts: draftsSnapshot.size,
      publicCatalog: publicSnapshot.size,
      promotions: promotionsSnapshot.size,
    },
    plannedWrites: changes.length,
    byCollection: Object.fromEntries(['recipes', 'catalogDrafts', 'publicCatalog', 'promotions'].map(name => [
      name, changes.filter(change => change.collection === name).length,
    ])),
    conflictCount: conflicts.length,
    conflicts,
    legacyImageProductCount: legacyImageResolutions.length,
    legacyImageResolutions,
    unresolvedCount: unresolved.length,
    unresolved,
    sampleChanges: changes.slice(0, 30).map(({ collection, id, patch }) => ({
      collection, id, fields: Object.keys(patch),
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!APPLY) return;
  if (!changes.length) {
    if (unresolved.length) console.warn('No se modificaron los ' + unresolved.length + ' productos sin imagen canónica verificable.');
    return;
  }
  if (unresolved.length) {
    console.warn('Se aplicará únicamente la migración segura de los productos resueltos. Los ' + unresolved.length + ' productos sin imagen canónica verificable permanecerán intactos en Firebase.');
  }

  const writer = db.bulkWriter();
  for (const change of changes) writer.update(change.ref, change.patch);
  await writer.close();
  const changedKeys = [...new Set(changes.map(change => change.collection))];
  await db.doc('system/stateMeta').set({
    revision: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
    changedKeys,
  }, { merge: true });
  console.log('Migración parcial segura aplicada. Solo se actualizaron productos con una imagen canónica verificada; los productos sin resolver permanecen intactos. No se borraron archivos ni documentos.');
}

main().catch(error => {
  console.error('No se pudo completar la migración:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
