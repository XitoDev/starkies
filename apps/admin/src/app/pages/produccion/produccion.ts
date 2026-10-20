import { DataService } from '../../services/data.service';
import { Ingredient, Recipe } from 'shared';

type ProductionEntry = {
  id: string;
  date: string;
  recipeId: string;
  recipeName: string;
  batches: number;
  totalYield: number;
  calculatedCost: number;
  status: string;
};

type IngredientRequirement = {
  ingredientId: string;
  quantity: number;
  ingredient?: Ingredient;
};

@Component({
  selector: 'app-produccion',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
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
  readonly batchCount = signal(1);

  readonly activeRecipes = computed(() => this.recipes().filter(recipe => !recipe.archived));

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
  readonly totalUnits = computed(() => this.productionHistory().reduce((total, item) => total + item.totalYield, 0));
  readonly totalProductionCost = computed(() => this.productionHistory().reduce((total, item) => total + item.calculatedCost, 0));

  readonly selectedRecipe = computed(() =>
    this.activeRecipes().find(recipe => recipe.id === this.selectedRecipeId()) ?? null,
  );

  readonly requirements = computed<IngredientRequirement[]>(() => {
    const recipe = this.selectedRecipe();
    if (!recipe) return [];
    const totals = new Map<string, number>();
    const batches = this.batchCount();
    if (recipe.baseId) {
      const rawBases = this.dataService.rawState()?.['doughBases'];
      const bases = Array.isArray(rawBases) ? rawBases as Record<string, unknown>[] : [];
      const base = bases.find(item => String(item['id'] ?? '') === recipe.baseId);
      const baseItems = Array.isArray(base?.['ingredients']) ? base['ingredients']
        : Array.isArray(base?.['items']) ? base['items'] : [];
      const baseWeight = Number(base?.['weight'] ?? 0);
      const gramsNeeded = Number(recipe.baseGramsPerCookie ?? 0) * Math.max(1, recipe.yield);
      const baseScale = baseWeight > 0 && gramsNeeded > 0 ? gramsNeeded / baseWeight : 1;
      for (const rawItem of baseItems) {
        if (typeof rawItem !== 'object' || rawItem === null) continue;
        const item = rawItem as Record<string, unknown>;
        const ingredientId = String(item['ingredientId'] ?? item['id'] ?? '');
        const quantity = Number(item['quantity'] ?? item['qty'] ?? 0) * baseScale * batches;
        if (ingredientId && quantity > 0) totals.set(ingredientId, (totals.get(ingredientId) ?? 0) + quantity);
      }
    }
    for (const section of recipe.sections) {
      const sectionName = section.name.toLocaleLowerCase('es');
      const quantityScale = recipe.baseId && sectionName !== 'masa' ? Math.max(1, recipe.yield) : 1;
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

  readonly estimatedYield = computed(() => (this.selectedRecipe()?.yield ?? 0) * this.batchCount());

  onSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  setBatchCount(value: string): void {
    const parsed = Number.parseInt(value, 10);
    this.batchCount.set(Number.isFinite(parsed) ? Math.min(1000, Math.max(1, parsed)) : 1);
  }

  openNewBatch(): void {
    this.selectedRecipeId.set(this.activeRecipes()[0]?.id ?? '');
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

  async createProduction(): Promise<void> {
    const recipe = this.selectedRecipe();
    const batches = this.batchCount();
    if (!recipe) {
      this.formError.set('Selecciona una receta activa para registrar la producción.');
      return;
    }
    if (!Number.isInteger(batches) || batches < 1) {
      this.formError.set('La cantidad de lotes debe ser un entero mayor que cero.');
      return;
    }
    if (this.requirements().length === 0) {
      this.formError.set('Esta receta no tiene ingredientes vinculados. Completa su fórmula antes de registrar producción.');
      return;
    }
    if (this.stockShortages().length > 0) {
      const first = this.stockShortages()[0];
      this.formError.set(first.ingredient
        ? `Stock insuficiente de "${first.ingredient.name}". Revisa las cantidades o repón el inventario.`
        : 'Hay ingredientes de la fórmula que ya no existen en el inventario. Corrige la receta antes de producir.');
      return;
    }

    const record: Record<string, unknown> = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      recipeId: recipe.id,
      recipeName: recipe.name,
      batches,
      totalYield: recipe.yield * batches,
      calculatedCost: this.estimatedCost(),
      status: 'COMPLETED',
    };
    const deductions = this.requirements().map(({ ingredientId, quantity }) => ({ ingredientId, quantity }));

    this.saving.set(true);
    this.formError.set('');
    this.notice.set('');
    try {
      await this.dataService.recordProduction(record, deductions);
      this.formOpen.set(false);
      this.notice.set('Producción registrada y stock de ingredientes actualizado.');
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