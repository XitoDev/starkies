import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Ingredient } from 'shared';
import { DataService } from '../../services/data.service';
import { DoughBaseRecord, DoughBaseService } from '../../services/dough-base.service';

@Component({
  selector: 'app-masas-base-list',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DecimalPipe, MatButtonModule, MatIconModule],
  template: `
    <section class="base-list">
      <button matButton="text" class="primary" type="button" (click)="create()">Nueva masa base</button>
      @if (notice()) { <p class="notice" role="status">{{ notice() }}</p> }
      @if (bases().length === 0) {
        <div class="empty">No hay masas base registradas. Crea una nueva o copia la masa de una receta existente.</div>
      } @else {
        <div class="grid">
          @for (base of bases(); track base.id) {
            <article class="card">
              <header class="card-header">
                <h2>{{ base.name || 'Masa base sin nombre' }}</h2>
                <button matButton="text" class="menu-trigger" type="button" [attr.aria-label]="'Opciones de ' + base.name" [attr.aria-expanded]="openMenuId() === base.id" (click)="openMenuId.set(openMenuId() === base.id ? null : base.id)">⋮</button>
                @if (openMenuId() === base.id) {
                  <div class="menu">
                    <button matButton="text" type="button" [disabled]="$index === 0" (click)="move(base, -1)">↑ <span>Subir</span></button>
                    <button matButton="text" type="button" [disabled]="$index === bases().length - 1" (click)="move(base, 1)">↓ <span>Bajar</span></button>
                    <button matButton="text" type="button" (click)="edit(base)">✎ <span>Editar</span></button>
                    <button matButton="text" type="button" class="danger" (click)="remove(base)">▤ <span>Eliminar</span></button>
                  </div>
                }
              </header>
              <p class="weight"><strong>{{ base.weight | number:'1.0-2' }} g</strong> de masa por lote</p>
              <section class="yield">
                <h3>Rendimiento de este lote</h3>
                <div class="yield-grid">
                  @for (portion of portions(); track portion) {
                    <div><span>Porciones de {{ portion }} g</span><strong>{{ yieldFor(base, portion).count }} {{ yieldFor(base, portion).count === 1 ? 'porción' : 'porciones' }}</strong><small>{{ yieldFor(base, portion).remainder > 0 ? ('Sobran ' + (yieldFor(base, portion).remainder | number:'1.0-2') + ' g') : 'Sin sobrante' }}</small></div>
                  }
                </div>
                <p class="yield-note">Calculado con masa cruda, sin relleno ni decoración. El peso final puede variar al hornear.</p>
              </section>
              <p class="meta">{{ recipeCount(base.id) }} {{ recipeCount(base.id) === 1 ? 'receta vinculada' : 'recetas vinculadas' }} · {{ cost(base) | currency:'USD' }} de ingredientes / lote</p>
              <ul class="ingredients">
                @for (row of base.ingredients; track $index) {
                  <li>{{ ingredientName(row.ingredientId) }} · {{ row.quantity | number:'1.0-2' }} {{ ingredientUnit(row.ingredientId) }}</li>
                }
              </ul>
              @if (base.notes) { <p class="notes">{{ base.notes }}</p> }
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0;color:#30263a}.base-list{display:grid;gap:28px}.primary{justify-self:start;min-height:55px;padding:0 22px;border:0;border-radius:10px;background:#8056ad;color:#fff;font-size:13px;font-weight:750;cursor:pointer}.primary:hover{background:#704795}
    .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;align-items:stretch}.card{position:relative;min-width:0;padding:26px 28px;border:1px solid #dfcbe9;border-radius:20px;background:#f7f0f9;box-sizing:border-box}.card-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;position:relative}.card-header h2{margin:0;color:#74518b;font-size:17px;font-weight:500;line-height:1.45}.menu-trigger{flex:0 0 28px;width:28px;height:30px;padding:0;border:0;background:transparent;color:#79558f;font-size:25px;line-height:1;cursor:pointer}.menu{position:absolute;right:0;top:36px;z-index:10;min-width:185px;padding:8px;border:1px solid #e5d6ed;border-radius:12px;background:#fff;box-shadow:0 14px 28px rgb(48 38 58 / 14%)}.menu button{display:flex;align-items:center;gap:12px;width:100%;padding:11px 10px;border:0;border-radius:7px;background:#fff;color:#765388;text-align:left;font-size:13px;cursor:pointer}.menu button:hover:not(:disabled){background:#f7f0fa}.menu button:disabled{opacity:.45;cursor:not-allowed}.menu button.danger{color:#a14c5a}
    .weight{margin:18px 0 24px;font-size:15px}.weight strong{font-weight:750}.yield{padding:20px 18px;border-radius:15px;background:#eee2f3;color:#765388}.yield h3{margin:0 0 18px;font-size:13px;font-weight:750}.yield-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.yield-grid>div{display:grid;gap:9px;min-width:0}.yield-grid span,.yield-grid small{color:#8b7199;font-size:12px;line-height:1.4}.yield-grid strong{color:#684578;font-size:23px;line-height:1.2}.yield-grid small{font-size:12px}.yield-note{margin:19px 0 0;color:#8b7199;font-size:12px;line-height:1.5}.meta{margin:24px 0 7px;color:#8b7199;font-size:13px;line-height:1.5}.ingredients{margin:0;padding-left:22px;color:#3c3343;font-size:14px;line-height:1.85}.notes{margin:12px 0 0;color:#8b7199;font-size:12px;white-space:pre-wrap}.empty{padding:28px;border:1px dashed #d9c6e5;border-radius:14px;color:#8b7199;font-size:13px}.notice{margin:0;color:#8056ad;font-size:12px}
    @media(max-width:1100px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:680px){.grid{grid-template-columns:minmax(0,1fr)}.card{padding:22px 18px}.yield-grid strong{font-size:20px}}
  `]
})
export class MasasBaseList {
  private readonly router = inject(Router);
  private readonly data = inject(DataService);
  private readonly service = inject(DoughBaseService);
  readonly openMenuId = signal<string | null>(null);
  readonly notice = signal('');
  readonly portions = signal([30, 60]);
  readonly bases = computed(() => this.service.list());
  readonly ingredientRows = computed(() => this.data.ingredients());

