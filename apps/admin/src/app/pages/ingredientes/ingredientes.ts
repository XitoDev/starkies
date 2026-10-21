import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { DataService } from '../../services/data.service';
import { Ingredient } from 'shared';

type IngredientForm = {
  name: string;
  packageQuantityGrams: number;
  packagePrice: number;
  unit: string;
  stock: number;
  minStock: number;
  supplyGroup: string;
  foodGroup: string;
  ingredientGroup: string;
};

@Component({
  selector: 'app-ingredientes',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DecimalPipe, MatButtonModule, MatIconModule, MatInputModule],
  templateUrl: './ingredientes.html',
  styleUrls: ['./ingredientes.css'],
})
export class Ingredientes {
  private readonly dataService = inject(DataService);
  readonly ingredients = this.dataService.ingredients;
  readonly searchTerm = signal('');
  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal('');
  readonly notice = signal('');
  readonly form = signal<IngredientForm>(this.emptyForm());


  readonly filteredIngredients = computed(() => {
    const term = this.searchTerm().trim().toLocaleLowerCase('es');
    return this.ingredients()
      .filter(item => !term || item.name.toLocaleLowerCase('es').includes(term) || (item.supplyGroup ?? '').toLocaleLowerCase('es').includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  onSearch(event: Event): void { this.searchTerm.set((event.target as HTMLInputElement).value); }
  packageQuantity(item: Ingredient): number { return item.packageQuantityGrams ?? this.gramsPerUnit(item.unit); }
  packagePrice(item: Ingredient): number { return item.packagePrice ?? item.costPerUnit; }
  costPerGram(item: Ingredient): number { const quantity = this.packageQuantity(item); return quantity > 0 ? this.packagePrice(item) / quantity : 0; }
  costPerGramFromForm(): number { const quantity = this.form().packageQuantityGrams; return quantity > 0 ? this.form().packagePrice / quantity : 0; }

  openNewIngredient(): void {
    this.editingId.set(null);
    this.form.set(this.emptyForm());
    this.formError.set('');
    this.notice.set('');
    this.formOpen.set(true);
  }

  openEditIngredient(item: Ingredient): void {
    this.editingId.set(item.id);
    const grams = item.packageQuantityGrams ?? this.gramsPerUnit(item.unit);
    this.form.set({
      name: item.name,
      packageQuantityGrams: grams,
      packagePrice: item.packagePrice ?? item.costPerUnit,
      unit: item.unit || 'g',
      stock: item.stock,
      minStock: item.minStock ?? 0,
      supplyGroup: item.supplyGroup ?? 'Secos',
      foodGroup: item.foodGroup ?? 'No aplica',
      ingredientGroup: item.ingredientGroup ?? '',
    });
    this.formError.set('');
    this.notice.set('');
    this.formOpen.set(true);
  }

  closeForm(): void { if (!this.saving()) { this.formOpen.set(false); this.formError.set(''); } }
  updateTextField(field: 'name', value: string): void { this.form.update(current => ({ ...current, [field]: value })); }
  updateSupplyType(value: string): void { this.form.update(current => ({ ...current, supplyGroup: value })); }
  updateNumberField(field: 'packageQuantityGrams' | 'packagePrice', value: string): void {
    const parsed = value.trim() === '' ? 0 : Number(value);
    this.form.update(current => ({ ...current, [field]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0 }));
  }
  submitForm(event: Event): void { event.preventDefault(); void this.saveIngredient(); }

  async saveIngredient(): Promise<void> {
    const values = this.form();
    const name = values.name.trim();
    if (!name) { this.formError.set('Ingresa el nombre del insumo.'); return; }
    if (!Number.isFinite(values.packageQuantityGrams) || values.packageQuantityGrams <= 0 || !Number.isFinite(values.packagePrice) || values.packagePrice < 0) {
      this.formError.set('La cantidad del empaque debe ser mayor que cero y el precio no puede ser negativo.');
      return;
    }
    this.saving.set(true);
    this.formError.set('');
    try {
      const costPerGram = values.packagePrice / values.packageQuantityGrams;
      const unitFactor = this.gramsPerUnit(values.unit);
      const costPerUnit = unitFactor > 0 ? costPerGram * unitFactor : values.packagePrice;
      const item: Ingredient = {
        id: this.editingId() ?? crypto.randomUUID(),
        name,
        packageQuantityGrams: values.packageQuantityGrams,
        packagePrice: values.packagePrice,
        unit: values.unit || 'g',
        costPerUnit,
        stock: values.stock,
        minStock: values.minStock,
        supplyGroup: values.supplyGroup,
        foodGroup: values.foodGroup,
        ingredientGroup: values.ingredientGroup,
      };
      await this.dataService.saveIngredient(item);
      this.formOpen.set(false);
      this.notice.set(this.editingId() ? 'Insumo actualizado correctamente.' : 'Insumo creado correctamente.');
      this.editingId.set(null);
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'No se pudo guardar el insumo.');
    } finally { this.saving.set(false); }
  }

  async removeIngredient(item: Ingredient): Promise<void> {
    if (!window.confirm(`¿Eliminar el insumo "${item.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await this.dataService.deleteIngredient(item.id);
      this.notice.set('Insumo eliminado correctamente.');
    } catch (error) {
      this.notice.set(error instanceof Error ? error.message : 'No se pudo eliminar el insumo.');
    }
  }

  private gramsPerUnit(unit: string): number {
    const normalized = unit.toLocaleLowerCase('es');
    if (normalized === 'kg' || normalized === 'l') return 1000;
    if (normalized === 'g' || normalized === 'ml') return 1;
    return 0;
  }
  private emptyForm(): IngredientForm {
    return { name: '', packageQuantityGrams: 1000, packagePrice: 0, unit: 'g', stock: 0, minStock: 0, supplyGroup: 'Secos', foodGroup: 'No aplica', ingredientGroup: '' };
  }
}

type InventoryDraft = { stock: number; minStock: number };

@Component({
  selector: 'app-inventario',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DecimalPipe, MatButtonModule, MatIconModule, MatInputModule],
  template: `
    <div class="page-container inventory-page">
      <div class="page-heading">
        <div><p class="eyebrow">Mi negocio / Existencias</p><h1 class="page-title">Inventario</h1><p class="page-subtitle">Controla las cantidades disponibles y cuánto falta para alcanzar el stock mínimo.</p></div>
      </div>
      @if (notice()) { <div class="notice" role="status">{{ notice() }}</div> }
      <div class="inventory-table-wrap">
        <table class="inventory-table">
          <thead><tr><th>Insumo</th><th>Existencias</th><th>Stock mínimo</th><th>Faltante</th><th>Acciones</th></tr></thead>
          <tbody>
            @for (item of ingredients(); track item.id) {
              <tr>
                <td><strong>{{ item.name }}</strong><small>{{ item.brand || 'Sin marca registrada' }}</small></td>
                <td><label class="inventory-input"><input type="number" min="0" step="any" [attr.aria-label]="'Existencias de ' + item.name" [value]="draft(item).stock" (input)="updateDraft(item, 'stock', $any($event.target).value)"><span>{{ item.unit }}</span></label></td>
                <td><label class="inventory-input"><input type="number" min="0" step="any" [attr.aria-label]="'Stock mínimo de ' + item.name" [value]="draft(item).minStock" (input)="updateDraft(item, 'minStock', $any($event.target).value)"><span>{{ item.unit }}</span></label></td>
                <td><span class="shortage-pill" [class.has-shortage]="shortage(item) > 0">{{ shortage(item) | number:'1.0-3' }} {{ item.unit }}</span></td>
                <td class="inventory-actions"><button matIconButton class="inventory-action-save" type="button" [attr.aria-label]="'Guardar existencias de ' + item.name" [title]="'Guardar existencias de ' + item.name" [disabled]="savingId() === item.id" (click)="saveInventory(item)"><mat-icon fontSet="material-symbols-rounded">{{ savingId() === item.id ? 'hourglass_top' : 'save' }}</mat-icon></button><button matIconButton class="inventory-action-buy" type="button" [attr.aria-label]="'Comprar ' + item.name" [title]="'Comprar ' + item.name" (click)="buyIngredient(item)"><mat-icon fontSet="material-symbols-rounded">shopping_cart</mat-icon></button></td>
              </tr>
            }
            @if (ingredients().length === 0) { <tr><td colspan="5"><div class="empty-state"><strong>No hay insumos registrados</strong><p>Primero registra los ingredientes y sus costos en Insumos.</p></div></td></tr> }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    :host{display:block;min-width:0}.page-container{display:flex;flex-direction:column;gap:24px;min-width:0}.page-heading{display:flex;align-items:center;justify-content:space-between;gap:22px}.eyebrow{margin:0 0 12px;color:#8056ad;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase}.page-title{margin:0;color:#30263a;font-size:clamp(29px,3vw,37px);font-weight:500;letter-spacing:-1.6px;line-height:1.15}.page-subtitle{margin:13px 0 0;color:#95899d;font-size:13px;line-height:1.6}.notice{padding:12px 15px;border:1px solid #e4d6ef;border-radius:10px;background:#f7f0fb;color:#704795;font-size:12px}.inventory-table-wrap{overflow-x:auto;border:1px solid #eee7f2;border-radius:14px;background:#fff}.inventory-table{width:100%;border-collapse:collapse;min-width:690px}.inventory-table th,.inventory-table td{padding:14px 16px;border-bottom:1px solid #f0eaf4;text-align:left;font-size:12px}.inventory-table th{background:#faf7fc;color:#8d7c98;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px}.inventory-table tbody tr:last-child td{border-bottom:0}.inventory-table td>strong{display:block;color:#3d3046}.inventory-table td small{display:block;margin-top:5px;color:#a094aa;font-size:10px}.inventory-input{display:flex;align-items:center;gap:7px;min-width:110px}.inventory-input input{width:92px;min-width:0;height:37px;padding:0 9px;border:1px solid #e8e0ed;border-radius:8px;color:#51445b}.inventory-input span{color:#95899d;font-size:10px}.shortage-pill{display:inline-flex;padding:6px 9px;border-radius:7px;background:#f0e7f7;color:#8056ad;font-weight:700;white-space:nowrap}.shortage-pill.has-shortage{background:#fff0db;color:#a96521}.empty-state{padding:28px;text-align:center;color:#95899d}.empty-state strong{color:#51445b}.empty-state p{font-size:12px}.inventory-table button{white-space:nowrap}.inventory-actions{display:flex;align-items:center;gap:5px}.inventory-actions button{width:32px;height:32px;min-width:32px;padding:5px;border-radius:9px}.inventory-actions mat-icon{width:18px;height:18px;font-size:18px;line-height:18px}.inventory-action-save{color:#6d8b57}.inventory-action-save:hover{background:#edf5e8}.inventory-action-buy{color:#8056ad}.inventory-action-buy:hover{background:#f0e7f7}@media(max-width:700px){.page-heading{align-items:flex-start;flex-direction:column}.inventory-table th,.inventory-table td{padding:12px}}`
  ],
})
export class Inventario {
  private readonly dataService = inject(DataService);
  readonly ingredients = this.dataService.ingredients;
  private readonly router = inject(Router);
  readonly drafts = signal<Record<string, InventoryDraft>>({});
  readonly savingId = signal<string | null>(null);
  readonly notice = signal('');

  buyIngredient(item: Ingredient): void { void this.router.navigate(['/finanzas'], { queryParams: { action: 'purchase', ingredientId: item.id } }); }
  draft(item: Ingredient): InventoryDraft { return this.drafts()[item.id] ?? { stock: item.stock, minStock: item.minStock ?? 0 }; }
  shortage(item: Ingredient): number { const draft = this.draft(item); return Math.max(0, draft.minStock - draft.stock); }
  updateDraft(item: Ingredient, field: 'stock' | 'minStock', value: string): void {
    const current = this.draft(item);
    const parsed = value.trim() === '' ? 0 : Number(value);
    this.drafts.update(all => ({ ...all, [item.id]: { ...current, [field]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0 } }));
  }
  async saveInventory(item: Ingredient): Promise<void> {
    const draft = this.draft(item);
    this.savingId.set(item.id);
    this.notice.set('');
    try {
      await this.dataService.saveIngredient({ ...item, stock: draft.stock, minStock: draft.minStock });
      this.drafts.update(all => { const next = { ...all }; delete next[item.id]; return next; });
      this.notice.set(`Inventario de ${item.name} actualizado.`);
    } catch (error) {
      this.notice.set(error instanceof Error ? error.message : 'No se pudo guardar el inventario.');
    } finally { this.savingId.set(null); }
  }
}
