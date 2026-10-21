import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DataService } from '../../services/data.service';
import { FirebaseClientService } from '../../core/firebase/firebase-client.service';
import { Order } from 'shared';

@Component({
  selector: 'app-pedido-ruta',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, FormsModule, RouterLink, MatButtonModule, MatIconModule],
  template: `
    @if (order(); as item) {
      <section class="order-page">
        <header class="heading">
          <div><h1>{{ editing() ? 'Editar pedido' : 'Detalle del pedido' }}</h1><p>{{ customerName() }} · Pedido #{{ item.id }}</p></div>
          @if (!editing()) { <button matButton="outlined" class="secondary pdf-download" type="button" (click)="downloadPdf(item.id)" [disabled]="downloadingPdf()"><mat-icon fontSet="material-symbols-rounded" aria-hidden="true">download</mat-icon>{{ downloadingPdf() ? 'Preparando PDF…' : 'Descargar PDF' }}</button> }
        </header>
        @if (error()) { <p class="message error">{{ error() }}</p> }
        @if (!editing()) {
          <div class="summary"><div><span>Cliente</span><strong>{{ customerName() }}</strong><small>{{ customer()?.phone || 'Sin teléfono' }}</small><small>{{ customer()?.address || 'Sin dirección registrada' }}</small></div><div><span>Entrega</span><strong>{{ item.deliveryDate ? (item.deliveryDate | date:'d MMM y') : 'Por confirmar' }}</strong><small>Modalidad: {{ item.deliveryMethod || 'Según catálogo / por confirmar' }}</small><small>Sector: {{ item.zone || 'Por confirmar' }}</small><small>Dirección de entrega: {{ item.deliveryAddress || customer()?.address || 'Por confirmar' }}</small><small>Horario: {{ item.deliveryTime || 'Por confirmar' }}</small><small>Estado: {{ statusLabel(item.status) }}</small><small>Envío: {{ (item.shippingFee ?? 0) | currency:'USD' }}</small><small>Pago: {{ item.isPaid ? 'Pagado' : 'Pendiente de pago' }}@if (item.isPaid && item.paymentMethod) { · {{ paymentMethodLabel(item.paymentMethod) }}}</small></div></div>
          @if (item.notes) { <div class="notes"><span>Notas del pedido</span><p>{{ item.notes }}</p></div> }
          <section class="lines"><header><strong>Productos del pedido</strong><span>{{ item.items.length }} líneas</span></header>@for(line of item.items;track line.recipeId + '-' + $index){<div class="line">@if (recipeImage(line.recipeId); as image) { <img class="cookie-image" [src]="image" [alt]="line.name || recipeName(line.recipeId)" loading="lazy"> } @else { <span class="cookie-placeholder" aria-hidden="true"><mat-icon fontSet="material-symbols-rounded">cookie</mat-icon></span> }<div><strong>{{ line.name || recipeName(line.recipeId) }}</strong><small>{{ line.quantity }} × {{ line.unitPrice | currency:'USD' }}</small></div><b>{{ line.quantity * line.unitPrice | currency:'USD' }}</b></div>}<div class="total-row"><span>Subtotal de galletas</span><strong>{{ subtotal(item) | currency:'USD' }}</strong></div><div class="total-row"><span>Envío</span><strong>{{ (item.shippingFee ?? 0) | currency:'USD' }}</strong></div><div class="total"><span>Total del pedido</span><strong>{{ totalWithShipping(item) | currency:'USD' }}</strong></div></section>
          <footer class="actions"><a matButton="outlined" class="secondary" routerLink="/pedidos">Volver</a><button matButton="outlined" class="danger" type="button" (click)="remove()">Eliminar pedido</button><a matButton="elevated" class="primary" [routerLink]="['/pedidos', item.id, 'editar']">Editar pedido</a></footer>
        } @else {
          <form (ngSubmit)="save()">
            <label>Estado del pedido<select [(ngModel)]="status" name="status"><option value="PENDING">Pendiente</option><option value="PREPARING">En preparación</option><option value="READY">Listo</option><option value="DELIVERED">Entregado</option><option value="CANCELLED">Cancelado</option></select></label>
            <label>Fecha de entrega<input type="date" [(ngModel)]="deliveryDate" name="deliveryDate"></label>
            <label>Modalidad según catálogo<input maxlength="100" [(ngModel)]="deliveryMethod" name="deliveryMethod" placeholder="Ej. Entrega a domicilio o retiro"></label>
            <label>Dirección de entrega<input maxlength="250" [(ngModel)]="deliveryAddress" name="deliveryAddress" placeholder="Dirección registrada en el catálogo"></label>
            <label>Horario de entrega<input maxlength="100" [(ngModel)]="deliveryTime" name="deliveryTime" placeholder="Horario solicitado en el catálogo"></label>
            <label>Sector de entrega<input maxlength="120" [(ngModel)]="zone" name="zone" placeholder="Sector de entrega"></label>
            <label>Costo de envío ($)<input type="number" min="0" step="0.01" [(ngModel)]="shippingFee" name="shippingFee"></label>
            <label class="paid-toggle"><input type="checkbox" [(ngModel)]="isPaid" name="isPaid"> Pedido pagado</label>
            <label>Forma de pago<select [(ngModel)]="paymentMethod" name="paymentMethod" [disabled]="!isPaid"><option value="TRANSFER">Transferencia</option><option value="CASH">Efectivo</option></select></label>
            <label>Notas adicionales<textarea rows="4" maxlength="1000" [(ngModel)]="notes" name="notes"></textarea></label>
            <div class="readonly-total"><span>Total con envío · los productos se conservan del catálogo</span><strong>{{ totalWithShipping(item) | currency:'USD' }}</strong></div>
            <footer class="actions"><a matButton="outlined" class="secondary" [routerLink]="['/pedidos', item.id]">Cancelar</a><button matButton="elevated" class="primary" type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar pedido' }}</button></footer>
          </form>
        }
      </section>
    } @else {
      <section class="order-page"><h1>No encontramos ese pedido</h1><p>Puede que se haya eliminado o que todavía se estén cargando los datos.</p><a class="primary" routerLink="/pedidos">Volver a pedidos</a></section>
    }
  `,
  styles: [`
    :host{display:block;min-width:0;color:#30263a}.order-page{max-width:980px;margin:0 auto;padding:clamp(20px,3vw,36px);border:1px solid #eee7f2;border-radius:18px;background:#fff}
    .heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:26px}.pdf-download{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}.pdf-download mat-icon{font-size:18px;width:18px;height:18px}.heading h1{margin:0;font-size:29px;font-weight:500;letter-spacing:-1px}.heading p{margin:9px 0 0;color:#95899d;font-size:13px}
    .summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:20px}.summary>div{display:grid;align-content:start;gap:9px;padding:18px;border:1px solid #eee7f2;border-radius:12px;background:#fdfbfe}.summary span,.notes>span{color:#9a88a4;font-size:11px}.summary strong{font-size:15px}.summary small{color:#8f8298;font-size:12px;overflow-wrap:anywhere}
    .notes{padding:15px;margin-bottom:18px;border-radius:11px;background:#f7f0fb}.notes p{white-space:pre-wrap;font-size:13px;line-height:1.6}.lines{padding:18px;border:1px solid #eee7f2;border-radius:12px}.lines header{display:flex;justify-content:space-between;gap:10px;padding-bottom:13px;border-bottom:1px solid #f0eaf4}.lines header span{color:#95899d;font-size:11px}.line{display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid #f4eff6}.line>div{display:grid;gap:6px;flex:1;min-width:0}.line strong{font-size:12px}.line small{color:#95899d;font-size:11px}.line b{font-size:12px;white-space:nowrap}.cookie-image,.cookie-placeholder{width:58px;height:58px;flex:0 0 58px;object-fit:contain;border-radius:10px;background:#fff}.cookie-placeholder{display:grid;place-items:center;color:#95899d}.total-row,.total,.readonly-total{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:12px}.total-row{color:#776584;font-size:12px}.total strong{color:#8056ad;font-size:22px}.readonly-total{padding:17px;border-radius:10px;background:#f4ebf8}.readonly-total span{font-size:12px;color:#776584}.readonly-total strong{font-size:20px}
    form{display:grid;gap:20px}label{display:grid;gap:8px;color:#8d76a0;font-size:12px}input,textarea,select{width:100%;box-sizing:border-box;padding:13px;border:1px solid #e5d9ed;border-radius:9px;color:#5b4d65;background:#fff;font:inherit;font-size:13px}textarea{resize:vertical}label.paid-toggle{display:flex;align-items:center;gap:10px}label.paid-toggle input{width:18px;height:18px;accent-color:#8056ad}.actions{display:flex;justify-content:flex-end;align-items:center;flex-wrap:wrap;gap:10px;margin-top:22px}.primary,.secondary,.danger{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 17px;border-radius:9px;text-decoration:none;font-size:12px;font-weight:700;cursor:pointer}.secondary{border:1px solid #e8e0ed;background:#fff;color:#65586d}.danger{border:1px solid #f0d6d9;background:#fff;color:#a44855}.message{padding:12px;border-radius:9px;background:#fff0f0;color:#a44855;font-size:12px}
    @media(max-width:600px){.heading{flex-direction:column}.pdf-download{width:100%}.summary{grid-template-columns:1fr}.actions{align-items:stretch;flex-direction:column}.actions>*{width:100%;box-sizing:border-box}}
  `]
})
export class PedidoRuta {
  private readonly data = inject(DataService);
  private readonly firebase = inject(FirebaseClientService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly orderId = signal(this.route.snapshot.paramMap.get('orderId') ?? '');
  readonly editing = signal(this.router.url.endsWith('/editar'));
  readonly order = computed(() => this.data.orders().find(order => order.id === this.orderId()) ?? null);
  readonly customer = computed(() => { const order = this.order(); return order ? this.data.customers().find(customer => customer.id === order.customerId) ?? null : null; });
  readonly customerName = computed(() => this.customer()?.name ?? 'Cliente desconocido');
  readonly error = signal('');
  readonly saving = signal(false);
  readonly downloadingPdf = signal(false);
  deliveryDate = '';
  deliveryMethod = '';
  deliveryAddress = '';
  deliveryTime = '';
  zone = '';
  notes = '';
  status: Order['status'] = 'PENDING';
  shippingFee = 0;
  isPaid = false;
  paymentMethod: NonNullable<Order['paymentMethod']> = 'TRANSFER';

  constructor() {
    effect(() => {
      const item = this.order();
      if (!item) return;
      this.deliveryDate = item.deliveryDate?.slice(0, 10) ?? '';
      this.deliveryMethod = item.deliveryMethod ?? '';
      this.deliveryAddress = item.deliveryAddress ?? this.customer()?.address ?? '';
      this.deliveryTime = item.deliveryTime ?? '';
      this.zone = item.zone ?? '';
      this.notes = item.notes ?? '';
      this.status = item.status;
      this.shippingFee = item.shippingFee ?? 0;
      this.isPaid = item.isPaid ?? false;
      this.paymentMethod = item.paymentMethod ?? 'TRANSFER';
    });
  }
  statusLabel(status: Order['status']): string {
    return status === 'PENDING' ? 'Pendiente' : status === 'PREPARING' ? 'En preparación' : status === 'READY' ? 'Listo' : status === 'DELIVERED' ? 'Entregado' : 'Cancelado';
  }
  paymentMethodLabel(method: NonNullable<Order['paymentMethod']>): string { return method === 'TRANSFER' ? 'Transferencia' : 'Efectivo'; }
  recipeImage(id: string): string { return this.data.recipes().find(recipe => recipe.id === id)?.image ?? ''; }
  subtotal(item: Order): number { return Math.max(0, item.total - Math.max(0, Number(item.shippingFee ?? 0) || 0)); }
  totalWithShipping(item: Order): number { return this.subtotal(item) + Math.max(0, Number(this.editing() ? this.shippingFee : item.shippingFee ?? 0) || 0); }
  recipeName(id: string): string { return this.data.recipes().find(recipe => recipe.id === id)?.name ?? 'Producto no disponible'; }
  async downloadPdf(orderId: string): Promise<void> {
    if (this.downloadingPdf()) return;
    this.downloadingPdf.set(true);
    this.error.set('');
    try {
      const user = this.firebase.auth.currentUser;
      if (!user) throw new Error('Tu sesión ha caducado. Inicia sesión nuevamente.');
      const idToken = await user.getIdToken();
      const response = await fetch('/api/admin-order-document?orderId=' + encodeURIComponent(orderId), {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + idToken },
        cache: 'no-store',
      });
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        const message = typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string'
          ? result.message
          : 'No se pudo descargar el PDF del pedido.';
        throw new Error(message);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = 'pedido-' + orderId + '.pdf';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo descargar el PDF del pedido.');
    } finally {
      this.downloadingPdf.set(false);
    }
  }
  async save(): Promise<void> {
    const item = this.order();
    if (!item || this.saving()) return;
    const fee = Number(this.shippingFee);
    if (!Number.isFinite(fee) || fee < 0) { this.error.set('Ingresa un costo de envío válido, igual o mayor que cero.'); return; }
    if (this.isPaid && !this.paymentMethod) { this.error.set('Selecciona la forma de pago del pedido.'); return; }
    this.saving.set(true); this.error.set('');
    try {
      await this.data.saveOrderDetails(this.orderId(), {
        deliveryDate: this.deliveryDate,
        deliveryMethod: this.deliveryMethod.trim(),
        deliveryAddress: this.deliveryAddress.trim(),
        deliveryTime: this.deliveryTime.trim(),
        zone: this.zone.trim(),
        notes: this.notes.trim(),
        status: this.status,
        shippingFee: Math.round(fee * 100) / 100,
        isPaid: this.isPaid,
        paymentMethod: this.isPaid ? this.paymentMethod : undefined,
      });
      await this.router.navigate(['/pedidos', this.orderId()]);
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'No se pudo guardar el pedido.'); }
    finally { this.saving.set(false); }
  }
  async remove(): Promise<void> {
    const item = this.order();
    if (!item || !window.confirm(`¿Eliminar el pedido #${item.id}? Esta acción no se puede deshacer.`)) return;
    try { await this.data.deleteOrder(item.id); await this.router.navigate(['/pedidos'], { queryParams: { eliminado: '1' } }); }
    catch (error) { this.error.set(error instanceof Error ? error.message : 'No se pudo eliminar el pedido.'); }
  }
}
