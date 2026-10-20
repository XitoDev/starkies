import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { DataService } from '../../services/data.service';
import { Ingredient } from 'shared';

const SUPPLY_GROUPS = ['Secos', 'Húmedos', 'Rellenos', 'Decoraciones', 'Cajas y complementos'] as const;
const FOOD_GROUPS = ['No aplica', 'Cereales y harinas', 'Azúcares y endulzantes', 'Lácteos', 'Huevos', 'Grasas y aceites', 'Frutas', 'Chocolate y cacao', 'Frutos secos', 'Otros'] as const;

type IngredientForm = {
  name: string;
  unit: string;
  costPerUnit: number;
  stock: number;
  minStock: number;
  supplyGroup: string;
  foodGroup: string;
  ingredientGroup: string;
};

@Component({
  selector: 'app-ingredientes',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatInputModule],
  templateUrl: './ingredientes.html',
  styleUrls: ['./ingredientes.css'],
})
export class Ingredientes {
  private readonly dataService = inject(DataService);

  readonly ingredients = this.dataService.ingredients;
  readonly supplyGroups = SUPPLY_GROUPS;
  readonly foodGroups = FOOD_GROUPS;
  readonly selectedGroup = signal<string>('Todos');
  readonly openMenuId = signal<string | null>(null);
  readonly purchaseOpen = signal(false);
  readonly purchaseIngredientId = signal<string | null>(null);
  readonly purchaseQuantity = signal(0);
  readonly purchaseUnitCost = signal(0);
  readonly purchaseSaving = signal(false);
  readonly purchaseError = signal('');
  readonly searchTerm = signal('');
  readonly lowStockOnly = signal(false);
  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal('');
  readonly notice = signal('');
  readonly form = signal<IngredientForm>(this.emptyForm());

