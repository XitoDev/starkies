#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');
const verify = process.argv.includes('--verify');
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) throw new Error('Set FIREBASE_SERVICE_ACCOUNT_JSON; no database operation was started.');
const account = JSON.parse(raw);
const expectedProjectId = process.env.FIREBASE_EXPECTED_PROJECT_ID ?? 'starkies';
if (account.project_id !== expectedProjectId || !account.client_email || !account.private_key) {
  throw new Error('Service account project_id must match FIREBASE_EXPECTED_PROJECT_ID (' + expectedProjectId + ').');
}
const app = getApps().find(item => item.name === 'public-catalog-projection') ?? initializeApp({
  credential: cert({
    projectId: account.project_id,
    clientEmail: account.client_email,
    privateKey: account.private_key.replace(/\\n/g, '\n'),
  }),
}, 'public-catalog-projection');
const db = getFirestore(app);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const str = value => typeof value === 'string' ? value.trim() : '';
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const publicOnlyFields = ['description', 'catalogDescription', 'catalogImage', 'catalogLabel', 'catalogLabelColor', 'catalogVisible'];
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLocaleLowerCase('es');
const asPublicProduct = (recipe, draft, sortIndex) => {
  const id = str(recipe.id);
  const category = str(recipe.category) || 'Galletas clásicas';
  const grams = num(recipe.baseGramsPerCookie, 0);
  const isNy = normalize(category).includes('ny') || normalize(category).includes('new york') || grams >= 50;
  const image = str(draft.image) || str(recipe.image);
  const value = {
    id,
    name: str(recipe.name),
    category: isNy ? 'Galletas NY' : 'Galletas clásicas',
    description: str(draft.description),
    price: num(recipe.price, 0),
    isNy,
    stock: true,
    sortIndex,
  };
  if (str(draft.label)) value.tag = str(draft.label);
  if (image) value.image = image;
  return value;
};
const [meta, recipesSnap, draftsSnap, publicSnap, zonesSnap, catalogSettingsSnap] = await Promise.all([
  db.doc('system/stateMeta').get(),
  db.collection('recipes').orderBy('sortIndex', 'asc').get(),
  db.collection('catalogDrafts').get(),
  db.collection('publicCatalog').get(),
  db.doc('settings/deliveryZones').get(),
  db.doc('settings/catalogSettings').get(),
]);
if (!meta.exists || meta.data()?.status !== 'complete') throw new Error('system/stateMeta is not complete; no writes made.');
const existingDrafts = new Map(draftsSnap.docs.map(doc => [doc.id, doc.data()]));
const existingPublicIds = new Set(publicSnap.docs.map(doc => doc.id).filter(id => id !== 'catalog-settings'));
const recipes = recipesSnap.docs.map((doc, index) => {
  const source = doc.data();
  const previousDraft = existingDrafts.get(doc.id) ?? {};
  const draft = {
    id: doc.id,
    description: str(previousDraft.description) || str(source.catalogDescription) || str(source.description),
    image: str(previousDraft.image) || str(source.catalogImage),
    label: str(previousDraft.label) || str(source.catalogLabel),
    labelColor: str(previousDraft.labelColor) || str(source.catalogLabelColor) || 'Morado',
    visible: previousDraft.visible === undefined ? source.catalogVisible !== false : previousDraft.visible !== false,
    sortIndex: num(previousDraft.sortIndex, num(source.sortIndex, index)),
  };
  const internal = { ...source, id: str(source.id) || doc.id, sortIndex: num(source.sortIndex, index) };
  for (const key of publicOnlyFields) delete internal[key];
  const publicProduct = draft.visible && source.archived !== true && str(source.name) && Number.isFinite(Number(source.price)) && Number(source.price) >= 0
    ? asPublicProduct({ ...source, id: doc.id }, draft, draft.sortIndex)
    : null;
  return { id: doc.id, ref: doc.ref, internal, draft, publicProduct };
});
const wantedPublicIds = new Set(recipes.filter(item => item.publicProduct).map(item => item.id));
const zones = zonesSnap.data()?.data;
const catalogSettings = catalogSettingsSnap.data()?.data;
const publicZones = Array.isArray(zones) && zones.length ? zones
  : isRecord(catalogSettings) && Array.isArray(catalogSettings.deliveryZones) ? catalogSettings.deliveryZones : [];
