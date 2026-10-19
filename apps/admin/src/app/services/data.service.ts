import { Injectable, signal } from '@angular/core';
import { Ingredient, Recipe, Order, Customer, StarkiesBackup } from 'shared';
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
          quantity: this.asNumber(line['qty'] ?? line['quantity']),
          unitPrice: this.asNumber(line['price'] ?? line['unitPrice']),
        })),
        total: this.asNumber(item['total']),
        status: this.normalizeOrderStatus(this.asString(item['status'])) as Order['status'],
        createdAt: this.asString(item['created'] ?? item['date']),
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
