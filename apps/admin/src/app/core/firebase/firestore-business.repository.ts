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

  constructor(private readonly firebase: FirebaseClientService, private readonly archiveService: FirestoreBackupArchiveService) {}

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
  watchStateMeta(onChange: (changedKeys: string[]) => void, onError?: (error: Error) => void): Unsubscribe {
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
  private async publishStateChange(
    changedKeys: string[] = [],
    collectionChange?: { collectionKey: string; delta?: number },
  ): Promise<void> {
    if (!this.firebase.isConfigured) return;
    const metaRef = this.stateMetaRef();
    const snapshot = await getDoc(metaRef);
    const metadata = snapshot.data() ?? {};
    const update: Record<string, unknown> = {
      revision: increment(1),
      updatedAt: serverTimestamp(),
      changedKeys,
    };
    if (collectionChange) {
      const key = collectionChange.collectionKey;
      const arrayKeys = Array.isArray(metadata['arrayKeys']) ? metadata['arrayKeys'] as string[] : [];
      const stateKeys = Array.isArray(metadata['stateKeys']) ? metadata['stateKeys'] as string[] : [];
      update['arrayKeys'] = Array.from(new Set([...arrayKeys, key]));
      update['stateKeys'] = Array.from(new Set([...stateKeys, key]));
      if (collectionChange.delta !== undefined) {
        const counts = typeof metadata['recordCounts'] === 'object' && metadata['recordCounts'] !== null
          ? metadata['recordCounts'] as Record<string, unknown>
          : {};
        update['recordCounts'] = {
          ...counts,
          [key]: Math.max(0, Number(counts[key] ?? 0) + collectionChange.delta),
        };
      }
    }
    await setDoc(metaRef, update, { merge: true });
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
      ? requestedCollectionKeys.filter(key => allArrayKeys.includes(key) || key === 'publicCatalog' || key === 'catalogDrafts' || key === 'promotions')
      : allArrayKeys;
    const settingKeys = requestedCollectionKeys
      ? requestedCollectionKeys.filter(key => allSettingKeys.includes(key))
      : allSettingKeys;
    const state: Record<string, unknown> = {};

    await Promise.all(arrayKeys.map(async (key) => {
      const recordsRef = collection(this.firebase.firestore, key);
      const recordsSnapshot = await getDocs(query(recordsRef, orderBy('sortIndex', 'asc')));
      state[key] = recordsSnapshot.docs
        .filter(record => key !== 'publicCatalog' || record.id !== 'catalog-settings')
        .map((record) => { const { sortIndex: _sortIndex, ...value } = record.data(); return value; });
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
        return { ...value, id: value['id'] ?? item.id } as unknown as T;
      }),
      cursor: docs.length ? docs[docs.length - 1] : null,
      hasMore,
    };
  }

  /** Searches indexed prefixes; only matching documents are returned from Firestore. */
  async getCollectionRecord(collectionKey: string, recordId: string): Promise<Record<string, unknown> | null> {
    if (!this.firebase.isConfigured) throw new Error(this.firebase.configurationMessage);
    const snapshot = await getDoc(doc(this.firebase.firestore, collectionKey, recordId));
    if (!snapshot.exists()) return null;
    const { sortIndex: _sortIndex, searchTokens: _searchTokens, nameSearchTokens: _nameSearchTokens, ...value } = snapshot.data();
    return { ...value, id: value['id'] ?? snapshot.id };
  }

  async getBusinessStats(key: 'sales' | 'production'): Promise<Record<string, unknown> | null> {
    if (!this.firebase.isConfigured) throw new Error(this.firebase.configurationMessage);
    const snapshot = await getDoc(doc(this.firebase.firestore, 'businessStats', key));
    return snapshot.exists() ? snapshot.data() : null;
  }

  async loadPendingOrders<T extends Record<string, unknown>>(): Promise<T[]> {
    if (!this.firebase.isConfigured) throw new Error(this.firebase.configurationMessage);
    const snapshot = await getDocs(query(
      collection(this.firebase.firestore, 'orders'),
      where('status', 'in', ['PENDING', 'pending', 'Pendiente', 'PENDIENTE', 'pendiente', 'PENDIENTES', 'Pendiente de pago', 'PENDIENTE DE PAGO', 'pendiente de pago']),
    ));
    return snapshot.docs.map(item => {
      const { sortIndex: _sortIndex, searchTokens: _searchTokens, nameSearchTokens: _nameSearchTokens, ...value } = item.data();
      return { ...value, id: value['id'] ?? item.id } as unknown as T;
    });
  }

  async loadDeliveredOrders<T extends Record<string, unknown>>(): Promise<T[]> {
    if (!this.firebase.isConfigured) throw new Error(this.firebase.configurationMessage);
    const snapshot = await getDocs(query(
      collection(this.firebase.firestore, 'orders'),
      where('status', 'in', ['DELIVERED', 'delivered', 'Entregado', 'Entregada', 'ENTREGADO', 'ENTREGADA', 'entregado', 'entregada', 'COMPLETED', 'COMPLETE', 'completed']),
    ));
    return snapshot.docs.map(item => {
      const { sortIndex: _sortIndex, searchTokens: _searchTokens, nameSearchTokens: _nameSearchTokens, ...value } = item.data();
      return { ...value, id: value['id'] ?? item.id } as unknown as T;
    });
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
      return { ...value, id: value['id'] ?? item.id } as unknown as T;
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
    const recordRef = doc(this.firebase.firestore, collectionKey, recordId);
    const existing = await getDoc(recordRef);
    const existingData = existing.data() ?? {};
    let previousCustomerData: Record<string, unknown> | null = null;
    let nextCustomerData: Record<string, unknown> | null = null;
    let previousCustomerId = '';
    let nextCustomerId = '';
    let previousPhone = '';
    let nextPhone = '';

    if (collectionKey === 'customers') {
      previousPhone = this.normalizePhone(String(existingData['phone'] ?? ''));
      nextPhone = this.normalizePhone(String(safeValue['phone'] ?? ''));
      await this.assertCustomerPhoneAvailable(recordId, nextPhone);
      safeValue['searchTokens'] = this.searchTokensFor({ ...safeValue, id: recordId });
      safeValue['nameSearchTokens'] = this.searchNameTokensFor({ ...safeValue, id: recordId });
    } else if (collectionKey === 'orders') {
      previousCustomerId = String(existingData['customerId'] ?? '');
      nextCustomerId = String(safeValue['customerId'] ?? previousCustomerId);
      if (previousCustomerId) {
        const previousSnapshot = await getDoc(doc(this.firebase.firestore, 'customers', previousCustomerId));
        if (previousSnapshot.exists()) previousCustomerData = previousSnapshot.data();
      }
      if (nextCustomerId) {
        const nextSnapshot = await getDoc(doc(this.firebase.firestore, 'customers', nextCustomerId));
        if (nextSnapshot.exists()) nextCustomerData = nextSnapshot.data();
      }
      previousPhone = this.normalizePhone(String(previousCustomerData?.['phone'] ?? existingData['phone'] ?? ''));
      nextPhone = this.normalizePhone(String(nextCustomerData?.['phone'] ?? safeValue['phone'] ?? ''));
      if (nextCustomerId && nextCustomerData) await this.assertCustomerPhoneAvailable(nextCustomerId, nextPhone);
      safeValue['searchTokens'] = this.searchTokensFor({
        ...safeValue,
        customer: nextCustomerData?.['name'] ?? safeValue['customer'] ?? previousCustomerData?.['name'],
        phone: nextCustomerData?.['phone'] ?? safeValue['phone'] ?? previousCustomerData?.['phone'],
        address: safeValue['address'] ?? safeValue['deliveryAddress'],
      });
    }

    const sortIndex = existing.exists() ? Number(existingData['sortIndex'] ?? Date.now()) : Date.now();
    let orderStatsChanges: { salesChanged: boolean; demandChanged: boolean } | null = null;
    if (collectionKey === 'orders') {
      orderStatsChanges = await this.persistOrderWithStats(recordRef, safeValue, sortIndex);
      if (nextCustomerId && nextCustomerData) {
        await this.syncCustomerPhoneLookup(nextCustomerId, nextPhone, nextPhone, true);
      }
      await this.syncOrderPhoneLookup(recordId, previousPhone, nextPhone, !existing.exists());
    } else {
      await setDoc(recordRef, { ...safeValue, sortIndex });
      if (collectionKey === 'customers') {
        await this.syncCustomerPhoneLookup(recordId, previousPhone, nextPhone);
        await this.refreshLinkedOrderSearchTokens(recordId, safeValue);
      }
    }

    this.invalidateStateCache();
    const changedKeys = collectionKey === 'customers'
      ? ['customers', 'customer:' + recordId, 'orders']
      : collectionKey === 'orders'
        ? ['orders', ...(nextCustomerId ? ['customer:' + nextCustomerId] : [])]
        : [collectionKey];
    if (orderStatsChanges?.salesChanged) changedKeys.push('stats:sales');
    if (orderStatsChanges?.demandChanged) changedKeys.push('stats:demand');
    await this.publishStateChange(changedKeys, {
      collectionKey,
      delta: existing.exists() ? 0 : 1,
    });
  }

  private normalizePhone(value: string): string {
    return value.replace(/\D/g, '').replace(/^593/, '0');
  }

  private async phoneHash(normalizedPhone: string): Promise<string> {
    if (normalizedPhone.length < 7 || normalizedPhone.length > 15) return '';
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedPhone));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private async assertCustomerPhoneAvailable(customerId: string, normalizedPhone: string): Promise<void> {
    const hash = await this.phoneHash(normalizedPhone);
    if (!hash) return;
    const lookupRef = doc(this.firebase.firestore, 'customerPhoneLookup', hash);
    const lookup = await getDoc(lookupRef);
    const indexedCustomerId = String(lookup.data()?.['customerId'] ?? '');
    if (!lookup.exists() || !indexedCustomerId || indexedCustomerId === customerId) return;

    const indexedCustomer = await getDoc(doc(this.firebase.firestore, 'customers', indexedCustomerId));
    const indexedPhone = this.normalizePhone(String(indexedCustomer.data()?.['phone'] ?? ''));
    if (indexedCustomer.exists() && indexedPhone === normalizedPhone) {
      throw new Error('Ese teléfono ya está asociado a otro cliente.');
    }

    // Older records may leave an index behind after the corresponding customer
    // was removed or its phone changed. Only an approved admin can repair it.
    await deleteDoc(lookupRef);
  }

  private async syncCustomerPhoneLookup(
    customerId: string,
    previousPhone: string,
    nextPhone: string,
    allowReassign = false,
  ): Promise<void> {
    const previousHash = await this.phoneHash(previousPhone);
    const nextHash = await this.phoneHash(nextPhone);
    if (previousHash && previousHash !== nextHash) {
      const previousRef = doc(this.firebase.firestore, 'customerPhoneLookup', previousHash);
      const previousLookup = await getDoc(previousRef);
      if (previousLookup.exists() && String(previousLookup.data()?.['customerId'] ?? '') === customerId) await deleteDoc(previousRef);
      const previousOrderLookupRef = doc(this.firebase.firestore, 'orderPhoneLookup', previousHash);
      const previousOrderLookup = await getDoc(previousOrderLookupRef);
      const previousOrderId = String(previousOrderLookup.data()?.['orderId'] ?? '');
      if (previousOrderLookup.exists() && previousOrderId) {
        const previousOrder = await getDoc(doc(this.firebase.firestore, 'orders', previousOrderId));
        if (previousOrder.exists() && String(previousOrder.data()?.['customerId'] ?? '') === customerId) {
          await deleteDoc(previousOrderLookupRef);
        }
      }
    }
    if (!nextHash) return;
    if (!allowReassign) await this.assertCustomerPhoneAvailable(customerId, nextPhone);
    await setDoc(doc(this.firebase.firestore, 'customerPhoneLookup', nextHash), {
      customerId,
      normalizedPhone: nextPhone,
      updatedAt: new Date().toISOString(),
    });
  }

  private async syncOrderPhoneLookup(
    orderId: string,
    previousPhone: string,
    nextPhone: string,
    isNew: boolean,
  ): Promise<void> {
    const previousHash = await this.phoneHash(previousPhone);
    const nextHash = await this.phoneHash(nextPhone);
    if (previousHash && previousHash !== nextHash) {
      const previousRef = doc(this.firebase.firestore, 'orderPhoneLookup', previousHash);
      const previousLookup = await getDoc(previousRef);
      if (previousLookup.exists() && String(previousLookup.data()?.['orderId'] ?? '') === orderId) await deleteDoc(previousRef);
    }
    if (!nextHash) return;
    const nextRef = doc(this.firebase.firestore, 'orderPhoneLookup', nextHash);
    const existing = await getDoc(nextRef);
    if (isNew || !existing.exists() || String(existing.data()?.['orderId'] ?? '') === orderId) {
      await setDoc(nextRef, { orderId, normalizedPhone: nextPhone, createdAt: new Date().toISOString() });
    }
  }

  private async refreshLinkedOrderSearchTokens(customerId: string, customer: Record<string, unknown>): Promise<void> {
    const linked = await getDocs(query(collection(this.firebase.firestore, 'orders'), where('customerId', '==', customerId)));
    let batch = writeBatch(this.firebase.firestore);
    let pending = 0;
    for (const snapshot of linked.docs) {
      const order = snapshot.data();
      batch.set(snapshot.ref, {
        searchTokens: this.searchTokensFor({
          ...order,
          customer: customer['name'],
          phone: customer['phone'],
          address: order['deliveryAddress'] ?? order['address'],
        }),
      }, { merge: true });
      pending++;
      if (pending >= 400) {
        await batch.commit();
        batch = writeBatch(this.firebase.firestore);
        pending = 0;
      }
    }
    if (pending) await batch.commit();
  }

  /**
   * Persists internal recipe data separately from private catalog drafts and the
   * public-safe projection. All three changes are committed atomically.
   */
  async upsertRecipeAndCatalogProjection(recordId: string, value: Record<string, unknown>, updateCatalogDraft = false): Promise<void> {
    if (!this.firebase.isConfigured) throw new Error(this.firebase.configurationMessage);
    const safeValue: Record<string, unknown> = this.removeUndefinedFields({ ...value, id: recordId });
    const recipeRef = doc(this.firebase.firestore, 'recipes', recordId);
    const draftRef = doc(this.firebase.firestore, 'catalogDrafts', recordId);
    const publicRef = doc(this.firebase.firestore, 'publicCatalog', recordId);
    const [existing, existingDraft] = await Promise.all([getDoc(recipeRef), getDoc(draftRef)]);
    const sortIndex = existing.exists() ? Number(existing.data()['sortIndex'] ?? Date.now()) : Date.now();
    const previousDraft = existingDraft.data() ?? {};

    const catalogImage = updateCatalogDraft
      ? (String(safeValue['image'] ?? '').trim() || String(safeValue['catalogImage'] ?? '').trim() || String(previousDraft['image'] ?? '').trim())
      : (String(previousDraft['image'] ?? '').trim() || String(safeValue['catalogImage'] ?? '').trim() || String(safeValue['image'] ?? '').trim());
    const recipeData: Record<string, unknown> = { ...safeValue, image: catalogImage };
    for (const key of ['description', 'catalogDescription', 'catalogImage', 'catalogLabel', 'catalogLabelColor', 'catalogVisible']) {
      delete recipeData[key];
    }
    const draft = {
      id: recordId,
      description: String(updateCatalogDraft ? (safeValue['catalogDescription'] ?? safeValue['description'] ?? '') : (previousDraft['description'] ?? safeValue['catalogDescription'] ?? safeValue['description'] ?? '')),
      // Keep the existing catalog photo; fall back to the legacy recipe photo only
      // when no catalog photo exists, then use the same path on the recipe and public product.
      image: catalogImage,
      label: String(updateCatalogDraft ? (safeValue['catalogLabel'] ?? '') : (previousDraft['label'] ?? safeValue['catalogLabel'] ?? '')),
      labelColor: String(updateCatalogDraft ? (safeValue['catalogLabelColor'] ?? 'Morado') : (previousDraft['labelColor'] ?? safeValue['catalogLabelColor'] ?? 'Morado')),
      visible: updateCatalogDraft ? safeValue['catalogVisible'] !== false : (previousDraft['visible'] !== false),
      sortIndex: Number(previousDraft['sortIndex'] ?? sortIndex),
    };
    const category = String(safeValue['category'] ?? 'Galletas clásicas');
    const normalizedCategory = category.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    const grams = Number(safeValue['baseGramsPerCookie'] ?? 0);
    const isNy = normalizedCategory.includes('ny') || normalizedCategory.includes('new york') || grams >= 50;
    const image = String(draft.image || safeValue['image'] || '');
    const publicProduct: Record<string, unknown> = {
      id: recordId,
      name: String(safeValue['name'] ?? ''),
      category: isNy ? 'Galletas NY' : 'Galletas clásicas',
      description: draft.description,
      price: Number(safeValue['price'] ?? 0),
      isNy,
      stock: true,
      sortIndex,
    };
    if (draft.label.trim()) publicProduct['tag'] = draft.label.trim();
    if (image) publicProduct['image'] = image;

    const batch = writeBatch(this.firebase.firestore);
    batch.set(recipeRef, { ...recipeData, sortIndex });
    batch.set(draftRef, draft);
    if (draft.visible && safeValue['archived'] !== true) batch.set(publicRef, publicProduct);
    else batch.delete(publicRef);
    await batch.commit();

    this.invalidateStateCache();
    await this.publishStateChange(['recipes', 'catalogDrafts', 'publicCatalog']);
  }

  private isDeliveredOrderStatus(value: unknown): boolean {
    const status = String(value ?? '').normalize('NFD').split('')
      .filter(char => char.charCodeAt(0) < 768 || char.charCodeAt(0) > 879)
      .join('').toLocaleLowerCase('es').trim();
    return status === 'delivered' || status === 'completed' || status === 'complete'
      || status.includes('entreg');
  }

  private isPendingOrderStatus(value: unknown): boolean {
    const status = String(value ?? '').normalize('NFD').split('')
      .filter(char => char.charCodeAt(0) < 768 || char.charCodeAt(0) > 879)
      .join('').toLocaleLowerCase('es').trim();
    return status === 'pending' || status.includes('pendient');
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
    addItems(order['lines']);
    if (!quantities.size) addItems(order['items']);
    if (!quantities.size && Array.isArray(order['boxes'])) {
      for (const box of order['boxes']) if (this.isRecord(box)) addItems(box['items']);
    }
    return quantities;
  }

  private async persistOrderWithStats(
    orderRef: DocumentReference,
    updatedOrder: Record<string, unknown>,
    sortIndex: number,
  ): Promise<{ salesChanged: boolean; demandChanged: boolean }> {
    const salesSummaryRef = doc(this.firebase.firestore, 'businessStats', 'sales');
    return runTransaction(this.firebase.firestore, async transaction => {
      const currentSnapshot = await transaction.get(orderRef);
      const current = currentSnapshot.exists() ? currentSnapshot.data()! : null;
      const oldStatus = String(current?.['status'] ?? '').toUpperCase();
      const newStatus = String(updatedOrder['status'] ?? '').toUpperCase();
      const oldQuantities = current ? this.extractOrderSalesQuantities(current) : new Map<string, number>();
      const nextQuantities = this.extractOrderSalesQuantities(updatedOrder);
      const oldDelivered = this.isDeliveredOrderStatus(oldStatus);
      const nextDelivered = this.isDeliveredOrderStatus(newStatus);
      const oldPending = this.isPendingOrderStatus(oldStatus);
      const nextPending = this.isPendingOrderStatus(newStatus);
      const productIds = new Set([...oldQuantities.keys(), ...nextQuantities.keys()]);
      const changes = [...productIds].map(id => ({
        id,
        salesDelta: (nextDelivered ? nextQuantities.get(id) ?? 0 : 0) - (oldDelivered ? oldQuantities.get(id) ?? 0 : 0),
        demandDelta: (nextPending ? nextQuantities.get(id) ?? 0 : 0) - (oldPending ? oldQuantities.get(id) ?? 0 : 0),
      })).filter(item => item.salesDelta !== 0 || item.demandDelta !== 0);
      const salesChanges = changes.filter(item => item.salesDelta !== 0);
      const demandChanges = changes.filter(item => item.demandDelta !== 0);
      const salesSnapshot = oldDelivered || nextDelivered ? await transaction.get(salesSummaryRef) : null;
      const productSnapshots: DocumentSnapshot[] = [];
      const demandSnapshots: DocumentSnapshot[] = [];
      for (const change of salesChanges) productSnapshots.push(await transaction.get(doc(this.firebase.firestore, 'productSalesStats', change.id)));
      for (const change of demandChanges) demandSnapshots.push(await transaction.get(doc(this.firebase.firestore, 'productionDemand', change.id)));

      transaction.set(orderRef, { ...updatedOrder, sortIndex });
      const now = new Date().toISOString();
      salesChanges.forEach((change, index) => {
        const snapshot = productSnapshots[index];
        const currentUnits = Number(snapshot.exists() ? snapshot.data()?.['unitsSold'] ?? 0 : 0);
        transaction.set(doc(this.firebase.firestore, 'productSalesStats', change.id), {
          productId: change.id,
          unitsSold: Math.max(0, currentUnits + change.salesDelta),
          updatedAt: now,
        });
      });
      demandChanges.forEach((change, index) => {
        const snapshot = demandSnapshots[index];
        const currentUnits = Number(snapshot.exists() ? snapshot.data()?.['pendingUnits'] ?? 0 : 0);
        transaction.set(doc(this.firebase.firestore, 'productionDemand', change.id), {
          recipeId: change.id,
          pendingUnits: Math.max(0, currentUnits + change.demandDelta),
          updatedAt: now,
        });
      });

      const revenueDelta = (nextDelivered ? Number(updatedOrder['total'] ?? 0) : 0)
        - (oldDelivered ? Number(current?.['total'] ?? 0) : 0);
      const unitsDelta = changes.reduce((sum, item) => sum + item.salesDelta, 0);
      const deliveredDelta = Number(nextDelivered) - Number(oldDelivered);
      if (salesSnapshot && (revenueDelta !== 0 || unitsDelta !== 0 || deliveredDelta !== 0 || !salesSnapshot.exists())) {
        const summary = salesSnapshot.data() ?? {};
        transaction.set(salesSummaryRef, {
          deliveredOrders: Math.max(0, Number(summary['deliveredOrders'] ?? 0) + deliveredDelta),
          revenue: Math.max(0, Math.round((Number(summary['revenue'] ?? 0) + revenueDelta) * 100) / 100),
          unitsSold: Math.max(0, Number(summary['unitsSold'] ?? 0) + unitsDelta),
          updatedAt: now,
        }, { merge: true });
      }
      return {
        salesChanged: oldDelivered !== nextDelivered || salesChanges.length > 0 || revenueDelta !== 0,
        demandChanged: oldPending !== nextPending || demandChanges.length > 0,
      };
    });
  }

  private async deleteOrderWithStats(orderRef: DocumentReference): Promise<{ salesChanged: boolean; demandChanged: boolean }> {
    const salesSummaryRef = doc(this.firebase.firestore, 'businessStats', 'sales');
    return runTransaction(this.firebase.firestore, async transaction => {
      const orderSnapshot = await transaction.get(orderRef);
      if (!orderSnapshot.exists()) throw new Error('No se encontró el registro que intentas eliminar.');
      const order = orderSnapshot.data();
      const status = String(order['status'] ?? '').toUpperCase();
      const isDelivered = this.isDeliveredOrderStatus(status);
      const isPending = this.isPendingOrderStatus(status);
      const quantities = this.extractOrderSalesQuantities(order);
      const salesSnapshot = isDelivered ? await transaction.get(salesSummaryRef) : null;
      const productSnapshots: DocumentSnapshot[] = [];
      const demandSnapshots: DocumentSnapshot[] = [];
      if (isDelivered) for (const id of quantities.keys()) productSnapshots.push(await transaction.get(doc(this.firebase.firestore, 'productSalesStats', id)));
      if (isPending) for (const id of quantities.keys()) demandSnapshots.push(await transaction.get(doc(this.firebase.firestore, 'productionDemand', id)));
      transaction.delete(orderRef);
      const now = new Date().toISOString();
      if (isDelivered) [...quantities.entries()].forEach(([id, quantity], index) => {
        const snapshot = productSnapshots[index];
        const units = Number(snapshot.exists() ? snapshot.data()?.['unitsSold'] ?? 0 : 0);
        transaction.set(doc(this.firebase.firestore, 'productSalesStats', id), {
          productId: id, unitsSold: Math.max(0, units - quantity), updatedAt: now,
        });
      });
      if (isPending) [...quantities.entries()].forEach(([id, quantity], index) => {
        const snapshot = demandSnapshots[index];
        const units = Number(snapshot.exists() ? snapshot.data()?.['pendingUnits'] ?? 0 : 0);
        transaction.set(doc(this.firebase.firestore, 'productionDemand', id), {
          recipeId: id, pendingUnits: Math.max(0, units - quantity), updatedAt: now,
        });
      });
      if (isDelivered && salesSnapshot) {
        const summary = salesSnapshot.data() ?? {};
        transaction.set(salesSummaryRef, {
          deliveredOrders: Math.max(0, Number(summary['deliveredOrders'] ?? 0) - 1),
          revenue: Math.max(0, Math.round((Number(summary['revenue'] ?? 0) - Number(order['total'] ?? 0)) * 100) / 100),
          unitsSold: Math.max(0, Number(summary['unitsSold'] ?? 0) - [...quantities.values()].reduce((sum, value) => sum + value, 0)),
          updatedAt: now,
        }, { merge: true });
      }
      return { salesChanged: isDelivered, demandChanged: isPending };
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

    const matchingData = matching.data() ?? {};
    if (collectionKey === 'customers') {
      await this.syncCustomerPhoneLookup(recordId, this.normalizePhone(String(matchingData['phone'] ?? '')), '');
    }
    if (collectionKey === 'orders') {
      const customerId = String(matchingData['customerId'] ?? '');
      const customerSnapshot = customerId ? await getDoc(doc(this.firebase.firestore, 'customers', customerId)) : null;
      const customerPhone = customerSnapshot?.exists() ? customerSnapshot.data()?.['phone'] : '';
      const orderPhone = this.normalizePhone(String(customerPhone ?? matchingData['phone'] ?? ''));
      await this.syncOrderPhoneLookup(recordId, orderPhone, '', false);
    }
    const orderStatsChanges = collectionKey === 'orders' ? await this.deleteOrderWithStats(matching.ref) : null;
    if (collectionKey === 'recipes') {
      const batch = writeBatch(this.firebase.firestore);
      batch.delete(matching.ref);
      batch.delete(doc(this.firebase.firestore, 'catalogDrafts', recordId));
      batch.delete(doc(this.firebase.firestore, 'publicCatalog', recordId));
      await batch.commit();
    } else if (collectionKey !== 'orders') {
      await deleteDoc(matching.ref);
    }
    this.invalidateStateCache();
    const changedKeys = collectionKey === 'customers' ? ['customer:' + recordId]
      : collectionKey === 'recipes' ? ['recipes', 'catalogDrafts', 'publicCatalog'] : [collectionKey];
    if (orderStatsChanges?.salesChanged) changedKeys.push('stats:sales');
    if (orderStatsChanges?.demandChanged) changedKeys.push('stats:demand');
    await this.publishStateChange(changedKeys, { collectionKey, delta: -1 });
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
    const batch = writeBatch(this.firebase.firestore);
    batch.set(doc(this.firebase.firestore, 'settings', key), { data: value }, { merge: true });
    if (key === 'deliveryZones') {
      const projectionRef = doc(this.firebase.firestore, 'publicCatalog', 'catalog-settings');
      const projection = await getDoc(projectionRef);
      batch.set(projectionRef, {
        id: 'catalog-settings',
        kind: 'settings',
        zones: Array.isArray(value) ? value : [],
        presentations: projection.data()?.['presentations'] ?? [],
        sortIndex: Number(projection.data()?.['sortIndex'] ?? 0),
      }, { merge: true });
    }
    batch.set(metadataRef, {
      settingKeys: Array.from(new Set([...(metadata.settingKeys ?? []), key])),
      stateKeys: Array.from(new Set([...(metadata.stateKeys ?? []), key])),
      revision: increment(1),
      changedKeys: key === 'deliveryZones' ? [key, 'publicCatalog'] : [key],
    }, { merge: true });
    await batch.commit();
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
        revision: increment(1),
        changedKeys: ['cashMovements', 'ingredients'],
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
          const storedRecord: Record<string, unknown> = { ...(this.isRecord(record) ? record : {}), sortIndex: index };
          if (key === 'customers') {
            storedRecord['searchTokens'] = this.searchTokensFor({ ...storedRecord, id: recordId });
            storedRecord['nameSearchTokens'] = this.searchNameTokensFor({ ...storedRecord, id: recordId });
          } else if (key === 'orders') {
            storedRecord['searchTokens'] = this.searchTokensFor({ ...storedRecord, id: recordId });
          }
          batch.set(recordRef, storedRecord);
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

    const ordersForStats = stateEntries.find(([key, value]) => key === 'orders' && Array.isArray(value))?.[1] as unknown[] | undefined;
    const salesByProduct = new Map<string, number>();
    const demandByProduct = new Map<string, number>();
    let deliveredOrders = 0;
    let revenue = 0;
    for (const rawOrder of ordersForStats ?? []) {
      if (!this.isRecord(rawOrder)) continue;
      const status = String(rawOrder['status'] ?? '').toUpperCase();
      const quantities = this.extractOrderSalesQuantities(rawOrder);
      const isDelivered = this.isDeliveredOrderStatus(status);
      const isPending = this.isPendingOrderStatus(status);
      if (isDelivered) {
        deliveredOrders++;
        const total = Number(rawOrder['total'] ?? 0);
        if (Number.isFinite(total) && total > 0) revenue += total;
        for (const [id, quantity] of quantities) salesByProduct.set(id, (salesByProduct.get(id) ?? 0) + quantity);
      } else if (isPending) {
        for (const [id, quantity] of quantities) demandByProduct.set(id, (demandByProduct.get(id) ?? 0) + quantity);
      }
    }
    for (const [id, unitsSold] of salesByProduct) {
      batch.set(doc(this.firebase.firestore, 'productSalesStats', id), { productId: id, unitsSold });
      operations += 1;
      await flushIfFull();
    }
    for (const [id, pendingUnits] of demandByProduct) {
      batch.set(doc(this.firebase.firestore, 'productionDemand', id), { recipeId: id, pendingUnits });
      operations += 1;
      await flushIfFull();
    }
    batch.set(doc(this.firebase.firestore, 'businessStats', 'sales'), {
      deliveredOrders, revenue: Math.round(revenue * 100) / 100,
      unitsSold: [...salesByProduct.values()].reduce((sum, quantity) => sum + quantity, 0),
      updatedAt: new Date().toISOString(),
    });
    operations += 1;
    await flushIfFull();

    const productionRows = stateEntries.find(([key, value]) => key === 'productionHistory' && Array.isArray(value))?.[1] as unknown[] | undefined;
    const productionEntries = (productionRows ?? []).filter((row): row is Record<string, unknown> => this.isRecord(row));
    batch.set(doc(this.firebase.firestore, 'businessStats', 'production'), {
      totalBatches: productionEntries.reduce((sum, row) => sum + Math.max(0, Number(row['batches'] ?? 0)), 0),
      totalUnits: productionEntries.reduce((sum, row) => sum + (String(row['outputUnit'] ?? '') === 'g' ? 0 : Math.max(0, Number(row['totalYield'] ?? 0))), 0),
      totalCost: Math.round(productionEntries.reduce((sum, row) => sum + Math.max(0, Number(row['calculatedCost'] ?? 0)), 0) * 100) / 100,
      completedRuns: productionEntries.length,
      updatedAt: new Date().toISOString(),
    });
    operations += 1;
    await flushIfFull();

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
      revision: increment(1),
      changedKeys: [...stateKeys, 'stats:sales', 'stats:demand', 'stats:production'],
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
    const values = [record['id'], record['code'], record['name'], record['customer'], record['phone'], record['address'], record['deliveryAddress'], record['zone']]
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