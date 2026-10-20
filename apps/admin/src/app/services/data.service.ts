import { Injectable, signal } from '@angular/core';
import { Ingredient, Recipe, Order, Customer, StarkiesBackup, CashMovement } from 'shared';
import { FirestoreBusinessRepository } from '../core/firebase/firestore-business.repository';
import { FirebaseClientService } from '../core/firebase/firebase-client.service';

type RawRecord = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class DataService {
  readonly ingredients = signal<Ingredient[]>([]);
  readonly recipes = signal<Recipe[]>([]);
  readonly customers = signal<Customer[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly loading = signal(false);
  readonly migrationRequired = signal(false);
  readonly error = signal('');
  readonly rawState = signal<RawRecord | null>(null);

  constructor(
    private readonly repository: FirestoreBusinessRepository,
    private readonly firebase: FirebaseClientService,
  ) {
    // Existing pages receive a cloud-backed snapshot; no seed is silently
    // imported and no localStorage value is overwritten.
    void this.loadFromCloud();
  }

  async loadFromCloud(): Promise<void> {
    if (!this.firebase.isConfigured) {
      this.error.set(this.firebase.configurationMessage);
      return;
    }

    this.loading.set(true);
    this.error.set('');
    try {
      const state = await this.repository.loadState();
      if (!state) {
        this.migrationRequired.set(true);
        return;
      }

      this.rawState.set(state);
      this.migrationRequired.set(false);
      this.loadViewModels(state);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudieron cargar los datos de Firebase.');
    } finally {
      this.loading.set(false);
    }
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

    await this.repository.upsertCollectionRecord('ingredients', ingredient.id, savedRecord);

    const nextIngredients = [...currentIngredients];
    if (existingIndex >= 0) {
      nextIngredients[existingIndex] = savedRecord;
    } else {
      nextIngredients.push(savedRecord);
    }

    const nextState = { ...state, ingredients: nextIngredients };
    this.rawState.set(nextState);
    this.loadViewModels(nextState);
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

    await this.repository.deleteCollectionRecord('ingredients', ingredientId);
    const nextIngredients = this.asArray(state['ingredients']).filter(
      (item) => this.asString(item['id']) !== ingredientId,
    );
    const nextState = { ...state, ingredients: nextIngredients };
    this.rawState.set(nextState);
    this.loadViewModels(nextState);
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
    await this.repository.upsertCollectionRecord('recipes', recipe.id, savedRecord);
    const nextRecipes = [...rawRecipes];
    if (existingIndex >= 0) nextRecipes[existingIndex] = savedRecord;
    else nextRecipes.push(savedRecord);
    const nextState = { ...state, recipes: nextRecipes };
    this.rawState.set(nextState);
    this.loadViewModels(nextState);
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
        customer: 'Cliente eliminado',
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
        return key === customerId ? { ...order, customer: 'Cliente eliminado', phone: '', address: '' } : order;
      }),
    };
    this.rawState.set(nextState);
    this.loadViewModels(nextState);
  }

  async deleteOrder(orderId: string): Promise<void> {
    const state = this.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados.');
    await this.repository.deleteCollectionRecord('orders', orderId);
    const nextState = { ...state, orders: this.asArray(state['orders']).filter((order) => this.asString(order['id'] ?? order['code']) !== orderId) };
    this.rawState.set(nextState);
    this.loadViewModels(nextState);
  }

  async saveOrderDetails(orderId: string, changes: { deliveryDate?: string; zone?: string; notes?: string }): Promise<void> {
    const state = this.rawState();
    if (!state) throw new Error('No hay datos de StarKies cargados.');
    const rawOrders = this.asArray(state['orders']);
    const index = rawOrders.findIndex((order) => this.asString(order['id'] ?? order['code']) === orderId);
    if (index < 0) throw new Error('No se encontró el pedido.');
    const current = rawOrders[index];
    const updated = { ...current, ...changes, date: changes.deliveryDate ?? current['date'] };
    await this.repository.upsertCollectionRecord('orders', orderId, updated);
    const nextOrders = [...rawOrders];
    nextOrders[index] = updated;
    const nextState = { ...state, orders: nextOrders };
    this.rawState.set(nextState);
    this.loadViewModels(nextState);
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
    await this.repository.upsertCollectionRecord('orders', orderId, updatedOrder);

    const nextOrders = [...rawOrders];
    nextOrders[orderIndex] = updatedOrder;
    const nextState = { ...state, orders: nextOrders };
    this.rawState.set(nextState);
    this.loadViewModels(nextState);
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

    this.ingredients.set(rawIngredients.map((item) => ({
      id: this.asString(item['id']),
      name: this.asString(item['name'], 'Insumo sin nombre'),
      unit: this.asString(item['unit']),
      stock: this.asNumber(item['stock']),
      costPerUnit: this.asNumber(item['costPerUnit'] ?? item['cost']),
      minStock: this.asNumber(item['minStock'] ?? item['min']),
    })));

    this.recipes.set(rawRecipes.map((item) => {
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
        ? rawSections.map((section) => ({
            name: this.asString(section['name'], 'masa'),
            ingredients: this.asArray(section['ingredients']).map((ingredient) => ({
              ingredientId: this.asString(ingredient['ingredientId']),
              quantity: this.asNumber(ingredient['quantity']),
            })),
          }))
        : Array.from(grouped.entries()).map(([name, ingredients]) => ({ name, ingredients }));

      return {
        id: this.asString(item['id']),
        name: this.asString(item['name'], 'Receta sin nombre'),
        category: this.asString(item['category'], 'Sin categoría'),
        yield: this.asNumber(item['yield']),
        price: this.asNumber(item['price']),
        image: this.asOptionalString(item['image']),
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

      return {
        id: this.asString(item['id'] ?? item['code']),
        customerId: customerKey,
        items: lines.map((line) => ({
          recipeId: this.asString(line['id'] ?? line['recipeId']),
          name: this.asOptionalString(line['name']),
          quantity: this.asNumber(line['qty'] ?? line['quantity']),
          unitPrice: this.asNumber(line['price'] ?? line['unitPrice']),
        })),
        total: this.asNumber(item['total']),
        status: this.normalizeOrderStatus(this.asString(item['status'])) as Order['status'],
        createdAt: this.asString(item['createdAt'] ?? item['created'] ?? item['date']),
        deliveryDate: this.asOptionalString(item['deliveryDate'] ?? item['date']),
        zone: this.asOptionalString(item['zone']),
        notes: this.asOptionalString(item['notes']),
        cookieName: this.asOptionalString(item['cookieName']),
      };
    });

    this.customers.set(Array.from(customerMap.values()));
    this.orders.set(normalizedOrders);
  }

  private normalizeOrderStatus(value: string): Order['status'] {
    const normalized = value.trim().toLocaleLowerCase();
    if (normalized.includes('entreg') || normalized === 'delivered') return 'DELIVERED';
    if (normalized.includes('cancel') || normalized === 'cancelled' || normalized === 'canceled') return 'CANCELLED';
    return 'PENDING';
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