import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { Component, computed, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { DataService } from '../../services/data.service';
import { FirebaseClientService } from '../../core/firebase/firebase-client.service';
import { Order, OrderItem, Recipe } from 'shared';

@Component({
  selector: 'app-pedido-ruta',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, FormsModule, RouterLink, MatButtonModule, MatIconModule, MatMenuModule],
  template: `
    @if (creating() || order()) {
      <section class="order-page">
        <header class="heading">
          <div class="heading-copy">
            <h1>{{ creating() ? 'Registrar pedido' : 'Pedido ' + displayOrderId(order()!.id) }}</h1>
            <p>{{ selectedCustomer()?.name || 'Selecciona un cliente' }} · {{ creating() ? 'Nuevo pedido' : 'Detalles y edición en una sola vista' }}</p>
            @if (!creating()) {
              <div class="status-inline">
                <span>Estado</span>
                <button matButton="outlined" class="status-trigger" type="button" [matMenuTriggerFor]="statusMenu" [disabled]="savingStatus()">
                  {{ statusLabel(status) }} <mat-icon fontSet="material-symbols-rounded" aria-hidden="true">expand_more</mat-icon>
                </button>
              </div>
            }
          </div>
          @if (!creating()) {
            <button matButton="outlined" class="secondary pdf-download" type="button" (click)="downloadPdf(order()!.id)" [disabled]="downloadingPdf()">
              <mat-icon fontSet="material-symbols-rounded" aria-hidden="true">download</mat-icon>
              {{ downloadingPdf() ? 'Preparando PDF…' : 'Descargar PDF' }}
            </button>
          }
        </header>
        <mat-menu #statusMenu="matMenu">
          @for (option of statusOptions; track option.value) { <button mat-menu-item type="button" (click)="changeStatus(option.value)">{{ option.label }}</button> }
        </mat-menu>
        @if (error()) { <p class="message error" role="alert">{{ error() }}</p> }
        @if (saved()) { <p class="message success" role="status">{{ creating() ? 'Pedido registrado.' : 'Cambios guardados correctamente.' }}</p> }

        <form (ngSubmit)="save()">
          <section class="editor-section">
            <div class="section-heading">
              <div><h2>Cliente</h2><p>Los datos predeterminados se toman de la ficha del cliente.</p></div>
              @if (selectedCustomer(); as customer) {
                <a matButton="outlined" class="secondary customer-details-link" [routerLink]="['/pedidos/clientes', customer.id]"><mat-icon fontSet="material-symbols-rounded" aria-hidden="true">person</mat-icon> Detalles del cliente</a>
              }
            </div>
            <label>Vincular con cliente
              <select [ngModel]="customerId()" (ngModelChange)="onCustomerChange($event)" name="customerId" required>
                <option value="">Selecciona un cliente</option>
                @if (!creating() && customerId() && !selectedCustomer()) { <option [value]="customerId()">Cliente desconocido · selecciona uno válido</option> }
                @for (customer of customers(); track customer.id) { <option [value]="customer.id">{{ customer.name }} · {{ customer.phone || 'Sin teléfono' }}</option> }
              </select>
            </label>
            @if (selectedCustomer(); as customer) {
              <div class="customer-summary">
                <div><span>Teléfono</span><strong>{{ customer.phone || 'Sin teléfono registrado' }}</strong></div>
                <div><span>Dirección predeterminada</span><strong>{{ customer.address || 'Todavía no tiene una dirección predeterminada' }}</strong></div>
              </div>
            } @else {
              <p class="hint">¿No encuentras al cliente?
                @if (creating()) {
                  <a routerLink="/pedidos/clientes/nuevo">Registrar cliente</a>
                } @else {
                  <a [routerLink]="['/pedidos/clientes/nuevo']" [queryParams]="{ orderId: order()!.id }">Registrar cliente</a>
                }
              </p>
            }
          </section>

          <section class="editor-section">
            <div class="section-heading">
              <div><h2>Productos</h2><p>La cantidad y el precio se guardan en este pedido.</p></div>
              <button matButton="outlined" class="secondary" type="button" (click)="addItem()" [disabled]="activeRecipes().length === 0"><mat-icon fontSet="material-symbols-rounded" aria-hidden="true">add</mat-icon> Agregar producto</button>
            </div>
            @if (items().length === 0) { <p class="hint">Agrega al menos un producto para registrar el pedido.</p> }
            @for (line of items(); track $index) {
              <div class="item-editor-row">
                <label>Producto
                  <select [ngModel]="line.recipeId" (ngModelChange)="updateItemRecipe($index, $event)" [name]="'recipe-' + $index" required>
                    <option value="">Selecciona un producto</option>
                    @for (recipe of recipesForLine(line); track recipe.id) { <option [value]="recipe.id">{{ recipe.name }}</option> }
                  </select>
                </label>
                <label>Cantidad<input type="number" min="1" step="1" [ngModel]="line.quantity" (ngModelChange)="updateItemQuantity($index, $event)" [name]="'quantity-' + $index" required></label>
                <label>Precio unitario<input type="number" min="0" step="0.01" [ngModel]="line.unitPrice" (ngModelChange)="updateItemPrice($index, $event)" [name]="'price-' + $index" required></label>
                <button matIconButton class="remove-item" type="button" (click)="removeItem($index)" [attr.aria-label]="'Quitar ' + (line.name || 'producto')"><mat-icon fontSet="material-symbols-rounded" aria-hidden="true">delete</mat-icon></button>
              </div>
            }
            <div class="order-totals">
              <div><span>Subtotal de productos</span><strong>{{ subtotal() | currency:'USD' }}</strong></div>
              <div><span>Envío</span><strong>{{ normalizedShippingFee() | currency:'USD' }}</strong></div>
              <div class="grand-total"><span>Total del pedido</span><strong>{{ totalWithShipping() | currency:'USD' }}</strong></div>
            </div>
          </section>

          <section class="editor-section">
            <div class="section-heading"><div><h2>Entrega</h2><p>La dirección de este pedido puede ser distinta de la dirección predeterminada del cliente.</p></div></div>
            <div class="form-grid">
              <label>Fecha de entrega<input type="date" [(ngModel)]="deliveryDate" name="deliveryDate"></label>
              <label>Modalidad<select [ngModel]="deliveryMethod" (ngModelChange)="onDeliveryMethodChange($event)" name="deliveryMethod"><option value="">Por confirmar</option><option value="Entrega a domicilio">Entrega a domicilio</option><option value="Retiro en tienda">Retiro en tienda</option></select></label>
              <label>Sector de entrega<input maxlength="120" [(ngModel)]="zone" name="zone" placeholder="Sector o zona"></label>
              <label>Horario de entrega<input maxlength="100" [(ngModel)]="deliveryTime" name="deliveryTime" placeholder="Horario acordado"></label>
              <label class="full-width">Dirección de entrega<textarea rows="2" maxlength="250" [(ngModel)]="deliveryAddress" name="deliveryAddress" placeholder="Se propone la dirección predeterminada del cliente; puedes cambiarla para este pedido"></textarea></label>
              <label>Costo de envío ($)<input type="number" min="0" step="0.01" [(ngModel)]="shippingFee" name="shippingFee"></label>
              <label class="full-width">Notas adicionales<textarea rows="3" maxlength="1000" [(ngModel)]="notes" name="notes" placeholder="Indicaciones para preparar o entregar el pedido"></textarea></label>
            </div>
          </section>

          <section class="editor-section payment-section">
            <div class="section-heading"><div><h2>Pago</h2><p>Registra si el pedido ya fue pagado.</p></div></div>
            <label class="paid-toggle"><input type="checkbox" [(ngModel)]="isPaid" name="isPaid"> Pago recibido</label>
            <label>Forma de pago<select [(ngModel)]="paymentMethod" name="paymentMethod" [disabled]="!isPaid"><option value="TRANSFER">Transferencia</option><option value="CASH">Efectivo</option></select></label>
          </section>

          <footer class="actions admin-sticky-actions">
            <a matButton="outlined" class="secondary" routerLink="/pedidos">Cancelar</a>
            <button matButton="elevated" class="primary" type="submit" [disabled]="saving() || loadingOrder()">{{ saving() ? 'Guardando…' : (creating() ? 'Registrar pedido' : 'Guardar cambios') }}</button>
          </footer>
        </form>
      </section>
    } @else if (loadingOrder()) {
      <section class="order-page"><h1>Cargando pedido…</h1><p>Estamos consultando los datos guardados.</p></section>
    } @else {
      <section class="order-page"><h1>No encontramos ese pedido</h1><p>Puede que se haya eliminado o que todavía no exista en Firebase.</p><a class="primary" routerLink="/pedidos">Volver a pedidos</a></section>
    }
  `,
  styles: [`
    :host{display:block;min-width:0;color:#30263a}.order-page{max-width:1040px;margin:0 auto;padding:clamp(20px,3vw,36px);border:1px solid #eee7f2;border-radius:18px;background:#fff}
    .heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:26px}.heading-copy{min-width:0}.heading h1{margin:0;font-size:29px;font-weight:500;letter-spacing:-1px}.heading p{margin:9px 0 0;color:#95899d;font-size:13px}
    .status-inline{display:flex;align-items:center;gap:10px;margin-top:15px;color:#95899d;font-size:12px}.status-trigger{display:inline-flex;align-items:center;gap:5px;min-height:34px;padding:0 10px;border:1px solid #e8e0ed;border-radius:9px;background:#fff;color:#6c5b79;font-size:12px}.status-trigger mat-icon{width:17px;height:17px;font-size:17px}
    .pdf-download{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}.pdf-download mat-icon{font-size:18px;width:18px;height:18px}
    form{display:grid;gap:18px}.editor-section{display:grid;gap:16px;padding:20px;border:1px solid #eee7f2;border-radius:13px;background:#fff}.section-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.section-heading h2{margin:0;color:#44354e;font-size:17px;font-weight:600}.section-heading p{margin:7px 0 0;color:#95899d;font-size:12px;line-height:1.55}
    label{display:grid;gap:8px;color:#8d76a0;font-size:12px}input,textarea,select{width:100%;box-sizing:border-box;min-height:42px;padding:11px 12px;border:1px solid #e5d9ed;border-radius:9px;color:#5b4d65;background:#fff;font:inherit;font-size:13px}textarea{resize:vertical}.customer-details-link{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}.customer-details-link mat-icon{width:18px;height:18px;font-size:18px}
    .customer-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.customer-summary>div{display:grid;gap:6px;padding:12px;border-radius:9px;background:#faf7fc}.customer-summary span{color:#9a88a4;font-size:11px}.customer-summary strong{color:#51435d;font-size:12px;font-weight:600;overflow-wrap:anywhere}.hint{margin:0;color:#95899d;font-size:12px}.hint a{color:#8056ad;font-weight:600}
    .item-editor-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(80px,.7fr) minmax(110px,.9fr) 38px;align-items:end;gap:12px;padding-bottom:14px;border-bottom:1px solid #f0eaf4}.remove-item{width:36px;height:36px;min-width:36px;border:1px solid #f0d6d9;border-radius:9px;color:#a44855}
    .order-totals{display:grid;gap:11px;margin-left:auto;width:min(100%,360px)}.order-totals>div{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#776584;font-size:12px}.order-totals .grand-total{padding-top:12px;border-top:1px solid #eee7f2;color:#30263a;font-size:14px}.grand-total strong{color:#8056ad;font-size:22px}
    .form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.full-width{grid-column:1/-1}.paid-toggle{display:flex;align-items:center;gap:10px}.paid-toggle input{width:18px;min-height:18px;height:18px;accent-color:#8056ad}.payment-section>label:not(.paid-toggle){max-width:380px}
    .actions{display:flex;justify-content:flex-end;align-items:center;flex-wrap:wrap;gap:10px;margin-top:4px}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 17px;border-radius:9px;text-decoration:none;font-size:12px;font-weight:700;cursor:pointer}.secondary{border:1px solid #e8e0ed;background:#fff;color:#65586d}.message{padding:12px;border-radius:9px;background:#f7f0fb;color:#704795;font-size:12px}.error{background:#fff0f0;color:#a44855}.success{background:#eff8f0;color:#39744b}
    @media(max-width:700px){.heading{flex-direction:column}.pdf-download{width:100%}.section-heading{flex-direction:column}.customer-details-link{width:100%}.customer-summary{grid-template-columns:1fr}.item-editor-row{grid-template-columns:minmax(0,1fr) minmax(80px,.7fr);align-items:end}.item-editor-row label:first-child{grid-column:1/-1}.remove-item{grid-column:2;justify-self:end}.form-grid{grid-template-columns:1fr}.full-width{grid-column:auto}.actions{align-items:stretch;flex-direction:column-reverse}.actions>*{width:100%;box-sizing:border-box}}
  `]
})
export class PedidoRuta implements OnDestroy {
  private readonly data = inject(DataService);
  private readonly firebase = inject(FirebaseClientService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private routeSubscription: Subscription | null = null;
  readonly orderId = signal(this.route.snapshot.paramMap.get('orderId') ?? 'nuevo');
  readonly creating = computed(() => this.orderId() === 'nuevo');
  readonly order = computed(() => this.data.orders().find(order => order.id === this.orderId()) ?? null);
  readonly customers = this.data.customers;
  readonly activeRecipes = computed(() => this.data.recipes().filter(recipe => recipe.archived !== true));
  readonly selectedCustomer = computed(() => this.customers().find(customer => customer.id === this.customerId()) ?? null);
  readonly customerId = signal('');
  readonly items = signal<{ recipeId: string; name: string; quantity: number; unitPrice: number }[]>([]);
  readonly error = signal('');
  readonly saved = signal(false);
  readonly saving = signal(false);
  readonly savingStatus = signal(false);
  readonly loadingOrder = signal(false);
  readonly downloadingPdf = signal(false);
  readonly statusOptions: { value: Order['status']; label: string }[] = [
    { value: 'PENDING', label: 'Pendiente' }, { value: 'PREPARING', label: 'En preparación' },
    { value: 'READY', label: 'Listo para entregar' }, { value: 'DELIVERED', label: 'Entregado' },
    { value: 'CANCELLED', label: 'Cancelado' },
  ];
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
    this.routeSubscription = this.route.paramMap.subscribe(params => {
      const id = params.get('orderId') ?? 'nuevo';
      this.orderId.set(id);
      this.error.set('');
      this.saved.set(false);
      if (id === 'nuevo') { this.resetForm(); return; }
      void this.loadOrder(id);
    });
    void this.data.loadCollections(['customers', 'recipes']).catch(error => {
      this.error.set(error instanceof Error ? error.message : 'No se pudieron cargar los clientes y productos.');
    });
  }

