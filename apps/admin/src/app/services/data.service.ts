import { Injectable, OnDestroy, signal } from '@angular/core';
import { DocumentData, QueryDocumentSnapshot, Unsubscribe } from 'firebase/firestore';
import { Ingredient, Recipe, Order, Customer, StarkiesBackup, CashMovement } from 'shared';
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

  constructor(
    private readonly repository: FirestoreBusinessRepository,
    private readonly firebase: FirebaseClientService,
  ) {
    // One lightweight metadata listener invalidates shared collection caches when another session writes.
    this.stopMetadataWatch = this.repository.watchStateMeta(changedKeys => {
      this.cloudRevision += 1;
      this.searchCache.clear();
      this.ordersPageCache.clear();
      this.repository.invalidateStateCache();
      if (changedKeys.includes('orders')) void this.refreshPendingOrderCount().catch(() => undefined);
      if (changedKeys.includes('stats:sales')) {
        void this.refreshSalesStats().catch(error => this.error.set(error.message));
        void this.refreshDeliveredOrders().catch(error => this.error.set(error.message));
      }
      if (changedKeys.includes('stats:demand')) void this.refreshProductionDemand().catch(error => this.error.set(error.message));
      if (changedKeys.includes('stats:production')) void this.refreshProductionStats().catch(error => this.error.set(error.message));
    }, error => this.error.set(error.message));
    // Existing pages receive a cloud-backed snapshot; no seed is silently
    // imported and no localStorage value is overwritten.
    void this.loadCollections(['recipes', 'ingredients']);
    void this.refreshPendingOrderCount().catch(() => undefined);
    void this.refreshSalesStats().catch(() => undefined);
    void this.refreshProductionStats().catch(() => undefined);
    void this.refreshProductionDemand().catch(() => undefined);
    void this.refreshDeliveredOrders().catch(() => undefined);
  }

  async loadFromCloud(collectionKeys?: string[]): Promise<void> {
    if (!this.firebase.isConfigured) {
      this.error.set(this.firebase.configurationMessage);
      return;
    }

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
    const items = await this.repository.searchCollection<RawRecord>('customers', normalized, { limit: 50, tokenField: 'nameSearchTokens' };
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

  async refreshDeliveredOrders(): Promise<void> {
    this.deliveredOrders.set(await this.repository.loadDeliveredOrders<Order>());
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
  private cloudRevision = 0;
  private readonly loadedCollectionRevision = new Map<string, number>();
  private readonly collectionLoadPromises = new Map<string, Promise<void>>();
  private readonly ordersPageCache = new Map<string, { items: RawRecord[]; cursor: QueryDocumentSnapshot<DocumentData> | null; hasMore: boolean; revision: number }>();
  private readonly stopMetadataWatch: Unsubscribe;

  /** Loads orders in bounded pages; the initial Admin load does not fetch all orders. */
  async loadOrdersPage(reset = false, statusFilter = 'ALL'): Promise<void> {
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

  async saveRecipe(recipe: Recipe): Promise<void> {
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
    const savedRecord: RawRecord = {
      ...existing,
      ...recipe,
      sections: recipe.sections.map(section => ({
        name: section.name,
        ingredients: section.ingredients.map(item => ({ ingredientId: item.ingredientId, quantity: item.quantity })),
      })),
      items: flattenedItems,
    };
    const nextRecipes = [...rawRecipes];
    if (existingIndex >= 0) nextRecipes[existingIndex] = savedRecord;
    else nextRecipes.push(savedRecord);
    const nextState = { ...state, recipes: nextRecipes };
    await this.applyOptimisticState(state, nextState, () => this.repository.upsertCollectionRecord('recipes', recipe.id, savedRecord));
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
    const nextState = { ...state, recipes: rawRecipes.filter(recipe => this.asString(recipe['id']) !== recipeId) };
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

    const updatedRecipe: RawRecord = { ...rawRecipes[recipeIndex], catalogVisible: visible };
    const nextRecipes = [...rawRecipes];
    nextRecipes[recipeIndex] = updatedRecipe;
    const nextState = { ...state, recipes: nextRecipes };
    await this.applyOptimisticState(state, nextState, () => this.repository.upsertCollectionRecord('recipes', recipeId, updatedRecipe));
  }

  async saveCustomer(customer: Customer): Promise<void> {
    const state = this.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados.');
    const rawOrders = this.asArray(state['orders']);
    const related = rawOrders.filter((item) => {
      const name = this.asString(item['customer'], 'Cliente sin nombre');
      const phone = this.asOptionalString(item['phone']);
      const key = phone ? `phone:${phone}` : `name:${name.trim().toLocaleLowerCase()}`;
      return key === customer.id;
    });
    if (!related.length) throw new Error('No se encontraron pedidos vinculados a este cliente.');
    for (const order of related) {
      const id = this.asString(order['id'] ?? order['code']);
      await this.repository.upsertCollectionRecord('orders', id, {
        ...order,
        customer: customer.name.trim(),
        phone: customer.phone?.trim() ?? '',
        address: customer.address?.trim() ?? '',
      });
    }
    const nextState = {
      ...state,
      orders: rawOrders.map((order) => {
        const name = this.asString(order['customer'], 'Cliente sin nombre');
        const phone = this.asOptionalString(order['phone']);
        const key = phone ? `phone:${phone}` : `name:${name.trim().toLocaleLowerCase()}`;
        return key === customer.id ? { ...order, customer: customer.name.trim(), phone: customer.phone?.trim() ?? '', address: customer.address?.trim() ?? '' } : order;
      }),
    };
    this.rawState.set(nextState);
    this.loadViewModels(nextState);
  }

  async deleteCustomer(customerId: string): Promise<void> {
    const state = this.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados.');
    const rawOrders = this.asArray(state['orders']);
    const related = rawOrders.filter((order) => {
      const name = this.asString(order['customer'], 'Cliente sin nombre');
      const phone = this.asOptionalString(order['phone']);
      return (phone ? `phone:${phone}` : `name:${name.trim().toLocaleLowerCase()}`) === customerId;
    });
    if (!related.length) throw new Error('No se encontraron pedidos vinculados a este cliente.');
    for (const order of related) {
      const id = this.asString(order['id'] ?? order['code']);
      await this.repository.upsertCollectionRecord('orders', id, {
        ...order,
        customer: `Cliente eliminado · ${id}`,
        phone: '',
        address: '',
      });
    }
    const nextState = {
      ...state,
      orders: rawOrders.map((order) => {
        const name = this.asString(order['customer'], 'Cliente sin nombre');
        const phone = this.asOptionalString(order['phone']);
        const key = phone ? `phone:${phone}` : `name:${name.trim().toLocaleLowerCase()}`;
        return key === customerId ? { ...order, customer: `Cliente eliminado · ${this.asString(order['id'] ?? order['code'])}`, phone: '', address: '' } : order;
      }),
    };
    this.rawState.set(nextState);
    this.loadViewModels(nextState);
  }

  async deleteOrder(orderId: string): Promise<void> {
    const state = this.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados.');
    const nextState = { ...state, orders: this.asArray(state['orders']).filter((order) => this.asString(order['id'] ?? order['code']) !== orderId) };
    await this.applyOptimisticState(state, nextState, () => this.repository.deleteCollectionRecord('orders', orderId));
    void this.refreshPendingOrderCount().catch(() => undefined);
  }

  async saveOrderDetails(orderId: string, changes: {
    deliveryDate?: string;
    deliveryMethod?: string;
    deliveryAddress?: string;
    deliveryTime?: string;
    zone?: string;
    notes?: string;
    status?: Order['status'];
    shippingFee?: number;
    isPaid?: boolean;
    paymentMethod?: Order['paymentMethod'];
  }): Promise<void> {
    const state = this.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados.');
    const rawOrders = this.asArray(state['orders']);
    const index = rawOrders.findIndex((order) => this.asString(order['id'] ?? order['code']) === orderId);
    if (index < 0) throw new Error('No se encontró el pedido.');
    const current = rawOrders[index];
    const deliveryDate = changes.deliveryDate ?? this.asString(current['deliveryDate'] ?? current['date']);
    const shippingFee = changes.shippingFee === undefined
      ? this.asNumber(current['shippingFee'] ?? current['deliveryFee'] ?? current['shipping'] ?? 0)
      : Math.max(0, Math.round(changes.shippingFee * 100) / 100);
    const paid = changes.isPaid ?? (current['isPaid'] === true || current['paymentStatus'] === 'PAID' || current['paymentStatus'] === 'paid');
    const rawLines = this.asArray(current['lines']).length
      ? this.asArray(current['lines'])
      : this.asArray(current['boxOrders']).flatMap(box => this.asArray(box['lines']));
    const currentShippingLine = rawLines.find(line => this.asString(line['id']).toLocaleLowerCase() === 'shipping'
      || this.asString(line['name']).toLocaleLowerCase().startsWith('envío'));
    const currentShippingFee = this.asNumber(current['shippingFee'] ?? current['deliveryFee'] ?? current['shipping'] ?? currentShippingLine?.['price'] ?? 0);
    const subtotal = Math.max(0, this.asNumber(current['total']) - currentShippingFee);
    const zone = changes.zone ?? this.asString(current['zone'] ?? current['deliveryZone'] ?? current['deliveryArea']);
    const updatedLines = rawLines.length
      ? [
          ...rawLines.filter(line => this.asString(line['id']).toLocaleLowerCase() !== 'shipping'
            && !this.asString(line['name']).toLocaleLowerCase().startsWith('envío')),
          ...(shippingFee > 0 ? [{ id: 'shipping', name: 'Envío — ' + zone, qty: 1, price: shippingFee }] : []),
        ]
      : rawLines;
    const updated: RawRecord = {
      ...current,
      ...changes,
      ...(rawLines.length ? { lines: updatedLines } : {}),
      deliveryDate,
      date: deliveryDate || current['date'],
      deliveryMethod: changes.deliveryMethod ?? this.asString(current['deliveryMethod'] ?? current['deliveryType'] ?? current['deliveryOption']),
      deliveryAddress: changes.deliveryAddress ?? this.asString(current['deliveryAddress'] ?? current['shippingAddress'] ?? current['address']),
      deliveryTime: changes.deliveryTime ?? this.asString(current['deliveryTime'] ?? current['deliverySlot']),
      zone,
      shippingFee,
      total: rawLines.length ? Math.round((subtotal + shippingFee) * 100) / 100 : this.asNumber(current['total']),
      isPaid: paid,
      paymentStatus: paid ? 'PAID' : 'PENDING',
      paymentMethod: paid ? (changes.paymentMethod ?? current['paymentMethod'] ?? current['paymentType'] ?? '') : '',
    };
    const nextOrders = [...rawOrders];
    nextOrders[index] = updated;
    const nextState = { ...state, orders: nextOrders };
    await this.applyOptimisticState(state, nextState, () => this.repository.upsertCollectionRecord('orders', orderId, updated));
    void this.refreshPendingOrderCount().catch(() => undefined);
  }

  async saveBusinessSetting(key: string, value: unknown): Promise<void> {
    const state = this.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados.');
    await this.repository.upsertBusinessSetting(key, value);
    const nextState = { ...state, [key]: value };
    this.rawState.set(nextState);
  }

  async updateOrderStatus(orderId: string, status: Order['status']): Promise<void> {
    const state = this.rawState();
    if (!state) {
      throw new Error('No hay datos de StarKies cargados. Actualiza la pantalla e inténtalo de nuevo.');
    }

    const rawOrders = this.asArray(state['orders']);
    const orderIndex = rawOrders.findIndex(
      (item) => this.asString(item['id'] ?? item['code']) === orderId,
    );
    if (orderIndex < 0) {
      throw new Error('No se encontró el pedido. Actualiza la pantalla e inténtalo de nuevo.');
    }

    const currentOrder = rawOrders[orderIndex];
    const currentStatus = this.normalizeOrderStatus(this.asString(currentOrder['status']));
    if (currentStatus === status) return;
    if (currentStatus !== 'PENDING') {
      throw new Error('Solo se pueden actualizar pedidos que todavía están pendientes.');
    }

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
    await this.refreshAfterFinancialWrite();
  }

  async recordIngredientPurchase(movement: CashMovement): Promise<void> {
    if (!this.rawState()) {
      throw new Error('No hay datos de StarKies cargados. Completa la migración e inténtalo de nuevo.');
    }

    await this.repository.recordIngredientPurchase(movement);
    await this.refreshAfterFinancialWrite();
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

  private async refreshAfterFinancialWrite(): Promise<void> {
    await this.loadFromCloud();
    if (this.error()) throw new Error(this.error());
    if (this.migrationRequired() || !this.rawState()) {
      throw new Error('No se pudo recargar el estado de StarKies después de guardar el movimiento.');
    }
  }

  async recordProduction(
    record: Record<string, unknown>,
    deductions: { ingredientId: string; quantity: number }[],
  ): Promise<void> {
    await this.repository.recordProduction(record, deductions);
    await this.loadFromCloud();
    if (this.error()) {
      throw new Error(this.error());
    }
  }

  exportBackup(): void {
    const state = this.rawState();
    if (!state) {
      this.error.set('Todavía no hay datos de StarKies cargados para exportar.');
      return;
    }

    const backup: StarkiesBackup & { business: string; exportedAt: string; state: RawRecord } = {
      business: 'StarKies',
      exportedAt: new Date().toISOString(),
      state,
      ingredients: this.ingredients(),
      recipes: this.recipes(),
      customers: this.customers(),
      orders: this.orders(),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `StarKies-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.URL.revokeObjectURL(url);
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

    if (Object.prototype.hasOwnProperty.call(state, 'recipes')) this.recipes.set(rawRecipes.map((item) => {
      const items = this.asArray(item['items']);
      const grouped = new Map<string, { ingredientId: string; quantity: number }[]>();
      for (const recipeItem of items) {
        const section = this.asString(recipeItem['section'], 'masa');
        const entries = grouped.get(section) ?? [];
        entries.push({
          ingredientId: this.asString(recipeItem['id'] ?? recipeItem['ingredientId']),
          quantity: this.asNumber(recipeItem['qty'] ?? recipeItem['quantity']),
        });
        grouped.set(section, entries);
      }

      const rawSections = this.asArray(item['sections']);
      const sections = rawSections.length
        ? rawSections.map((section) => {
            const name = this.asString(section['name'], 'masa');
            const storedIngredients = this.asArray(section['ingredients']).map((ingredient) => ({
              ingredientId: this.asString(ingredient['ingredientId'] ?? ingredient['id']),
              quantity: this.asNumber(ingredient['quantity'] ?? ingredient['qty']),
            })).filter(ingredient => ingredient.ingredientId && ingredient.quantity > 0);
            // Older recipes may have empty section shells while the formula
            // still lives in the flattened items array. Restore those rows.
            const legacyIngredients = Array.from(grouped.entries())
              .filter(([legacyName]) => legacyName.trim().toLocaleLowerCase('es') === name.trim().toLocaleLowerCase('es'))
              .flatMap(([, ingredients]) => ingredients);
            return { name, ingredients: storedIngredients.length ? storedIngredients : legacyIngredients };
          })
        : Array.from(grouped.entries()).map(([name, ingredients]) => ({ name, ingredients }));

      return {
        id: this.asString(item['id']),
        name: this.asString(item['name'], 'Receta sin nombre'),
        category: this.asString(item['category'], 'Sin categoría'),
        yield: this.asNumber(item['yield']),
        price: this.asNumber(item['price']),
        image: this.asOptionalString(item['image']),
        catalogImage: this.asOptionalString(item['catalogImage']),
        catalogVisible: item['catalogVisible'] !== false,
        catalogLabel: this.asOptionalString(item['catalogLabel']),
        catalogLabelColor: this.asOptionalString(item['catalogLabelColor']) ?? 'Morado',
        catalogDescription: this.asOptionalString(item['catalogDescription']),
        archived: item['archived'] === true,
        archivedAt: this.asOptionalString(item['archivedAt']),
        baseId: this.asOptionalString(item['baseId']),
        baseGramsPerCookie: this.asOptionalNumber(item['baseGramsPerCookie']),
        sections,
      };
    }));

    const customerMap = new Map<string, Customer>();
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
      const rawAddress = this.asOptionalString(item['deliveryAddress'] ?? item['shippingAddress'] ?? item['address']);
      const addressPrefix = zone ? zone + ' — ' : '';
      const deliveryAddress = rawAddress?.startsWith(addressPrefix) && addressPrefix
        ? rawAddress.slice(addressPrefix.length)
        : rawAddress;
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

  private asArray(value: unknown): RawRecord[] {
    return Array.isArray(value)
      ? value.filter((item): item is RawRecord => typeof item === 'object' && item !== null && !Array.isArray(item))
      : [];
  }

  private asString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : value == null ? fallback : String(value);
  }

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