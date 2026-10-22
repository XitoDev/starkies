import { Injectable } from '@angular/core';
import {
  collection,
  deleteDoc,
  DocumentSnapshot,
  DocumentReference,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  increment,
  limit,
  onSnapshot,
  orderBy,
  QueryConstraint,
  QueryDocumentSnapshot,
  DocumentData,
  startAfter,
  where,
  query,
  runTransaction,
  setDoc,
  serverTimestamp,
  Unsubscribe,
  writeBatch,
} from 'firebase/firestore';
import { CashMovement } from 'shared';
import { FirebaseClientService } from './firebase-client.service';
import { FirestoreBackupArchiveService } from './firestore-backup-archive.service';

export interface StarKiesBackupFile {
  business?: string;
  exportedAt?: string;
  state: Record<string, unknown>;
}

interface StateMetadata {
  status?: 'in-progress' | 'complete';
  stateKeys?: string[];
  arrayKeys?: string[];
  settingKeys?: string[];
  sourceBackupId?: string;
  sourceExportedAt?: string;
  recordCounts?: Record<string, number>;
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class FirestoreBusinessRepository {
  private readonly stateMetaRef = () =>
    doc(this.firebase.firestore, 'system', 'stateMeta');

  private readonly stateCacheTtlMs = 15_000;
  private stateCache: { value: Record<string, unknown> | null; expiresAt: number } | null = null;
  private stateLoadPromise: Promise<Record<string, unknown> | null> | null = null;
  private cacheGeneration = 0;

  constructor(
    private readonly firebase: FirebaseClientService,
    private readonly archiveService: FirestoreBackupArchiveService,
  ) {}

  /**
   * Reuses a recent complete business snapshot and coalesces simultaneous reads.
   * Writes invalidate the cache; the short TTL also bounds staleness from other sessions.
   */
  async loadState(collectionKeys?: string[]): Promise<Record<string, unknown> | null> {
    // A scoped read deliberately bypasses the whole-state cache so a screen can
    // request only the collections it needs without triggering every collection.
    if (collectionKeys) return this.fetchStateFromFirestore(collectionKeys);
    if (this.stateCache && this.stateCache.expiresAt > Date.now()) {
      return this.cloneState(this.stateCache.value);
    }
    if (this.stateLoadPromise) {
      return this.stateLoadPromise.then((state) => this.cloneState(state));
    }

    const generation = this.cacheGeneration;
    const request = this.fetchStateFromFirestore();
    this.stateLoadPromise = request;
    try {
      const state = await request;
      if (generation === this.cacheGeneration) {
        this.stateCache = { value: this.cloneState(state), expiresAt: Date.now() + this.stateCacheTtlMs };
      }
      return this.cloneState(state);
    } finally {
      if (this.stateLoadPromise === request) this.stateLoadPromise = null;
    }
  }

  /** Watches the small metadata document, not every business collection. */
  watchStateMeta(onChange: () => void, onError?: (error: Error) => void): Unsubscribe {
    if (!this.firebase.isConfigured) return () => undefined;
    let initialized = false;
    return onSnapshot(this.stateMetaRef(), snapshot => {
      if (initialized) {
        const keys = snapshot.data()?.['changedKeys'];
        onChange(Array.isArray(keys) ? keys.filter((key): key is string => typeof key === 'string') : []);
      }
      initialized = true;
    }, error => onError?.(error));
  }

  /** Signals other Admin sessions that a root collection or setting changed. */
  private async publishStateChange(changedKeys: string[] = []): Promise<void> {
    if (!this.firebase.isConfigured) return;
    await setDoc(this.stateMetaRef(), {
      revision: increment(1),
      updatedAt: serverTimestamp(),
      changedKeys,
    }, { merge: true });
  }

  invalidateStateCache(): void {
    this.cacheGeneration++;
    this.stateCache = null;
  }

  private cloneState(state: Record<string, unknown> | null): Record<string, unknown> | null {
    return state === null ? null : structuredClone(state);
  }

  async hasCompletedMigration(): Promise<boolean> {
    if (!this.firebase.isConfigured) return false;
    const snapshot = await getDoc(this.stateMetaRef());
    return snapshot.exists() && snapshot.data()['status'] === 'complete';
  }

  private async fetchStateFromFirestore(requestedCollectionKeys?: string[]): Promise<Record<string, unknown> | null> {
    if (!this.firebase.isConfigured) {
      throw new Error(this.firebase.configurationMessage);
    }

    const metadataSnapshot = await getDoc(this.stateMetaRef());
    if (!metadataSnapshot.exists()) return null;

    const metadata = metadataSnapshot.data() as StateMetadata;
    if (metadata.status !== 'complete') return null;

    const allArrayKeys = metadata.arrayKeys ?? [];
    const allSettingKeys = metadata.settingKeys ?? [];
    const arrayKeys = requestedCollectionKeys
      ? requestedCollectionKeys.filter(key => allArrayKeys.includes(key))
      : allArrayKeys;
    const settingKeys = requestedCollectionKeys
      ? requestedCollectionKeys.filter(key => allSettingKeys.includes(key))
      : allSettingKeys;
    const state: Record<string, unknown> = {};

    await Promise.all(arrayKeys.map(async (key) => {
      const recordsRef = collection(this.firebase.firestore, key);
      const recordsSnapshot = await getDocs(query(recordsRef, orderBy('sortIndex', 'asc')));
      state[key] = recordsSnapshot.docs.map((record) => { const { sortIndex: _sortIndex, ...value } = record.data(); return value; });
    }));

    await Promise.all(settingKeys.map(async (key) => {
      const settingSnapshot = await getDoc(
        doc(this.firebase.firestore, 'settings', key),
      );
      if (settingSnapshot.exists()) state[key] = settingSnapshot.data()['data'];
    }));

    return state;
  }

  /**
   * Fetches one bounded page from a root collection. Filters are translated to
   * Firestore where clauses and are therefore applied before documents are read.
   */
  async getCollectionPage<T extends Record<string, unknown>>(
    collectionKey: string,
    options: {
      pageSize?: number;
      cursor?: QueryDocumentSnapshot<DocumentData> | null;
      orderField?: string;
      direction?: 'asc' | 'desc';
      filters?: { field: string; op: '==' | '>=' | '<=' | '>' | '<' | 'in'; value: unknown }[];
    } = {},
  ): Promise<{ items: T[]; cursor: QueryDocumentSnapshot<DocumentData> | null; hasMore: boolean }> {
    if (!this.firebase.isConfigured) throw new Error(this.firebase.configurationMessage);
    const pageSize = Math.min(100, Math.max(1, Math.floor(options.pageSize ?? 25)));
    const constraints: QueryConstraint[] = [];
    for (const filter of options.filters ?? []) {
      constraints.push(where(filter.field, filter.op, filter.value));
    }
    constraints.push(orderBy(options.orderField ?? 'sortIndex', options.direction ?? 'desc'));
    if (options.cursor) constraints.push(startAfter(options.cursor));
    constraints.push(limit(pageSize + 1));
    const snapshot = await getDocs(query(collection(this.firebase.firestore, collectionKey), ...constraints));
    const docs = snapshot.docs.slice(0, pageSize);
    const hasMore = snapshot.docs.length > pageSize;
    return {
      items: docs.map(item => {
        const { sortIndex: _sortIndex, ...value } = item.data();
        return { ...value, id: value['id'] ?? item.id } as T;
      }),
      cursor: docs.length ? docs[docs.length - 1] : null,
      hasMore,
    };
  }

  /** Searches indexed prefixes; only matching documents are returned from Firestore. */
  async getBusinessStats(key: 'sales' | 'production'): Promise<Record<string, unknown> | null> {
    if (!this.firebase.isConfigured) throw new Error(this.firebase.configurationMessage);
    const snapshot = await getDoc(doc(this.firebase.firestore, 'businessStats', key));
    return snapshot.exists() ? snapshot.data() : null;
  }

  async loadProductionDemand(): Promise<Record<string, number>> {
    if (!this.firebase.isConfigured) throw new Error(this.firebase.configurationMessage);
    const snapshot = await getDocs(collection(this.firebase.firestore, 'productionDemand'));
    return Object.fromEntries(snapshot.docs.map(item => [item.id, Math.max(0, Number(item.data()['pendingUnits'] ?? 0))]));
  }

  async searchCollection<T extends Record<string, unknown>>(
    collectionKey: string,
    term: string,
    options: { limit?: number; status?: string; tokenField?: 'searchTokens' | 'nameSearchTokens' } = {},
  ): Promise<T[]> {
    if (!this.firebase.isConfigured) throw new Error(this.firebase.configurationMessage);
    const token = term.normalize('NFD').split('').filter(char => char.charCodeAt(0) < 768 || char.charCodeAt(0) > 879).join('').toLocaleLowerCase('es').replace(/[^a-z0-9]+/g, '').trim();
    if (token.length < 2) return [];
    const constraints: QueryConstraint[] = [where(options.tokenField ?? 'searchTokens', 'array-contains', token)];
    if (options.status && options.status !== 'ALL') constraints.push(where('status', '==', options.status));
    constraints.push(limit(Math.min(50, Math.max(1, options.limit ?? 25))));
    const snapshot = await getDocs(query(collection(this.firebase.firestore, collectionKey), ...constraints));
    return snapshot.docs.map(item => {
      const { sortIndex: _sortIndex, searchTokens: _searchTokens, nameSearchTokens: _nameSearchTokens, ...value } = item.data();
      return { ...value, id: value['id'] ?? item.id } as T;
    });
  }

  /** Uses Firestore's count aggregation instead of downloading matching documents. */
  async countCollection(
    collectionKey: string,
    filters: { field: string; op: '==' | '>=' | '<=' | '>' | '<' | 'in'; value: unknown }[] = [],
  ): Promise<number> {
    if (!this.firebase.isConfigured) throw new Error(this.firebase.configurationMessage);
    const constraints: QueryConstraint[] = filters.map(filter => where(filter.field, filter.op, filter.value));
    const snapshot = await getCountFromServer(query(collection(this.firebase.firestore, collectionKey), ...constraints));
    return snapshot.data().count;
  }

  /**
   * Upserts one record inside an imported business collection while preserving
   * the original numeric order. Deleted records may leave index gaps; this is
   * intentional because loadState orders by index and does not require gaps to
   * be compacted.
   */
  async upsertCollectionRecord(
    collectionKey: string,
    recordId: string,
    value: Record<string, unknown>,
  ): Promise<void> {
    if (!this.firebase.isConfigured) throw new Error(this.firebase.configurationMessage);
    const safeValue = this.removeUndefinedFields(value);
    if (collectionKey === 'customers' || collectionKey === 'orders') safeValue['searchTokens'] = this.searchTokensFor({ ...safeValue, id: recordId });
    if (collectionKey === 'customers') safeValue['nameSearchTokens'] = this.searchNameTokensFor({ ...safeValue, id: recordId });
    const recordRef = doc(this.firebase.firestore, collectionKey, recordId);
    const existing = await getDoc(recordRef);
    const sortIndex = existing.exists()
      ? Number(existing.data()['sortIndex'] ?? Date.now())
      : Date.now();
    if (collectionKey === 'orders') {
      await this.persistOrderWithStats(recordRef, safeValue, sortIndex);
    } else {
      await setDoc(recordRef, { ...safeValue, sortIndex });
    }
    this.invalidateStateCache();
    await this.publishStateChange([collectionKey]);
  }

  private extractOrderSalesQuantities(order: Record<string, unknown>): Map<string, number> {
    const quantities = new Map<string, number>();
    const addItems = (items: unknown): void => {
      if (!Array.isArray(items)) return;
      for (const rawItem of items) {
        if (!this.isRecord(rawItem)) continue;
        const id = String(rawItem['recipeId'] ?? rawItem['productId'] ?? rawItem['id'] ?? '').trim();
        const quantity = Number(rawItem['quantity'] ?? rawItem['qty'] ?? rawItem['count'] ?? 0);
        if (id && id !== 'shipping' && Number.isFinite(quantity) && quantity > 0) {
          quantities.set(id, (quantities.get(id) ?? 0) + quantity);
        }
      }
    };
    addItems(order['items']);
    if (!quantities.size) addItems(order['lines']);
    if (!quantities.size && Array.isArray(order['boxes'])) {
      for (const box of order['boxes']) if (this.isRecord(box)) addItems(box['items']);
    }
    return quantities;
  }

  private async persistOrderWithStats(
    orderRef: DocumentReference,
    updatedOrder: Record<string, unknown>,
    sortIndex: number,
  ): Promise<void> {
    const salesSummaryRef = doc(this.firebase.firestore, 'businessStats', 'sales');
    await runTransaction(this.firebase.firestore, async transaction => {
      const currentSnapshot = await transaction.get(orderRef);
      const current = currentSnapshot.exists() ? currentSnapshot.data()! : null;
      const oldStatus = String(current?.['status'] ?? '').toUpperCase();
      const newStatus = String(updatedOrder['status'] ?? '').toUpperCase();
      const oldQuantities = current ? this.extractOrderSalesQuantities(current) : new Map<string, number>();
      const nextQuantities = this.extractOrderSalesQuantities(updatedOrder);
      const oldDelivered = oldStatus === 'DELIVERED';
      const nextDelivered = newStatus === 'DELIVERED';
      const oldPending = oldStatus === 'PENDING';
      const nextPending = newStatus === 'PENDING';
      const productIds = new Set([...oldQuantities.keys(), ...nextQuantities.keys()]);
      const changes = [...productIds].map(id => ({
        id,
        salesDelta: (nextDelivered ? nextQuantities.get(id) ?? 0 : 0) - (oldDelivered ? oldQuantities.get(id) ?? 0 : 0),
        demandDelta: (nextPending ? nextQuantities.get(id) ?? 0 : 0) - (oldPending ? oldQuantities.get(id) ?? 0 : 0),
      })).filter(item => item.salesDelta !== 0 || item.demandDelta !== 0);
      const salesSnapshot = await transaction.get(salesSummaryRef);
      const productSnapshots: DocumentSnapshot[] = [];
      const demandSnapshots: DocumentSnapshot[] = [];
      for (const change of changes) {
        productSnapshots.push(await transaction.get(doc(this.firebase.firestore, 'productSalesStats', change.id)));
        demandSnapshots.push(await transaction.get(doc(this.firebase.firestore, 'productionDemand', change.id)));
      }

      transaction.set(orderRef, { ...updatedOrder, sortIndex });
      const now = new Date().toISOString();
      changes.forEach((change, index) => {
        if (change.salesDelta !== 0) {
          const snapshot = productSnapshots[index];
          const currentUnits = Number(snapshot.exists() ? snapshot.data()?.['unitsSold'] ?? 0 : 0);
          transaction.set(doc(this.firebase.firestore, 'productSalesStats', change.id), {
            productId: change.id,
            unitsSold: Math.max(0, currentUnits + change.salesDelta),
            updatedAt: now,
          });
        }
        if (change.demandDelta !== 0) {
          const snapshot = demandSnapshots[index];
          const currentUnits = Number(snapshot.exists() ? snapshot.data()?.['pendingUnits'] ?? 0 : 0);
          transaction.set(doc(this.firebase.firestore, 'productionDemand', change.id), {
            recipeId: change.id,
            pendingUnits: Math.max(0, currentUnits + change.demandDelta),
            updatedAt: now,
          });
        }
      });

      const revenueDelta = (nextDelivered ? Number(updatedOrder['total'] ?? 0) : 0)
        - (oldDelivered ? Number(current?.['total'] ?? 0) : 0);
      const unitsDelta = changes.reduce((sum, item) => sum + item.salesDelta, 0);
      const deliveredDelta = Number(nextDelivered) - Number(oldDelivered);
      if (revenueDelta !== 0 || unitsDelta !== 0 || deliveredDelta !== 0 || !salesSnapshot.exists()) {
        const summary = salesSnapshot.data() ?? {};
        transaction.set(salesSummaryRef, {
          deliveredOrders: Math.max(0, Number(summary['deliveredOrders'] ?? 0) + deliveredDelta),
          revenue: Math.max(0, Math.round((Number(summary['revenue'] ?? 0) + revenueDelta) * 100) / 100),
          unitsSold: Math.max(0, Number(summary['unitsSold'] ?? 0) + unitsDelta),
          updatedAt: now,
        }, { merge: true });
      }
    });
  }

  private async deleteOrderWithStats(orderRef: DocumentReference): Promise<void> {
    const salesSummaryRef = doc(this.firebase.firestore, 'businessStats', 'sales');
    await runTransaction(this.firebase.firestore, async transaction => {
      const orderSnapshot = await transaction.get(orderRef);
      if (!orderSnapshot.exists()) throw new Error('No se encontró el registro que intentas eliminar.');
      const order = orderSnapshot.data();
      const status = String(order['status'] ?? '').toUpperCase();
      const quantities = this.extractOrderSalesQuantities(order);
      const salesSnapshot = await transaction.get(salesSummaryRef);
      const productSnapshots: DocumentSnapshot[] = [];
      const demandSnapshots: DocumentSnapshot[] = [];
      for (const id of quantities.keys()) {
        productSnapshots.push(await transaction.get(doc(this.firebase.firestore, 'productSalesStats', id)));
        demandSnapshots.push(await transaction.get(doc(this.firebase.firestore, 'productionDemand', id)));
      }
      transaction.delete(orderRef);
      const now = new Date().toISOString();
      [...quantities.entries()].forEach(([id, quantity], index) => {
        if (status === 'DELIVERED') {
          const snapshot = productSnapshots[index];
          const units = Number(snapshot.exists() ? snapshot.data()?.['unitsSold'] ?? 0 : 0);
          transaction.set(doc(this.firebase.firestore, 'productSalesStats', id), {
            productId: id, unitsSold: Math.max(0, units - quantity), updatedAt: now,
          });
        }
        if (status === 'PENDING') {
          const snapshot = demandSnapshots[index];
          const units = Number(snapshot.exists() ? snapshot.data()?.['pendingUnits'] ?? 0 : 0);
          transaction.set(doc(this.firebase.firestore, 'productionDemand', id), {
            recipeId: id, pendingUnits: Math.max(0, units - quantity), updatedAt: now,
          });
        }
      });
      if (status === 'DELIVERED') {
        const summary = salesSnapshot.data() ?? {};
        transaction.set(salesSummaryRef, {
          deliveredOrders: Math.max(0, Number(summary['deliveredOrders'] ?? 0) - 1),
          revenue: Math.max(0, Math.round((Number(summary['revenue'] ?? 0) - Number(order['total'] ?? 0)) * 100) / 100),
          unitsSold: Math.max(0, Number(summary['unitsSold'] ?? 0) - [...quantities.values()].reduce((sum, value) => sum + value, 0)),
          updatedAt: now,
        }, { merge: true });
      }
    });
  }

  async deleteCollectionRecord(collectionKey: string, recordId: string): Promise<void> {
    this.invalidateStateCache();
    if (!this.firebase.isConfigured) {
      throw new Error(this.firebase.configurationMessage);
    }

    const matching = await getDoc(doc(this.firebase.firestore, collectionKey, recordId));

    if (!matching.exists()) {
      throw new Error('No se encontró el registro que intentas eliminar. Actualiza la pantalla e inténtalo de nuevo.');
    }

    if (collectionKey === 'orders') await this.deleteOrderWithStats(matching.ref);
    else await deleteDoc(matching.ref);
    this.invalidateStateCache();
    await this.publishStateChange([collectionKey]);
  }

  async upsertBusinessSetting(key: string, value: unknown): Promise<void> {
    this.invalidateStateCache();
    if (!this.firebase.isConfigured) {
      throw new Error('Firebase no está configurado.');
    }
    const metadataRef = this.stateMetaRef();
    const metadataSnapshot = await getDoc(metadataRef);
    if (!metadataSnapshot.exists() || metadataSnapshot.data()['status'] !== 'complete') {
      throw new Error('La migración de StarKies no está completa. No se guardó la configuración.');
    }
    const metadata = metadataSnapshot.data() as StateMetadata;
    await setDoc(
      doc(this.firebase.firestore, 'settings', key),
      { data: value },
      { merge: true },
    );
    await setDoc(metadataRef, {
      settingKeys: Array.from(new Set([...(metadata.settingKeys ?? []), key])),
      stateKeys: Array.from(new Set([...(metadata.stateKeys ?? []), key])),
      revision: increment(1),
      changedKeys: [key],
    }, { merge: true });
    this.invalidateStateCache();
  }

  /**
   * Atomically records a production run, deducts its recipe ingredients from
   * inventory, and registers the new productionHistory collection in metadata.
   */
  async recordProduction(
    record: Record<string, unknown>,
    deductions: { ingredientId: string; quantity: number }[],
  ): Promise<void> {
    if (!this.firebase.isConfigured) {
      throw new Error(this.firebase.configurationMessage);
    }

    const productionId = String(record['id'] ?? '').trim();
    if (!productionId) throw new Error('El lote necesita un identificador.');

    const metadataRef = this.stateMetaRef();
    const metadataSnapshot = await getDoc(metadataRef);
    if (!metadataSnapshot.exists() || metadataSnapshot.data()['status'] !== 'complete') {
      throw new Error('La migración de StarKies no está completa. No se registró el lote.');
    }

    const totals = new Map<string, number>();
    for (const deduction of deductions) {
      if (!deduction.ingredientId || !Number.isFinite(deduction.quantity) || deduction.quantity <= 0) {
        throw new Error('La fórmula contiene una cantidad de ingrediente no válida.');
      }
      totals.set(deduction.ingredientId, (totals.get(deduction.ingredientId) ?? 0) + deduction.quantity);
    }

    const ingredientDocs: { ingredientId: string; quantity: number; ref: DocumentReference }[] = [];
    for (const [ingredientId, quantity] of totals.entries()) {
      const ingredientRef = doc(this.firebase.firestore, 'ingredients', ingredientId);
      const matching = await getDoc(ingredientRef);
      if (!matching.exists()) {
        throw new Error('No se encontró uno de los ingredientes de la receta. Revisa la fórmula antes de producir.');
      }
      ingredientDocs.push({ ingredientId, quantity, ref: ingredientRef });
    }

    const productionRef = collection(
      this.firebase.firestore,
      'productionHistory',
    );
    const newProductionRef = doc(productionRef, productionId);

    await runTransaction(this.firebase.firestore, async (transaction) => {
      const currentMetadataSnapshot = await transaction.get(metadataRef);
      if (!currentMetadataSnapshot.exists() || currentMetadataSnapshot.data()['status'] !== 'complete') {
        throw new Error('La migración de StarKies ya no está disponible. No se registró el lote.');
      }

      const currentIngredientSnapshots: DocumentSnapshot[] = [];
      for (const ingredientDoc of ingredientDocs) {
        currentIngredientSnapshots.push(await transaction.get(ingredientDoc.ref));
      }
      const existingProductionSnapshot = await transaction.get(newProductionRef);
      if (existingProductionSnapshot.exists()) {
        throw new Error('Este lote ya existe. Actualiza la pantalla antes de volver a intentarlo.');
      }
      const finishedInventoryRef = doc(this.firebase.firestore, 'settings', 'finishedProductInventory');
      const finishedInventorySnapshot = await transaction.get(finishedInventoryRef);
      const productionStatsRef = doc(this.firebase.firestore, 'businessStats', 'production');
      const productionStatsSnapshot = await transaction.get(productionStatsRef);

      const updates: { ref: DocumentReference; index: number; value: Record<string, unknown> }[] = [];
      ingredientDocs.forEach((ingredientDoc, index) => {
        const snapshot = currentIngredientSnapshots[index];
        if (!snapshot.exists()) {
          throw new Error('Uno de los ingredientes cambió durante el registro. Actualiza la pantalla e inténtalo de nuevo.');
        }
        const data = snapshot.data();
        const stored = data;
        if (!this.isRecord(stored)) {
          throw new Error('No se pudo leer uno de los ingredientes. No se registró el lote.');
        }

        const currentStock = Number(stored['stock'] ?? 0);
        if (!Number.isFinite(currentStock)) {
          const ingredientName = String(stored['name'] ?? ingredientDoc.ingredientId);
          throw new Error(`El stock de "${ingredientName}" no es un número válido. Corrige el inventario antes de producir.`);
        }

        // Production is allowed to reveal a real stock deficit: negative balances
        // remain visible until the next physical count corrects them.
        updates.push({
          ref: ingredientDoc.ref,
          index: Number(data['sortIndex'] ?? 0),
          value: { ...stored, stock: currentStock - ingredientDoc.quantity },
        });
      });

      const metadata = currentMetadataSnapshot.data() as StateMetadata;
      const arrayKeys = Array.from(new Set([...(metadata.arrayKeys ?? []), 'productionHistory']));
      const settingKeys = Array.from(new Set([...(metadata.settingKeys ?? []), 'finishedProductInventory']));
      const stateKeys = Array.from(new Set([...(metadata.stateKeys ?? []), 'productionHistory', 'finishedProductInventory']));
      const counts = metadata.recordCounts ?? {};

      const rawInventory = finishedInventorySnapshot.exists() ? finishedInventorySnapshot.data()['data'] : [];
      const inventoryRows = Array.isArray(rawInventory)
        ? rawInventory.filter((item): item is Record<string, unknown> => this.isRecord(item))
        : [];
      const inventoryMap = new Map(inventoryRows.map(item => [
        String(item['id'] ?? item['recipeId'] ?? ''),
        Number.isFinite(Number(item['quantity'])) ? Number(item['quantity']) : 0,
      ]));
      const outputId = String(record['recipeId'] ?? '').trim();
      const outputQuantity = Number(record['totalYield'] ?? 0);
      if (!outputId || !Number.isFinite(outputQuantity) || outputQuantity < 0) {
        throw new Error('La producción necesita un producto y una cantidad válida.');
      }
      inventoryMap.set(outputId, (inventoryMap.get(outputId) ?? 0) + outputQuantity);
      const baseInventoryId = String(record['baseInventoryId'] ?? '').trim();
      const baseGramsConsumed = Number(record['baseGramsConsumed'] ?? 0);
      if (baseInventoryId && Number.isFinite(baseGramsConsumed) && baseGramsConsumed > 0) {
        inventoryMap.set(baseInventoryId, (inventoryMap.get(baseInventoryId) ?? 0) - baseGramsConsumed);
      }
      const nextInventory = Array.from(inventoryMap.entries()).map(([id, quantity]) => ({
        id, quantity, updatedAt: new Date().toISOString(),
      }));

      for (const update of updates) {
        transaction.set(update.ref, { ...update.value, sortIndex: update.index });
      }
      transaction.set(newProductionRef, { ...record, sortIndex: Date.now() });
      transaction.set(finishedInventoryRef, { data: nextInventory }, { merge: true });
      const productionStats = productionStatsSnapshot.data() ?? {};
      const batches = Math.max(0, Number(record['batches'] ?? 0));
      const yieldQuantity = String(record['outputUnit'] ?? '') === 'g' ? 0 : Math.max(0, outputQuantity);
      transaction.set(productionStatsRef, {
        totalBatches: Math.max(0, Number(productionStats['totalBatches'] ?? 0) + batches),
        totalUnits: Math.max(0, Number(productionStats['totalUnits'] ?? 0) + yieldQuantity),
        totalCost: Math.max(0, Math.round((Number(productionStats['totalCost'] ?? 0) + Number(record['calculatedCost'] ?? 0)) * 100) / 100),
        completedRuns: Math.max(0, Number(productionStats['completedRuns'] ?? 0) + 1),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      transaction.set(metadataRef, {
        arrayKeys,
        settingKeys,
        stateKeys,
        recordCounts: {
          ...counts,
          productionHistory: Number(counts['productionHistory'] ?? 0) + 1,
        },
        revision: increment(1),
        changedKeys: ['ingredients', 'productionHistory', 'finishedProductInventory', 'stats:production'],
      }, { merge: true });
    });
  }

  async recordCashMovement(movement: CashMovement): Promise<void> {
    this.invalidateStateCache();
    if (!this.firebase.isConfigured) {
      throw new Error(this.firebase.configurationMessage);
    }
    this.validateCashMovement(movement);

    const metadataRef = this.stateMetaRef();
    const movementRef = doc(
      this.firebase.firestore,
      'cashMovements', movement.id,
    );

    await runTransaction(this.firebase.firestore, async (transaction) => {
      const metadataSnapshot = await transaction.get(metadataRef);
      const existingMovement = await transaction.get(movementRef);
      if (!metadataSnapshot.exists() || metadataSnapshot.data()['status'] !== 'complete') {
        throw new Error('La migración de StarKies no está completa. No se registró el movimiento.');
      }
      if (existingMovement.exists()) {
        throw new Error('Este movimiento ya existe. Actualiza la pantalla e inténtalo de nuevo.');
      }

      const metadata = metadataSnapshot.data() as StateMetadata;
      const counts = metadata.recordCounts ?? {};
      const nextCount = Number(counts['cashMovements'] ?? 0) + 1;
      transaction.set(movementRef, { ...movement, sortIndex: Date.now() });
      transaction.set(metadataRef, {
        arrayKeys: Array.from(new Set([...(metadata.arrayKeys ?? []), 'cashMovements'])),
        stateKeys: Array.from(new Set([...(metadata.stateKeys ?? []), 'cashMovements'])),
        recordCounts: { ...counts, cashMovements: nextCount },
        revision: increment(1),
        changedKeys: ['cashMovements', 'ingredients'],
        revision: increment(1),
        changedKeys: ['cashMovements'],
      }, { merge: true });
    });
  }

  /**
   * Records the cash outflow and stock increase in one Firestore transaction.
   * The ingredient cost is updated using a weighted average, so inventory value
   * remains consistent after purchases at different unit prices.
   */
  async recordIngredientPurchase(movement: CashMovement): Promise<void> {
    this.invalidateStateCache();
    if (!this.firebase.isConfigured) {
      throw new Error(this.firebase.configurationMessage);
    }

    const ingredientId = String(movement.ingredientId ?? '').trim();
    const quantity = Number(movement.quantity);
    const unitCost = Number(movement.unitCost);
    if (!ingredientId) throw new Error('Selecciona el insumo de la compra.');
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('La cantidad comprada debe ser mayor que cero.');
    }
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      throw new Error('El costo por unidad debe ser mayor que cero.');
    }

    const amount = Math.round(quantity * unitCost * 100) / 100;
    const savedMovement: CashMovement = {
      ...movement,
      type: 'OUT',
      category: 'compra_insumo',
      amount,
    };
    this.validateCashMovement(savedMovement);

    const ingredientRef = doc(this.firebase.firestore, 'ingredients', ingredientId);
    const matchingIngredient = await getDoc(ingredientRef);
    if (!matchingIngredient.exists()) {
      throw new Error('No se encontró el insumo seleccionado. Actualiza la pantalla e inténtalo de nuevo.');
    }

    const metadataRef = this.stateMetaRef();
    const movementRef = doc(
      this.firebase.firestore,
      'cashMovements', savedMovement.id,
    );

    await runTransaction(this.firebase.firestore, async (transaction) => {
      const metadataSnapshot = await transaction.get(metadataRef);
      const currentIngredientSnapshot = await transaction.get(matchingIngredient.ref);
      const existingMovement = await transaction.get(movementRef);

      if (!metadataSnapshot.exists() || metadataSnapshot.data()['status'] !== 'complete') {
        throw new Error('La migración de StarKies no está completa. No se registró la compra.');
      }
      if (!currentIngredientSnapshot.exists()) {
        throw new Error('El insumo cambió durante el registro. Actualiza la pantalla e inténtalo de nuevo.');
      }
      if (existingMovement.exists()) {
        throw new Error('Esta compra ya existe. Actualiza la pantalla e inténtalo de nuevo.');
      }

      const stored = currentIngredientSnapshot.data();
      if (!this.isRecord(stored)) {
        throw new Error('No se pudo leer el insumo seleccionado. No se registró la compra.');
      }

      const currentStock = Number(stored['stock'] ?? 0);
      const currentUnitCost = Number(stored['costPerUnit'] ?? stored['cost'] ?? 0);
      if (!Number.isFinite(currentStock) || currentStock < 0
        || !Number.isFinite(currentUnitCost) || currentUnitCost < 0) {
        throw new Error('El stock o costo actual del insumo no es válido. Corrige el inventario antes de comprar.');
      }

      const nextStock = currentStock + quantity;
      const latestPurchaseCost = unitCost;
      const updatedIngredient: Record<string, unknown> = {
        ...stored,
        stock: nextStock,
        costPerUnit: latestPurchaseCost,
        packageQuantityGrams: Number(movement.packageQuantityGrams ?? stored['packageQuantityGrams'] ?? 0),
        packageUnit: String(movement.packageUnit ?? stored['packageUnit'] ?? stored['unit'] ?? 'g'),
        packagePrice: Number(movement.packagePrice ?? stored['packagePrice'] ?? amount),
      };
      if (movement.brand?.trim()) updatedIngredient['brand'] = movement.brand.trim();
      // Preserve compatibility with backups whose original field was named "cost".
      if (Object.prototype.hasOwnProperty.call(stored, 'cost')) {
        updatedIngredient['cost'] = latestPurchaseCost;
      }

      const metadata = metadataSnapshot.data() as StateMetadata;
      const counts = metadata.recordCounts ?? {};
      const nextCount = Number(counts['cashMovements'] ?? 0) + 1;
      transaction.set(currentIngredientSnapshot.ref, { ...updatedIngredient, sortIndex: Number(currentIngredientSnapshot.data()['sortIndex'] ?? 0) });
      transaction.set(movementRef, { ...savedMovement, sortIndex: Date.now() });
      transaction.set(metadataRef, {
        arrayKeys: Array.from(new Set([...(metadata.arrayKeys ?? []), 'cashMovements'])),
        stateKeys: Array.from(new Set([...(metadata.stateKeys ?? []), 'cashMovements'])),
        recordCounts: { ...counts, cashMovements: nextCount },
      }, { merge: true });
    });
  }

  private validateCashMovement(movement: CashMovement): void {
    if (!movement.id?.trim()) throw new Error('El movimiento necesita un identificador.');
    if (!movement.description?.trim()) throw new Error('Ingresa una descripción para el movimiento.');
    if (!movement.date?.trim() || !Number.isFinite(Date.parse(movement.date))) {
      throw new Error('Selecciona una fecha válida para el movimiento.');
    }
    if (movement.type !== 'IN' && movement.type !== 'OUT') {
      throw new Error('El tipo de movimiento no es válido.');
    }
    if (!Number.isFinite(movement.amount) || movement.amount <= 0) {
      throw new Error('El monto debe ser mayor que cero.');
    }
    if (!movement.category?.trim()) throw new Error('Selecciona una categoría para el movimiento.');
  }

  async importInitialBackup(backup: StarKiesBackupFile): Promise<void> {
    this.invalidateStateCache();
    if (!this.firebase.isConfigured) {
      throw new Error(this.firebase.configurationMessage);
    }
    if (!this.isRecord(backup) || !this.isRecord(backup.state)) {
      throw new Error('El archivo no tiene el formato de respaldo StarKies esperado. No se ha importado nada.');
    }

    const stateEntries = Object.entries(backup.state);
    if (stateEntries.length === 0) {
      throw new Error('El respaldo no contiene datos de negocio. No se ha importado nada.');
    }

    const stateKeys = stateEntries.map(([key]) => key);
    const arrayKeys = stateEntries.filter(([, value]) => Array.isArray(value)).map(([key]) => key);
    const settingKeys = stateEntries.filter(([, value]) => !Array.isArray(value)).map(([key]) => key);
    const sourceExportedAt = backup.exportedAt ?? 'unknown-date';
    const archiveId = `original-${sourceExportedAt.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const metaRef = this.stateMetaRef();

    const before = await getDoc(metaRef);
    let isResume = false;

    if (before.exists()) {
      const metadata = before.data() as StateMetadata;
      if (metadata.status === 'complete') {
        throw new Error('StarKies ya tiene una migración completa en Firebase. Se rechazó la importación para proteger los datos existentes.');
      }
      if (metadata.status !== 'in-progress' || metadata.sourceExportedAt !== sourceExportedAt) {
        throw new Error('Existe una migración incompleta de otro respaldo. No se sobrescribió ningún dato; revisa el estado de migración antes de continuar.');
      }
      isResume = true;
    } else {
      await this.assertDestinationIsEmpty(arrayKeys, settingKeys);
    }

    await runTransaction(this.firebase.firestore, async (transaction) => {
      const current = await transaction.get(metaRef);
      if (current.exists()) {
        const metadata = current.data() as StateMetadata;
        if (metadata.status === 'complete') {
          throw new Error('StarKies ya tiene una migración completa en Firebase. Se rechazó la importación.');
        }
        if (metadata.status !== 'in-progress' || metadata.sourceExportedAt !== sourceExportedAt) {
          throw new Error('Cambió el estado de migración mientras se preparaba la importación. No se escribieron nuevos registros.');
        }
      } else {
        transaction.set(metaRef, {
          status: 'in-progress',
          schemaVersion: 3,
          stateKeys,
          arrayKeys,
          settingKeys,
          sourceBackupId: archiveId,
          sourceExportedAt,
          startedAt: new Date().toISOString(),
        });
      }
    });

    const archiveRef = doc(
      this.firebase.firestore,
      'migrationArchives', archiveId,
    );
    const archiveSnapshot = await getDoc(archiveRef);
    if (!archiveSnapshot.exists()) {
      await this.archiveService.archiveOriginalBackup(backup, archiveId);
    } else if (!isResume) {
      throw new Error('Ya existe un archivo con ese identificador y no hay una migración en curso. No se sobrescribió.');
    }

    let batch = writeBatch(this.firebase.firestore);
    let operations = 0;
    const flushIfFull = async () => {
      if (operations >= 400) {
        await batch.commit();
        batch = writeBatch(this.firebase.firestore);
        operations = 0;
      }
    };

    for (const [key, value] of stateEntries) {
      if (Array.isArray(value)) {
        value.forEach((record, index) => {
          const rawRecord = this.isRecord(record) ? record : {};
          const candidateId = String(rawRecord['id'] ?? rawRecord['code'] ?? '').trim();
          const recordId = candidateId && !candidateId.includes('/') ? candidateId : String(index).padStart(6, '0');
          const recordRef = doc(
            this.firebase.firestore,
            key, recordId,
          );
          batch.set(recordRef, { ...(this.isRecord(record) ? record : {}), sortIndex: index });
          operations += 1;
        });
        await flushIfFull();
      } else {
        const settingRef = doc(this.firebase.firestore, 'settings', key);
        batch.set(settingRef, { data: value });
        operations += 1;
        await flushIfFull();
      }
    }

    if (operations > 0) await batch.commit();

    await setDoc(metaRef, {
      status: 'complete',
      schemaVersion: 3,
      stateKeys,
      arrayKeys,
      settingKeys,
      sourceBackupId: archiveId,
      sourceExportedAt,
      importedAt: new Date().toISOString(),
      recordCounts: Object.fromEntries(
        stateEntries
          .filter(([, value]) => Array.isArray(value))
          .map(([key, value]) => [key, (value as unknown[]).length]),
      ),
    }, { merge: true });
  }

  private async assertDestinationIsEmpty(arrayKeys: string[], settingKeys: string[]): Promise<void> {
    const existingArrays = await Promise.all(arrayKeys.map(async (key) => {
      const snapshot = await getDocs(collection(
        this.firebase.firestore,
        key,
      ));
      return snapshot.empty ? null : key;
    }));

    const existingSettings = await Promise.all(settingKeys.map(async (key) => {
      const snapshot = await getDoc(
        doc(this.firebase.firestore, 'settings', key),
      );
      return snapshot.exists() ? key : null;
    }));

    const conflicts = [...existingArrays, ...existingSettings].filter((key): key is string => Boolean(key));
    if (conflicts.length) {
      throw new Error(`Ya hay datos en Firebase (${conflicts.slice(0, 5).join(', ')}). Se canceló la importación para no sobrescribirlos.`);
    }
  }

  /**
   * Recursively removes undefined object properties before sending values to
   * Firestore. Undefined array slots become null to preserve array positions.
   * Non-plain objects (Date, Firestore Timestamp, etc.) are preserved.
   */
  private removeUndefinedFields<T>(value: T): T {
    if (Array.isArray(value)) {
      return value.map((item) => item === undefined ? null : this.removeUndefinedFields(item)) as T;
    }
    if (value === null || typeof value !== 'object') return value;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;

    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (child !== undefined) result[key] = this.removeUndefinedFields(child);
    }
    return result as T;
  }

  private searchTokensFor(record: Record<string, unknown>): string[] {
    const values = [record['id'], record['code'], record['name'], record['customer'], record['phone'], record['address']]
      .map(value => String(value ?? '').normalize('NFD').split('').filter(char => char.charCodeAt(0) < 768 || char.charCodeAt(0) > 879).join('').toLocaleLowerCase('es').replace(/[^a-z0-9]+/g, ' ').trim())
      .filter(Boolean);
    const tokens = new Set<string>();
    for (const value of values) {
      const compact = value.split(' ').join('');
      for (let i = 2; i <= compact.length; i++) tokens.add(compact.slice(0, i));
      for (const word of value.split(' ').filter(part => part.length >= 2)) {
        for (let i = 2; i <= word.length; i++) tokens.add(word.slice(0, i));
      }
    }
    return [...tokens];
  }

  private searchNameTokensFor(record: Record<string, unknown>): string[] {
    const name = String(record['name'] ?? '').normalize('NFD').split('')
      .filter(char => char.charCodeAt(0) < 768 || char.charCodeAt(0) > 879)
      .join('').toLocaleLowerCase('es').replace(/[^a-z0-9]+/g, ' ').trim();
    const tokens = new Set<string>();
    for (const word of name.split(' ').filter(part => part.length >= 2)) {
      for (let i = 2; i <= word.length; i++) tokens.add(word.slice(0, i));
    }
    const compact = name.split(' ').join('');
    for (let i = 2; i <= compact.length; i++) tokens.add(compact.slice(0, i));
    return [...tokens];
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}