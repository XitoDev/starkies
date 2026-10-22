#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';

const apply = process.argv.includes('--apply');
const verify = process.argv.includes('--verify');
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) throw new Error('Set FIREBASE_SERVICE_ACCOUNT_JSON; no database operation was started.');
const account = JSON.parse(raw);
const expectedProjectId = process.env.FIREBASE_EXPECTED_PROJECT_ID ?? 'starkies';
if (account.project_id !== expectedProjectId || !account.client_email || !account.private_key) {
  throw new Error('Service account project_id must match FIREBASE_EXPECTED_PROJECT_ID (' + expectedProjectId + ').');
}
const app = getApps().find(x => x.name === 'root-migration') ?? initializeApp({
  credential: cert({
    projectId: account.project_id,
    clientEmail: account.client_email,
    privateKey: account.private_key.replace(/\\n/g, '\n'),
  }),
}, 'root-migration');
const db = getFirestore(app);
const oldBase = 'businesses/starkies';
const metaPath = oldBase + '/system/stateMeta';
const knownCollections = [
  'ingredients', 'recipes', 'customers', 'orders', 'doughBases',
  'productionHistory', 'cashMovements', 'inventory', 'deliveryZones', 'catalog',
];
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const cleanId = value => {
  const id = String(value ?? '').trim();
  return id && !id.includes('/') && id !== '.' && id !== '..' ? id : '';
};
const normalizePhone = value => String(value ?? '').replace(/\D/g, '').replace(/^593/, '0');
const phoneHash = value => createHash('sha256').update(value).digest('hex');
const cleanName = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
const normalizeSearch = value => cleanName(value).replace(/[^a-z0-9]+/g, ' ').trim();
const searchTokensFor = record => {
  const values = [record.id, record.code, record.name, record.customer, record.phone, record.address]
    .map(normalizeSearch).filter(Boolean);
  const tokens = new Set();
  for (const value of values) {
    const compact = value.split(' ').join('');
    if (compact.length >= 2) for (let i = 2; i <= compact.length; i++) tokens.add(compact.slice(0, i));
    for (const word of value.split(' ').filter(part => part.length >= 2)) {
      for (let i = 2; i <= word.length; i++) tokens.add(word.slice(0, i));
    }
  }
  return [...tokens];
};
const nameSearchTokensFor = record => {
  const name = cleanName(record.name).replace(/[^a-z0-9]+/g, ' ').trim();
  const tokens = new Set();
  for (const word of name.split(' ').filter(part => part.length >= 2)) {
    for (let i = 2; i <= word.length; i++) tokens.add(word.slice(0, i));
  }
  const compact = name.split(' ').join('');
  for (let i = 2; i <= compact.length; i++) tokens.add(compact.slice(0, i));
  return [...tokens];
};
const stableJson = value => {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (!isObject(value)) return JSON.stringify(value);
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
};
const equal = (left, right) => stableJson(left) === stableJson(right);