  ngOnDestroy(): void { this.routeSubscription?.unsubscribe(); }

  private async loadOrder(id: string): Promise<void> {
    this.loadingOrder.set(true);
    try {
      await this.data.loadOrderById(id);
      const item = this.data.orders().find(order => order.id === id);
      if (!item) { this.error.set('No encontramos ese pedido en Firebase.'); return; }
      this.initializeFromOrder(item);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo cargar el pedido.');
    } finally { this.loadingOrder.set(false); }
  }

  private resetForm(): void {
    this.customerId.set(''); this.items.set([]);
    this.deliveryDate = ''; this.deliveryMethod = ''; this.deliveryAddress = ''; this.deliveryTime = '';
    this.zone = ''; this.notes = ''; this.status = 'PENDING'; this.shippingFee = 0;
    this.isPaid = false; this.paymentMethod = 'TRANSFER'; this.saved.set(false); this.error.set('');
  }

  private initializeFromOrder(item: Order): void {
    this.customerId.set(item.customerId);
    this.items.set(item.items.map(line => ({ recipeId: line.recipeId, name: line.name ?? this.recipeName(line.recipeId), quantity: line.quantity, unitPrice: line.unitPrice })));
    this.deliveryDate = item.deliveryDate?.slice(0, 10) ?? '';
    this.deliveryMethod = item.deliveryMethod ?? '';
    const isPickup = this.deliveryMethod.toLocaleLowerCase('es').includes('retiro') || (item.zone ?? '').toLocaleLowerCase('es').includes('retiro');
    this.deliveryAddress = item.deliveryAddress ?? (isPickup ? '' : this.selectedCustomer()?.address ?? '');
    this.deliveryTime = item.deliveryTime ?? ''; this.zone = item.zone ?? ''; this.notes = item.notes ?? '';
    this.status = item.status; this.shippingFee = item.shippingFee ?? 0;
    this.isPaid = item.isPaid ?? false; this.paymentMethod = item.paymentMethod ?? 'TRANSFER';
  }

