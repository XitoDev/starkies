import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DataService } from '../../services/data.service';
import { Order } from 'shared';

@Component({
  selector: 'app-pedido-ruta',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, FormsModule, RouterLink],
  template: `
    @if (order(); as item) {
      <section class="order-page">
        <p class="eyebrow">Starkies / Mi negocio / Pedidos</p>
        <header class="heading">
          <div><h1>{{ editing() ? 'Editar pedido' : 'Detalle del pedido' }}</h1><p>{{ customerName() }} · Pedido #{{ item.id }}</p></div>
          <a class="close" routerLink="/pedidos" aria-label="Volver a pedidos">×</a>
        </header>
        @if (error()) { <p class="message error">{{ error() }}</p> }
        @if (!editing()) {
          <div class="summary"><div><span>Cliente</span><strong>{{ customerName() }}</strong><small>{{ customer()?.phone || 'Sin teléfono' }}</small><small>{{ customer()?.address || 'Sin dirección registrada' }}</small></div><div><span>Entrega</span><strong>{{ item.deliveryDate ? (item.deliveryDate | date:'d MMM y') : 'Por confirmar' }}</strong><small>Sector: {{ item.zone || 'Por confirmar' }}</small><small>Estado: {{ statusLabel(item.status) }}</small></div></div>
          @if (item.notes) { <div class="notes"><span>Notas del pedido</span><p>{{ item.notes }}</p></div> }
          <section class="lines"><header><strong>Productos del pedido</strong><span>{{ item.items.length }} líneas</span></header>@for(line of item.items;track line.recipeId + '-' + $index){<div class="line"><div><strong>{{ line.name || recipeName(line.recipeId) }}</strong><small>{{ line.quantity }} × {{ line.unitPrice | currency:'USD' }}</small></div><b>{{ line.quantity * line.unitPrice | currency:'USD' }}</b></div>}<div class="total"><span>Total del pedido</span><strong>{{ item.total | currency:'USD' }}</strong></div></section>
          <footer class="actions"><a class="secondary" routerLink="/pedidos">Volver</a><a class="primary" [routerLink]="['/pedidos', item.id, 'editar']">Editar pedido</a><button class="danger" type="button" (click)="remove()">Eliminar pedido</button></footer>
        } @else {
          <form (ngSubmit)="save()">
            <label>Fecha de entrega<input type="date" [(ngModel)]="deliveryDate" name="deliveryDate"></label>
            <label>Sector de entrega<input maxlength="120" [(ngModel)]="zone" name="zone" placeholder="Ej. Kennedy, Norte o Retiro en tienda"></label>
            <label>Notas adicionales<textarea rows="4" maxlength="1000" [(ngModel)]="notes" name="notes"></textarea></label>
            <div class="readonly-total"><span>Total actual · los productos no se modifican desde este formulario</span><strong>{{ item.total | currency:'USD' }}</strong></div>
            <footer class="actions"><a class="secondary" [routerLink]="['/pedidos', item.id]">Cancelar</a><button class="primary" type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar pedido' }}</button></footer>
          </form>
        }
      </section>
    } @else {
      <section class="order-page"><h1>No encontramos ese pedido</h1><p>Puede que se haya eliminado o que todavía se estén cargando los datos.</p><a class="primary" routerLink="/pedidos">Volver a pedidos</a></section>
    }
  `,
  styles: [`
    :host{display:block;min-width:0;color:#30263a}.order-page{max-width:980px;margin:0 auto;padding:clamp(20px,3vw,36px);border:1px solid #eee7f2;border-radius:18px;background:#fff}
    .eyebrow{margin:0 0 14px;color:#8056ad;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase}.heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:26px}.heading h1{margin:0;font-size:29px;font-weight:500;letter-spacing:-1px}.heading p{margin:9px 0 0;color:#95899d;font-size:13px}.close{display:grid;place-items:center;width:38px;height:38px;border-radius:9px;background:#f6f0fa;color:#9d86b2;text-decoration:none;font-size:28px}
    .summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:20px}.summary>div{display:grid;align-content:start;gap:9px;padding:18px;border:1px solid #eee7f2;border-radius:12px;background:#fdfbfe}.summary span,.notes>span{color:#9a88a4;font-size:11px}.summary strong{font-size:15px}.summary small{color:#8f8298;font-size:12px;overflow-wrap:anywhere}
    .notes{padding:15px;margin-bottom:18px;border-radius:11px;background:#f7f0fb}.notes p{white-space:pre-wrap;font-size:13px;line-height:1.6}.lines{padding:18px;border:1px solid #eee7f2;border-radius:12px}.lines header{display:flex;justify-content:space-between;gap:10px;padding-bottom:13px;border-bottom:1px solid #f0eaf4}.lines header span{color:#95899d;font-size:11px}.line{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0;border-bottom:1px solid #f4eff6}.line>div{display:grid;gap:6px}.line strong{font-size:12px}.line small{color:#95899d;font-size:11px}.line b{font-size:12px;white-space:nowrap}.total,.readonly-total{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:17px}.total strong{color:#8056ad;font-size:22px}.readonly-total{padding:17px;border-radius:10px;background:#f4ebf8}.readonly-total span{font-size:12px;color:#776584}.readonly-total strong{font-size:20px}
    form{display:grid;gap:20px}label{display:grid;gap:8px;color:#8d76a0;font-size:12px}input,textarea{width:100%;box-sizing:border-box;padding:13px;border:1px solid #e5d9ed;border-radius:9px;color:#5b4d65;font:inherit;font-size:13px}textarea{resize:vertical}.actions{display:flex;justify-content:flex-end;align-items:center;flex-wrap:wrap;gap:10px;margin-top:22px}.primary,.secondary,.danger{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 17px;border:0;border-radius:9px;background:#8056ad;color:#fff;text-decoration:none;font-size:12px;font-weight:700;cursor:pointer}.secondary{border:1px solid #e8e0ed;background:#fff;color:#65586d}.danger{border:1px solid #f0d6d9;background:#fff5f5;color:#a44855}.message{padding:12px;border-radius:9px;background:#fff0f0;color:#a44855;font-size:12px}
    @media(max-width:600px){.summary{grid-template-columns:1fr}.actions{align-items:stretch;flex-direction:column}.actions>*{width:100%;box-sizing:border-box}}
  `]
})
export class PedidoRuta {
  private readonly data = inject(DataService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly orderId = signal(this.route.snapshot.paramMap.get('orderId') ?? '');
  readonly editing = signal(this.router.url.endsWith('/editar'));
  readonly order = computed(() => this.data.orders().find(order => order.id === this.orderId()) ?? null);
  readonly customer = computed(() => { const order = this.order(); return order ? this.data.customers().find(customer => customer.id === order.customerId) ?? null : null; });
  readonly customerName = computed(() => this.customer()?.name ?? 'Cliente desconocido');
  readonly error = signal('');
  readonly saving = signal(false);
  deliveryDate = '';
  zone = '';
  notes = '';

  constructor() {
    effect(() => {
      const item = this.order();
      if (!item) return;
      this.deliveryDate = item.deliveryDate?.slice(0, 10) ?? '';
      this.zone = item.zone ?? '';
      this.notes = item.notes ?? '';
    });
  }
  statusLabel(status: Order['status']): string { return status === 'PENDING' ? 'Pendiente' : status === 'DELIVERED' ? 'Entregado' : 'Cancelado'; }
  recipeName(id: string): string { return this.data.recipes().find(recipe => recipe.id === id)?.name ?? 'Producto no disponible'; }
  async save(): Promise<void> {
    if (!this.order() || this.saving()) return;
    this.saving.set(true); this.error.set('');
    try { await this.data.saveOrderDetails(this.orderId(), { deliveryDate: this.deliveryDate, zone: this.zone.trim(), notes: this.notes.trim() }); await this.router.navigate(['/pedidos', this.orderId()]); }
    catch (error) { this.error.set(error instanceof Error ? error.message : 'No se pudo guardar el pedido.'); }
    finally { this.saving.set(false); }
  }
  async remove(): Promise<void> {
    const item = this.order();
    if (!item || !window.confirm(`¿Eliminar el pedido #${item.id}? Esta acción no se puede deshacer.`)) return;
    try { await this.data.deleteOrder(item.id); await this.router.navigate(['/pedidos'], { queryParams: { eliminado: '1' } }); }
    catch (error) { this.error.set(error instanceof Error ? error.message : 'No se pudo eliminar el pedido.'); }
  }
}