import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getR2Config, imageObjectKey, parseManagedImageUrl, r2Request } from './lib/r2-storage.mjs';
import { collectImageRecordFailures } from './lib/r2-image-audit.mjs';

function asRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}
function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function fail(message) { failures.push(message); }

const failures = [];
const rawAccount = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
if (!rawAccount) throw new Error('Define FIREBASE_SERVICE_ACCOUNT_JSON before verifying the migration.');
const account = JSON.parse(rawAccount);
if (account.project_id !== 'starkies' || !account.client_email || !account.private_key) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON does not belong to the starkies Firebase project or is incomplete.');
}
const appName = 'starkies-r2-image-migration-verifier';
const app = getApps().find(candidate => candidate.name === appName) ?? initializeApp({
  credential: cert({
    projectId: account.project_id,
    clientEmail: account.client_email,
    privateKey: account.private_key.replace(/\\n/g, '\n'),
  }),
}, appName);
const db = getFirestore(app);
const r2AuditEnv = {
  ...process.env,
  R2_ACCESS_KEY_ID: process.env['R2_AUDIT_ACCESS_KEY_ID'] || process.env['R2_ACCESS_KEY_ID'],
  R2_SECRET_ACCESS_KEY: process.env['R2_AUDIT_SECRET_ACCESS_KEY'] || process.env['R2_SECRET_ACCESS_KEY'],
};
const config = getR2Config(r2AuditEnv);

const [recipesSnapshot, publicSnapshot, promotionsSnapshot, draftsSnapshot, assetsSnapshot] = await Promise.all([
  db.collection('recipes').get(),
  db.collection('publicCatalog').get(),
  db.collection('promotions').get(),
  db.collection('catalogDrafts').get(),
  db.collection('imageAssets').get(),
]);

const publicProducts = new Map(publicSnapshot.docs
  .filter(document => document.id !== 'catalog-settings')
  .map(document => [document.id, asRecord(document.data())]));
const recipes = new Map(recipesSnapshot.docs.map(document => [document.id, asRecord(document.data())]));
const expected = new Map();

for (const message of collectImageRecordFailures({
  recipes: recipesSnapshot.docs.map(document => ({ id: document.id, data: document.data() })),
  publicProducts: [...publicProducts.entries()].map(([id, data]) => ({ id, data })),
  drafts: draftsSnapshot.docs.map(document => ({ id: document.id, data: document.data() })),
})) {
  fail(message);
}

function addReference(url, reference, label) {
  const parsed = parseManagedImageUrl(url, config);
  if (!parsed) {
    fail(label + ' todavía apunta fuera de Cloudflare R2 o no usa una URL WebP content-addressed: ' + url);
    return;
  }
  const references = expected.get(parsed.hash) ?? new Set();
  references.add(reference);
  expected.set(parsed.hash, references);
}

for (const [id, recipe] of recipes) {
  const publicProduct = publicProducts.get(id);
  const recipeImage = text(recipe['image']);
  const publicImage = text(publicProduct?.['image']);
  const canonicalImage = recipeImage || publicImage;
  if (canonicalImage) addReference(canonicalImage, 'product:' + id, 'Producto ' + (text(recipe['name']) || id));
}

for (const [id, product] of publicProducts) {
  if (recipes.has(id)) continue;
  const image = text(product['image']);
  if (image) addReference(image, 'product:' + id, 'Publicación de catálogo sin receta ' + (text(product['name']) || id));
}

for (const document of promotionsSnapshot.docs) {
  const promotion = asRecord(document.data());
  const image = text(promotion['bannerImage']);
  if (image) addReference(image, 'promotion:' + document.id, 'Banner de promoción ' + (text(promotion['name']) || document.id));
}

const assets = new Map(assetsSnapshot.docs.map(document => [document.id, asRecord(document.data())]));
for (const [hash, references] of expected) {
  const asset = assets.get(hash);
  if (!asset) {
    fail('Falta imageAssets/' + hash + ' para una imagen todavía referenciada.');
    continue;
  }
  const actualReferences = Array.isArray(asset['references'])
    ? [...new Set(asset['references'].filter(value => typeof value === 'string'))].sort()
    : [];
  const expectedReferences = [...references].sort();
  if (JSON.stringify(actualReferences) !== JSON.stringify(expectedReferences)) {
    fail('Las referencias registradas de imageAssets/' + hash + ' no coinciden con Firestore.');
  }
  if (Number(asset['refCount'] ?? -1) !== expectedReferences.length) {
    fail('El contador refCount de imageAssets/' + hash + ' no coincide con sus referencias.');
  }
  if (asset['status'] !== 'active') fail('La imagen ' + hash + ' no está en estado active.');
  const key = imageObjectKey(hash);
  if (text(asset['key']) !== key) fail('La clave R2 de imageAssets/' + hash + ' no es la esperada.');
  try {
    const response = await r2Request('HEAD', key, {}, r2AuditEnv);
    if (!response.ok) fail('El objeto R2 no existe o no es accesible: ' + key);
  } catch (error) {
    fail('No se pudo comprobar el objeto R2 ' + key + ': ' + (error instanceof Error ? error.message : String(error)));
  }
}

for (const [hash, asset] of assets) {
  const refs = expected.get(hash);
  const actualCount = Array.isArray(asset['references']) ? asset['references'].length : 0;
  if (!refs || refs.size === 0) {
    fail('imageAssets/' + hash + ' no tiene ninguna referencia activa; espera la limpieza automática antes de purgar Git.');
  } else if (actualCount !== refs.size) {
    fail('imageAssets/' + hash + ' contiene referencias adicionales o duplicadas.');
  }
}

const report = {
  status: failures.length ? 'blocked' : 'verified',
  scanned: {
    recipes: recipesSnapshot.size,
    publicCatalog: publicSnapshot.size - (publicSnapshot.docs.some(document => document.id === 'catalog-settings') ? 1 : 0),
    promotions: promotionsSnapshot.size,
    catalogDrafts: draftsSnapshot.size,
    indexedAssets: assetsSnapshot.size,
  },
  referencedImages: expected.size,
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