  create(): void { void this.router.navigate(['/recetas/masas-base/nueva']); }
  edit(base: DoughBaseRecord): void { this.openMenuId.set(null); void this.router.navigate(['/recetas/masas-base', base.id, 'editar']); }
  yieldFor(base: DoughBaseRecord, portion: number): { count: number; remainder: number } {
    const weight = Math.max(0, Number(base.weight) || 0);
    return { count: Math.floor(weight / portion), remainder: Math.round((weight % portion) * 100) / 100 };
  }
  ingredientName(id: string): string { return this.ingredientRows().find((item: Ingredient) => item.id === id)?.name ?? 'Insumo no encontrado'; }
  ingredientUnit(id: string): string { return this.ingredientRows().find((item: Ingredient) => item.id === id)?.unit ?? ''; }
  cost(base: DoughBaseRecord): number {
    return base.ingredients.reduce((sum, row) => {
      const ingredient = this.ingredientRows().find(item => item.id === row.ingredientId);
      return sum + (ingredient ? Number(row.quantity) * Number(ingredient.costPerUnit) : 0);
    }, 0);
  }
  recipeCount(id: string): number { return this.data.recipes().filter(recipe => recipe.baseId === id).length; }
  async move(base: DoughBaseRecord, direction: -1 | 1): Promise<void> {
    this.openMenuId.set(null); this.notice.set('');
    try { await this.service.move(base.id, direction); }
    catch (error) { this.notice.set(error instanceof Error ? error.message : 'No se pudo cambiar el orden.'); }
  }
  async remove(base: DoughBaseRecord): Promise<void> {
    this.openMenuId.set(null);
    if (!confirm(`¿Eliminar la masa base «${base.name}»? Esta acción no se puede deshacer.`)) return;
    this.notice.set('');
    try { await this.service.delete(base.id); }
    catch (error) { this.notice.set(error instanceof Error ? error.message : 'No se pudo eliminar la masa base.'); }
  }
}