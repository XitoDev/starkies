import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DataService } from '../../services/data.service';
import { DoughBaseRecord, DoughBaseService } from '../../services/dough-base.service';

type BaseRow = { ingredientId: string; quantity: number | null };

@Component({
  selector: 'app-masa-base-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DecimalPipe, RouterLink, MatButtonModule, MatIconModule],
  template: `
    <section class="editor-page">
      <header class="heading"><div><h1>{{ editing() ? 'Editar masa base' : 'Nueva masa base' }}</h1><p>{{ editing() ? 'Actualiza la fórmula y el rendimiento del lote.' : 'Define una fórmula que puedas reutilizar en distintas recetas.' }}</p></div></header>
      @if (error()) { <p class="message error" role="alert">{{ error() }}</p> }
      @if (!loading() && editing() && !base()) { <p class="message error">No se encontró esta masa base. Puede que todavía se estén cargando los datos.</p> }
      <form (ngSubmit)="save()">
        @if (!editing()) {
          <label class="field">Copiar masa de una receta existente · opcional
            <select [ngModel]="copyRecipeId()" (ngModelChange)="copyFromRecipe($event)" name="copyRecipeId">
              <option value="">Elegir receta</option>
              @for (recipe of recipes(); track recipe.id) { <option [value]="recipe.id">{{ recipe.name }}</option> }
            </select>
          </label>
        }
        <label class="field">Nombre de la base
          <input required maxlength="100" name="name" [(ngModel)]="name" placeholder="Ej. Masa madre clásica">
        </label>
        <label class="field">Peso total de la masa de este lote (g)
          <input required type="number" min="0.01" step="any" name="weight" [ngModel]="weight()" (ngModelChange)="setWeight($event)" placeholder="Ej. 600">
        </label>
        <section class="yield">
          <h2>Rendimiento de este lote</h2>
          <div class="yield-grid">
            @for (portion of portions; track portion) {
              <div><span>Porciones de {{ portion }} g</span><strong>{{ yieldFor(portion).count }} {{ yieldFor(portion).count === 1 ? 'porción' : 'porciones' }}</strong><small>{{ yieldFor(portion).remainder > 0 ? 'Sobran ' + (yieldFor(portion).remainder | number:'1.0-2') + ' g' : 'Sin sobrante' }}</small></div>
            }
          </div>
          <p>Calculado con masa cruda, sin relleno ni decoración. El peso final puede variar al hornear.</p>
        </section>
        <p class="hint">Usa el peso de la masa antes de añadir rellenos o decoración. Si hay huevos por unidad o líquidos en ml, pesa el lote: no se convierten automáticamente a gramos.</p>
        <section class="ingredients-panel">
          <h2>Masa</h2>
          @for (row of rows(); track $index) {
            <div class="ingredient-row">
              <mat-icon class="drag" fontSet="material-symbols-rounded" aria-hidden="true">drag_indicator</mat-icon>
              <select [name]="'ingredient-' + $index" [ngModel]="row.ingredientId" (ngModelChange)="updateRow($index, 'ingredientId', $event)" aria-label="Ingrediente">
                <option value="">Selecciona ingrediente</option>
                @for (ingredient of ingredients(); track ingredient.id) { <option [value]="ingredient.id">{{ ingredient.name }} ({{ ingredient.unit }})</option> }
              </select>
              <input [name]="'quantity-' + $index" type="number" min="0.001" step="any" [ngModel]="row.quantity ?? ''" (ngModelChange)="updateRow($index, 'quantity', $event)" aria-label="Cantidad" placeholder="Cantidad">
              <button matIconButton class="remove" type="button" aria-label="Quitar ingrediente" [disabled]="rows().length === 1" (click)="removeRow($index)"><mat-icon fontSet="material-symbols-rounded" aria-hidden="true">close</mat-icon></button>
            </div>
          }
          <button matButton="text" class="add" type="button" (click)="addRow()"><mat-icon fontSet="material-symbols-rounded" aria-hidden="true">add</mat-icon> Agregar ingrediente</button>
        </section>
        <label class="field">Notas de la base
          <textarea rows="3" maxlength="1500" name="notes" [(ngModel)]="notes"></textarea>
        </label>
        <footer class="admin-sticky-actions"><a matButton="outlined" class="secondary" routerLink="/recetas" [queryParams]="{vista:'masas-base'}">Cancelar</a><button matButton="elevated" class="primary" type="submit" [disabled]="saving() || (editing() && !base())">{{ saving() ? 'Guardando…' : 'Guardar masa base' }}</button></footer>
      </form>
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0;color:#30263a}.editor-page{width:100%;box-sizing:border-box;padding:4px 0 28px}
    .heading{margin-bottom:24px}.heading h1{margin:0;font-size:26px;font-weight:500;letter-spacing:-.7px}.heading p{margin:8px 0 0;color:#95899d;font-size:12px;line-height:1.6}form{display:grid;gap:22px}.field{display:grid;gap:10px;color:#957fa5;font-size:12px}
    input,select,textarea{width:100%;min-width:0;box-sizing:border-box;min-height:52px;padding:0 15px;border:1px solid #e5d9ed;border-radius:9px;background:#fff;color:#5b4d65;font:inherit;font-size:13px;outline:none}textarea{padding:13px 15px;resize:vertical}input:focus,select:focus,textarea:focus{border-color:#b99ad4;box-shadow:0 0 0 3px rgb(128 86 173 / 9%)}
    .yield{padding:22px 18px;border-radius:15px;background:#eee2f3;color:#765388}.yield h2{margin:0 0 20px;font-size:13px;font-weight:750}.yield-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.yield-grid>div{display:grid;gap:8px}.yield-grid span,.yield-grid small{color:#8b7199;font-size:12px}.yield-grid strong{color:#684578;font-size:23px}.yield p{margin:20px 0 0;color:#8b7199;font-size:12px;line-height:1.5}.hint{margin:-4px 0 0;color:#a090ae;font-size:12px;line-height:1.5}
    .ingredients-panel{display:grid;gap:14px;padding:20px 18px;border:1px solid #eee7f2;border-radius:14px;background:#fff}.ingredients-panel h2{margin:0;font-size:16px;font-weight:500}.ingredient-row{display:grid;grid-template-columns:30px minmax(0,1fr) 125px 32px;align-items:center;gap:8px}.ingredient-row select,.ingredient-row input{min-height:48px}.drag{display:grid;place-items:center;width:30px;height:40px;border-radius:8px;background:#f7f0fa;color:#a38ab7;font-size:20px}.remove{display:inline-grid;place-items:center;width:32px;min-width:32px;height:38px;padding:0;border:0;border-radius:8px;background:#f7f0fa;color:#a38ab7;cursor:pointer}.remove mat-icon{display:block;width:20px;height:20px;font-size:20px;line-height:20px}.remove:disabled{opacity:.35;cursor:not-allowed}.add,.add.mat-mdc-button,.add[matButton="text"]{justify-self:start;display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;color:#8056ad;font-size:13px;font-weight:600;line-height:1.4;cursor:pointer}.add mat-icon{width:18px;height:18px;font-size:18px;line-height:18px}.add:hover{background:transparent;box-shadow:none;color:#704795}
    footer{display:flex;align-items:center;justify-content:flex-end;gap:12px}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border-radius:10px;font-size:13px;font-weight:750;text-decoration:none;cursor:pointer}.secondary{color:#7d6c88;font-weight:500}.primary:disabled{opacity:.6;cursor:wait}.message{padding:12px 14px;border-radius:9px;background:#f7f0fb;color:#704795;font-size:12px}.error{background:#fff0f0;color:#a44855}
    @media(max-width:620px){.ingredient-row{grid-template-columns:25px minmax(0,1fr) 88px 30px;gap:5px}.ingredient-row select,.ingredient-row input{padding:0 8px;font-size:11px}.yield-grid strong{font-size:20px}footer{align-items:stretch;flex-direction:column-reverse}footer>*{width:100%;box-sizing:border-box}}
  `]
})
export class MasaBaseEditor {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly data = inject(DataService);
  private readonly service = inject(DoughBaseService);
  readonly id = signal(this.route.snapshot.paramMap.get('baseId') ?? '');
  readonly editing = computed(() => Boolean(this.id()));
  readonly base = computed(() => this.service.list().find(item => item.id === this.id()) ?? null);
  readonly loading = this.data.loading;
  readonly ingredients = this.data.ingredients;
  readonly recipes = this.data.recipes;
  readonly rows = signal<BaseRow[]>([{ ingredientId: '', quantity: null }]);
  readonly weight = signal<number | null>(null);
  readonly portions = [30, 60];
  readonly saving = signal(false);
  readonly error = signal('');
  readonly copyRecipeId = signal('');
  name = '';
  notes = '';

