import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideDynamicIcon,
  LucideSearch,
  LucideTriangleAlert,
  LucidePlus,
  LucideSquarePen,
  LucidePackage,
} from '@lucide/angular';
import { DataService } from '../../services/data.service';
import { Ingredient } from 'shared';

type IngredientForm = {
  name: string;
  unit: string;
  costPerUnit: number;
  stock: number;
  minStock: number;
};

@Component({
  selector: 'app-ingredientes',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  templateUrl: './ingredientes.html',
  styleUrls: ['./ingredientes.css'],
})
export class Ingredientes {
  private readonly dataService = inject(DataService);

  readonly icons = {
    Search: LucideSearch,
    AlertTriangle: LucideTriangleAlert,
    Plus: LucidePlus,
    Edit: LucideSquarePen,
    Package: LucidePackage,
  };

  readonly ingredients = this.dataService.ingredients;
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
        const matchesStock = !this.lowStockOnly()
          || this.isLowStock(ingredient.stock, ingredient.minStock);
        return matchesTerm && matchesStock;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  readonly lowStockCount = computed(
    () => this.ingredients().filter((ingredient) => this.isLowStock(ingredient.stock, ingredient.minStock)).length,
  );

  readonly inventoryValue = computed(
    () => this.ingredients().reduce((total, ingredient) => total + ingredient.stock * ingredient.costPerUnit, 0),
  );

  readonly ingredientCount = computed(() => this.ingredients().length);

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

  updateTextField(field: 'name' | 'unit', value: string): void {
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
    return { name: '', unit: 'g', costPerUnit: 0, stock: 0, minStock: 0 };
  }
}