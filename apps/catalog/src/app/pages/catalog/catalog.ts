import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { BoxPresentation, DeliveryZone, PackedBox, Product } from './catalog.models';
import { BOX_PRESENTATIONS, CATALOG_PRODUCTS, DELIVERY_ZONES } from './catalog.data';
interface OrderConfirmation { id: string; total: number; }
@Component({ selector: 'app-catalog', standalone: true, imports: [CommonModule, FormsModule, NgOptimizedImage], templateUrl: './catalog.html', styleUrls: ['./catalog.css'] })
export class Catalog {
  readonly presentations = BOX_PRESENTATIONS;
  readonly products = signal<Product[]>(CATALOG_PRODUCTS.map(product => ({ ...product })));
  readonly zones = DELIVERY_ZONES;
  readonly selectedPresentation = signal<BoxPresentation>(this.presentations[2]);
  readonly currentBoxItems = signal<{ [productId: string]: number }>({});
  readonly completedBoxes = signal<PackedBox[]>([]);
  readonly searchQuery = signal('');
  readonly showBoxChoiceModal = signal(false);
  readonly showOrderSheetModal = signal(false);
  readonly savingOrder = signal(false);
  readonly orderError = signal('');
  readonly orderSuccess = signal<OrderConfirmation | null>(null);
  orderForm = this.emptyOrderForm();
  readonly categories = computed(() => ['Galletas clásicas', 'Galletas NY']);
  readonly filteredProducts = computed(() => {
    const query = this.searchQuery().toLocaleLowerCase('es').trim();
    if (!query) return this.products();
    return this.products().filter(product => product.name.toLocaleLowerCase('es').includes(query) || product.description.toLocaleLowerCase('es').includes(query));
  });
  readonly currentClasicasCount = computed(() => {
    let count = 0;
    for (const [id, quantity] of Object.entries(this.currentBoxItems())) { const product = this.products().find(item => item.id === id); if (product && !product.isNy) count += quantity; }
    return count;
  });
  readonly currentNYCount = computed(() => {
    let count = 0;
    for (const [id, quantity] of Object.entries(this.currentBoxItems())) { const product = this.products().find(item => item.id === id); if (product && product.isNy) count += quantity; }
    return count;
  });
  readonly totalBoxRequired = computed(() => this.selectedPresentation().reqClasicas + this.selectedPresentation().reqNY);
  readonly totalBoxCurrent = computed(() => this.currentClasicasCount() + this.currentNYCount());
  readonly isBoxComplete = computed(() => {
    const presentation = this.selectedPresentation();
    return this.currentClasicasCount() === presentation.reqClasicas && this.currentNYCount() === presentation.reqNY;
  });
  readonly boxesTotalSum = computed(() => this.completedBoxes().reduce((total, box) => total + box.presentation.price, 0));
  readonly shippingFee = computed(() => this.orderForm.zone?.fee ?? 0);
  readonly grandTotal = computed(() => this.boxesTotalSum() + this.shippingFee());
  constructor() {
    const title = inject(Title), meta = inject(Meta);
    title.setTitle('Cajas de galletas artesanales en Guayaquil | StarKies');
    meta.updateTag({ name: 'description', content: 'Arma tu caja de galletas artesanales StarKies en Guayaquil. Elige sabores clásicos y New York, revisa los precios y solicita tu pedido en línea.' });
    meta.updateTag({ property: 'og:title', content: 'StarKies | Cajas de galletas artesanales' });
    meta.updateTag({ property: 'og:description', content: 'Combina tus sabores favoritos en cajas de galletas clásicas y New York. Pedidos en Guayaquil y sectores cercanos.' });
    meta.updateTag({ property: 'og:url', content: 'https://starkies.lat/' });
    meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
  }
  setTabSearch(value: string): void { this.searchQuery.set(value); }
  selectPresentation(presentation: BoxPresentation): void { this.selectedPresentation.set(presentation); this.currentBoxItems.set({}); }
  getQuantity(productId: string): number { return this.currentBoxItems()[productId] || 0; }
  changeQuantity(productId: string, delta: number): void {
    const product = this.products().find(item => item.id === productId);
    if (!product || !product.stock) return;
    const presentation = this.selectedPresentation();
    if (delta > 0 && ((!product.isNy && this.currentClasicasCount() >= presentation.reqClasicas) || (product.isNy && this.currentNYCount() >= presentation.reqNY))) return;
    const nextItems = { ...this.currentBoxItems() }, nextQuantity = (nextItems[productId] || 0) + delta;
    if (nextQuantity <= 0) delete nextItems[productId]; else nextItems[productId] = nextQuantity;
    this.currentBoxItems.set(nextItems);
  }
  finishBox(): void {
    if (!this.isBoxComplete()) return;
    this.completedBoxes.update(previous => [...previous, { presentation: this.selectedPresentation(), items: { ...this.currentBoxItems() } }]);
    this.currentBoxItems.set({}); this.showBoxChoiceModal.set(true); this.orderError.set(''); this.orderSuccess.set(null);
  }
  openOrderSheet(): void { this.showBoxChoiceModal.set(false); this.orderError.set(''); this.showOrderSheetModal.set(true); }
  closeOrderSheet(): void { if (this.savingOrder()) return; this.showOrderSheetModal.set(false); this.orderError.set(''); }
  getProductName(id: string): string { return this.products().find(product => product.id === id)?.name ?? 'Producto'; }
  getObjectKeys(object: Record<string, number>): string[] { return Object.keys(object); }
  today(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  async submitOrder(): Promise<void> {
    if (this.savingOrder()) return;
    if (!this.completedBoxes().length) { this.orderError.set('Agrega al menos una caja antes de confirmar tu pedido.'); return; }
    if (!this.orderForm.zone) { this.orderError.set('Selecciona el sector de entrega o retiro en tienda.'); return; }
    this.savingOrder.set(true); this.orderError.set('');
    const payload = {
      name: this.orderForm.name.trim(), phone: this.orderForm.phone.trim(), zoneId: this.orderForm.zone.id,
      address: this.orderForm.address.trim(), deliveryDate: this.orderForm.date, cookieName: this.orderForm.cookieName.trim(),
      notes: this.orderForm.notes.trim(), website: this.orderForm.website,
      boxes: this.completedBoxes().map(box => ({ presentationId: box.presentation.id, items: { ...box.items } })),
    };
    try {
      const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) { const record = this.asRecord(result); throw new Error(typeof record['message'] === 'string' ? record['message'] : 'No pudimos registrar tu pedido en este momento. Puedes terminarlo por WhatsApp.'); }
      const record = this.asRecord(result), orderId = typeof record['orderId'] === 'string' && record['orderId'] ? record['orderId'] : 'recibido';
      this.orderSuccess.set({ id: orderId, total: this.grandTotal() }); this.showOrderSheetModal.set(false); this.completedBoxes.set([]); this.currentBoxItems.set({}); this.orderForm = this.emptyOrderForm();
    } catch (error) {
      this.orderError.set(error instanceof Error ? error.message : 'No pudimos registrar tu pedido en este momento. Puedes terminarlo por WhatsApp.');
    } finally { this.savingOrder.set(false); }
  }
  getWhatsAppUrl(): string {
    const form = this.orderForm;
    let message = '*¡Hola StarKies! Quisiera realizar un pedido:*\n\n';
    message += '👤 *Cliente:* ' + form.name + '\n📞 *Teléfono:* ' + form.phone + '\n📍 *Sector:* ' + (form.zone?.name || 'Por definir') + '\n🏡 *Dirección:* ' + (form.address || 'Retiro en tienda') + '\n📅 *Fecha solicitada:* ' + form.date + '\n🏷️ *Nombre en la caja:* ' + (form.cookieName || form.name) + '\n';
    if (form.notes.trim()) message += '📝 *Notas:* ' + form.notes.trim() + '\n';
    message += '\n📦 *DETALLE DE CAJAS:*\n';
    this.completedBoxes().forEach((box, index) => { message += '\n*Caja ' + (index + 1) + ' (' + box.presentation.name + '):*\n'; for (const [id, quantity] of Object.entries(box.items)) message += '  • ' + quantity + 'x ' + this.getProductName(id) + '\n'; });
    message += '\n💰 *Total cajas:* $' + this.boxesTotalSum().toFixed(2) + '\n🛵 *Envío:* $' + this.shippingFee().toFixed(2) + '\n💵 *Total estimado:* $' + this.grandTotal().toFixed(2);
    return 'https://wa.me/593985313438?text=' + encodeURIComponent(message);
  }
  private emptyOrderForm() { return { name: '', phone: '', zone: null as DeliveryZone | null, address: '', date: this.today(), cookieName: '', notes: '', website: '' }; }
  private asRecord(value: unknown): Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
}
