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
if (account.project_id !== 'starkies' || !account.client_email || !account.private_key) throw new Error('Service account must belong to Firebase project starkies.');
const app = getApps().find(x => x.name === 'root-migration') ?? initializeApp({ credential: cert({
  projectId: account.project_id, clientEmail: account.client_email,
  privateKey: account.private_key.replace(/\\n/g, '\n'),
}) }, 'root-migration');
const db = getFirestore(app);
const oldBase = 'businesses/starkies';
const metaPath = oldBase + '/system/stateMeta';
const known = ['ingredients','recipes','customers','orders','doughBases','productionHistory','cashMovements','inventory','deliveryZones','catalog'];
const isObject = x => x && typeof x === 'object' && !Array.isArray(x);
const idFor = (value, fallback) => {
  const id = isObject(value) ? String(value.id ?? value.code ?? '').trim() : '';
  return id && !id.includes('/') ? id : fallback;
};
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const metaSnap = await db.doc(metaPath).get();
  if (!metaSnap.exists || metaSnap.data().status !== 'complete') throw new Error('Legacy metadata is missing or incomplete; refusing to guess source collections.');
  const meta = metaSnap.data();
  const keys = [...new Set([...(meta.arrayKeys ?? []), ...known])];
  const ops = [];
  const counts = {};
  for (const key of keys) {
    const source = db.collection(oldBase + '/collections/' + key + '/records');
    const snap = await source.get();
    counts[key] = snap.size;
    for (const d of snap.docs) {
      const data = d.data();
      ops.push({ source: d.ref.path, target: key + '/' + idFor(data.value, d.id), data });
    }
  }
  for (const key of [...new Set(meta.settingKeys ?? [])]) {
    const ref = db.doc(oldBase + '/settings/' + key);
    const snap = await ref.get();
    if (snap.exists) ops.push({ source: ref.path, target: 'settings/' + key, data: snap.data() });
  }
  const settings = await db.collection(oldBase + '/settings').get();
  for (const d of settings.docs) if (!ops.some(x => x.target === 'settings/' + d.id)) ops.push({source:d.ref.path,target:'settings/'+d.id,data:d.data()});
  const archives = await db.collection(oldBase + '/migrationArchives').get();
  for (const d of archives.docs) ops.push({source:d.ref.path,target:'migrationArchives/'+d.id,data:d.data()});

  const phoneOwners = new Map();
  for (const op of ops.filter(item => item.target.startsWith('customers/'))) {
    const value = isObject(op.data.value) ? op.data.value : {};
    const normalizedPhone = String(value.phone ?? '').replace(/\\D/g, '').replace(/^593/, '0');
    if (normalizedPhone.length < 7) continue;
    const customerId = op.target.slice('customers/'.length);
    if (phoneOwners.has(normalizedPhone) && phoneOwners.get(normalizedPhone).customerId !== customerId) {
      throw new Error('Duplicate normalized customer phone found in ' + phoneOwners.get(normalizedPhone).source + ' and ' + op.source + '. Resolve duplicates before migrating; no writes made.');
    }
    phoneOwners.set(normalizedPhone, { customerId, source: op.source });
  }
  for (const [normalizedPhone, owner] of phoneOwners) {
    const hash = createHash('sha256').update(normalizedPhone).digest('hex');
    ops.push({ source: 'derived phone index from ' + owner.source, target: 'customerPhoneLookup/' + hash, data: { customerId: owner.customerId, normalizedPhone } });
  }
  for (const op of ops.filter(item => item.target.startsWith('orders/'))) {
    const value = isObject(op.data.value) ? op.data.value : null;
    if (!value) continue;
    const normalizedPhone = String(value.phone ?? '').replace(/\\D/g, '').replace(/^593/, '0');
    const owner = phoneOwners.get(normalizedPhone);
    if (owner) op.data = { ...op.data, value: { ...value, customerId: owner.customerId } };
  }
  const latestOrderByPhone = new Map();
  for (const op of ops.filter(item => item.target.startsWith('orders/'))) {
    const value = isObject(op.data.value) ? op.data.value : {};
    const normalizedPhone = String(value.phone ?? '').replace(/\\D/g, '').replace(/^593/, '0');
    if (normalizedPhone.length < 7) continue;
    const current = latestOrderByPhone.get(normalizedPhone);
    const timestamp = String(value.createdAt ?? value.created ?? value.date ?? '');
    if (!current || timestamp > current.timestamp) latestOrderByPhone.set(normalizedPhone, { orderId: op.target.slice('orders/'.length), timestamp, source: op.source });
  }
  for (const [normalizedPhone, latest] of latestOrderByPhone) {
    const hash = createHash('sha256').update(normalizedPhone).digest('hex');
    ops.push({ source: 'derived order phone index from ' + latest.source, target: 'orderPhoneLookup/' + hash, data: { orderId: latest.orderId, normalizedPhone, createdAt: latest.timestamp } });
  }

  // Build a deterministic phone index so order creation never downloads all customers.
  const phoneOwners = new Map();
  for (const op of ops.filter(item => item.target.startsWith('customers/'))) {
    const value = isObject(op.data.value) ? op.data.value : {};
    const normalizedPhone = String(value.phone ?? '').replace(/\\D/g, '').replace(/^593/, '0');
    if (normalizedPhone.length < 7) continue;
    if (phoneOwners.has(normalizedPhone) && phoneOwners.get(normalizedPhone).customerId !== op.target.slice('customers/'.length)) {
      throw new Error('Duplicate normalized customer phone found in ' + phoneOwners.get(normalizedPhone).source + ' and ' + op.source + '. Resolve duplicates before migrating; no writes made.');
    }
    const customerId = op.target.slice('customers/'.length);
    phoneOwners.set(normalizedPhone, { customerId, source: op.source });
  }
  for (const [normalizedPhone, owner] of phoneOwners) {
    const hash = createHash('sha256').update(normalizedPhone).digest('hex');
    ops.push({
      source: 'derived customer phone index for ' + owner.source,
      target: 'customerPhoneLookup/' + hash,
      data: { customerId: owner.customerId, normalizedPhone },
    });
  }

  const targetOwners = new Map();
  for (const op of ops) {
    if (targetOwners.has(op.target)) throw new Error('Duplicate target ID ' + op.target + ' from ' + targetOwners.get(op.target) + ' and ' + op.source + '. No writes made.');
    targetOwners.set(op.target, op.source);
  }
  const checked = await Promise.all(ops.map(async op => {
    const target = await db.doc(op.target).get();
    return {...op, action: !target.exists ? 'create' : equal(target.data(),op.data) ? 'skip-identical' : 'conflict'};
  }));
  const conflicts = checked.filter(x=>x.action==='conflict');
  const actions = checked.reduce((a,x)=>(a[x.action]=(a[x.action]??0)+1,a),{});
  console.log(JSON.stringify({mode:apply?'apply':verify?'verify':'dry-run',source:metaPath,destinationMeta:'system/stateMeta',counts,operations:ops.length,actions,conflicts:conflicts.map(x=>({source:x.source,target:x.target}))},null,2));
  if (conflicts.length) throw new Error('Destination conflicts found. Resolve them before retrying; no writes made.');
  if (verify) {
    if (checked.some(x=>x.action==='create')) throw new Error('Verification failed: some destination documents are missing.');
    console.log('Verification passed.');
    return;
  }
  if (!apply) {
    console.log('Dry run only. No writes made. Add --apply after reviewing the report.');
    return;
  }
  await mkdir(resolve('.migration-backups'),{recursive:true});
  const hash=createHash('sha256').update(JSON.stringify(ops)).digest('hex').slice(0,12);
  const backup=resolve('.migration-backups/root-migration-'+Date.now()+'-'+hash+'.json');
  await writeFile(backup,JSON.stringify({meta,operations:ops},null,2),{mode:0o600});
  console.log('Private backup: '+backup);
  let batch=db.batch(), pending=0;
  for (const op of checked) {
    if (op.action==='skip-identical') continue;
    batch.set(db.doc(op.target),op.data); pending++;
    if (pending>=400) { await batch.commit(); batch=db.batch(); pending=0; }
  }
  batch.set(db.doc('system/stateMeta'),{...meta,status:'complete',schemaVersion:2,sourceSchemaVersion:meta.schemaVersion??1,collectionKeys:keys,settingKeys:meta.settingKeys??[],migratedFrom:metaPath,migratedAt:new Date().toISOString(),migrationTool:'scripts/migrate-firestore-root.mjs'},{merge:true});
  await batch.commit();
  console.log('Destination populated. Legacy documents were not deleted. Run verification before switching production traffic.');
}
main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