  constructor() {
    effect(() => {
      const base = this.base();
      if (!base) return;
      this.name = base.name;
      this.weight.set(base.weight);
      this.rows.set(base.ingredients.length ? base.ingredients.map(row => ({ ...row })) : [{ ingredientId: '', quantity: null }]);
      this.notes = base.notes ?? '';
    });
  }

  setWeight(value: unknown): void {
    const parsed = value === '' || value === null ? null : Number(value);
    this.weight.set(parsed !== null && Number.isFinite(parsed) ? parsed : null);
  }
  yieldFor(portion: number): { count: number; remainder: number } {
    const weight = Math.max(0, Number(this.weight()) || 0);
    return { count: Math.floor(weight / portion), remainder: Math.round((weight % portion) * 100) / 100 };
  }
  updateRow(index: number, field: 'ingredientId' | 'quantity', value: unknown): void {
    this.rows.update(rows => rows.map((row, i) => i !== index ? row : field === 'ingredientId'
      ? { ...row, ingredientId: String(value ?? '') }
      : { ...row, quantity: value === '' || value === null ? null : Number(value) }));
  }
  addRow(): void { this.rows.update(rows => [...rows, { ingredientId: '', quantity: null }]); }
  removeRow(index: number): void { this.rows.update(rows => rows.filter((_, i) => i !== index)); }
  copyFromRecipe(id: string): void {
    this.copyRecipeId.set(id);
    const recipe = this.recipes().find(item => item.id === id);
    if (!recipe) return;
    this.name = recipe.name ? `Masa base · ${recipe.name}` : '';
    const dough = recipe.sections.filter(section => section.name.toLocaleLowerCase('es').includes('masa')).flatMap(section => section.ingredients);
    const rows = dough.length ? dough.map(row => ({ ingredientId: row.ingredientId, quantity: row.quantity }))
      : recipe.sections.flatMap(section => section.ingredients).map(row => ({ ingredientId: row.ingredientId, quantity: row.quantity }));
    this.rows.set(rows.length ? rows : [{ ingredientId: '', quantity: null }]);
    const total = this.rows().reduce((sum, row) => {
      const ingredient = this.ingredients().find(item => item.id === row.ingredientId);
      const unit = ingredient?.unit.toLocaleLowerCase('es');
      const quantity = Number(row.quantity ?? 0);
      return sum + (unit === 'kg' ? quantity * 1000 : unit === 'g' || unit === 'ml' ? quantity : 0);
    }, 0);
    this.weight.set(total > 0 ? total : null);
    this.notes = '';
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    const name = this.name.trim();
    const weight = Number(this.weight());
    const ingredients = this.rows().filter(row => row.ingredientId && Number(row.quantity) > 0)
      .map(row => ({ ingredientId: row.ingredientId, quantity: Number(row.quantity) }));
    if (!name) { this.error.set('El nombre de la masa base es obligatorio.'); return; }
    if (!Number.isFinite(weight) || weight <= 0) { this.error.set('El peso total del lote debe ser mayor que cero.'); return; }
    if (!ingredients.length) { this.error.set('Agrega al menos un ingrediente con una cantidad mayor que cero.'); return; }
    if (this.rows().some(row => !row.ingredientId || !Number.isFinite(Number(row.quantity)) || Number(row.quantity) <= 0)) {
      this.error.set('Completa o elimina las filas de ingredientes incompletas.'); return;
    }
    this.saving.set(true); this.error.set('');
    try {
      const current = this.base();
      const id = current?.id ?? `base-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const record: DoughBaseRecord = { id, name, weight, ingredients, notes: this.notes.trim() || undefined, sortOrder: current?.sortOrder };
      await this.service.save(record);
      await this.router.navigate(['/recetas'], { queryParams: { vista: 'masas-base' } });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo guardar la masa base.');
    } finally { this.saving.set(false); }
  }
}