import { MatIconModule } from '@angular/material/icon';
import { siInstagram, siTiktok, siWhatsapp } from 'simple-icons';
import { MatBottomSheet, MatBottomSheetModule, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { CatalogOrderSheetComponent } from './catalog-order-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Component, computed, inject, signal, PLATFORM_ID } from '@angular/core';
import { CommonModule, NgOptimizedImage, isPlatformBrowser, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { BoxPresentation, DeliveryZone, PackedBox, Product } from './catalog.models';
import { BOX_PRESENTATIONS } from './catalog.data';
interface OrderConfirmation { id: string; total: number; documentUrl: string; whatsappUrl: string; }
@Component({ selector: 'app-catalog', standalone: true, imports: [CommonModule, FormsModule, NgOptimizedImage, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MatBottomSheetModule], templateUrl: './catalog.html', styleUrls: ['./catalog.css'] })
export class Catalog {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  readonly currentYear = new Date().getFullYear();
  readonly socialIcons = { whatsapp: siWhatsapp, instagram: siInstagram, tiktok: siTiktok };
  readonly presentations = BOX_PRESENTATIONS;
  readonly products = signal<Product[]>([]);
  zones: DeliveryZone[] = [];
  readonly catalogLoading = signal(true);
  readonly catalogLoadError = signal('');
  readonly selectedPresentation = signal<BoxPresentation>(this.presentations[2]);
  readonly currentBoxItems = signal<{ [productId: string]: number }>({});
  readonly completedBoxes = signal<PackedBox[]>([]);
  readonly searchQuery = signal('');
  readonly categoryFilter = signal<'Todas' | 'Galletas clásicas' | 'Galletas NY'>('Todas');
  readonly boxSelectionError = signal('');
  readonly showCartTip = signal(false);
  private cartTipShowTimer: ReturnType<typeof setTimeout> | null = null;
  private cartTipHideTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly bottomSheet = inject(MatBottomSheet);
  private orderSheetRef: MatBottomSheetRef<CatalogOrderSheetComponent> | null = null;
  readonly orderFormVisible = signal(false);
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
    const category = this.categoryFilter();
    const presentation = this.selectedPresentation();
    const availableProducts = this.products().filter(product =>
      product.isNy ? presentation.reqNY > 0 : presentation.reqClasicas > 0,
    );
    return availableProducts.filter(product => {
      const matchesCategory = category === 'Todas' || product.category === category;
      const matchesQuery = !query
        || product.name.toLocaleLowerCase('es').includes(query)
        || product.description.toLocaleLowerCase('es').includes(query);
      return matchesCategory && matchesQuery;
    });
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
  readonly cartItemCount = computed(() => this.completedBoxes().reduce(
    (total, box) => total + Object.values(box.items).reduce((boxTotal, quantity) => boxTotal + quantity, 0),
    this.totalBoxCurrent(),
  ));
  readonly shippingFee = computed(() => this.selectedDeliveryZone()?.fee ?? 0);
  readonly grandTotal = computed(() => this.boxesTotalSum()
    + (this.totalBoxCurrent() > 0 && this.editingBoxIndex() === null ? this.selectedPresentation().price : 0)
    + this.shippingFee());
  readonly hasUnavailableBox = computed(() => this.completedBoxes().some(box => this.boxHasUnavailableItems(box)));
  constructor() {
    const title = inject(Title), meta = inject(Meta);
    title.setTitle('StarKies · La estrella eres tú');
    meta.updateTag({ name: 'description', content: 'Arma tu caja de galletas artesanales StarKies en Guayaquil. Elige sabores clásicos y New York, revisa los precios y solicita tu pedido en línea.' });
    meta.updateTag({ property: 'og:title', content: 'StarKies · La estrella eres tú' });
    meta.updateTag({ property: 'og:description', content: 'Combina tus sabores favoritos en cajas de galletas clásicas y New York. Pedidos en Guayaquil y sectores cercanos.' });
    meta.updateTag({ property: 'og:url', content: 'https://starkies.lat/' });
    meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    // Relative API paths are browser-relative. During Angular prerender there is no
    // document origin, so Node fetch('/api/catalog') throws "Failed to parse URL".
    // Load live business data only in the browser; never fabricate prerender data.
    if (isPlatformBrowser(this.platformId)) void this.loadCatalog(this.document.baseURI);
  }
  retryCatalog(): void { void this.loadCatalog(isPlatformBrowser(this.platformId) ? this.document.baseURI : undefined); }
  private async loadCatalog(baseUri?: string): Promise<void> {
    this.catalogLoading.set(true);
    this.catalogLoadError.set('');
    try {
      const apiUrl = baseUri ? new URL('/api/catalog', baseUri).toString() : '/api/catalog';
      const response = await fetch(apiUrl, { headers: { Accept: 'application/json' }, cache: 'no-store' });
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
      if (!zones.length) throw new Error('No pudimos cargar las tarifas de entrega. Inténtalo de nuevo.');
      this.products.set(products);
      this.zones = zones;
      if (this.fulfillmentMode() === 'pickup') this.setFulfillmentMode('pickup');
    } catch (error) {
      this.catalogLoadError.set(error instanceof Error ? error.message : 'No pudimos cargar el catálogo.');
    } finally {
      this.catalogLoading.set(false);
    }
  }
  formatPresentationPrice(price: number): string { return '$' + price.toFixed(2).replace('.', ','); }
  setTabSearch(value: string): void { this.searchQuery.set(value); }
  setCategoryFilter(value: 'Todas' | 'Galletas clásicas' | 'Galletas NY'): void {
    this.categoryFilter.set(value === 'Todas' || this.categories().includes(value) ? value : 'Todas');
  }
  selectPresentation(presentation: BoxPresentation): void {
    if (presentation.id === this.selectedPresentation().id) return;
    if (this.totalBoxCurrent() > 0) {
      this.boxSelectionError.set('Termina o guarda la caja actual antes de cambiar su presentación.');
      return;
    }
    this.selectedPresentation.set(presentation);
    this.currentBoxItems.set({});
    this.categoryFilter.set('Todas');
    this.boxSelectionError.set('');
  }
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
  canAddProduct(productId: string): boolean {
    const product = this.products().find(item => item.id === productId);
    if (!product || !product.stock || this.isBoxComplete()) return false;
    return product.isNy
      ? this.currentNYCount() < this.selectedPresentation().reqNY
      : this.currentClasicasCount() < this.selectedPresentation().reqClasicas;
  }
  changeQuantity(productId: string, delta: number): void {
    const product = this.products().find(item => item.id === productId);
    if (!product || !product.stock) return;
    const wasComplete = this.isBoxComplete();
    if (delta > 0 && !this.canAddProduct(productId)) return;
    const nextItems = { ...this.currentBoxItems() }, nextQuantity = (nextItems[productId] || 0) + delta;
    if (nextQuantity <= 0) delete nextItems[productId]; else nextItems[productId] = nextQuantity;
    this.currentBoxItems.set(nextItems);
    if (!wasComplete && this.isBoxComplete()) this.triggerCartTip();
    if (delta < 0) this.boxSelectionError.set('');
  }
  private triggerCartTip(): void {
    this.showCartTip.set(false);
    if (this.cartTipShowTimer) clearTimeout(this.cartTipShowTimer);
    if (this.cartTipHideTimer) clearTimeout(this.cartTipHideTimer);
    this.cartTipShowTimer = setTimeout(() => {
      this.showCartTip.set(true);
      this.cartTipHideTimer = setTimeout(() => this.showCartTip.set(false), 2800);
    }, 10);
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
    this.currentBoxItems.set({});
    this.selectedPresentation.set(this.presentations[0]);
    this.categoryFilter.set('Todas');
    this.boxSelectionError.set('');
    this.showCartTip.set(false);
    this.orderError.set('');
    this.orderSuccess.set(null);
  }
  editBox(index: number): void {
    const box = this.completedBoxes()[index];
    if (!box) return;
    const availableItems = Object.fromEntries(Object.entries(box.items).filter(([id]) => this.products().some(product => product.id === id && product.stock)));
    this.selectedPresentation.set(box.presentation);
    this.currentBoxItems.set(availableItems);
    this.editingBoxIndex.set(index);
    this.orderSheetRef?.dismiss();
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
    if (this.isBoxComplete() && this.totalBoxCurrent() > 0) this.finishBox();
    this.orderFormVisible.set(false);
    this.orderError.set('');
    if (this.orderSheetRef) return;
    const sheetRef = this.bottomSheet.open(CatalogOrderSheetComponent, {
      data: { catalog: this },
      panelClass: 'catalog-order-bottom-sheet',
      ariaLabel: 'Tu pedido',
      disableClose: true,
    });
    this.orderSheetRef = sheetRef;
    sheetRef.backdropClick().subscribe(() => this.closeOrderSheet());
    sheetRef.keydownEvents().subscribe(event => {
      if (event.key === 'Escape') this.closeOrderSheet();
    });
    sheetRef.afterDismissed().subscribe(() => {
      if (this.orderSheetRef === sheetRef) this.orderSheetRef = null;
      this.orderError.set('');
    });
  }
  closeOrderSheet(): void {
    if (this.savingOrder() || !this.orderSheetRef) return;
    this.orderSheetRef.dismiss();
  }
  getProductName(id: string): string { return this.products().find(product => product.id === id)?.name ?? 'Producto'; }
  getObjectKeys(object: Record<string, number>): string[] { return Object.keys(object); }
  today(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  async submitOrder(): Promise<void> {
    if (this.savingOrder()) return;
    if (this.totalBoxCurrent() > 0) { this.orderError.set('Completa y guarda la caja actual antes de confirmar el pedido.'); return; }
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
      const documentShortCode = typeof record['documentShortCode'] === 'string' ? record['documentShortCode'] : '';
      const pdfUrl = documentShortCode
        ? new URL('/p/' + encodeURIComponent(documentShortCode), window.location.origin).toString()
        : '';
      const message = 'Hola StarKies, quiero confirmar mi pedido ' + orderId + '.\n\n'
        + (pdfUrl ? 'Mi pedido en PDF:\n' + pdfUrl + '\n\n' : '')
        + 'Recuerda enviar tu ubicación exacta por WhatsApp para la entrega.';
      const whatsappUrl = 'https://wa.me/593985313438?text=' + encodeURIComponent(message);
      this.orderSuccess.set({ id: orderId, total: this.grandTotal(), documentUrl: pdfUrl, whatsappUrl });
      if (whatsappPopup) whatsappPopup.location.href = whatsappUrl;
      this.orderSheetRef?.dismiss(); this.completedBoxes.set([]); this.currentBoxItems.set({}); this.orderForm = this.emptyOrderForm();
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
