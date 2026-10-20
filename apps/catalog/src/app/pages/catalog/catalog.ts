import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { BoxPresentation, DeliveryZone, PackedBox, Product } from './catalog.models';
import { BOX_PRESENTATIONS } from './catalog.data';
interface OrderConfirmation { id: string; total: number; documentUrl: string; whatsappUrl: string; }
@Component({ selector: 'app-catalog', standalone: true, imports: [CommonModule, FormsModule, NgOptimizedImage, MatButtonModule, MatIconModule], templateUrl: './catalog.html', styleUrls: ['./catalog.css'] })
export class Catalog {
  readonly presentations = BOX_PRESENTATIONS;
  readonly products = signal<Product[]>([]);
  zones: DeliveryZone[] = [];
  readonly catalogLoading = signal(true);
  readonly catalogLoadError = signal('');
  readonly selectedPresentation = signal<BoxPresentation>(this.presentations[2]);
  readonly currentBoxItems = signal<{ [productId: string]: number }>({});
  readonly completedBoxes = signal<PackedBox[]>([]);
  readonly searchQuery = signal('');
  readonly showBoxChoiceModal = signal(false);
  readonly showOrderSheetModal = signal(false);
  readonly isOrderSheetClosing = signal(false);
  readonly savingOrder = signal(false);
  readonly orderError = signal('');
  readonly orderSuccess = signal<OrderConfirmation | null>(null);
  readonly customerLookupMessage = signal('');
  readonly lookingUpCustomer = signal(false);
  readonly editingBoxIndex = signal<number | null>(null);
  readonly wantsCookieName = signal(false);
  readonly selectedDeliveryZone = signal<DeliveryZone | null>(null);
  readonly fulfillmentMode = signal<'delivery' | 'pickup'>('delivery');
  orderForm = this.emptyOrderForm();
  readonly categories = computed(() => {
    const presentation = this.selectedPresentation();
    const visible: string[] = [];
    if (presentation.reqClasicas > 0) visible.push('Galletas clásicas');
    if (presentation.reqNY > 0) visible.push('Galletas NY');
    return visible;
  });
  readonly filteredProducts = computed(() => {
    const query = this.searchQuery().toLocaleLowerCase('es').trim();
    const presentation = this.selectedPresentation();
    const availableProducts = this.products().filter(product =>
      product.stock && (product.isNy ? presentation.reqNY > 0 : presentation.reqClasicas > 0),
    );
    if (!query) return availableProducts;
    return availableProducts.filter(product =>
      product.name.toLocaleLowerCase('es').includes(query)
      || product.description.toLocaleLowerCase('es').includes(query),
    );
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
  readonly shippingFee = computed(() => this.selectedDeliveryZone()?.fee ?? 0);
  readonly grandTotal = computed(() => this.boxesTotalSum() + this.shippingFee());
  readonly hasUnavailableBox = computed(() => this.completedBoxes().some(box => this.boxHasUnavailableItems(box)));
  constructor() {
    const title = inject(Title), meta = inject(Meta);
    title.setTitle('Cajas de galletas artesanales en Guayaquil | StarKies');
    meta.updateTag({ name: 'description', content: 'Arma tu caja de galletas artesanales StarKies en Guayaquil. Elige sabores clásicos y New York, revisa los precios y solicita tu pedido en línea.' });
    meta.updateTag({ property: 'og:title', content: 'StarKies | Cajas de galletas artesanales' });
    meta.updateTag({ property: 'og:description', content: 'Combina tus sabores favoritos en cajas de galletas clásicas y New York. Pedidos en Guayaquil y sectores cercanos.' });
    meta.updateTag({ property: 'og:url', content: 'https://starkies.lat/' });
    meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    void this.loadCatalog();
  }
  private async loadCatalog(): Promise<void> {
    this.catalogLoading.set(true);
    this.catalogLoadError.set('');
    try {
      const response = await fetch('/api/catalog', { headers: { Accept: 'application/json' } });
      const result: unknown = await response.json().catch(() => null);
      const record = this.asRecord(result);
      if (!response.ok) throw new Error(typeof record['message'] === 'string' ? record['message'] : 'No pudimos cargar el catálogo.');
      if (!Array.isArray(record['products']) || !Array.isArray(record['zones'])) {
        throw new Error('La respuesta del catálogo no tiene un formato válido.');
      }
      const products = record['products'].filter((value): value is Product => {
        const item = this.asRecord(value);
        return typeof item['id'] === 'string' && typeof item['name'] === 'string'
          && typeof item['price'] === 'number' && typeof item['isNy'] === 'boolean';
      });
      const zones = record['zones'].filter((value): value is DeliveryZone => {
        const item = this.asRecord(value);
        return typeof item['id'] === 'string' && typeof item['name'] === 'string' && typeof item['fee'] === 'number';
      });
      if (!products.length || !zones.length) throw new Error('Todavía no hay productos o tarifas publicables en el negocio.');
      this.products.set(products);
      this.zones = zones;
      if (this.fulfillmentMode() === 'pickup') this.setFulfillmentMode('pickup');
    } catch (error) {
      this.catalogLoadError.set(error instanceof Error ? error.message : 'No pudimos cargar el catálogo.');
    } finally {
      this.catalogLoading.set(false);
    }
  }
  setTabSearch(value: string): void { this.searchQuery.set(value); }
  selectPresentation(presentation: BoxPresentation): void { this.selectedPresentation.set(presentation); this.currentBoxItems.set({}); }
  setDeliveryZone(zone: DeliveryZone | null): void {
    this.orderForm.zone = zone;
    this.selectedDeliveryZone.set(zone);
    if (zone && this.isPickupZone(zone)) this.fulfillmentMode.set('pickup');
    else if (zone) this.fulfillmentMode.set('delivery');
  }
  setFulfillmentMode(mode: 'delivery' | 'pickup'): void {
    this.fulfillmentMode.set(mode);
    if (mode === 'pickup') {
      const pickupZone = this.zones.find(zone => this.isPickupZone(zone)) ?? null;
      this.setDeliveryZone(pickupZone);
      this.orderForm.address = '';
      return;
    }
    const deliveryZone = this.orderForm.zone && !this.isPickupZone(this.orderForm.zone)
      ? this.orderForm.zone
      : null;
    this.setDeliveryZone(deliveryZone);
  }
  isPickupZone(zone: DeliveryZone | null | undefined): boolean {
    return (zone?.name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').includes('retiro');
  }
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
    const box = { presentation: this.selectedPresentation(), items: { ...this.currentBoxItems() } };
    const editingIndex = this.editingBoxIndex();
    if (editingIndex !== null) {
      this.completedBoxes.update(previous => previous.map((item, index) => index === editingIndex ? box : item));
      this.editingBoxIndex.set(null);
    } else {
      this.completedBoxes.update(previous => [...previous, box]);
    }
    this.currentBoxItems.set({}); this.showBoxChoiceModal.set(true); this.orderError.set(''); this.orderSuccess.set(null);
  }
  editBox(index: number): void {
    const box = this.completedBoxes()[index];
    if (!box) return;
    const availableItems = Object.fromEntries(Object.entries(box.items).filter(([id]) => this.products().some(product => product.id === id && product.stock)));
    this.selectedPresentation.set(box.presentation);
    this.currentBoxItems.set(availableItems);
    this.editingBoxIndex.set(index);
    this.showOrderSheetModal.set(false);
    this.orderError.set('');
    document.getElementById('sabores')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  removeBox(index: number): void {
    this.completedBoxes.update(previous => previous.filter((_, current) => current !== index));
  }
  boxHasUnavailableItems(box: PackedBox): boolean {
    return Object.keys(box.items).some(id => !this.products().some(product => product.id === id && product.stock));
  }
  async lookupCustomerByPhone(): Promise<void> {
    const phone = this.orderForm.phone.trim();
    if (phone.replace(/\\D/g, '').length < 7) { this.customerLookupMessage.set(''); return; }
    this.lookingUpCustomer.set(true);
    this.customerLookupMessage.set('');
    try {
      const response = await fetch('/api/customer-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const result: unknown = await response.json().catch(() => null);
      const record = this.asRecord(result);
      if (!response.ok) throw new Error(typeof record['message'] === 'string' ? record['message'] : 'No pudimos consultar los datos del cliente.');
      if (record['found'] === true) {
        if (typeof record['name'] === 'string' && !this.orderForm.name.trim()) this.orderForm.name = record['name'];
        if (typeof record['address'] === 'string' && !this.orderForm.address.trim()) this.orderForm.address = record['address'];
        this.customerLookupMessage.set('Encontramos tus datos; revisa que estén actualizados.');
      } else {
        this.customerLookupMessage.set('No encontramos un cliente con ese teléfono. Completa tus datos para registrarlo.');
      }
    } catch {
      this.customerLookupMessage.set('No pudimos consultar datos guardados. Puedes completar el formulario normalmente.');
    } finally {
      this.lookingUpCustomer.set(false);
    }
  }
  openOrderSheet(): void {
    this.showBoxChoiceModal.set(false);
    this.orderError.set('');
    this.isOrderSheetClosing.set(false);
    this.showOrderSheetModal.set(true);
  }
  closeOrderSheet(): void {
    if (this.savingOrder() || !this.showOrderSheetModal() || this.isOrderSheetClosing()) return;
    this.isOrderSheetClosing.set(true);
    window.setTimeout(() => {
      this.showOrderSheetModal.set(false);
      this.isOrderSheetClosing.set(false);
      this.orderError.set('');
    }, 220);
  }
  onOrderBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeOrderSheet();
  }
  getProductName(id: string): string { return this.products().find(product => product.id === id)?.name ?? 'Producto'; }
  getObjectKeys(object: Record<string, number>): string[] { return Object.keys(object); }
  today(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  async submitOrder(): Promise<void> {
    if (this.savingOrder()) return;
    if (!this.completedBoxes().length) { this.orderError.set('Agrega al menos una caja antes de confirmar tu pedido.'); return; }
    if (!this.orderForm.zone) { this.orderError.set(this.fulfillmentMode() === 'pickup' ? 'No encontramos la opción de retiro en local. Intenta más tarde o contáctanos por WhatsApp.' : 'Selecciona tu sector de entrega.'); return; }
    if (this.fulfillmentMode() === 'delivery' && !this.orderForm.address.trim()) { this.orderError.set('Escribe tu dirección exacta para la entrega.'); return; }
    const whatsappPopup = window.open('about:blank', '_blank');
    if (whatsappPopup) whatsappPopup.opener = null;
    this.savingOrder.set(true); this.orderError.set('');
    const payload = {
      name: this.orderForm.name.trim(), phone: this.orderForm.phone.trim(), zoneId: this.orderForm.zone.id,
      address: this.orderForm.address.trim(), deliveryDate: this.orderForm.date, cookieName: this.wantsCookieName() ? this.orderForm.cookieName.trim() : '',
      notes: this.orderForm.notes.trim(), website: this.orderForm.website,
      boxes: this.completedBoxes().map(box => ({ presentationId: box.presentation.id, items: { ...box.items } })),
    };
    try {
      const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) { const record = this.asRecord(result); throw new Error(typeof record['message'] === 'string' ? record['message'] : 'No pudimos registrar tu pedido en este momento. Puedes terminarlo por WhatsApp.'); }
      const record = this.asRecord(result), orderId = typeof record['orderId'] === 'string' && record['orderId'] ? record['orderId'] : 'recibido';
      const documentToken = typeof record['documentToken'] === 'string' ? record['documentToken'] : '';
      const documentUrl = documentToken ? new URL('/api/order-document', window.location.origin) : null;
      if (documentUrl) documentUrl.searchParams.set('token', documentToken);
      const pdfUrl = documentUrl?.toString() ?? '';
      const message = 'Hola StarKies, quiero confirmar mi pedido ' + orderId + '.\n\n'
        + (pdfUrl ? 'Mi pedido en PDF:\n' + pdfUrl + '\n\n' : '')
        + 'Recuerda enviar tu ubicación exacta por WhatsApp para la entrega.';
      const whatsappUrl = 'https://wa.me/593985313438?text=' + encodeURIComponent(message);
      this.orderSuccess.set({ id: orderId, total: this.grandTotal(), documentUrl: pdfUrl, whatsappUrl });
      if (whatsappPopup) whatsappPopup.location.href = whatsappUrl;
      this.showOrderSheetModal.set(false); this.completedBoxes.set([]); this.currentBoxItems.set({}); this.orderForm = this.emptyOrderForm();
    } catch (error) {
      if (whatsappPopup) whatsappPopup.close();
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
  private emptyOrderForm() {
    this.wantsCookieName.set(false);
    this.customerLookupMessage.set('');
    this.selectedDeliveryZone.set(null);
    this.fulfillmentMode.set('delivery');
    return { name: '', phone: '', zone: null as DeliveryZone | null, address: '', date: this.today(), cookieName: '', notes: '', website: '' };
  }
  private asRecord(value: unknown): Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
}