  recipesForLine(line: { recipeId: string }): Recipe[] {
    return this.data.recipes().filter(recipe => recipe.archived !== true || recipe.id === line.recipeId);
  }

  onCustomerChange(id: string): void {
    this.customerId.set(id);
    const customer = this.customers().find(item => item.id === id);
    const isPickup = this.deliveryMethod.toLocaleLowerCase('es').includes('retiro');
    this.deliveryAddress = isPickup ? '' : customer?.address ?? '';
    this.saved.set(false);
  }

  onDeliveryMethodChange(value: string): void {
    const wasPickup = this.deliveryMethod.toLocaleLowerCase('es').includes('retiro');
    this.deliveryMethod = value;
    const isPickup = value.toLocaleLowerCase('es').includes('retiro');
    if (isPickup) this.deliveryAddress = '';
    else if (wasPickup && !this.deliveryAddress.trim()) this.deliveryAddress = this.selectedCustomer()?.address ?? '';
    this.saved.set(false);
  }

  addItem(): void {
    const recipe = this.activeRecipes()[0];
    this.items.update(items => [...items, { recipeId: recipe?.id ?? '', name: recipe?.name ?? '', quantity: 1, unitPrice: Math.max(0, Number(recipe?.price ?? 0)) }]);
    this.saved.set(false);
  }

