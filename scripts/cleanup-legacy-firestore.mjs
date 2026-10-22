#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');
const confirm = process.argv.includes('--confirm-delete-legacy-collections');
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) throw new Error('Set FIREBASE_SERVICE_ACCOUNT_JSON; no database operation was started.');
const account = JSON.parse(raw);
const expectedProjectId = process.env.FIREBASE_EXPECTED_PROJECT_ID ?? 'starkies';
if (account.project_id !== expectedProjectId || !account.client_email || !account.private_key) {
  throw new Error('Service account project_id must match FIREBASE_EXPECTED_PROJECT_ID (' + expectedProjectId + ').');
}
if (apply && !confirm) {
  throw new Error('Deletion requires both --apply and --confirm-delete-legacy-collections. No writes made.');
}
const app = getApps().find(item => item.name === 'legacy-collection-cleanup') ?? initializeApp({
  credential: cert({
    projectId: account.project_id,
    clientEmail: account.client_email,
    privateKey: account.private_key.replace(/\\n/g, '\n'),
  }),
}, 'legacy-collection-cleanup');
const db = getFirestore(app);

// Only collections audited as legacy or unreferenced by the current application.
// Financial/inventory source collections are intentionally excluded from this list.
const obsoleteCollections = [
  'addressTypes',
  'baseLinkAudit',
  'businesses',
  'catalog',
  'cookieCounts',
  'deletedIngredients',
  'deletedOrders',
  'deletedProductions',
  'financeArchives',
  'migrationArchives',
  'deliveryStockAdjustments',
];
const protectedCollections = [
  'adminUsers', 'businessStats', 'cashMovements', 'catalogDrafts',
  'customerPhoneLookup', 'customers', 'deliveryZones', 'doughBases',
  'fundTransfers', 'ingredients', 'inventory', 'inventoryAdjustments',
  'losses', 'orderPhoneLookup', 'orders', 'productSalesStats',
  'productionDemand', 'productionHistory', 'publicCatalog',
  'publicOrderRateLimits', 'purchases', 'recipes', 'settings', 'system',
];
async function collectCollection(collectionRef, output) {
  const snapshot = await collectionRef.get();
  for (const document of snapshot.docs) {
    output.push({ path: document.ref.path, data: document.data() });
    const subcollections = await document.ref.listCollections();
    for (const subcollection of subcollections) await collectCollection(subcollection, output);
  }
}
const rootCollections = await db.listCollections();
const existingNames = new Set(rootCollections.map(item => item.id));
const report = {
  mode: apply ? 'apply' : 'dry-run',
  projectId: account.project_id,
  candidates: [],
  protectedCollections,
  conflicts: [],
};
const backupDocuments = [];
for (const name of obsoleteCollections) {
  if (!existingNames.has(name)) {
    report.candidates.push({ collection: name, documents: 0, status: 'not-found' });
    continue;
  }
  const documents = [];
  await collectCollection(db.collection(name), documents);
  backupDocuments.push(...documents);
  report.candidates.push({ collection: name, documents: documents.length, status: 'candidate-for-deletion' });
}
report.totalDocuments = backupDocuments.length;
if (!apply) {
  report.note = 'Dry-run only. No writes made. Review each collection and count before applying.';
  console.log(JSON.stringify(report, null, 2));
} else {
  const backupDir = resolve('.migration-backups');
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const backupPath = resolve(backupDir, 'legacy-collections-' + Date.now() + '.json');
  await writeFile(backupPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    projectId: account.project_id,
    collections: obsoleteCollections,
    documents: backupDocuments,
  }, null, 2), { mode: 0o600 });

  for (const name of obsoleteCollections) {
    if (existingNames.has(name)) await db.recursiveDelete(db.collection(name));
  }
  const metaRef = db.doc('system/stateMeta');
  const meta = await metaRef.get();
  if (meta.exists) {
    const value = meta.data() ?? {};
    const remove = new Set(obsoleteCollections);
    await metaRef.set({
      stateKeys: (Array.isArray(value.stateKeys) ? value.stateKeys : []).filter(key => !remove.has(key)),
      arrayKeys: (Array.isArray(value.arrayKeys) ? value.arrayKeys : []).filter(key => !remove.has(key)),
      recordCounts: Object.fromEntries(Object.entries(value.recordCounts ?? {}).filter(([key]) => !remove.has(key))),
      revision: FieldValue.increment(1),
      changedKeys: obsoleteCollections,
      cleanupCompletedAt: new Date().toISOString(),
    }, { merge: true });
  }
  console.log(JSON.stringify({ ...report, backupPath, deletedCollections: obsoleteCollections.filter(name => existingNames.has(name)), note: 'Legacy collections deleted. Keep the local backup until the application is verified.' }, null, 2));
}