  readonly filteredIngredients = computed(() => {
    const term = this.searchTerm().trim().toLocaleLowerCase('es');
    return this.ingredients()
      .filter((ingredient) => {
        const matchesTerm = !term
          || ingredient.name.toLocaleLowerCase('es').includes(term)
          || ingredient.unit.toLocaleLowerCase('es').includes(term);
        const matchesGroup = this.selectedGroup() === 'Todos' || (ingredient.supplyGroup ?? 'Secos') === this.selectedGroup();
        const matchesStock = !this.lowStockOnly()
          || this.isLowStock(ingredient.stock, ingredient.minStock);
        return matchesTerm && matchesStock && matchesGroup;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  readonly groupedIngredients = computed(() => {
    const items = this.filteredIngredients();
    const groups = this.selectedGroup() === 'Todos' ? [...this.supplyGroups] : [this.selectedGroup()];
    return groups.map(group => ({ group, ingredients: items.filter(item => (item.supplyGroup ?? 'Secos') === group) })).filter(group => group.ingredients.length > 0);
  });

  readonly lowStockCount = computed(
    () => this.ingredients().filter((ingredient) => this.isLowStock(ingredient.stock, ingredient.minStock)).length,
  );

  readonly inventoryValue = computed(
    () => this.ingredients().reduce((total, ingredient) => total + ingredient.stock * ingredient.costPerUnit, 0),
  );

  readonly ingredientCount = computed(() => this.ingredients().length);

  countByGroup(group: string): number { return this.ingredients().filter(item => (item.supplyGroup ?? 'Secos') === group).length; }
  selectedPurchaseIngredientName(): string { return this.ingredients().find(item => item.id === this.purchaseIngredientId())?.name ?? ''; }
  onPurchaseQuantityChange(value: string): void { const parsed = Number(value); this.purchaseQuantity.set(Number.isFinite(parsed) ? Math.max(0, parsed) : 0); }
  onPurchaseUnitCostChange(value: string): void { const parsed = Number(value); this.purchaseUnitCost.set(Number.isFinite(parsed) ? Math.max(0, parsed) : 0); }

  isLowStock(stock: number, minStock?: number): boolean {
    return minStock !== undefined && minStock !== null && stock <= minStock;
  }

  onSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  openNewIngredient(): void {
    this.editingId.set(null);
    this.form.set(this.emptyForm());
    this.formError.set('');
    this.notice.set('');
    this.formOpen.set(true);
  }

  openEditIngredient(ingredient: Ingredient): void {
    this.editingId.set(ingredient.id);
    this.form.set({
      name: ingredient.name,
      unit: ingredient.unit,
      costPerUnit: ingredient.costPerUnit,
      stock: ingredient.stock,
      minStock: ingredient.minStock ?? 0,
      supplyGroup: ingredient.supplyGroup ?? 'Secos',
      foodGroup: ingredient.foodGroup ?? 'No aplica',
      ingredientGroup: ingredient.ingredientGroup ?? '',
    });
    this.formError.set('');
    this.notice.set('');
    this.formOpen.set(true);
  }

  closeForm(): void {
    if (this.saving()) return;
    this.formOpen.set(false);
    this.formError.set('');
  }

  updateTextField(field: 'name' | 'unit' | 'supplyGroup' | 'foodGroup' | 'ingredientGroup', value: string): void {
    this.form.update((current) => ({ ...current, [field]: value }));
  }

  updateNumberField(field: 'costPerUnit' | 'stock' | 'minStock', value: string): void {
    const parsed = value.trim() === '' ? 0 : Number(value);
    this.form.update((current) => ({
      ...current,
      [field]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
    }));
  }

  submitForm(event: Event): void {
    event.preventDefault();
    void this.saveIngredient();
  }

  async saveIngredient(): Promise<void> {
    const values = this.form();
    const name = values.name.trim();
    const unit = values.unit.trim();

    if (!name || !unit) {
      this.formError.set('Ingresa el nombre del insumo y su unidad de medida.');
      return;
    }

    if (![values.costPerUnit, values.stock, values.minStock].every((value) => Number.isFinite(value) && value >= 0)) {
      this.formError.set('Los costos y las cantidades deben ser números iguales o mayores que cero.');
      return;
    }

    this.saving.set(true);
    this.formError.set('');
    try {
      const ingredient: Ingredient = {
        id: this.editingId() ?? crypto.randomUUID(),
        name,
        unit,
        costPerUnit: values.costPerUnit,
        stock: values.stock,
        minStock: values.minStock,
        supplyGroup: values.supplyGroup,
        foodGroup: values.foodGroup,
        ingredientGroup: values.ingredientGroup.trim(),
      };
      await this.dataService.saveIngredient(ingredient);
      this.formOpen.set(false);
      this.notice.set(this.editingId() ? 'Insumo actualizado correctamente.' : 'Insumo creado correctamente.');
      this.editingId.set(null);
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'No se pudo guardar el insumo.');
    } finally {
      this.saving.set(false);
    }
  }

  openPurchase(ingredient: Ingredient): void {
    this.openMenuId.set(null);
    this.purchaseIngredientId.set(ingredient.id);
    this.purchaseQuantity.set(0);
    this.purchaseUnitCost.set(ingredient.costPerUnit);
    this.purchaseError.set('');
    this.purchaseOpen.set(true);
  }

  async savePurchase(): Promise<void> {
    const ingredient = this.ingredients().find(item => item.id === this.purchaseIngredientId());
    const quantity = this.purchaseQuantity();
    const unitCost = this.purchaseUnitCost();
    if (!ingredient) { this.purchaseError.set('No se encontró el ingrediente. Actualiza la pantalla e inténtalo de nuevo.'); return; }
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost <= 0) { this.purchaseError.set('Ingresa una cantidad y un costo por unidad mayores que cero.'); return; }
    this.purchaseSaving.set(true);
    this.purchaseError.set('');
    const amount = Math.round(quantity * unitCost * 100) / 100;
    try {
      // The repository transaction updates stock, weighted-average cost and cash movement atomically.
      await this.dataService.recordIngredientPurchase({
        id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10),
        description: `Compra de ${ingredient.name}`, type: 'OUT', amount,
        category: 'Compra de ingredientes', subcategory: ingredient.supplyGroup ?? 'Secos',
        ingredientId: ingredient.id, ingredientName: ingredient.name, ingredientUnit: ingredient.unit,
        quantity, unitCost,
      });
      this.purchaseOpen.set(false);
      this.notice.set(`Compra registrada: ${quantity} ${ingredient.unit} de ${ingredient.name}.`);
    } catch (error) {
      this.purchaseError.set(error instanceof Error ? error.message : 'No se pudo registrar la compra. Revisa el inventario y los movimientos financieros antes de volver a intentarlo.');
    } finally { this.purchaseSaving.set(false); }
  }

  async removeIngredient(ingredient: Ingredient): Promise<void> {
    const confirmed = window.confirm(`¿Eliminar el insumo "${ingredient.name}"? Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    this.notice.set('');
    this.formError.set('');
    try {
      await this.dataService.deleteIngredient(ingredient.id);
      this.notice.set('Insumo eliminado correctamente.');
    } catch (error) {
      this.notice.set(error instanceof Error ? error.message : 'No se pudo eliminar el insumo.');
    }
  }

  private emptyForm(): IngredientForm {
    return { name: '', unit: 'g', costPerUnit: 0, stock: 0, minStock: 0, supplyGroup: 'Secos', foodGroup: 'No aplica', ingredientGroup: '' };
  }
}