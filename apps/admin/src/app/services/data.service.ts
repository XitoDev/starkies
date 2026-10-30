import { Injectable, OnDestroy, signal } from '@angular/core';
import { DocumentData, QueryDocumentSnapshot, Unsubscribe } from 'firebase/firestore';
import { Ingredient, Recipe, Order, OrderItem, Customer, CashMovement } from 'shared';
import { FirestoreBusinessRepository } from '../core/firebase/firestore-business.repository';
import { FirebaseClientService } from '../core/firebase/firebase-client.service';

type RawRecord = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class DataService implements OnDestroy {
  readonly ingredients = signal<Ingredient[]>([]);
  readonly recipes = signal<Recipe[]>([]);
  readonly customers = signal<Customer[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly loading = signal(false);
  readonly migrationRequired = signal(false);
  readonly error = signal('');
  readonly rawState = signal<RawRecord | null>(null);
  readonly salesStats = signal<RawRecord>({ deliveredOrders: 0, revenue: 0, unitsSold: 0 });
  readonly productionStats = signal<RawRecord>({ totalBatches: 0, totalUnits: 0, totalCost: 0, completedRuns: 0 });
  readonly productionDemand = signal<Record<string, number>>({});
  readonly deliveredOrders = signal<Order[]>([]);
  readonly pendingOrders = signal<Order[]>([]);

  constructor(
    private readonly repository: FirestoreBusinessRepository,
    private readonly firebase: FirebaseClientService,
  ) {
    // One lightweight metadata listener invalidates shared collection caches when another session writes.
    this.stopMetadataWatch = this.repository.watchStateMeta?.(changedKeys => {
      this.cloudRevision += 1;
      const ordersChanged = changedKeys.includes('orders');
      const customersChanged = changedKeys.some(key => key === 'customers' || key.startsWith('customer:'));
      for (const [key, cached] of this.searchCache.entries()) {
        const collectionKey = key.split('|', 1)[0];
        if ((collectionKey === 'orders' && ordersChanged) || (collectionKey === 'customers' && customersChanged)) this.searchCache.delete(key);
        else cached.revision = this.cloudRevision;
      }
      if (ordersChanged) this.ordersPageCache.clear();
      const changedCollections = new Set(changedKeys.filter(key => !key.startsWith('stats:') && !key.startsWith('customer:')));
      for (const key of this.loadedCollectionRevision.keys()) {
        if (!changedCollections.has(key)) this.loadedCollectionRevision.set(key, this.cloudRevision);
      }
      this.repository.invalidateStateCache();
      if (ordersChanged) {
        void this.refreshPendingOrderCount().catch(() => undefined);
        if (Object.prototype.hasOwnProperty.call(this.rawState() ?? {}, 'orders')) {
          if (this.ordersPageLoading()) this.ordersRefreshPending = true;
          else void this.loadOrdersPage(true, this.lastOrdersStatusFilter).catch(() => undefined);
        }
      }
      if (changedKeys.includes('stats:sales')) {
        void this.refreshSalesStats().catch(error => this.error.set(error.message));
        void this.refreshDeliveredOrders().catch(error => this.error.set(error.message));
      }
      if (changedKeys.includes('stats:demand')) {
        void this.refreshProductionDemand().catch(error => this.error.set(error.message));
        void this.refreshPendingOrders().catch(error => this.error.set(error.message));
      }
      if (changedKeys.includes('stats:production')) void this.refreshProductionStats().catch(error => this.error.set(error.message));
      const changedCustomerIds = changedKeys.filter(key => key.startsWith('customer:')).map(key => key.slice('customer:'.length));
      for (const customerId of changedCustomerIds) void this.refreshCustomerRecord(customerId).catch(error => this.error.set(error.message));
      const refreshableKeys = changedKeys.filter(key => !key.startsWith('stats:') && !key.startsWith('customer:') && key !== 'orders'
        && Object.prototype.hasOwnProperty.call(this.rawState() ?? {}, key));
      if (refreshableKeys.length) void this.loadCollections(refreshableKeys, true);
    }, error => this.error.set(error.message)) ?? (() => undefined);
    // Existing pages receive a cloud-backed snapshot; no seed is silently
    // imported and no localStorage value is overwritten.
    void this.loadCollections(['recipes', 'ingredients']);
    void this.refreshPendingOrderCount().catch(() => undefined);
    void this.refreshSalesStats().catch(() => undefined);
    void this.refreshProductionStats().catch(() => undefined);
    void this.refreshProductionDemand().catch(() => undefined);
    void this.refreshDeliveredOrders().catch(() => undefined);
    void this.refreshPendingOrders().catch(() => undefined);
  }

  async loadFromCloud(collectionKeys?: string[], forceRefresh = false): Promise<void> {
    if (!this.firebase.isConfigured) {
      this.error.set(this.firebase.configurationMessage);
      return;
    }

    if (forceRefresh && !collectionKeys) this.repository.invalidateStateCache();
    this.loading.set(true);
    this.error.set('');
    const revisionAtStart = this.cloudRevision;
    try {
      const state = await this.repository.loadState(collectionKeys);
      if (!state) {
        this.migrationRequired.set(true);
        return;
      }

      const mergedState = { ...(this.rawState() ?? {}), ...state };
      this.rawState.set(mergedState);
      this.migrationRequired.set(false);
      this.loadViewModels(mergedState);
      const loadedKeys = collectionKeys ?? Object.keys(state);
      for (const key of loadedKeys) this.loadedCollectionRevision.set(key, revisionAtStart);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudieron cargar los datos de Firebase.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Loads only the named collections/settings and merges them into the local state. */
  async loadCollections(collectionKeys: string[], force = false): Promise<void> {
    const current = this.rawState() ?? {};
    const requested = [...new Set(collectionKeys)];
    const missing = force ? requested : requested.filter(key =>
      !Object.prototype.hasOwnProperty.call(current, key)
      || this.loadedCollectionRevision.get(key) !== this.cloudRevision,
    );
    if (missing.length) {
      await Promise.all(missing.map(key => {
        const existing = this.collectionLoadPromises.get(key);
        if (existing) return existing;
        const request = this.loadFromCloud([key]).finally(() => this.collectionLoadPromises.delete(key));
        this.collectionLoadPromises.set(key, request);
        return request;
      }));
    }
  }

  private readonly searchCache = new Map<string, { revision: number; items: RawRecord[] }>();

  async searchOrders(term: string, statusFilter: string): Promise<Order[]> {
    const normalized = this.normalizeSearchTerm(term);
    if (normalized.length < 2) return [];
    const key = 'orders|' + statusFilter + '|' + normalized;
    const cached = this.searchCache.get(key);
    if (cached && cached.revision === this.cloudRevision) return cached.items as unknown as Order[];
    const items = await this.repository.searchCollection<RawRecord>('orders', normalized, { limit: 50, status: statusFilter });
    this.searchCache.set(key, { revision: this.cloudRevision, items });
    return items as unknown as Order[];
  }

  async searchCustomers(term: string): Promise<Customer[]> {
    const normalized = this.normalizeSearchTerm(term);
    if (normalized.length < 2) return [];
    const key = 'customers|ALL|' + normalized;
    const cached = this.searchCache.get(key);
    if (cached && cached.revision === this.cloudRevision) return cached.items as unknown as Customer[];
    const items = await this.repository.searchCollection<RawRecord>('customers', normalized, { limit: 50, tokenField: 'nameSearchTokens' });
    this.searchCache.set(key, { revision: this.cloudRevision, items });
    return items as unknown as Customer[];
  }

  private normalizeSearchTerm(term: string): string {
    return term.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/[^a-z0-9]+/g, '').trim();
  }

  async refreshSalesStats(): Promise<void> {
    const stats = await this.repository.getBusinessStats('sales');
    this.salesStats.set({ deliveredOrders: 0, revenue: 0, unitsSold: 0, ...(stats ?? {}) });
  }

  async refreshProductionStats(): Promise<void> {
    const stats = await this.repository.getBusinessStats('production');
    this.productionStats.set({ totalBatches: 0, totalUnits: 0, totalCost: 0, completedRuns: 0, ...(stats ?? {}) });
  }

  private async refreshCustomerRecord(customerId: string): Promise<void> {
    const state = this.rawState();
    if (!state || !Object.prototype.hasOwnProperty.call(state, 'customers')) return;
    const customer = await this.repository.getCollectionRecord('customers', customerId);
    const customers = this.asArray(state['customers']).filter(item => this.asString(item['id']) !== customerId);
    if (customer) customers.push(customer);
    const nextState = { ...state, customers };
    this.rawState.set(nextState);
    this.loadViewModels(nextState);
  }

  async refreshPendingOrders(): Promise<void> {
    this.pendingOrders.set(await this.repository.loadPendingOrders<RawRecord>() as unknown as Order[]);
  }

  async refreshDeliveredOrders(): Promise<void> {
    this.deliveredOrders.set(await this.repository.loadDeliveredOrders<RawRecord>() as unknown as Order[]);
  }

  async refreshProductionDemand(): Promise<void> {
    this.productionDemand.set(await this.repository.loadProductionDemand());
  }

  /** Server-side count for the summary; avoids downloading all pending orders. */
  async refreshPendingOrderCount(): Promise<number> {
    const count = await this.repository.countCollection('orders', [
      { field: 'status', op: '==', value: 'PENDING' },
    ]);
    this.pendingOrderCount.set(count);
    return count;
  }

  readonly pendingOrderCount = signal(0);

  ngOnDestroy(): void { this.stopMetadataWatch(); }
  readonly ordersPageHasMore = signal(false);
  readonly ordersPageLoading = signal(false);
  private ordersPageCursor: QueryDocumentSnapshot<DocumentData> | null = null;
  private lastOrdersStatusFilter = 'ALL';
  private ordersRefreshPending = false;
  private cloudRevision = 0;
  private readonly loadedCollectionRevision = new Map<string, number>();
  private readonly collectionLoadPromises = new Map<string, Promise<void>>();
  private readonly ordersPageCache = new Map<string, { items: RawRecord[]; cursor: QueryDocumentSnapshot<DocumentData> | null; hasMore: boolean; revision: number }>();
  private readonly stopMetadataWatch: Unsubscribe;

  /** Loads orders in bounded pages; the initial Admin load does not fetch all orders. */
  async loadOrdersPage(reset = false, statusFilter = 'ALL'): Promise<void> {
    this.lastOrdersStatusFilter = statusFilter;
    if (this.ordersPageLoading()) return;
    this.ordersPageLoading.set(true);
    try {
      await this.loadCollections(['customers']);
      const cacheKey = statusFilter;
      const cachedPage = this.ordersPageCache.get(cacheKey);
      if (reset && cachedPage && cachedPage.revision === this.cloudRevision) {
        this.ordersPageCursor = cachedPage.cursor;
        this.ordersPageHasMore.set(cachedPage.hasMore);
        const cachedState = { ...(this.rawState() ?? {}), orders: cachedPage.items };
        this.rawState.set(cachedState);
        this.loadViewModels(cachedState);
        return;
      }
      if (reset) {
        this.ordersPageCursor = null;
        this.rawState.update(state => state ? { ...state, orders: [] } : state);
        this.orders.set([]);
      }
      const revisionAtStart = this.cloudRevision;
      const page = await this.repository.getCollectionPage<RawRecord>('orders', {
        pageSize: 25,
        cursor: this.ordersPageCursor,
        orderField: 'sortIndex',
        direction: 'desc',
        filters: statusFilter === 'ALL' ? [] : [{ field: 'status', op: '==', value: statusFilter }],
      });
      this.ordersPageCursor = page.cursor;
      this.ordersPageHasMore.set(page.hasMore);
      const currentState = this.rawState() ?? {};
      const previous = reset ? [] : this.asArray(currentState['orders']);
      const mergedItems = [...previous, ...page.items];
      const merged = { ...currentState, orders: mergedItems };
      this.rawState.set(merged);
      this.loadViewModels(merged);
      this.ordersPageCache.set(cacheKey, {
        items: mergedItems,
        cursor: page.cursor,
        hasMore: page.hasMore,
        revision: revisionAtStart,
      });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudieron cargar más pedidos.');
    } finally {
      this.ordersPageLoading.set(false);
      if (this.ordersRefreshPending) {
        this.ordersRefreshPending = false;
        void this.loadOrdersPage(true, this.lastOrdersStatusFilter).catch(() => undefined);
      }
    }
  }

  /** Loads all orders only when a workflow needs complete cross-order totals or edits. */
  async loadAllOrders(): Promise<void> {
    await this.loadCollections(['orders'], true);
    this.ordersPageCursor = null;
    this.ordersPageHasMore.set(false);
  }

  async saveIngredient(ingredient: Ingredient): Promise<void> {
    const state = this.rawState();
    if (!state) {
      throw new Error('No hay datos de StarKies cargados. Actualiza la pantalla e inténtalo de nuevo.');
    }

    const currentIngredients = this.asArray(state['ingredients']);
    const existingIndex = currentIngredients.findIndex(
      (item) => this.asString(item['id']) === ingredient.id,
    );
    const existing = existingIndex >= 0 ? currentIngredients[existingIndex] : {};
    const savedRecord: RawRecord = { ...existing, ...ingredient };

    const nextIngredients = [...currentIngredients];
    if (existingIndex >= 0) nextIngredients[existingIndex] = savedRecord;
    else nextIngredients.push(savedRecord);
    const nextState = { ...state, ingredients: nextIngredients };
    await this.applyOptimisticState(state, nextState, () => this.repository.upsertCollectionRecord('ingredients', ingredient.id, savedRecord));
  }

  async deleteIngredient(ingredientId: string): Promise<void> {
    const state = this.rawState();
    if (!state) {
      throw new Error('No hay datos de StarKies cargados. Actualiza la pantalla e inténtalo de nuevo.');
    }

    const rawRecipes = this.asArray(state['recipes']);
    const isUsedByRecipe = rawRecipes.some((recipe) => {
      const items = this.asArray(recipe['items']);
      const sections = this.asArray(recipe['sections']);
      const usedInItems = items.some(
        (item) => this.asString(item['id'] ?? item['ingredientId']) === ingredientId,
      );
      const usedInSections = sections.some((section) =>
        this.asArray(section['ingredients']).some(
          (item) => this.asString(item['ingredientId'] ?? item['id']) === ingredientId,
        ),
      );
      return usedInItems || usedInSections;
    });

    if (isUsedByRecipe) {
      throw new Error('Este insumo está utilizado en una receta. No se puede eliminar mientras exista esa relación.');
    }

    const nextIngredients = this.asArray(state['ingredients']).filter((item) => this.asString(item['id']) !== ingredientId);
    const nextState = { ...state, ingredients: nextIngredients };
    await this.applyOptimisticState(state, nextState, () => this.repository.deleteCollectionRecord('ingredients', ingredientId));
  }

  async saveRecipe(recipe: Recipe, updateCatalogFields = false): Promise<void> {
    const state = this.rawState();
    if (!state) {
      throw new Error('No hay datos de StarKies cargados. Actualiza la pantalla e inténtalo de nuevo.');
    }
    const rawRecipes = this.asArray(state['recipes']);
    const existingIndex = rawRecipes.findIndex(item => this.asString(item['id']) === recipe.id);
    const existing = existingIndex >= 0 ? rawRecipes[existingIndex] : {};
    const flattenedItems = recipe.sections.flatMap(section => section.ingredients.map(item => ({
      id: item.ingredientId,
      ingredientId: item.ingredientId,
      qty: item.quantity,
      quantity: item.quantity,
      section: section.name,
    })));
    const rawDrafts = this.asArray(state['catalogDrafts']);
    const draftIndex = rawDrafts.findIndex(item => this.asString(item['id']) === recipe.id);
    const existingDraft = draftIndex >= 0 ? rawDrafts[draftIndex] : {};
    // The catalog image is the canonical image for both the public product and its recipe.
    // Keep an existing catalog image first; only adopt the recipe image for older records
    // that have no catalog image yet, so previously uploaded catalog photos are never lost.
    const canonicalImage = updateCatalogFields
      ? (this.asString(recipe.image) || this.asString(existingDraft['image']) || this.asString(existing['catalogImage']) || this.asString(existing['image']))
      : (this.asString(existingDraft['image']) || this.asString(existing['catalogImage']) || this.asString(existing['image']) || this.asString(recipe.image));
    const savedRecord: RawRecord = {
      ...existing,
      ...recipe,
      image: canonicalImage,
      sections: recipe.sections.map(section => ({
        name: section.name,
        ingredients: section.ingredients.map(item => ({ ingredientId: item.ingredientId, quantity: item.quantity })),
      })),
      items: flattenedItems,
    };
    delete savedRecord['catalogImage'];
    const internalRecord: RawRecord = { ...savedRecord };
    for (const key of ['description', 'catalogDescription', 'catalogLabel', 'catalogLabelColor', 'catalogVisible']) {
      delete internalRecord[key];
    }
    const draftRecord: RawRecord = {
      ...existingDraft,
      id: recipe.id,
      description: this.asString(existingDraft['description'] ?? savedRecord['catalogDescription'] ?? savedRecord['description']),
      image: canonicalImage,
      label: this.asString(existingDraft['label'] ?? savedRecord['catalogLabel']),
      labelColor: this.asString(existingDraft['labelColor'] ?? savedRecord['catalogLabelColor'], 'Morado'),
      visible: (existingDraft['visible'] ?? savedRecord['catalogVisible']) !== false,
    };
    const nextDrafts = [...rawDrafts];
    // The Firestore transaction always writes catalogDrafts, even when only
    // recipe fields change. Mirror that image reconciliation in optimistic
    // state so the editor never reverts to an empty, stale draft image.
    if (draftIndex >= 0) nextDrafts[draftIndex] = draftRecord;
    else nextDrafts.push(draftRecord);
    const nextRecipes = [...rawRecipes];
    if (existingIndex >= 0) nextRecipes[existingIndex] = internalRecord;
    else nextRecipes.push(internalRecord);
    const nextState = { ...state, recipes: nextRecipes, catalogDrafts: nextDrafts };
    await this.applyOptimisticState(state, nextState, () =>
      this.repository.upsertRecipeAndCatalogProjection(recipe.id, savedRecord, updateCatalogFields));
  }


  /**
   * Changes only the catalog visibility flag on the original stored recipe.
   * Avoids rebuilding the entire view model, which can contain undefined
   * optional fields that Firestore rejects (for example catalogLabel).
   */
  async deleteRecipe(recipeId: string): Promise<void> {
    const state = this.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados.');
    const rawRecipes = this.asArray(state['recipes']);
    if (!rawRecipes.some(recipe => this.asString(recipe['id']) === recipeId)) throw new Error('No se encontró el producto.');
    const nextState = {
      ...state,
      recipes: rawRecipes.filter(recipe => this.asString(recipe['id']) !== recipeId),
      catalogDrafts: this.asArray(state['catalogDrafts']).filter(draft => this.asString(draft['id']) !== recipeId),
    };
    await this.applyOptimisticState(state, nextState, () => this.repository.deleteCollectionRecord('recipes', recipeId));
  }

  async setRecipeCatalogVisibility(recipeId: string, visible: boolean): Promise<void> {
    const state = this.rawState();
    if (!state) {
      throw new Error('No hay datos de StarKies cargados. Actualiza la pantalla e inténtalo de nuevo.');
    }

    const rawRecipes = this.asArray(state['recipes']);
    const recipeIndex = rawRecipes.findIndex(item => this.asString(item['id']) === recipeId);
    if (recipeIndex < 0) {
      throw new Error('No se encontró el producto. Actualiza la pantalla e inténtalo de nuevo.');
    }

    const drafts = this.asArray(state['catalogDrafts']);
    const currentDraft = drafts.find(item => this.asString(item['id']) === recipeId) ?? {};
    const updatedRecipe: RawRecord = {
      ...rawRecipes[recipeIndex],
      catalogVisible: visible,
      catalogDescription: this.asString(currentDraft['description']),
      catalogImage: this.asString(currentDraft['image']),
      catalogLabel: this.asString(currentDraft['label']),
      catalogLabelColor: this.asString(currentDraft['labelColor'], 'Morado'),
    };
    const updatedDraft = { ...currentDraft, id: recipeId, visible };
    const nextDrafts = [...drafts];
    const draftIndex = nextDrafts.findIndex(item => this.asString(item['id']) === recipeId);
    if (draftIndex >= 0) nextDrafts[draftIndex] = updatedDraft;
    else nextDrafts.push(updatedDraft);
    const nextState = { ...state, catalogDrafts: nextDrafts };
    await this.applyOptimisticState(state, nextState, () => this.repository.upsertRecipeAndCatalogProjection(recipeId, updatedRecipe, true));
  }

  async loadOrderById(orderId: string): Promise<void> {
    await this.loadCollections(['customers', 'recipes']);
    const order = await this.repository.getCollectionRecord('orders', orderId);
    if (!order) return;
    const state = this.rawState() ?? {};
    const orders = this.asArray(state['orders']);
    const index = orders.findIndex(item => this.asString(item['id'] ?? item['code']) === orderId);
    const nextOrders = [...orders];
    if (index >= 0) nextOrders[index] = order;
    else nextOrders.push(order);
    const nextState = { ...state, orders: nextOrders };
    this.rawState.set(nextState);
    this.loadViewModels(nextState);
  }

  getCustomerDraftFromOrder(orderId: string): { name: string; phone: string; address: string } | null {
    const state = this.rawState();
    if (!state) return null;
    const order = this.asArray(state['orders']).find(item => this.asString(item['id'] ?? item['code']) === orderId);
    if (!order) return null;
    const zone = this.asString(order['zone'] ?? order['deliveryZone'] ?? order['deliveryArea']);
    const deliveryMethod = this.asString(order['deliveryMethod'] ?? order['deliveryType'] ?? order['deliveryOption']);
    const legacyAddress = this.asString(order['address']).trim();
    const explicitAddress = this.asString(order['deliveryAddress'] ?? order['shippingAddress']).trim();
    const isPickup = zone.toLocaleLowerCase('es').includes('retiro')
      || deliveryMethod.toLocaleLowerCase('es').includes('retiro')
      || legacyAddress.toLocaleLowerCase('es') === 'retiro en tienda';
    let address = explicitAddress || legacyAddress;
    if (!explicitAddress && legacyAddress.includes(' — ')) {
      address = legacyAddress.split(' — ').slice(1).join(' — ').trim();
    }
    if (isPickup) address = '';
    return {
      name: this.asString(order['customer'] ?? order['customerName'] ?? order['name']).trim(),
      phone: this.asString(order['phone'] ?? order['customerPhone']).trim(),
      address,
    };
  }

  async createCustomer(input: Omit<Customer, 'id'>, linkedOrderId?: string): Promise<Customer> {
    const state = this.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados.');
    const name = input.name.trim();
    if (!name) throw new Error('El nombre del cliente es obligatorio.');
    const phone = (input.phone ?? '').trim();
    const address = (input.address ?? '').trim();
    const normalizedPhone = this.normalizePhone(phone);
    const customers = this.asArray(state['customers']);
    if (normalizedPhone.length >= 7 && customers.some(item => this.normalizePhone(this.asString(item['phone'])) === normalizedPhone)) {
      throw new Error('Ya existe un cliente con ese teléfono. Busca su ficha y reutilízala.');
    }

    const rawOrders = this.asArray(state['orders']);
    const orderIndex = linkedOrderId
      ? rawOrders.findIndex(item => this.asString(item['id'] ?? item['code']) === linkedOrderId)
      : -1;
    if (linkedOrderId && orderIndex < 0) throw new Error('No se encontró el pedido que debe vincularse. Actualiza la pantalla e inténtalo de nuevo.');
    const linkedOrder = orderIndex >= 0 ? rawOrders[orderIndex] : undefined;
    if (linkedOrder) {
      const currentCustomerId = this.asString(linkedOrder['customerId']);
      if (currentCustomerId && customers.some(item => this.asString(item['id'] ?? item['customerId']) === currentCustomerId)) {
        throw new Error('Este pedido ya tiene un cliente asociado. Actualiza la pantalla e inténtalo de nuevo.');
      }
    }

    const id = 'admin-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const customer: Customer = { id, name, phone, address };
    const nextCustomers = [...customers, customer as unknown as RawRecord];
    const nextOrders = [...rawOrders];
    const updatedOrder = linkedOrder ? { ...linkedOrder, customerId: id } : undefined;
    if (updatedOrder && orderIndex >= 0) nextOrders[orderIndex] = updatedOrder;
    const nextState = {
      ...state,
      customers: nextCustomers,
      ...(updatedOrder ? { orders: nextOrders } : {}),
    };
    await this.applyOptimisticState(state, nextState, async () => {
      await this.repository.upsertCollectionRecord('customers', id, customer as unknown as RawRecord);
      if (updatedOrder) {
        await this.repository.upsertCollectionRecord('orders', linkedOrderId!, updatedOrder);
      }
    });
    return customer;
  }

  async saveCustomer(customer: Customer): Promise<void> {
    const state = this.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados.');
    if (!customer.id || customer.id === 'nuevo') throw new Error('No se identificó el cliente que deseas actualizar.');
    const name = customer.name.trim();
    if (!name) throw new Error('El nombre del cliente es obligatorio.');
    const phone = (customer.phone ?? '').trim();
    const address = (customer.address ?? '').trim();
    const normalizedPhone = this.normalizePhone(phone);
    const customers = this.asArray(state['customers']);
    if (!customers.some(item => this.asString(item['id'] ?? item['customerId']) === customer.id)) {
      throw new Error('No se encontró el cliente. Actualiza la pantalla e inténtalo de nuevo.');
    }
    if (normalizedPhone.length >= 7 && customers.some(item =>
      this.asString(item['id'] ?? item['customerId']) !== customer.id
      && this.normalizePhone(this.asString(item['phone'])) === normalizedPhone,
    )) {
      throw new Error('Ese teléfono ya está asociado a otro cliente.');
    }
    const saved: Customer = { ...customer, name, phone, address };
    const nextCustomers = customers.map(item =>
      this.asString(item['id'] ?? item['customerId']) === customer.id ? saved as unknown as RawRecord : item,
    );
    const nextState = { ...state, customers: nextCustomers };
    await this.applyOptimisticState(state, nextState, () => this.repository.upsertCollectionRecord('customers', customer.id, saved as unknown as RawRecord));
  }

  async deleteCustomer(customerId: string): Promise<void> {
    await this.loadAllOrders();
    const state = this.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados.');
    const customers = this.asArray(state['customers']);
    const customer = customers.find(item => this.asString(item['id'] ?? item['customerId']) === customerId);
    if (!customer) throw new Error('No se encontró el cliente que intentas eliminar.');
    const rawOrders = this.asArray(state['orders']);
    const normalizedPhone = this.normalizePhone(this.asString(customer['phone']));
    const normalizedName = this.asString(customer['name']).trim().toLocaleLowerCase('es');
    const related = rawOrders.filter(order => {
      if (this.asString(order['customerId']) === customerId) return true;
      const phone = this.normalizePhone(this.asString(order['phone']));
      const name = this.asString(order['customer']).trim().toLocaleLowerCase('es');
      return normalizedPhone.length >= 7 ? phone === normalizedPhone : name === normalizedName;
    });
    const updatedRelated: RawRecord[] = related.map((order): RawRecord => {
      const id = this.asString(order['id'] ?? order['code']);
      return { ...order, customerId: 'deleted-' + id, customer: 'Cliente eliminado · ' + id, phone: '', address: '' };
    });
    const replacements = new Map(updatedRelated.map(order => [this.asString(order['id'] ?? order['code']), order]));
    const nextState = {
      ...state,
      customers: customers.filter(item => this.asString(item['id'] ?? item['customerId']) !== customerId),
      orders: rawOrders.map(order => replacements.get(this.asString(order['id'] ?? order['code'])) ?? order),
    };
    await this.applyOptimisticState(state, nextState, async () => {
      for (const order of updatedRelated) {
        const id = this.asString(order['id'] ?? order['code']);
        await this.repository.upsertCollectionRecord('orders', id, order);
      }
      await this.repository.deleteCollectionRecord('customers', customerId);
    });
  }

  async createOrder(input: {
    customerId: string;
    items: OrderItem[];
    deliveryDate?: string;
    deliveryMethod?: string;
    deliveryAddress?: string;
    deliveryTime?: string;
    zone?: string;
    notes?: string;
    cookieName?: string;
    orderType?: Order['orderType'];
    shippingFee?: number;
    isPaid?: boolean;
    paymentMethod?: Order['paymentMethod'];
  }): Promise<Order> {
    const state = this.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados.');
    const customers = this.asArray(state['customers']);
    const rawCustomer = customers.find(item => this.asString(item['id'] ?? item['customerId']) === input.customerId);
    if (!rawCustomer) throw new Error('Selecciona un cliente válido para el pedido.');
    if (!input.items.length) throw new Error('Agrega al menos un producto al pedido.');
    const items: OrderItem[] = input.items.map(item => {
      const recipe = this.asArray(state['recipes']).find(value => this.asString(value['id']) === item.recipeId);
      if (!recipe) throw new Error('No se encontró el producto ' + item.recipeId + '. Actualiza el catálogo e inténtalo de nuevo.');
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error('Revisa las cantidades y los precios del pedido.');
      }
      return {
        recipeId: item.recipeId,
        name: (item.name ?? '').trim() || this.asString(recipe['name'], 'Producto'),
        quantity,
        unitPrice: Math.round(unitPrice * 100) / 100,
      };
    });
    const feeValue = Number(input.shippingFee ?? 0);
    if (!Number.isFinite(feeValue) || feeValue < 0) throw new Error('El costo de envío debe ser un valor válido igual o mayor que cero.');
    const shippingFee = Math.round(feeValue * 100) / 100;
    const deliveryMethod = (input.deliveryMethod ?? '').trim();
    const zone = (input.zone ?? '').trim();
    const isPickup = deliveryMethod.toLocaleLowerCase('es').includes('retiro') || zone.toLocaleLowerCase('es') === 'retiro en tienda';
    const inputAddress = (input.deliveryAddress ?? '').trim();
    const customerDefaultAddress = this.asString(rawCustomer['address']).trim();
    const deliveryAddress = inputAddress || (isPickup ? '' : customerDefaultAddress);
    const customerWithDefault = !customerDefaultAddress && deliveryAddress && !isPickup
      ? { ...rawCustomer, address: deliveryAddress }
      : rawCustomer;
    const nextCustomers = customers.map(item =>
      this.asString(item['id'] ?? item['customerId']) === input.customerId ? customerWithDefault : item,
    );
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const total = Math.round((subtotal + shippingFee) * 100) / 100;
    const lines: RawRecord[] = items.map(item => ({ id: item.recipeId, name: item.name ?? '', qty: item.quantity, price: item.unitPrice }));
    const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, '');
    const orderId = 'SK-' + dateKey + '-' + Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, '0').toUpperCase();
    const createdAt = new Date().toISOString();
    const isPaid = input.isPaid === true;
    const orderRecord: RawRecord = {
      id: orderId,
      customerId: input.customerId,
      lines,
      total,
      status: 'PENDING',
      createdAt,
      deliveryDate: (input.deliveryDate ?? '').trim(),
      deliveryMethod,
      deliveryTime: (input.deliveryTime ?? '').trim(),
      zone,
      notes: (input.notes ?? '').trim(),
      ...(input.cookieName?.trim() ? { cookieName: input.cookieName.trim() } : {}),
      ...(input.orderType ? { orderType: input.orderType } : {}),
      shippingFee,
      isPaid,
      paymentStatus: isPaid ? 'PAID' : 'PENDING',
      paymentMethod: isPaid ? (input.paymentMethod ?? '') : '',
      orderChannel: 'admin',
    };
    if (deliveryAddress && deliveryAddress !== this.asString(customerWithDefault['address']).trim()) orderRecord['deliveryAddress'] = deliveryAddress;
    const nextState = { ...state, customers: nextCustomers, orders: [...this.asArray(state['orders']), orderRecord] };
    await this.applyOptimisticState(state, nextState, async () => {
      if (customerWithDefault !== rawCustomer) {
        await this.repository.upsertCollectionRecord('customers', input.customerId, customerWithDefault);
      }
      await this.repository.upsertCollectionRecord('orders', orderId, orderRecord);
    });
    void this.refreshPendingOrderCount().catch(() => undefined);
    return this.orders().find(order => order.id === orderId) ?? {
      id: orderId, customerId: input.customerId, items, total, status: 'PENDING', createdAt,
      deliveryDate: (input.deliveryDate ?? '').trim(), deliveryMethod, deliveryAddress, deliveryTime: (input.deliveryTime ?? '').trim(),
      zone, notes: (input.notes ?? '').trim(), cookieName: input.cookieName?.trim() || undefined, orderType: input.orderType,
      shippingFee, isPaid, paymentMethod: isPaid ? input.paymentMethod : undefined,
    };
  }

  async deleteOrder(orderId: string): Promise<void> {
    const state = this.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados.');
    const nextState = { ...state, orders: this.asArray(state['orders']).filter((order) => this.asString(order['id'] ?? order['code']) !== orderId) };
    await this.applyOptimisticState(state, nextState, () => this.repository.deleteCollectionRecord('orders', orderId));
    void this.refreshPendingOrderCount().catch(() => undefined);
  }

  async saveOrderDetails(orderId: string, changes: {
    customerId?: string;
    items?: OrderItem[];
    deliveryDate?: string;
    deliveryMethod?: string;
    deliveryAddress?: string;
    deliveryTime?: string;
    zone?: string;
    notes?: string;
    cookieName?: string;
    orderType?: Order['orderType'];
    status?: Order['status'];
    shippingFee?: number;
    isPaid?: boolean;
    paymentMethod?: Order['paymentMethod'];
  }): Promise<void> {
    const state = this.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados.');
    const rawOrders = this.asArray(state['orders']);
    const index = rawOrders.findIndex(order => this.asString(order['id'] ?? order['code']) === orderId);
    if (index < 0) throw new Error('No se encontró el pedido.');
    const current = rawOrders[index];
    const customerId = changes.customerId ?? this.asString(current['customerId']);
    const customers = this.asArray(state['customers']);
    const rawCustomer = customers.find(item => this.asString(item['id'] ?? item['customerId']) === customerId);
    if (!rawCustomer) throw new Error('Selecciona un cliente válido para el pedido.');
    const rawLines = this.asArray(current['lines']).length
      ? this.asArray(current['lines'])
      : this.asArray(current['boxOrders']).flatMap(box => this.asArray(box['lines']));
    const currentProductLines = rawLines.filter(line =>
      this.asString(line['id'] ?? line['recipeId']).toLocaleLowerCase() !== 'shipping'
      && !this.asString(line['name']).toLocaleLowerCase().startsWith('envío'),
    );
    const productLines: RawRecord[] = changes.items !== undefined
      ? changes.items.map(item => ({
          id: item.recipeId,
          name: (item.name ?? '').trim(),
          qty: Number(item.quantity),
          price: Math.round(Number(item.unitPrice) * 100) / 100,
        }))
      : currentProductLines.length
        ? currentProductLines
        : this.asArray(current['items']).map(item => ({
            id: item['recipeId'] ?? item['id'],
            name: item['name'],
            qty: item['quantity'] ?? item['qty'],
            price: item['unitPrice'] ?? item['price'],
          }));
    if (productLines.some(line => !this.asString(line['id'] ?? line['recipeId']) || !Number.isInteger(Number(line['qty'] ?? line['quantity'])) || Number(line['qty'] ?? line['quantity']) < 1 || !Number.isFinite(Number(line['price'] ?? line['unitPrice'])) || Number(line['price'] ?? line['unitPrice']) < 0)) {
      throw new Error('Revisa los productos, cantidades y precios del pedido.');
    }
    const feeValue = changes.shippingFee === undefined
      ? this.asNumber(current['shippingFee'] ?? current['deliveryFee'] ?? current['shipping'] ?? rawLines.find(line => this.asString(line['id']).toLocaleLowerCase() === 'shipping')?.['price'] ?? 0)
      : Number(changes.shippingFee);
    if (!Number.isFinite(feeValue) || feeValue < 0) throw new Error('El costo de envío debe ser un valor válido igual o mayor que cero.');
    const shippingFee = Math.round(feeValue * 100) / 100;
    const deliveryDate = (changes.deliveryDate ?? this.asString(current['deliveryDate'] ?? current['date'])).trim();
    const deliveryMethod = (changes.deliveryMethod ?? this.asString(current['deliveryMethod'] ?? current['deliveryType'] ?? current['deliveryOption'])).trim();
    const deliveryTime = (changes.deliveryTime ?? this.asString(current['deliveryTime'] ?? current['deliverySlot'])).trim();
    const zone = (changes.zone ?? this.asString(current['zone'] ?? current['deliveryZone'] ?? current['deliveryArea'])).trim();
    const isPickup = deliveryMethod.toLocaleLowerCase('es').includes('retiro') || zone.toLocaleLowerCase('es') === 'retiro en tienda';
    const requestedDeliveryAddress = (changes.deliveryAddress ?? this.asString(current['deliveryAddress'] ?? current['shippingAddress'] ?? current['address'])).trim();
    const deliveryAddress = requestedDeliveryAddress || (isPickup ? '' : this.asString(rawCustomer['address']).trim());
    const notes = (changes.notes ?? this.asString(current['notes'])).trim();
    const status = changes.status ?? this.normalizeOrderStatus(this.asString(current['status']));
    const isPaid = changes.isPaid ?? (current['isPaid'] === true || current['paymentStatus'] === 'PAID' || current['paymentStatus'] === 'paid');
    const paymentMethod = isPaid ? (changes.paymentMethod ?? current['paymentMethod'] ?? current['paymentType'] ?? '') : '';
    const subtotal = productLines.reduce((sum, line) => sum + Number(line['qty'] ?? line['quantity'] ?? 0) * Number(line['price'] ?? line['unitPrice'] ?? 0), 0);
    const updatedLines = [...productLines];
    const updated: RawRecord = {
      ...current,
      id: orderId,
      customerId,
      lines: updatedLines,
      deliveryDate,
      deliveryMethod,
      deliveryTime,
      zone,
      notes,
      status,
      shippingFee,
      total: Math.round((subtotal + shippingFee) * 100) / 100,
      isPaid,
      paymentStatus: isPaid ? 'PAID' : 'PENDING',
      paymentMethod,
    };
    if (changes.cookieName !== undefined) {
      const cookieName = changes.cookieName.trim();
      if (cookieName) updated['cookieName'] = cookieName;
      else delete updated['cookieName'];
    }
    if (changes.orderType !== undefined) updated['orderType'] = changes.orderType;
    for (const key of ['customer', 'phone', 'address', 'deliveryAddress', 'code', 'date', 'deliveryFee', 'shipping', 'shippingAddress', 'deliveryType', 'deliveryOption', 'paymentType', 'items']) delete updated[key];
    if (changes.items !== undefined) {
      delete updated['boxes'];
      delete updated['boxOrders'];
    }
    const customerWithDefault = !this.asString(rawCustomer['address']).trim() && deliveryAddress && !isPickup
      ? { ...rawCustomer, address: deliveryAddress }
      : rawCustomer;
    if (deliveryAddress && deliveryAddress !== this.asString(customerWithDefault['address']).trim()) updated['deliveryAddress'] = deliveryAddress;
    const nextCustomers = customers.map(item =>
      this.asString(item['id'] ?? item['customerId']) === customerId ? customerWithDefault : item,
    );
    const nextOrders = [...rawOrders];
    nextOrders[index] = updated;
    const nextState = { ...state, customers: nextCustomers, orders: nextOrders };
    await this.applyOptimisticState(state, nextState, async () => {
      if (customerWithDefault !== rawCustomer) await this.repository.upsertCollectionRecord('customers', customerId, customerWithDefault);
      await this.repository.upsertCollectionRecord('orders', orderId, updated);
    });
    void this.refreshPendingOrderCount().catch(() => undefined);
  }

  async saveBusinessSetting(key: string, value: unknown): Promise<void> {
    const state = this.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados.');
    await this.repository.upsertBusinessSetting(key, value);
    const nextState = { ...state, [key]: value };
    this.rawState.set(nextState);
  }

  async savePromotion(promotion: RawRecord): Promise<void> {
    const state = this.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados.');
    const promotionId = this.asString(promotion['id']);
    if (!promotionId) throw new Error('La promoción no tiene un identificador válido.');
    const promotions = this.asArray(state['promotions']);
    const index = promotions.findIndex(item => this.asString(item['id']) === promotionId);
    const existing = index >= 0 ? promotions[index] : {};
    const savedRecord: RawRecord = { ...existing, ...promotion, id: promotionId };
    const nextPromotions = [...promotions];
    if (index >= 0) nextPromotions[index] = savedRecord;
    else nextPromotions.push(savedRecord);
    const nextState = { ...state, promotions: nextPromotions };
    await this.applyOptimisticState(state, nextState, () =>
      this.repository.upsertCollectionRecord('promotions', promotionId, savedRecord));
  }

  async deletePromotion(promotionId: string): Promise<void> {
    const state = this.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados.');
    const nextPromotions = this.asArray(state['promotions']).filter(item => this.asString(item['id']) !== promotionId);
    const nextState = { ...state, promotions: nextPromotions };
    await this.applyOptimisticState(state, nextState, () =>
      this.repository.deleteCollectionRecord('promotions', promotionId));
  }

  async updateOrderStatus(orderId: string, status: Order['status']): Promise<void> {
    const state = this.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados. Actualiza la pantalla e inténtalo de nuevo.');
    const rawOrders = this.asArray(state['orders']);
    const orderIndex = rawOrders.findIndex(item => this.asString(item['id'] ?? item['code']) === orderId);
    if (orderIndex < 0) throw new Error('No se encontró el pedido. Actualiza la pantalla e inténtalo de nuevo.');
    const currentOrder = rawOrders[orderIndex];
    const currentStatus = this.normalizeOrderStatus(this.asString(currentOrder['status']));
    if (currentStatus === status) return;
    const updatedOrder: RawRecord = { ...currentOrder, status };
    const nextOrders = [...rawOrders];
    nextOrders[orderIndex] = updatedOrder;
    const nextState = { ...state, orders: nextOrders };
    await this.applyOptimisticState(state, nextState, () => this.repository.upsertCollectionRecord('orders', orderId, updatedOrder));
    void this.refreshPendingOrderCount().catch(() => undefined);
  }

  async recordCashMovement(movement: CashMovement): Promise<void> {
    if (!this.rawState()) {
      throw new Error('No hay datos de StarKies cargados. Completa la migración e inténtalo de nuevo.');
    }

    await this.repository.recordCashMovement(movement);
  }

  async recordIngredientPurchase(movement: CashMovement): Promise<void> {
    if (!this.rawState()) {
      throw new Error('No hay datos de StarKies cargados. Completa la migración e inténtalo de nuevo.');
    }

    await this.repository.recordIngredientPurchase(movement);
  }

  private async applyOptimisticState(previousState: RawRecord, nextState: RawRecord, persist: () => Promise<void>): Promise<void> {
    this.rawState.set(nextState);
    this.loadViewModels(nextState);
    try {
      await persist();
    } catch (error) {
      this.rawState.set(previousState);
      this.loadViewModels(previousState);
      throw error;
    }
  }

  async recordProduction(
    record: Record<string, unknown>,
    deductions: { ingredientId: string; quantity: number }[],
  ): Promise<void> {
    await this.repository.recordProduction(record, deductions);
  }


  private loadViewModels(state: RawRecord): void {
    const rawIngredients = this.asArray(state['ingredients']);
    const rawRecipes = this.asArray(state['recipes']);
    const rawOrders = this.asArray(state['orders']);

    if (Object.prototype.hasOwnProperty.call(state, 'ingredients')) this.ingredients.set(rawIngredients.map((item) => ({
      id: this.asString(item['id']),
      name: this.asString(item['name'], 'Insumo sin nombre'),
      unit: this.asString(item['unit']),
      stock: this.asNumber(item['stock']),
      costPerUnit: this.asNumber(item['costPerUnit'] ?? item['cost']),
      packageQuantityGrams: this.asOptionalNumber(item['packageQuantityGrams']),
      packagePrice: this.asOptionalNumber(item['packagePrice']),
      brand: this.asOptionalString(item['brand']),
      minStock: this.asNumber(item['minStock'] ?? item['min']),
      supplyGroup: this.asOptionalString(item['supplyGroup'] ?? item['supplyCategory']),
      foodGroup: this.asOptionalString(item['foodGroup']),
      ingredientGroup: this.asOptionalString(item['ingredientGroup']),
    })));

    if (Object.prototype.hasOwnProperty.call(state, 'recipes')) {
      const draftsById = new Map(this.asArray(state['catalogDrafts']).map(draft => [this.asString(draft['id']), draft]));
      this.recipes.set(rawRecipes.map((item) => {
      const draft = draftsById.get(this.asString(item['id'])) ?? {};
      const items = this.asArray(item['items']);
      const grouped = new Map<string, { ingredientId: string; quantity: number }[]>();
      for (const recipeItem of items) {
        // Legacy formulas have used labels such as "Relleno · por galleta"
        // while the editor stores the canonical section name "relleno".
        // Group by a canonical key so those rows survive the next save/reload.
        const section = this.recipeSectionKey(this.asString(recipeItem['section'], 'masa'));
        const entries = grouped.get(section) ?? [];
        entries.push({
          ingredientId: this.asString(recipeItem['id'] ?? recipeItem['ingredientId']),
          quantity: this.asNumber(recipeItem['qty'] ?? recipeItem['quantity']),
        });
        grouped.set(section, entries);
      }

      const rawSections = this.asArray(item['sections']);
      const sectionMap = new Map<string, { name: string; ingredients: { ingredientId: string; quantity: number }[] }>();
      for (const section of rawSections) {
        const name = this.asString(section['name'], 'masa');
        const key = this.recipeSectionKey(name);
        const storedIngredients = this.asArray(section['ingredients']).map((ingredient) => ({
          ingredientId: this.asString(ingredient['ingredientId'] ?? ingredient['id']),
          quantity: this.asNumber(ingredient['quantity'] ?? ingredient['qty']),
        })).filter(ingredient => ingredient.ingredientId && ingredient.quantity > 0);
        const current = sectionMap.get(key);
        if (current) current.ingredients.push(...storedIngredients);
        else sectionMap.set(key, { name, ingredients: storedIngredients });
      }

      // Reconcile canonical sections with the flattened legacy list. Merge missing rows
      // rather than only falling back when an entire section is empty; older documents
      // can contain partial sections or omit a section while items still has its rows.
      for (const [key, legacyIngredients] of grouped.entries()) {
        const current = sectionMap.get(key);
        if (!current) {
          sectionMap.set(key, { name: key, ingredients: [...legacyIngredients] });
          continue;
        }
        const storedCounts = new Map<string, number>();
        for (const ingredient of current.ingredients) {
          const signature = ingredient.ingredientId + '|' + ingredient.quantity;
          storedCounts.set(signature, (storedCounts.get(signature) ?? 0) + 1);
        }
        const seenLegacy = new Map<string, number>();
        for (const ingredient of legacyIngredients) {
          const signature = ingredient.ingredientId + '|' + ingredient.quantity;
          const occurrence = (seenLegacy.get(signature) ?? 0) + 1;
          seenLegacy.set(signature, occurrence);
          if (occurrence > (storedCounts.get(signature) ?? 0)) current.ingredients.push(ingredient);
        }
      }
      const sectionOrder = ['masa', 'anadidos', 'relleno', 'decoracion'];
      const sections = Array.from(sectionMap.entries())
        .sort(([a], [b]) => {
          const ai = sectionOrder.indexOf(this.recipeSectionKey(a));
          const bi = sectionOrder.indexOf(this.recipeSectionKey(b));
          return (ai < 0 ? sectionOrder.length : ai) - (bi < 0 ? sectionOrder.length : bi);
        })
        .map(([key, section]) => ({
          name: sectionOrder.includes(key) ? ({ masa: 'masa', anadidos: 'añadidos', relleno: 'relleno', decoracion: 'decoración' } as Record<string, string>)[key] : section.name,
          ingredients: section.ingredients,
        }));

      return {
        id: this.asString(item['id']),
        name: this.asString(item['name'], 'Receta sin nombre'),
        category: this.asString(item['category'], 'Sin categoría'),
        yield: this.asNumber(item['yield']),
        price: this.asNumber(item['price']),
        image: this.asOptionalString(draft['image']) || this.asOptionalString(item['image']) || this.asOptionalString(item['catalogImage']),
        catalogVisible: (draft['visible'] ?? item['catalogVisible']) !== false,
        catalogLabel: this.asOptionalString(draft['label'] ?? item['catalogLabel']),
        catalogLabelColor: this.asOptionalString(draft['labelColor'] ?? item['catalogLabelColor']) ?? 'Morado',
        catalogDescription: this.asOptionalString(draft['description'] ?? item['catalogDescription']),
        archived: item['archived'] === true,
        archivedAt: this.asOptionalString(item['archivedAt']),
        baseId: this.asOptionalString(item['baseId']),
        baseGramsPerCookie: this.asOptionalNumber(item['baseGramsPerCookie']),
        sections,
      };
      }));
    }

    const customerMap = new Map<string, Customer>();
    const customersById = new Map(this.asArray(state['customers']).map(customer => [this.asString(customer['id'] ?? customer['customerId']), customer]));
    const normalizedOrders = rawOrders.map((item) => {
      const name = this.asString(item['customer'], 'Cliente sin nombre');
      const phone = this.asOptionalString(item['phone']);
      const address = this.asOptionalString(item['address']);
      const customerKey = phone ? `phone:${phone}` : `name:${name.trim().toLocaleLowerCase()}`;
      if (!customerMap.has(customerKey)) {
        customerMap.set(customerKey, {
          id: customerKey,
          name,
          phone,
          address,
        });
      }

      const rawLines = this.asArray(item['lines']);
      const lines: RawRecord[] = rawLines.length
        ? rawLines
        : this.asArray(item['boxOrders']).flatMap((box): RawRecord[] => this.asArray(box['lines']).map((line): RawRecord => ({
            id: line['id'],
            qty: line['qty'],
            price: line['price'] ?? 0,
          })));
      const zone = this.asOptionalString(item['zone'] ?? item['deliveryZone'] ?? item['deliveryArea']);
      const shippingLine = lines.find(line => this.asString(line['id'] ?? line['recipeId']).toLocaleLowerCase() === 'shipping'
        || this.asString(line['name']).toLocaleLowerCase().startsWith('envío'));
      const shippingFee = this.asNumber(item['shippingFee'] ?? item['deliveryFee'] ?? item['shipping'] ?? shippingLine?.['price'] ?? 0);
      const linkedCustomer = customersById.get(this.asString(item['customerId']));
      const explicitAddress = this.asOptionalString(item['deliveryAddress'] ?? item['shippingAddress'] ?? item['address']);
      const addressPrefix = zone ? zone + ' — ' : '';
      const cleanedAddress = explicitAddress?.startsWith(addressPrefix) && addressPrefix
        ? explicitAddress.slice(addressPrefix.length)
        : explicitAddress;
      const isPickup = (zone ?? '').toLocaleLowerCase('es').includes('retiro') || this.asString(item['deliveryMethod'] ?? item['deliveryType']).toLocaleLowerCase('es').includes('retiro');
      const defaultAddress = this.asOptionalString(linkedCustomer?.['address']);
      const addressMatchesDefault = Boolean(cleanedAddress && defaultAddress
        && cleanedAddress.trim().toLocaleLowerCase('es') === defaultAddress.trim().toLocaleLowerCase('es'));
      const deliveryAddress = addressMatchesDefault ? defaultAddress : cleanedAddress ?? (!isPickup ? defaultAddress : undefined);
      const cookieLines = lines.filter(line => {
        const id = this.asString(line['id'] ?? line['recipeId']).toLocaleLowerCase();
        return id !== 'shipping' && !this.asString(line['name']).toLocaleLowerCase().startsWith('envío');
      });

      return {
        id: this.asString(item['id'] ?? item['code']),
        customerId: this.asString(item['customerId'], customerKey),
        items: cookieLines.map((line) => ({
          recipeId: this.asString(line['id'] ?? line['recipeId']),
          name: this.asOptionalString(line['name']),
          quantity: this.asNumber(line['qty'] ?? line['quantity']),
          unitPrice: this.asNumber(line['price'] ?? line['unitPrice']),
        })),
        total: this.asNumber(item['total']),
        status: this.normalizeOrderStatus(this.asString(item['status'])) as Order['status'],
        createdAt: this.asString(item['createdAt'] ?? item['created'] ?? item['date']),
        deliveryDate: this.asOptionalString(item['deliveryDate'] ?? item['scheduledDeliveryDate'] ?? item['date']),
        deliveryMethod: this.asOptionalString(item['deliveryMethod'] ?? item['deliveryType'] ?? item['deliveryOption'])
          ?? (zone?.toLocaleLowerCase() === 'retiro en tienda' ? 'Retiro en tienda' : zone ? 'Entrega a domicilio' : undefined),
        deliveryAddress,
        deliveryTime: this.asOptionalString(item['deliveryTime'] ?? item['deliverySlot']),
        zone,
        notes: this.asOptionalString(item['notes']),
        cookieName: this.asOptionalString(item['cookieName']),
        orderType: (this.asString(item['orderType']) === 'CUSTOM' ? 'CUSTOM' : this.asString(item['orderType']) === 'STANDARD' ? 'STANDARD' : undefined) as Order['orderType'],
        shippingFee,
        isPaid: item['isPaid'] === true || item['paymentStatus'] === 'PAID' || item['paymentStatus'] === 'paid',
        paymentMethod: this.normalizePaymentMethod(this.asString(item['paymentMethod'] ?? item['paymentType'])),
      };
    });

    if (Object.prototype.hasOwnProperty.call(state, 'customers')) {
      const rawCustomers = this.asArray(state['customers']);
      this.customers.set(rawCustomers.map(item => ({
        id: this.asString(item['id'] ?? item['customerId']),
        name: this.asString(item['name'], 'Cliente sin nombre'),
        phone: this.asOptionalString(item['phone']),
        address: this.asOptionalString(item['address']),
      })));
    } else if (Object.prototype.hasOwnProperty.call(state, 'orders')) {
      this.customers.set(Array.from(customerMap.values()));
    }
    if (Object.prototype.hasOwnProperty.call(state, 'orders')) this.orders.set(normalizedOrders);
  }

  private normalizeOrderStatus(value: string): Order['status'] {
    const normalized = value.trim().toLocaleLowerCase();
    if (normalized.includes('entreg') || normalized === 'delivered') return 'DELIVERED';
    if (normalized.includes('cancel') || normalized === 'cancelled' || normalized === 'canceled') return 'CANCELLED';
    if (normalized.includes('listo') || normalized === 'ready') return 'READY';
    if (normalized.includes('prepar') || normalized === 'in_preparation' || normalized === 'processing') return 'PREPARING';
    return 'PENDING';
  }

  private normalizePaymentMethod(value: string): Order['paymentMethod'] {
    const normalized = value.trim().toLocaleLowerCase();
    if (normalized.includes('transf') || normalized.includes('transfer')) return 'TRANSFER';
    if (normalized.includes('efect') || normalized.includes('cash')) return 'CASH';
    return undefined;
  }

  private recipeSectionKey(value: string): string {
    const normalized = value.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    if (normalized.includes('relleno')) return 'relleno';
    if (normalized.includes('decoracion')) return 'decoracion';
    if (normalized.includes('anadido')) return 'anadidos';
    if (normalized.includes('masa')) return 'masa';
    return normalized;
  }

  private asArray(value: unknown): RawRecord[] {
    return Array.isArray(value)
      ? value.filter((item): item is RawRecord => typeof item === 'object' && item !== null && !Array.isArray(item))
      : [];
  }

  private asString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : value == null ? fallback : String(value);
  }

  private normalizePhone(value: string): string { return value.replace(/\D/g, '').replace(/^593/, '0'); }

  private asOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private asNumber(value: unknown): number {
    const result = typeof value === 'number' ? value : Number(value ?? 0);
    return Number.isFinite(result) ? result : 0;
  }
}