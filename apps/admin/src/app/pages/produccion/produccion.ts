import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { DataService } from '../../services/data.service';
import { Ingredient, Recipe } from 'shared';

type ProductionEntry = {
  id: string;
  date: string;
  recipeId: string;
  recipeName: string;
  batches: number;
  totalYield: number;
  outputUnit?: string;
  calculatedCost: number;
  status: string;
};

type IngredientRequirement = {
  ingredientId: string;
  quantity: number;
  ingredient?: Ingredient;
};
type DoughBase = { id: string; name: string; weight: number; ingredients?: Record<string, unknown>[]; items?: Record<string, unknown>[] };
type InventoryRow = { id: string; name: string; quantity: number; unit: string };
type CommandLine = { key: string; orderId: string; recipeId: string; recipeName: string; quantity: number };
type PlannedRecipe = { recipeId: string; recipeName: string; requested: number; markedReady: number; remaining: number; stock: number; toBake: number; baseId?: string; baseName?: string; doughGrams: number };
type DoughPlan = { baseId: string; baseName: string; gramsNeeded: number; availableGrams: number; gramsToPrepare: number; batchWeight: number; batchesNeeded: number };

@Component({
  selector: 'app-produccion',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatInputModule, MatSelectModule],
  templateUrl: './produccion.html',
  styleUrls: ['./produccion.css'],
})
export class Produccion {
  private readonly dataService = inject(DataService);