async function main() {
  const metaSnapshot = await db.doc(metaPath).get();
  if (!metaSnapshot.exists || metaSnapshot.data().status !== 'complete') {
    throw new Error('Legacy metadata is missing or incomplete; refusing to guess source collections.');
  }
  const legacyMeta = metaSnapshot.data();
  const businessRootSnapshot = await db.doc(oldBase).get();
  const rootBusinessData = businessRootSnapshot.exists ? businessRootSnapshot.data() : undefined;
  const collectionDocumentRefs = await db.collection(oldBase + '/collections').listDocuments();
  const discoveredCollectionKeys = [];
  for (const collectionDocument of collectionDocumentRefs) {
    const children = await collectionDocument.listCollections();
    if (children.some(child => child.id === 'records')) discoveredCollectionKeys.push(collectionDocument.id);
  }
  const collectionKeys = [...new Set([...(legacyMeta.arrayKeys ?? []), ...knownCollections, ...discoveredCollectionKeys])];
  for (const key of collectionKeys) {
    if (!/^[A-Za-z0-9_-]+$/.test(key)) throw new Error('Unsafe collection key in legacy metadata: ' + key + '. No writes made.');
  }
  const operations = [];
  const originalDocuments = [];
  const counts = {};
  const customerByPhone = new Map();
  const ordersByPhone = new Map();

  for (const key of collectionKeys) {
    const sourceCollection = db.collection(oldBase + '/collections/' + key + '/records');
    const snapshot = await sourceCollection.get();
    counts[key] = snapshot.size;
    const targetCollection = key;
    for (const document of snapshot.docs) {
      const legacyDocument = document.data();
      originalDocuments.push({ source: document.ref.path, data: legacyDocument });
      // Most legacy records use the { value, index } envelope. Some dynamically
      // discovered collections (for example addressesTypes) store native fields
      // directly on the record document. Preserve that complete shape instead of
      // rejecting it or silently discarding fields.
      const hasValueEnvelope = isObject(legacyDocument.value);
      const value = hasValueEnvelope ? legacyDocument.value : legacyDocument;
      const documentId = cleanId(value.id) || cleanId(value.code) || cleanId(document.id);
      if (!documentId) throw new Error('Cannot derive a stable document ID from ' + document.ref.path);
      const sortIndex = Number(legacyDocument.index ?? value.sortIndex ?? 0);
      const data = { ...value, sortIndex, ...(key === 'customers' || key === 'orders' ? { searchTokens: searchTokensFor({ ...value, id: documentId }) } : {}), ...(key === 'customers' ? { nameSearchTokens: nameSearchTokensFor({ ...value, id: documentId }) } : {}) };
      operations.push({ source: document.ref.path, target: targetCollection + '/' + documentId, data });
      if (key === 'customers') {
        const phone = normalizePhone(value.phone);
        if (phone.length >= 7) {
          const previous = customerByPhone.get(phone);
          if (previous && previous.customerId !== documentId) {
            throw new Error('Duplicate normalized customer phone found in ' + previous.source + ' and ' + document.ref.path + '. Resolve duplicates before migrating; no writes made.');
          }
          customerByPhone.set(phone, { customerId: documentId, source: document.ref.path });
        }
      }
    }
  }

  if (rootBusinessData && Object.keys(rootBusinessData).length) {
    originalDocuments.push({ source: oldBase, data: rootBusinessData });
    operations.push({
      source: oldBase,
      target: 'settings/businessProfile',
      data: { data: rootBusinessData },
    });
  }

  const settingsSnapshot = await db.collection(oldBase + '/settings').get();
  const settingKeys = settingsSnapshot.docs.map(document => document.id);
  for (const document of settingsSnapshot.docs) {
    const legacy = document.data();
    originalDocuments.push({ source: document.ref.path, data: legacy });
    const data = Object.prototype.hasOwnProperty.call(legacy, 'value') ? legacy.value : legacy;
    const targetData = { data };
    operations.push({ source: document.ref.path, target: 'settings/' + document.id, data: targetData });
  }

  const archivesSnapshot = await db.collection(oldBase + '/migrationArchives').get();
  for (const document of archivesSnapshot.docs) {
    originalDocuments.push({ source: document.ref.path, data: document.data() });
    operations.push({ source: document.ref.path, target: 'migrationArchives/' + document.id, data: document.data() });
  }

  const systemSnapshot = await db.collection(oldBase + '/system').get();
  for (const document of systemSnapshot.docs) {
    originalDocuments.push({ source: document.ref.path, data: document.data() });
    if (document.id === 'stateMeta') continue;
    operations.push({ source: document.ref.path, target: 'system/' + document.id, data: document.data() });
  }

  // Audit every document/subcollection under the legacy namespace. If the
  // explicit mapping above missed anything, stop before any destination write.
  const discoveredSourcePaths = new Set();
  const visitDocument = async documentRef => {
    const snapshot = await documentRef.get();
    if (snapshot.exists) discoveredSourcePaths.add(documentRef.path);
    const childCollections = await documentRef.listCollections();
    for (const childCollection of childCollections) {
      const childDocuments = await childCollection.listDocuments();
      for (const childDocument of childDocuments) await visitDocument(childDocument);
    }
  };
  await visitDocument(db.doc(oldBase));
  const explicitlyHandledSources = new Set([...originalDocuments.map(item => item.source), metaPath]);
  const unhandledSources = [...discoveredSourcePaths].filter(path => !explicitlyHandledSources.has(path));
  if (unhandledSources.length) {
    throw new Error('Migration mapping is not total. Unhandled source documents/subcollections found: '
      + unhandledSources.slice(0, 20).join(', ')
      + (unhandledSources.length > 20 ? ' (and more)' : '')
      + '. No writes made; add explicit mappings before retrying.');
  }

  for (const operation of operations.filter(item => item.target.startsWith('orders/'))) {
    const order = operation.data;
    const phone = normalizePhone(order.phone);
    const owner = customerByPhone.get(phone);
    if (owner) operation.data = { ...order, customerId: owner.customerId };
    if (phone.length >= 7) {
      const timestamp = String(order.createdAt ?? order.created ?? order.date ?? '');
      const current = ordersByPhone.get(phone);
      if (!current || timestamp > current.timestamp) {
        ordersByPhone.set(phone, { orderId: operation.target.slice('orders/'.length), timestamp, source: operation.source });
      }
    }
  }

  for (const [phone, owner] of customerByPhone) {
    operations.push({
      source: 'derived customer phone index from ' + owner.source,
      target: 'customerPhoneLookup/' + phoneHash(phone),
      data: { customerId: owner.customerId, normalizedPhone: phone },
    });
  }
  for (const [phone, latest] of ordersByPhone) {
    operations.push({
      source: 'derived order phone index from ' + latest.source,
      target: 'orderPhoneLookup/' + phoneHash(phone),
      data: { orderId: latest.orderId, normalizedPhone: phone, createdAt: latest.timestamp },
    });
  }

  const productNames = new Map();
  const productIds = new Set();
  for (const operation of operations.filter(item => item.target.startsWith('recipes/'))) {
    const recipe = operation.data;
    productIds.add(operation.target.slice('recipes/'.length));
    const name = cleanName(recipe.name);
    if (name) productNames.set(name, operation.target.slice('recipes/'.length));
  }
  const sales = new Map();
  const pendingDemand = new Map();
  let deliveredOrders = 0;
  let salesRevenue = 0;
  const resolveProductId = item => {
    const nested = isObject(item.product) ? item.product : {};
    const rawId = String(item.recipeId ?? item.productId ?? item.id ?? nested.id ?? '').trim();
    if (productIds.has(rawId)) return rawId;
    const name = cleanName(item.productName ?? item.name ?? nested.name);
    return productNames.get(name) ?? '';
  };
  const addQuantities = (items, target) => {
    if (!Array.isArray(items)) return false;
    let counted = false;
    for (const rawItem of items) {
      const item = isObject(rawItem) ? rawItem : {};
      const productId = resolveProductId(item);
      const quantity = Number(item.qty ?? item.quantity ?? item.count ?? 0);
      if (productId && Number.isFinite(quantity) && quantity > 0) {
        target.set(productId, (target.get(productId) ?? 0) + quantity);
        counted = true;
      }
    }
    return counted;
  };
  for (const operation of operations.filter(item => item.target.startsWith('orders/'))) {
    const order = operation.data;
    const rawStatus = order.status ?? order.state ?? order.orderStatus;
    const statusValue = isObject(rawStatus) ? rawStatus.value ?? rawStatus.label ?? rawStatus.name : rawStatus;
    const status = cleanName(statusValue).toLocaleUpperCase('es');
    const isDelivered = ['DELIVERED', 'ENTREGADO', 'ENTREGADA', 'COMPLETED', 'COMPLETE'].includes(status);
    const isPending = status === 'PENDING' || status.includes('PENDIENT');
    const items = order.lines ?? order.items;
    let counted = isDelivered ? addQuantities(items, sales) : isPending ? addQuantities(items, pendingDemand) : false;
    if (!counted) {
      for (const box of Array.isArray(order.boxes) ? order.boxes : []) {
        if (isObject(box)) {
          const boxCounted = isDelivered ? addQuantities(box.items, sales) : isPending ? addQuantities(box.items, pendingDemand) : false;
          counted = counted || boxCounted;
        }
      }
    }
    if (!counted && Array.isArray(order.items) && order.items !== items) {
      counted = isDelivered ? addQuantities(order.items, sales) : isPending ? addQuantities(order.items, pendingDemand) : false;
    }
    if (isDelivered) {
      deliveredOrders++;
      const total = Number(order.total ?? 0);
      if (Number.isFinite(total) && total > 0) salesRevenue += total;
    }
  }
  for (const [productId, unitsSold] of sales) {
    operations.push({
      source: 'derived sales from delivered legacy orders',
      target: 'productSalesStats/' + productId,
      data: { productId, unitsSold },
    });
  }
  for (const [recipeId, pendingUnits] of pendingDemand) {
    operations.push({
      source: 'derived production demand from pending legacy orders',
      target: 'productionDemand/' + recipeId,
      data: { recipeId, pendingUnits },
    });
  }
  operations.push({
    source: 'derived aggregate from delivered legacy orders',
    target: 'businessStats/sales',
    data: { deliveredOrders, revenue: Math.round(salesRevenue * 100) / 100, unitsSold: [...sales.values()].reduce((sum, quantity) => sum + quantity, 0), updatedAt: new Date().toISOString() },
  });
  const productionRows = operations.filter(item => item.target.startsWith('productionHistory/')).map(item => item.data);
  operations.push({
    source: 'derived aggregate from legacy production history',
    target: 'businessStats/production',
    data: {
      totalBatches: productionRows.reduce((sum, row) => sum + Math.max(0, Number(row.batches ?? 0)), 0),
      totalUnits: productionRows.reduce((sum, row) => sum + (String(row.outputUnit ?? '') === 'g' ? 0 : Math.max(0, Number(row.totalYield ?? 0))), 0),
      totalCost: Math.round(productionRows.reduce((sum, row) => sum + Math.max(0, Number(row.calculatedCost ?? 0)), 0) * 100) / 100,
      completedRuns: productionRows.length,
      updatedAt: new Date().toISOString(),
    },
  });

  const targetOwners = new Map();
  for (const operation of operations) {
    if (targetOwners.has(operation.target)) {
      throw new Error('Duplicate target ID ' + operation.target + ' from ' + targetOwners.get(operation.target) + ' and ' + operation.source + '. No writes made.');
    }
    targetOwners.set(operation.target, operation.source);
  }

  const plannedByCollection = new Map();
  for (const operation of operations) {
    const [collectionName, documentId] = operation.target.split('/');
    if (!plannedByCollection.has(collectionName)) plannedByCollection.set(collectionName, new Set());
    plannedByCollection.get(collectionName).add(documentId);
  }
  for (const [collectionName, plannedIds] of plannedByCollection) {
    const existing = await db.collection(collectionName).get();
    const unexpected = existing.docs.filter(document => !plannedIds.has(document.id));
    if (unexpected.length) {
      throw new Error('Destination collection ' + collectionName + ' already contains unplanned documents (' + unexpected.slice(0, 5).map(document => document.id).join(', ') + '). No writes made.');
    }
  }

  const destinationMeta = db.doc('system/stateMeta');
  const existingMeta = await destinationMeta.get();
  if (existingMeta.exists && !(existingMeta.data().schemaVersion === 3 && existingMeta.data().migratedFrom === metaPath)) {
    throw new Error('Root system/stateMeta already exists and is not the marker from this migration. Resolve it before continuing; no writes made.');
  }

  const checked = await Promise.all(operations.map(async operation => {
    const destination = await db.doc(operation.target).get();
    return { ...operation, action: !destination.exists ? 'create' : equal(destination.data(), operation.data) ? 'skip-identical' : 'conflict' };
  }));
  const conflicts = checked.filter(operation => operation.action === 'conflict');
  const actions = checked.reduce((result, operation) => {
    result[operation.action] = (result[operation.action] ?? 0) + 1;
    return result;
  }, {});
  console.log(JSON.stringify({
    mode: apply ? 'apply' : verify ? 'verify' : 'dry-run',
    source: metaPath,
    destinationMeta: 'system/stateMeta',
    schemaVersion: 3,
    counts,
    operations: operations.length,
    actions,
    conflicts: conflicts.map(operation => ({ source: operation.source, target: operation.target })),
  }, null, 2));
  if (conflicts.length) throw new Error('Destination conflicts found. Resolve them before retrying; no writes made.');
  if (verify) {
    if (checked.some(operation => operation.action === 'create')) throw new Error('Verification failed: some destination documents are missing.');
    if (!existingMeta.exists || existingMeta.data()?.['schemaVersion'] !== 3 || existingMeta.data()?.['migratedFrom'] !== metaPath) {
      throw new Error('Verification failed: root system/stateMeta does not contain the expected schema-v3 migration marker.');
    }
    console.log('Verification passed.');
    return;
  }
  if (!apply) {
    console.log('Dry run only. No writes made. Add --apply after reviewing the report.');
    return;
  }

  await mkdir(resolve('.migration-backups'), { recursive: true });
  const hash = createHash('sha256').update(stableJson(operations)).digest('hex').slice(0, 12);
  const backupPath = resolve('.migration-backups/root-migration-' + Date.now() + '-' + hash + '.json');
  await writeFile(backupPath, JSON.stringify({ legacyMeta, originalDocuments, operations }, null, 2), { mode: 0o600 });
  console.log('Private backup: ' + backupPath);

  let batch = db.batch();
  let pending = 0;
  for (const operation of checked) {
    if (operation.action === 'skip-identical') continue;
    batch.set(db.doc(operation.target), operation.data);
    pending++;
    if (pending >= 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  batch.set(destinationMeta, {
    ...legacyMeta,
    status: 'complete',
    schemaVersion: 3,
    sourceSchemaVersion: legacyMeta.schemaVersion ?? 1,
    collectionKeys,
    arrayKeys: collectionKeys,
    stateKeys: [...new Set([...collectionKeys, ...settingKeys])],
    settingKeys,
    recordCounts: { ...counts },
    migratedFrom: metaPath,
    migratedAt: new Date().toISOString(),
    revision: Number(legacyMeta.revision ?? 0) + 1,
    changedKeys: [...new Set([...collectionKeys, ...settingKeys, 'stats:sales', 'stats:demand', 'stats:production'])],
    migrationTool: 'scripts/migrate-firestore-root.mjs',
  }, { merge: true });
  await batch.commit();
  console.log('Destination populated with flattened documents. Legacy documents were not deleted. Verify before switching production traffic.');
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