const projectionSettings = {
  id: 'catalog-settings',
  kind: 'settings',
  zones: publicZones,
  sortIndex: recipes.length,
};
const operations = recipes.length * 2
  + recipes.filter(item => item.publicProduct).length
  + [...existingPublicIds].filter(id => !wantedPublicIds.has(id)).length
  + 1;
const report = {
  mode: verify ? 'verify' : apply ? 'apply' : 'dry-run',
  projectId: account.project_id,
  recipes: recipes.length,
  privateDrafts: recipes.length,
  publicProducts: wantedPublicIds.size,
  removedPublicProducts: [...existingPublicIds].filter(id => !wantedPublicIds.has(id)).length,
  operations,
  conflicts: [],
};
if (verify) {
  const missingDrafts = recipes.filter(item => !existingDrafts.has(item.id)).map(item => item.id);
  const missingPublic = [...wantedPublicIds].filter(id => !existingPublicIds.has(id));
  const leakedFields = recipesSnap.docs.filter(doc => publicOnlyFields.some(key => Object.hasOwn(doc.data(), key))).map(doc => doc.id);
  const unexpectedPublicFields = publicSnap.docs.filter(doc => doc.id !== 'catalog-settings' && ['sections', 'items', 'baseId', 'baseGramsPerCookie', 'archived', 'catalogVisible', 'catalogDescription', 'catalogImage', 'catalogLabelColor'].some(key => Object.hasOwn(doc.data(), key))).map(doc => doc.id);
  report.conflicts = [
    ...missingDrafts.map(id => ({ kind: 'missing-draft', id })),
    ...missingPublic.map(id => ({ kind: 'missing-public-product', id })),
    ...leakedFields.map(id => ({ kind: 'public-fields-remain-in-recipe', id })),
    ...unexpectedPublicFields.map(id => ({ kind: 'non-public-fields-in-projection', id })),
  ];
  console.log(JSON.stringify(report, null, 2));
  if (report.conflicts.length) process.exitCode = 1;
  else console.log('Verification passed.');
} else if (!apply) {
  report.note = 'Dry-run only. No writes made. Review counts, then rerun with --apply.';
  console.log(JSON.stringify(report, null, 2));
} else {
  const backupDir = resolve('.migration-backups');
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const backupPath = resolve(backupDir, 'catalog-projection-' + Date.now() + '.json');
  await writeFile(backupPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    projectId: account.project_id,
    recipes: recipesSnap.docs.map(doc => ({ path: doc.ref.path, data: doc.data() })),
    catalogDrafts: draftsSnap.docs.map(doc => ({ path: doc.ref.path, data: doc.data() })),
    publicCatalog: publicSnap.docs.map(doc => ({ path: doc.ref.path, data: doc.data() })),
    settings: [
      ...(zonesSnap.exists ? [{ path: zonesSnap.ref.path, data: zonesSnap.data() }] : []),
      ...(catalogSettingsSnap.exists ? [{ path: catalogSettingsSnap.ref.path, data: catalogSettingsSnap.data() }] : []),
    ],
  }, null, 2), { mode: 0o600 });
  let batch = db.batch();
  let pending = 0;
  const flush = async () => { if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; } };
  for (const item of recipes) {
    batch.set(item.ref, item.internal);
    batch.set(db.doc('catalogDrafts/' + item.id), item.draft);
    pending += 2;
    if (item.publicProduct) batch.set(db.doc('publicCatalog/' + item.id), item.publicProduct);
    else batch.delete(db.doc('publicCatalog/' + item.id));
    pending++;
    await flush();
  }
  for (const id of existingPublicIds) if (!wantedPublicIds.has(id)) {
    batch.delete(db.doc('publicCatalog/' + id));
    pending++;
    await flush();
  }
  batch.set(db.doc('publicCatalog/catalog-settings'), projectionSettings);
  pending++;
  if (pending) await batch.commit();
  console.log(JSON.stringify({ ...report, backupPath, note: 'Projection written. Verify before switching public traffic.' }, null, 2));
}