  readonly recipes = this.dataService.recipes;
  readonly ingredients = this.dataService.ingredients;
  readonly searchTerm = signal('');
  readonly formOpen = signal(false);
  readonly saving = signal(false);
  readonly formError = signal('');
  readonly notice = signal('');
  readonly selectedRecipeId = signal('');
  readonly selectedBaseId = signal('');
  readonly productionType = signal<'recipe' | 'base'>('recipe');
  readonly batchCount = signal(1);
  readonly activeTab = signal<'inventory' | 'commands' | 'history'>('inventory');
  readonly inventoryEdits = signal<Record<string, string>>({});
  readonly activeRecipes = computed(() => this.recipes().filter(recipe => !recipe.archived));
  readonly orders = this.dataService.orders;
  readonly doughBases = computed<DoughBase[]>(() => {
    const value = this.dataService.rawState()?.['doughBases'];
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
      .map((item, index) => ({
        id: String(item['id'] ?? `base-${index}`),
        name: String(item['name'] ?? 'Masa base sin nombre'),
        weight: this.asNumber(item['weight']),
        ingredients: Array.isArray(item['ingredients']) ? item['ingredients'] as Record<string, unknown>[] : undefined,
        items: Array.isArray(item['items']) ? item['items'] as Record<string, unknown>[] : undefined,
      }));
  });
  readonly finishedInventory = computed<InventoryRow[]>(() => {
    const raw = this.dataService.rawState()?.['finishedProductInventory'];
    const records = Array.isArray(raw) ? raw.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item)) : [];
    const quantities = new Map(records.map(item => [String(item['id'] ?? item['recipeId'] ?? ''), this.asNumber(item['quantity'])]));
    return this.activeRecipes().map(recipe => ({
      id: recipe.id, name: recipe.name, quantity: quantities.get(recipe.id) ?? 0, unit: 'galletas',
    }));
  });
  readonly doughInventory = computed<InventoryRow[]>(() => {
    const raw = this.dataService.rawState()?.['finishedProductInventory'];
    const records = Array.isArray(raw) ? raw.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item)) : [];
    const quantities = new Map(records.map(item => [String(item['id'] ?? item['recipeId'] ?? ''), this.asNumber(item['quantity'])]));
    return this.doughBases().map(base => ({
      id: `base:${base.id}`, name: base.name, quantity: quantities.get(`base:${base.id}`) ?? 0, unit: 'g',
    }));
  });
  readonly commandLines = computed<CommandLine[]>(() => {
    const ready = new Set(this.readyCommandLines());
    const recipes = this.activeRecipes();
    return this.orders().filter(order => order.status === 'PENDING').flatMap(order => order.items.flatMap(item => {
      const recipe = recipes.find(entry => entry.id === item.recipeId)
        ?? recipes.find(entry => entry.name.trim().toLocaleLowerCase('es') === (item.name ?? '').trim().toLocaleLowerCase('es'));
      if (!recipe || item.quantity <= 0) return [];
      return [{
        key: `${order.id}:${recipe.id}`, orderId: order.id, recipeId: recipe.id,
        recipeName: recipe.name, quantity: item.quantity,
      }];
    }));
  });
  readonly readyCommandLines = computed<string[]>(() => {
    const value = this.dataService.rawState()?.['productionReadyLines'];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  });
  readonly commandPlan = computed<PlannedRecipe[]>(() => {
    const ready = new Set(this.readyCommandLines());
    const inventory = new Map(this.finishedInventory().map(item => [item.id, item.quantity]));
    const grouped = new Map<string, { recipeName: string; requested: number; markedReady: number }>();
    for (const line of this.commandLines()) {
      const row = grouped.get(line.recipeId) ?? { recipeName: line.recipeName, requested: 0, markedReady: 0 };
      row.requested += line.quantity;
      if (ready.has(line.key)) row.markedReady += line.quantity;
      grouped.set(line.recipeId, row);
    }
    return Array.from(grouped.entries()).map(([recipeId, row]) => {
      const recipe = this.activeRecipes().find(item => item.id === recipeId);
      const remaining = Math.max(0, row.requested - row.markedReady);
      const stock = inventory.get(recipeId) ?? 0;
      const toBake = Math.max(0, remaining - Math.max(0, stock));
      const base = recipe?.baseId ? this.doughBases().find(item => item.id === recipe.baseId) : undefined;
      const doughGrams = base && recipe ? Math.max(0, this.asNumber(recipe.baseGramsPerCookie)) * toBake : 0;
      return { recipeId, recipeName: row.recipeName, requested: row.requested, markedReady: row.markedReady, remaining, stock, toBake, baseId: base?.id, baseName: base?.name, doughGrams };
    }).sort((a, b) => a.recipeName.localeCompare(b.recipeName, 'es'));
  });
  readonly doughPlan = computed<DoughPlan[]>(() => {
    const grouped = new Map<string, { name: string; grams: number; weight: number }>();
    for (const item of this.commandPlan()) {
      if (!item.baseId || !item.baseName || item.doughGrams <= 0) continue;
      const base = this.doughBases().find(entry => entry.id === item.baseId);
      const current = grouped.get(item.baseId) ?? { name: item.baseName, grams: 0, weight: base?.weight ?? 0 };
      current.grams += item.doughGrams;
      grouped.set(item.baseId, current);
    }
    return Array.from(grouped.entries()).map(([baseId, item]) => {
      const availableGrams = this.doughInventory().find(row => row.id === `base:${baseId}`)?.quantity ?? 0;
      const gramsToPrepare = Math.max(0, item.grams - Math.max(0, availableGrams));
      return {
        baseId, baseName: item.name, gramsNeeded: item.grams, availableGrams, gramsToPrepare,
        batchWeight: item.weight,
        batchesNeeded: item.weight > 0 ? Math.ceil(gramsToPrepare / item.weight) : 0,
      };
    });
  });

  readonly productionHistory = computed<ProductionEntry[]>(() => {
    const value = this.dataService.rawState()?.['productionHistory'];
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
      .map((item, index) => ({
        id: this.asString(item['id'], `production-${index}`),
        date: this.asString(item['date'] ?? item['createdAt']),
        recipeId: this.asString(item['recipeId']),
        recipeName: this.asString(item['recipeName'], 'Receta sin nombre'),
        batches: this.asNumber(item['batches']),
        totalYield: this.asNumber(item['totalYield']),
        outputUnit: this.asString(item['outputUnit'], 'uds'),
        calculatedCost: this.asNumber(item['calculatedCost']),
        status: this.asString(item['status'], 'COMPLETED'),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  readonly filteredHistory = computed(() => {
    const term = this.searchTerm().trim().toLocaleLowerCase('es');
    if (!term) return this.productionHistory();
    return this.productionHistory().filter(item =>
      item.recipeName.toLocaleLowerCase('es').includes(term)
      || item.id.toLocaleLowerCase('es').includes(term)
      || item.date.toLocaleLowerCase('es').includes(term),
    );
  });

  readonly totalBatches = computed(() => this.productionHistory().reduce((total, item) => total + item.batches, 0));
  readonly totalUnits = computed(() => this.productionHistory().reduce((total, item) => total + (item.outputUnit === 'g' ? 0 : item.totalYield), 0));
  readonly totalProductionCost = computed(() => this.productionHistory().reduce((total, item) => total + item.calculatedCost, 0));

  readonly selectedRecipe = computed(() =>
    this.activeRecipes().find(recipe => recipe.id === this.selectedRecipeId()) ?? null,
  );
  readonly selectedBase = computed(() => this.doughBases().find(base => base.id === this.selectedBaseId()) ?? null);
  readonly selectedProductionName = computed(() => this.productionType() === 'base' ? this.selectedBase()?.name ?? '' : this.selectedRecipe()?.name ?? '');
  readonly requirements = computed<IngredientRequirement[]>(() => {
    const recipe = this.selectedRecipe();
    const selectedBase = this.selectedBase();
    if (this.productionType() === 'base' && selectedBase) {
      const baseItems = selectedBase.ingredients ?? selectedBase.items ?? [];
      const totals = new Map<string, number>();
      for (const rawItem of baseItems) {
        const ingredientId = String(rawItem['ingredientId'] ?? rawItem['id'] ?? '');
        const quantity = this.asNumber(rawItem['quantity'] ?? rawItem['qty']) * this.batchCount();
        if (ingredientId && quantity !== 0) totals.set(ingredientId, (totals.get(ingredientId) ?? 0) + quantity);
      }
      return Array.from(totals.entries()).map(([ingredientId, quantity]) => ({
        ingredientId, quantity, ingredient: this.ingredients().find(item => item.id === ingredientId),
      }));
    }
    if (!recipe) return [];
    const totals = new Map<string, number>();
    const batches = this.batchCount();
    for (const section of recipe.sections) {
      const sectionName = section.name.toLocaleLowerCase('es');
      // A recipe based on a dough base consumes the prepared dough stock.
      // Its "masa" ingredients were already deducted when that base was made.
      if (recipe.baseId && sectionName === 'masa') continue;
      const quantityScale = recipe.baseId ? Math.max(1, recipe.yield) : 1;
      for (const item of section.ingredients) {
        totals.set(item.ingredientId, (totals.get(item.ingredientId) ?? 0) + item.quantity * quantityScale * batches);
      }
    }
    return Array.from(totals.entries()).map(([ingredientId, quantity]) => ({
      ingredientId,
      quantity,
      ingredient: this.ingredients().find(item => item.id === ingredientId),
    }));
  });

  readonly stockShortages = computed(() =>
    this.requirements().filter(item => !item.ingredient || item.ingredient.stock < item.quantity),
  );

  readonly estimatedCost = computed(() =>
    this.requirements().reduce((total, item) => total + (item.ingredient?.costPerUnit ?? 0) * item.quantity, 0),
  );

  readonly estimatedYield = computed(() => this.productionType() === 'base'
    ? (this.selectedBase()?.weight ?? 0) * this.batchCount()
    : (this.selectedRecipe()?.yield ?? 0) * this.batchCount());
  readonly estimatedYieldUnit = computed(() => this.productionType() === 'base' ? 'g de masa' : 'galletas');

  onSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  updateInventoryEdit(id: string, value: string): void {
    this.inventoryEdits.update(edits => ({ ...edits, [id]: value }));
  }

  setBatchCount(value: string): void {
    const parsed = Number.parseInt(value, 10);
    this.batchCount.set(Number.isFinite(parsed) ? Math.min(1000, Math.max(1, parsed)) : 1);
  }

  openNewBatch(type: 'recipe' | 'base' = 'recipe'): void {
    this.productionType.set(type);
    this.selectedRecipeId.set(this.activeRecipes()[0]?.id ?? '');
    this.selectedBaseId.set(this.doughBases()[0]?.id ?? '');
    this.batchCount.set(1);
    this.formError.set('');
    this.notice.set('');
    this.formOpen.set(true);
  }

  closeForm(): void {
    if (this.saving()) return;
    this.formOpen.set(false);
    this.formError.set('');
  }

  async saveInventoryCount(id: string, rawValue: string): Promise<void> {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      this.formError.set('Ingresa una cantidad válida, también puede ser negativa.');
      return;
    }
    const current = this.dataService.rawState()?.['finishedProductInventory'];
    const rows = Array.isArray(current) ? current.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item)) : [];
    const next = rows.filter(item => String(item['id'] ?? item['recipeId'] ?? '') !== id)
      .concat([{ id, quantity: parsed, updatedAt: new Date().toISOString() }]);
    try {
      await this.dataService.saveBusinessSetting('finishedProductInventory', next);
      this.inventoryEdits.update(edits => { const copy = { ...edits }; delete copy[id]; return copy; });
      this.notice.set('Existencias actualizadas.');
      this.formError.set('');
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'No se pudieron guardar las existencias.');
    }
  }

  async toggleCommandReady(key: string, checked: boolean): Promise<void> {
    const current = this.readyCommandLines();
    const next = checked ? Array.from(new Set([...current, key])) : current.filter(item => item !== key);
    try {
      await this.dataService.saveBusinessSetting('productionReadyLines', next);
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'No se pudo actualizar la comanda.');
    }
  }

  async createProduction(): Promise<void> {
    const recipe = this.productionType() === 'recipe' ? this.selectedRecipe() : null;
    const base = this.productionType() === 'base' ? this.selectedBase() : null;
    const batches = this.batchCount();
    if (!recipe && !base) {
      this.formError.set(this.productionType() === 'base'
        ? 'Selecciona una masa base para registrar su producción.'
        : 'Selecciona una receta activa para registrar la producción.');
      return;
    }
    if (!Number.isInteger(batches) || batches < 1) {
      this.formError.set('La cantidad de lotes debe ser un entero mayor que cero.');
      return;
    }
    const consumesPreparedBase = Boolean(recipe?.baseId && this.asNumber(recipe.baseGramsPerCookie) > 0);
    if (this.requirements().length === 0 && !consumesPreparedBase) {
      this.formError.set('Esta fórmula no tiene insumos vinculados. Completa sus ingredientes antes de registrar producción.');
      return;
    }

    const outputId = recipe?.id ?? `base:${base?.id}`;
    const outputName = recipe?.name ?? base?.name ?? 'Masa base';
    const outputUnit = recipe ? 'galletas' : 'g';
    const record: Record<string, unknown> = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      recipeId: outputId,
      recipeName: outputName,
      outputUnit,
      batches,
      totalYield: this.estimatedYield(),
      calculatedCost: this.estimatedCost(),
      baseInventoryId: recipe?.baseId ? `base:${recipe.baseId}` : '',
      baseGramsConsumed: recipe?.baseId
        ? Math.max(0, this.asNumber(recipe.baseGramsPerCookie)) * Math.max(1, recipe.yield) * batches
        : 0,
      status: 'COMPLETED',
    };
    const deductions = this.requirements().map(({ ingredientId, quantity }) => ({ ingredientId, quantity }));

    this.saving.set(true);
    this.formError.set('');
    this.notice.set('');
    try {
      await this.dataService.recordProduction(record, deductions);
      this.formOpen.set(false);
      this.notice.set('Producción registrada. Se actualizaron las existencias y los insumos se descontaron incluso si quedan negativos.');
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'No se pudo registrar la producción.');
    } finally {
      this.saving.set(false);
    }
  }

  private asString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : value == null ? fallback : String(value);
  }

  private asNumber(value: unknown): number {
    const result = typeof value === 'number' ? value : Number(value ?? 0);
    return Number.isFinite(result) ? result : 0;
  }
}