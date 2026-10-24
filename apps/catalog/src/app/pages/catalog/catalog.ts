import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { CatalogOrderSheetComponent } from './catalog-order-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Component, computed, effect, inject, signal, PLATFORM_ID } from '@angular/core';
import { CommonModule, NgOptimizedImage, isPlatformBrowser, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { BoxPresentation, DeliveryZone, PackedBox, Product } from './catalog.models';
import { BOX_PRESENTATIONS } from './catalog.data';
import { CatalogUiService } from '../../catalog-ui.service';
interface OrderConfirmation { id: string; total: number; documentUrl: string; whatsappUrl: string; }
interface CachedPublicCatalog { products: Product[]; zones: DeliveryZone[]; fetchedAt: number; }
interface CartDraft { selectedPresentationId: string; currentBoxItems: Record<string, number>; completedBoxes: PackedBox[]; editingBoxIndex: number | null; }
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
const CART_DRAFT_KEY = 'starkies.catalog.cart.v1';
let publicCatalogCache: CachedPublicCatalog | null = null;
@Component({ selector: 'app-catalog', standalone: true, imports: [CommonModule, FormsModule, NgOptimizedImage, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MatDialogModule], templateUrl: './catalog.html', styleUrls: ['./catalog.css'] })
export class Catalog {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  readonly presentations = BOX_PRESENTATIONS;
  readonly products = signal<Product[]>([]);
  zones: DeliveryZone[] = [];
  readonly catalogLoading = signal(true);
  readonly catalogLoadError = signal('');
  readonly selectedPresentation = signal<BoxPresentation>(this.presentations[0]);
  readonly currentBoxItems = signal<{ [productId: string]: number }>({});
  readonly completedBoxes = signal<PackedBox[]>([]);
  readonly searchQuery = signal('');
  readonly categoryFilter = signal<'Todas' | 'Galletas clásicas' | 'Galletas NY'>('Todas');
  readonly boxSelectionError = signal('');
  readonly showCartTip = signal(false);
  private cartTipShowTimer: ReturnType<typeof setTimeout> | null = null;
  private cartTipHideTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly dialog = inject(MatDialog);
  private readonly catalogUi = inject(CatalogUiService);
  private orderSheetRef: MatDialogRef<CatalogOrderSheetComponent> | null = null;
  private lastOpenOrderRequest = this.catalogUi.openOrderRequest();
  readonly orderFormVisible = signal(false);
  readonly savingOrder = signal(false);
  readonly orderError = signal('');
  readonly orderSuccess = signal<OrderConfirmation | null>(null);
  readonly customerLookupMessage = signal('');
  readonly lookingUpCustomer = signal(false);
  readonly editingBoxIndex = signal<number | null>(null);
  readonly wantsCookieName = signal(false);
  readonly selectedDeliveryZone = signal<DeliveryZone | null>(null);
  readonly fulfillmentMode = signal<'delivery' | 'pickup'>('pickup');
  orderForm = this.emptyOrderForm();
  readonly categories = computed(() => ['Galletas clásicas', 'Galletas NY']);
  readonly filteredProducts = computed(() => {
    const query = this.searchQuery().toLocaleLowerCase('es').trim();
    const category = this.categoryFilter();
    return this.products().filter(product => {
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
  private readonly cartCountEffect = effect(() => {
    this.catalogUi.cartItemCount.set(this.cartItemCount());
  });
  private readonly openOrderEffect = effect(() => {
    const request = this.catalogUi.openOrderRequest();
    if (request !== this.lastOpenOrderRequest) {
      this.lastOpenOrderRequest = request;
      this.openOrderSheet();
    }
  });
  readonly shippingFee = computed(() => this.selectedDeliveryZone()?.fee ?? 0);
  readonly grandTotal = computed(() => this.boxesTotalSum()
    + (this.totalBoxCurrent() > 0 && this.editingBoxIndex() === null ? this.selectedPresentation().price : 0)
    + this.shippingFee());
  readonly hasUnavailableBox = computed(() => this.completedBoxes().some(box => this.boxHasUnavailableItems(box)));
  constructor() {
    const title = inject(Title), meta = inject(Meta);
    const pageTitle = 'Catálogo de galletas artesanales en Guayaquil | StarKies';
    const pageDescription = 'Explora el catálogo de galletas artesanales en Guayaquil, Ecuador: galletas clásicas, NY Style y sabores de chocolate. Consulta precios y arma tu caja en línea con StarKies.';
    title.setTitle(pageTitle);
    meta.updateTag({ name: 'description', content: pageDescription });
    meta.updateTag({ name: 'keywords', content: 'galletas artesanales Guayaquil, catálogo de galletas Guayaquil, galletas clásicas, galletas New York Guayaquil, NY Style, galletas de chocolate, galletas para regalar, StarKies Ecuador' });
    meta.updateTag({ property: 'og:title', content: pageTitle });
    meta.updateTag({ property: 'og:description', content: pageDescription });
    meta.updateTag({ property: 'og:url', content: 'https://starkies.lat/menu' });
    meta.updateTag({ property: 'og:image', content: 'https://starkies.lat/starkies-social.png' });
    meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    meta.updateTag({ name: 'twitter:title', content: pageTitle });
    meta.updateTag({ name: 'twitter:description', content: pageDescription });
    meta.updateTag({ name: 'twitter:image', content: 'https://starkies.lat/starkies-social.png' });
    this.setCanonicalUrl('https://starkies.lat/menu');
    // Fetch the public projection during prerender using an absolute URL so the
    // generated HTML can contain the currently published products and JSON-LD.
    // If the production API is temporarily unavailable, the browser retries after load.
    const isBrowser = isPlatformBrowser(this.platformId);
    if (isBrowser) this.restoreCartDraft();
    void this.loadCatalog(isBrowser ? this.document.baseURI : 'https://starkies.lat/');
  }

  private setCanonicalUrl(url: string): void {
    let canonical = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);
  }

  private updateProductStructuredData(products: Product[]): void {
    const pageUrl = 'https://starkies.lat/menu';
    const itemList = {
      '@type': 'ItemList',
      name: 'Galletas artesanales disponibles en el catálogo de StarKies',
      numberOfItems: products.length,
      itemListElement: products.map((product, index) => {
        const url = pageUrl + '#galleta-' + encodeURIComponent(product.id);
        return {
          '@type': 'ListItem',
          position: index + 1,
          item: {
            '@type': 'Thing',
            name: product.name,
            url,
            ...(product.description ? { description: product.description } : {}),
          },
        };
      }),
    };
    const productEntities = products.flatMap(product => {
      if (!product.image) return [];
      let image: string;
      try { image = new URL(product.image, 'https://starkies.lat/').toString(); }
      catch { return []; }
      const url = pageUrl + '#galleta-' + encodeURIComponent(product.id);
      return [{
        '@type': 'Product',
        '@id': url,
        name: product.name,
        image,
        ...(product.description ? { description: product.description } : {}),
        category: product.category,
        sku: product.id,
        brand: { '@type': 'Brand', name: 'StarKies' },
        offers: {
          '@type': 'Offer',
          price: product.price.toFixed(2),
          priceCurrency: 'USD',
          availability: product.stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          url,
          seller: { '@id': 'https://starkies.lat/#bakery' },
        },
      }];
    });
    const graph = [{
      '@type': 'CollectionPage',
      '@id': pageUrl + '#webpage',
      url: pageUrl,
      name: 'Catálogo de galletas artesanales en Guayaquil | StarKies',
      description: 'Galletas clásicas y NY Style disponibles en Guayaquil, Ecuador.',
      inLanguage: 'es-EC',
      mainEntity: itemList,
    }, ...productEntities];
    let script = this.document.getElementById('starkies-catalog-structured-data') as HTMLScriptElement | null;
    if (!script) {
      script = this.document.createElement('script');
      script.id = 'starkies-catalog-structured-data';
      script.type = 'application/ld+json';
      this.document.head.appendChild(script);
    }
    script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
  }
  retryCatalog(): void { publicCatalogCache = null; void this.loadCatalog(isPlatformBrowser(this.platformId) ? this.document.baseURI : undefined); }
  private async loadCatalog(baseUri?: string): Promise<void> {
    this.catalogLoading.set(true);
    this.catalogLoadError.set('');
    if (isPlatformBrowser(this.platformId) && publicCatalogCache && Date.now() - publicCatalogCache.fetchedAt < CATALOG_CACHE_TTL_MS) {
      this.applyPublicCatalog(publicCatalogCache);
      this.catalogLoading.set(false);
      return;
    }
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
      const cache: CachedPublicCatalog = { products, zones, fetchedAt: Date.now() };
      if (isPlatformBrowser(this.platformId)) publicCatalogCache = cache;
      this.applyPublicCatalog(cache);
    } catch (error) {
      // Keep prerender output clean when a remote API is unavailable; the browser
      // performs a fresh request and displays the retry message if it also fails.
      if (isPlatformBrowser(this.platformId)) {
        this.catalogLoadError.set(error instanceof Error ? error.message : 'No pudimos cargar el catálogo.');
      }
    } finally {
      this.catalogLoading.set(false);
    }
  }
  private applyPublicCatalog(cache: CachedPublicCatalog): void {
    this.products.set(cache.products);
    this.updateProductStructuredData(cache.products);
    this.zones = cache.zones;
    if (this.fulfillmentMode() === 'pickup') this.setFulfillmentMode('pickup');
  }
  private restoreCartDraft(): void {
    try {
      const raw = window.sessionStorage.getItem(CART_DRAFT_KEY);
      if (!raw) return;
      const draft = this.asRecord(JSON.parse(raw));
      const presentation = this.presentations.find(item => item.id === draft['selectedPresentationId']);
      if (presentation) this.selectedPresentation.set(presentation);
      const currentItems = this.asRecord(draft['currentBoxItems']);
      const validItems = Object.fromEntries(Object.entries(currentItems).filter(([, quantity]) => Number.isInteger(quantity) && Number(quantity) > 0)) as Record<string, number>;
      this.currentBoxItems.set(validItems);
      if (Array.isArray(draft['completedBoxes'])) {
        const boxes: PackedBox[] = draft['completedBoxes'].flatMap(value => {
          const item = this.asRecord(value);
          const savedPresentation = this.presentations.find(p => p.id === this.asRecord(item['presentation'])['id']);
          const items = this.asRecord(item['items']);
          if (!savedPresentation || !Object.values(items).every(quantity => Number.isInteger(quantity) && Number(quantity) > 0)) return [];
          return [{ presentation: savedPresentation, items: Object.fromEntries(Object.entries(items).filter(([, quantity]) => Number.isInteger(quantity) && Number(quantity) > 0)) as Record<string, number> }];
        });
        this.completedBoxes.set(boxes);
      }
      const editingIndex = draft['editingBoxIndex'];
      this.editingBoxIndex.set(Number.isInteger(editingIndex) && Number(editingIndex) >= 0 ? Number(editingIndex) : null);
    } catch {
      try { window.sessionStorage.removeItem(CART_DRAFT_KEY); } catch { /* Storage may be unavailable. */ }
    }
  }
  private persistCartDraft(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const draft: CartDraft = {
        selectedPresentationId: this.selectedPresentation().id,
        currentBoxItems: this.currentBoxItems(),
        completedBoxes: this.completedBoxes(),
        editingBoxIndex: this.editingBoxIndex(),
      };
      window.sessionStorage.setItem(CART_DRAFT_KEY, JSON.stringify(draft));
    } catch { /* Storage may be unavailable or full; the in-memory cart remains usable. */ }
  }
  getPresentationTitle(presentation: BoxPresentation): string {
    switch (presentation.id) {
      case 'clasicas': return 'Caja de 10 clásicas';
      case 'ny': return 'Caja de 6 NY Style';
      case 'mixta': return 'Caja mixta';
      default: return presentation.name;
    }
  }
  getPresentationDescription(presentation: BoxPresentation): string {
    switch (presentation.id) {
      case 'clasicas': return '10 galletas clásicas';
      case 'ny': return '6 galletas NY Style';
      case 'mixta': return '4 clásicas + 4 NY Style';
      default: return presentation.desc;
    }
  }
  setTabSearch(value: string): void { this.searchQuery.set(value); }
  setCategoryFilter(value: string): void {
    if (value === 'Todas') { this.categoryFilter.set('Todas'); return; }
    if ((value === 'Galletas clásicas' || value === 'Galletas NY') && this.categories().includes(value)) {
      this.categoryFilter.set(value);
      return;
    }
    this.categoryFilter.set('Todas');
  }
  selectPresentation(presentation: BoxPresentation): void {
    const isCurrentPresentation = presentation.id === this.selectedPresentation().id;
    if (!isCurrentPresentation && this.totalBoxCurrent() > 0) {
      this.boxSelectionError.set('Termina o guarda la caja actual antes de cambiar su presentación.');
      return;
    }
    if (!isCurrentPresentation) {
      this.selectedPresentation.set(presentation);
      this.currentBoxItems.set({});
    }
    this.categoryFilter.set(presentation.id === 'clasicas'
      ? 'Galletas clásicas'
      : presentation.id === 'ny' ? 'Galletas NY' : 'Todas');
    this.boxSelectionError.set('');
    this.persistCartDraft();
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
    this.persistCartDraft();
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
    this.persistCartDraft();
  }
  addAnotherBox(): void {
    this.finishBox();
    this.categoryFilter.set('Galletas clásicas');
  }
  editBox(index: number): void {
    const box = this.completedBoxes()[index];
    if (!box) return;
    const availableItems = Object.fromEntries(Object.entries(box.items).filter(([id]) => this.products().some(product => product.id === id && product.stock)));
    this.selectedPresentation.set(box.presentation);
    this.currentBoxItems.set(availableItems);
    this.editingBoxIndex.set(index);
    this.persistCartDraft();
    this.orderSheetRef?.close();
    this.orderError.set('');
    document.getElementById('sabores')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  removeBox(index: number): void {
    this.completedBoxes.update(previous => previous.filter((_, current) => current !== index));
    this.persistCartDraft();
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
    const sheetRef = this.dialog.open(CatalogOrderSheetComponent, {
      data: { catalog: this },
      panelClass: 'order-drawer-panel',
      backdropClass: 'order-drawer-backdrop',
      ariaLabel: 'Mi pedido',
      position: { top: '0', right: '0' },
      width: '600px',
      maxWidth: '100vw',
      height: '100dvh',
      maxHeight: '100dvh',
      autoFocus: false,
      restoreFocus: true,
      enterAnimationDuration: '240ms',
      exitAnimationDuration: '180ms',
      disableClose: true,
    });
    this.orderSheetRef = sheetRef;
    sheetRef.beforeClosed().subscribe(() => sheetRef.addPanelClass('order-drawer-closing'));
    sheetRef.backdropClick().subscribe(() => this.closeOrderSheet());
    sheetRef.keydownEvents().subscribe(event => {
      if (event.key === 'Escape') this.closeOrderSheet();
    });
    sheetRef.afterClosed().subscribe(() => {
      if (this.orderSheetRef === sheetRef) this.orderSheetRef = null;
      this.orderError.set('');
    });
  }
  closeOrderSheet(): void {
    if (this.savingOrder() || !this.orderSheetRef) return;
    this.orderSheetRef.close();
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
      const message = 'Hola StarKies, quiero confirmar mi pedido.\n\n'
        + (pdfUrl ? 'Pedido:\n' + pdfUrl + '\n\n' : '')
        + 'Enviaré mi ubicación exacta por WhatsApp para la entrega.';
      const whatsappUrl = 'https://wa.me/593985313438?text=' + encodeURIComponent(message);
      this.orderSuccess.set({ id: orderId, total: this.grandTotal(), documentUrl: pdfUrl, whatsappUrl });
      if (whatsappPopup) whatsappPopup.location.href = whatsappUrl;
      this.orderSheetRef?.close(); this.completedBoxes.set([]); this.currentBoxItems.set({}); this.orderForm = this.emptyOrderForm(); this.editingBoxIndex.set(null); this.persistCartDraft();
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
    this.fulfillmentMode.set('pickup');
    return { name: '', phone: '', zone: null as DeliveryZone | null, address: '', date: this.today(), cookieName: '', notes: '', website: '' };
  }
  private asRecord(value: unknown): Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
}
