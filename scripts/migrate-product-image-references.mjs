import { readFile } from 'node:fs/promises';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');
const IMAGE_MAP_URL = new URL('../public/images/image-map.json', import.meta.url);

function asRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}
function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function isProductUrl(value) {
  return /\/public\/images\/products\/|\/images\/products\//.test(text(value));
}
function isLegacyProductUrl(value) {
  return /\/public\/images\/(?:recipe-|catalog-)|\/images\/(?:recipe-|catalog-)|\/api\/recipe-image/.test(text(value));
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
  const productImages = new Map(
    Object.entries(mapEntries)
      .filter(([key, value]) => key.startsWith('product:') && isProductUrl(asRecord(value).url))
      .map(([key, value]) => [key.slice('product:'.length), text(asRecord(value).url)]),
  );
  if (!productImages.size) throw new Error('No se encontraron imágenes canónicas product:* en public/images/image-map.json.');

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
  const publicProducts = new Map(publicSnapshot.docs.filter(doc => doc.id !== 'catalog-settings').map(doc => [doc.id, doc.data()]));
  const canonicalById = new Map();

  const allIds = new Set([...recipes.keys(), ...drafts.keys(), ...publicProducts.keys()]);
  for (const id of allIds) {
    const recipe = asRecord(recipes.get(id));
    const draft = asRecord(drafts.get(id));
    const publicProduct = asRecord(publicProducts.get(id));
    const references = [recipe.image, recipe.catalogImage, draft.image, publicProduct.image].map(text).filter(Boolean);
    const mapped = productImages.get(id);
    const existingProductUrl = references.find(isProductUrl);
    const canonical = text(existingProductUrl) || (references.length ? mapped ?? '' : '');
    if (canonical) canonicalById.set(id, canonical);
  }

  const changes = [];
  const unresolved = [];
  for (const doc of recipesSnapshot.docs) {
    const data = doc.data();
    const canonical = canonicalById.get(doc.id);
    const patch = {};
    if (canonical && text(data['image']) !== canonical) patch['image'] = canonical;
    if (canonical && Object.prototype.hasOwnProperty.call(data, 'catalogImage')) patch['catalogImage'] = FieldValue.delete();
    if (Object.keys(patch).length) changes.push({ collection: 'recipes', id: doc.id, ref: doc.ref, patch });
    else if (isLegacyProductUrl(data['image']) || isLegacyProductUrl(data['catalogImage'])) unresolved.push('recipes/' + doc.id);
  }
  for (const doc of draftsSnapshot.docs) {
    const data = doc.data();
    const canonical = canonicalById.get(doc.id);
    if (canonical && Object.prototype.hasOwnProperty.call(data, 'image')) {
      changes.push({ collection: 'catalogDrafts', id: doc.id, ref: doc.ref, patch: { image: FieldValue.delete() } });
    } else if (isLegacyProductUrl(data['image'])) unresolved.push('catalogDrafts/' + doc.id);
  }
  for (const doc of publicSnapshot.docs) {
    if (doc.id === 'catalog-settings') continue;
    const data = doc.data();
    const canonical = canonicalById.get(doc.id);
    if (canonical && text(data['image']) !== canonical) {
      changes.push({ collection: 'publicCatalog', id: doc.id, ref: doc.ref, patch: { image: canonical } });
    } else if (isLegacyProductUrl(data['image'])) unresolved.push('publicCatalog/' + doc.id);
  }

  const promotionImageEntries = new Map(
    Object.entries(mapEntries)
      .filter(([key, value]) => key.startsWith('promotion:') && /\/public\/images\/promotions\//.test(text(asRecord(value).url)))
      .map(([key, value]) => [key.slice('promotion:'.length), text(asRecord(value).url)]),
  );
  for (const doc of promotionsSnapshot.docs) {
    const data = doc.data();
    const mapped = promotionImageEntries.get(doc.id);
    if (mapped && text(data['bannerImage']) !== mapped) {
      changes.push({ collection: 'promotions', id: doc.id, ref: doc.ref, patch: { bannerImage: mapped } });
    } else if (text(data['bannerImage']) && !/\/public\/images\/promotions\//.test(text(data['bannerImage']))) {
      unresolved.push('promotions/' + doc.id + ' (bannerImage)');
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
    unresolvedLegacyReferences: unresolved,
    sampleChanges: changes.slice(0, 20).map(({ collection, id, patch }) => ({
      collection, id, fields: Object.keys(patch),
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!APPLY || !changes.length) return;

  const writer = db.bulkWriter();
  for (const change of changes) writer.update(change.ref, change.patch);
  await writer.close();
  await db.doc('system/stateMeta').set({
    revision: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
    changedKeys: ['recipes', 'catalogDrafts', 'publicCatalog', 'promotions'],
  }, { merge: true });
  console.log('Migración aplicada. No se borraron archivos ni documentos.');
}

main().catch(error => {
  console.error('No se pudo completar la migración:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
