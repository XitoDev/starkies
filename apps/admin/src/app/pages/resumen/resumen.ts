import { Component, computed, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-resumen',
  standalone: true,
  imports: [CommonModule, DecimalPipe, RouterLink, MatIconModule],
  template: `
    <div class="page-container summary-page">
      <div class="page-heading">
        <div><p class="eyebrow">Mi negocio / Inicio</p><h1 class="page-title">Resumen</h1><p class="page-subtitle">Una vista rápida de recetas, insumos, inventario y pedidos.</p></div>
      </div>
      @if (data.loading()) { <p class="summary-muted">Cargando los datos del negocio…</p> }
      @if (data.error()) { <div class="notice" role="alert">{{ data.error() }}</div> }
      <section class="summary-grid" aria-label="Indicadores del negocio">
        <a class="summary-card" routerLink="/recetas"><span class="summary-icon"><mat-icon fontSet="material-symbols-rounded">cookie</mat-icon></span><span class="summary-label">Recetas activas</span><strong>{{ activeRecipes() }}</strong><small>Fórmulas y precios de venta</small></a>
        <a class="summary-card" routerLink="/ingredientes"><span class="summary-icon"><mat-icon fontSet="material-symbols-rounded">science</mat-icon></span><span class="summary-label">Insumos</span><strong>{{ data.ingredients().length }}</strong><small>Costos de compra por tipo</small></a>
        <a class="summary-card" routerLink="/inventario"><span class="summary-icon"><mat-icon fontSet="material-symbols-rounded">inventory_2</mat-icon></span><span class="summary-label">Insumos por reponer</span><strong>{{ lowStockCount() }}</strong><small>Existencias en o por debajo del mínimo</small></a>
        <a class="summary-card" routerLink="/pedidos"><span class="summary-icon"><mat-icon fontSet="material-symbols-rounded">shopping_bag</mat-icon></span><span class="summary-label">Pedidos pendientes</span><strong>{{ pendingOrders() }}</strong><small>Pedidos por gestionar</small></a>
      </section>
      <section class="summary-section">
        <div class="section-heading"><div><h2>Insumos que necesitan atención</h2><p>Revisa las existencias y registra una compra cuando sea necesario.</p></div><a routerLink="/inventario">Ver compras e inventario <mat-icon fontSet="material-symbols-rounded">arrow_forward</mat-icon></a></div>
        @if (lowStockItems().length) {
          <div class="summary-list">
            @for (item of lowStockItems(); track item.id) {
              <div class="summary-list-row"><div><strong>{{ item.name }}</strong><small>{{ item.supplyGroup || 'Otros' }}</small></div><span>{{ item.stock | number:'1.0-3' }} {{ item.unit }} disponibles</span><a routerLink="/finanzas" [queryParams]="{ action: 'purchase', ingredientId: item.id }" aria-label="Registrar compra de {{ item.name }}"><mat-icon fontSet="material-symbols-rounded">shopping_cart</mat-icon></a></div>
            }
          </div>
        } @else { <p class="summary-empty">No hay insumos por debajo del stock mínimo registrado.</p> }
      </section>
      <section class="summary-shortcuts">
        <a routerLink="/recetas"><mat-icon fontSet="material-symbols-rounded">menu_book</mat-icon><span><strong>Administrar recetas</strong><small>Las recetas conservan su precio de venta.</small></span><mat-icon fontSet="material-symbols-rounded">chevron_right</mat-icon></a>
        <a routerLink="/finanzas" [queryParams]="{ action: 'purchase' }"><mat-icon fontSet="material-symbols-rounded">add_shopping_cart</mat-icon><span><strong>Registrar una compra</strong><small>Actualiza el costo de compra y las existencias.</small></span><mat-icon fontSet="material-symbols-rounded">chevron_right</mat-icon></a>
        <a routerLink="/produccion"><mat-icon fontSet="material-symbols-rounded">precision_manufacturing</mat-icon><span><strong>Registrar producción</strong><small>Descuenta las cantidades usadas de inventario.</small></span><mat-icon fontSet="material-symbols-rounded">chevron_right</mat-icon></a>
      </section>
    </div>
  `,
  styles: [`
    .summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin:24px 0}
    .summary-card{display:flex;flex-direction:column;gap:8px;padding:20px;border:1px solid #e8e2ed;border-radius:16px;background:#fff;color:inherit;text-decoration:none;min-width:0}
    .summary-card:hover,.summary-shortcuts a:hover{border-color:#cdb9dc;background:#fcfaff}
    .summary-icon{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:12px;background:#f2edf7;color:#79569b}
    .summary-label{font-size:13px;color:#706878}.summary-card strong{font-size:30px;line-height:1.1;font-weight:650}.summary-card small,.summary-muted,.summary-section p,.summary-list-row small,.summary-shortcuts small{font-size:12px;color:#827a89}
    .summary-section{border:1px solid #e8e2ed;border-radius:16px;padding:22px;background:#fff;margin-bottom:20px}
    .section-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:16px}.section-heading h2{font-size:18px;margin:0 0 6px}.section-heading p{margin:0}.section-heading a{display:flex;align-items:center;gap:6px;color:#765196;text-decoration:none;font-size:13px;white-space:nowrap}
    .summary-list-row{display:grid;grid-template-columns:minmax(0,1fr) auto 38px;gap:12px;align-items:center;padding:13px 0;border-top:1px solid #f0edf3}.summary-list-row>div{display:flex;flex-direction:column;gap:4px}.summary-list-row>span{font-size:13px;color:#645b6d}.summary-list-row a{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;color:#79569b;background:#f5f0f8}
    .summary-empty{padding:16px 0}.summary-shortcuts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.summary-shortcuts a{display:flex;align-items:center;gap:12px;padding:16px;border:1px solid #e8e2ed;border-radius:14px;background:#fff;color:inherit;text-decoration:none}.summary-shortcuts a>mat-icon:first-child{color:#79569b}.summary-shortcuts a>mat-icon:last-child{margin-left:auto}.summary-shortcuts span{display:flex;flex-direction:column;gap:5px}.summary-shortcuts strong{font-size:13px}
    @media(max-width:900px){.summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.summary-shortcuts{grid-template-columns:1fr}}
    @media(max-width:560px){.summary-card{padding:14px}.summary-section{padding:16px}.section-heading{align-items:flex-start;flex-direction:column}.summary-list-row{grid-template-columns:minmax(0,1fr) auto 34px}.summary-list-row>span{font-size:11px}}
  `]
})
export class Resumen {
  readonly data = inject(DataService);
  readonly activeRecipes = computed(() => this.data.recipes().filter(recipe => !recipe.archived).length);
  readonly pendingOrders = computed(() => this.data.orders().filter(order => order.status === 'PENDING').length);
  readonly lowStockItems = computed(() => this.data.ingredients().filter(item => item.stock <= (item.minStock ?? 0)).sort((a, b) => a.stock - b.stock).slice(0, 8));
  readonly lowStockCount = computed(() => this.data.ingredients().filter(item => item.stock <= (item.minStock ?? 0)).length);
}