  updateItemRecipe(index: number, recipeId: string): void {
    const recipe = this.data.recipes().find(item => item.id === recipeId);
    this.items.update(items => items.map((line, i) => i === index ? { recipeId, name: recipe?.name ?? '', quantity: line.quantity, unitPrice: recipe ? Math.max(0, Number(recipe.price) || 0) : 0 } : line));
    this.saved.set(false);
  }

  updateItemQuantity(index: number, value: unknown): void {
    const quantity = Math.max(1, Math.floor(Number(value) || 1));
    this.items.update(items => items.map((line, i) => i === index ? { ...line, quantity } : line));
    this.saved.set(false);
  }

  updateItemPrice(index: number, value: unknown): void {
    const raw = Number(value);
    const unitPrice = Number.isFinite(raw) ? Math.max(0, Math.round(raw * 100) / 100) : 0;
    this.items.update(items => items.map((line, i) => i === index ? { ...line, unitPrice } : line));
    this.saved.set(false);
  }

  removeItem(index: number): void { this.items.update(items => items.filter((_line, i) => i !== index)); this.saved.set(false); }
  subtotal(): number { return this.items().reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.unitPrice) || 0), 0); }
  normalizedShippingFee(): number { const value = Number(this.shippingFee); return Number.isFinite(value) ? Math.max(0, Math.round(value * 100) / 100) : 0; }
  totalWithShipping(): number { return Math.round((this.subtotal() + this.normalizedShippingFee()) * 100) / 100; }
  displayOrderId(id: string): string { return id.replace(/-/g, '').slice(-6).toUpperCase(); }

  statusLabel(status: Order['status']): string {
    return status === 'PENDING' ? 'Pendiente' : status === 'PREPARING' ? 'En preparación' : status === 'READY' ? 'Listo para entregar' : status === 'DELIVERED' ? 'Entregado' : 'Cancelado';
  }

  recipeName(id: string): string { return this.data.recipes().find(recipe => recipe.id === id)?.name ?? 'Producto no disponible'; }

  async changeStatus(status: Order['status']): Promise<void> {
    const item = this.order();
    if (!item || item.status === status || this.savingStatus()) return;
    this.savingStatus.set(true); this.error.set(''); this.saved.set(false);
    try { await this.data.updateOrderStatus(item.id, status); this.status = status; this.saved.set(true); }
    catch (error) { this.error.set(error instanceof Error ? error.message : 'No se pudo cambiar el estado del pedido.'); }
    finally { this.savingStatus.set(false); }
  }

  async downloadPdf(orderId: string): Promise<void> {
    if (this.downloadingPdf()) return;
    this.downloadingPdf.set(true); this.error.set('');
    try {
      const user = this.firebase.auth.currentUser;
      if (!user) throw new Error('Tu sesión ha caducado. Inicia sesión nuevamente.');
      const idToken = await user.getIdToken();
      const response = await fetch('/api/admin-order-document?orderId=' + encodeURIComponent(orderId), { method: 'GET', headers: { Authorization: 'Bearer ' + idToken }, cache: 'no-store' });
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        const message = typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string' ? result.message : 'No se pudo descargar el PDF del pedido.';
        throw new Error(message);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl; anchor.download = 'pedido-' + orderId + '.pdf'; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'No se pudo descargar el PDF del pedido.'); }
    finally { this.downloadingPdf.set(false); }
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    const customer = this.selectedCustomer();
    if (!customer) { this.error.set('Selecciona un cliente válido para el pedido.'); return; }
    const currentItems = this.items();
    if (!currentItems.length) { this.error.set('Agrega al menos un producto al pedido.'); return; }
    if (currentItems.some(item => !item.recipeId || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1 || !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0)) {
      this.error.set('Revisa los productos, cantidades y precios del pedido.'); return;
    }
    if (!Number.isFinite(Number(this.shippingFee)) || Number(this.shippingFee) < 0) { this.error.set('Ingresa un costo de envío válido, igual o mayor que cero.'); return; }
    this.saving.set(true); this.error.set(''); this.saved.set(false);
    try {
      const changes = {
        customerId: customer.id,
        items: currentItems.map(item => ({ recipeId: item.recipeId, name: item.name || this.recipeName(item.recipeId), quantity: Number(item.quantity), unitPrice: Math.round(Number(item.unitPrice) * 100) / 100 } as OrderItem)),
        deliveryDate: this.deliveryDate, deliveryMethod: this.deliveryMethod.trim(), deliveryAddress: this.deliveryAddress.trim(),
        deliveryTime: this.deliveryTime.trim(), zone: this.zone.trim(), notes: this.notes.trim(), status: this.status,
        shippingFee: this.normalizedShippingFee(), isPaid: this.isPaid, paymentMethod: this.isPaid ? this.paymentMethod : undefined,
      };
      if (this.creating()) {
        const created = await this.data.createOrder(changes);
        await this.router.navigate(['/pedidos', created.id]);
      } else {
        await this.data.saveOrderDetails(this.orderId(), changes);
        this.saved.set(true);
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo guardar el pedido.');
    } finally { this.saving.set(false); }
  }
}