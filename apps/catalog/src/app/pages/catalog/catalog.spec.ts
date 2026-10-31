import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { Catalog } from './catalog';
import { BOX_PRESENTATIONS, rankCatalogProducts } from './catalog.data';
import { DeliveryZone, Product, PublicPromotion } from './catalog.models';

const TEST_PRODUCTS: Product[] = [
  { id: '1', name: 'Brownie Classic', category: 'Galletas clásicas', description: 'Cacao', price: .6, isNy: false, stock: true },
  { id: '2', name: 'Avena Classic', category: 'Galletas clásicas', description: 'Avena', price: .6, isNy: false, stock: true },
  { id: '3', name: 'Chispas de Chocolate Classic', category: 'Galletas clásicas', description: 'Chocolate', price: .6, isNy: false, stock: true },
  { id: '4', name: 'Canela Classic', category: 'Galletas clásicas', description: 'Canela', price: .6, isNy: false, stock: true },
  { id: '5', name: 'Red Velvet Classic', category: 'Galletas clásicas', description: 'Red velvet', price: .6, isNy: false, stock: false },
  { id: '6', name: 'Sunny Carrot', category: 'Galletas NY', description: 'Carrot', price: 1.3, isNy: true, stock: true },
  { id: '7', name: 'Chips Stars', category: 'Galletas NY', description: 'Chips', price: 1.3, isNy: true, stock: true },
  { id: '8', name: 'Velvet Kiss', category: 'Galletas NY', description: 'Velvet', price: 1.3, isNy: true, stock: true },
  { id: '9', name: 'Cinna Moon', category: 'Galletas NY', description: 'Canela', price: 1.3, isNy: true, stock: true },
  { id: '10', name: 'Nuti Dream', category: 'Galletas NY', description: 'Nutella', price: 1.3, isNy: true, stock: true },
  { id: '11', name: 'Lemon Glow', category: 'Galletas NY', description: 'Limón', price: 1.3, isNy: true, stock: true },
  { id: '12', name: 'Brownie Bliss', category: 'Galletas NY', description: 'Brownie', price: 1.3, isNy: true, stock: true },
  { id: '13', name: 'Choco Meteor', category: 'Galletas NY', description: 'Cacao', price: 1.3, isNy: true, stock: true },
];
const TEST_ZONES: DeliveryZone[] = [
  { id: '1', name: 'Kennedy', fee: .99 }, { id: '2', name: 'Norte', fee: 3.5 },
  { id: '3', name: 'Centro', fee: 3.99 }, { id: '4', name: 'Sur', fee: 4.5 },
  { id: '5', name: 'Daule/Samborondón', fee: 5.99 }, { id: '6', name: 'Retiro en tienda', fee: 0 },
];

describe('Catalog', () => {
  let component: Catalog;
  let fixture: ComponentFixture<Catalog>;

  beforeEach(async () => {
    window.sessionStorage.removeItem('starkies.catalog.cart.v1');
    await TestBed.configureTestingModule({ imports: [Catalog] }).compileComponents();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ products: TEST_PRODUCTS, zones: TEST_ZONES, presentations: BOX_PRESENTATIONS }),
    }));
    fixture = TestBed.createComponent(Catalog);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const TEST_PROMOTION: PublicPromotion = {
    id: 'promo-1',
    title: 'Segunda caja a mitad de precio',
    description: 'Lleva una caja Brownie Classic y disfruta la segunda con 50 % de descuento.',
    code: 'BROWNIE50',
    bannerImage: 'https://cdn.example.com/promotions/brownie50.jpg',
    showInCatalog: true,
    mechanic: {
      type: 'buy_x_get_y_discount',
      productIds: ['1'],
      presentationId: 'clasicas',
      buyQuantity: 1,
      rewardQuantity: 1,
      discountType: 'percentage',
      discountValue: 50,
    },
  };

  it('creates the public catalog and delivery options', () => {
    expect(component).toBeTruthy();
    expect(component.products().length).toBe(13);
    expect(component.presentations).toEqual(BOX_PRESENTATIONS);
    expect(component.zones).toEqual(TEST_ZONES);
    expect(component.fulfillmentMode()).toBe('pickup');
    expect(component.orderForm.zone?.name).toBe('Retiro en tienda');
  });

  it('renders promotions in the desktop sidebar and as compact mobile cards without text over the banner', () => {
    component.promotions.set([TEST_PROMOTION]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.promotions-sidebar')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.mobile-promotion-card')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.promotion-banner-overlay')).toBeNull();
    expect((fixture.nativeElement.querySelector('.promotion-banner img') as HTMLImageElement).src).toBe(TEST_PROMOTION.bannerImage);
    expect(fixture.nativeElement.querySelector('.menu-top')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('h1')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.menu-main h1')?.textContent?.trim()).toBe('Elige tu caja');
    const mobilePromotions = fixture.nativeElement.querySelector('.promotions-mobile');
    const menuLayout = fixture.nativeElement.querySelector('.menu-layout');
    expect(mobilePromotions.compareDocumentPosition(menuLayout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.menu-main .promotions-mobile')).toBeNull();
    const promotionHeadings = [...fixture.nativeElement.querySelectorAll('.promotions-mobile-heading h2, .promotions-sidebar-heading h2') as NodeListOf<HTMLElement>]
      .map(heading => heading.textContent?.trim());
    expect(promotionHeadings).toEqual(['Promociones', 'Promociones']);
    expect(fixture.nativeElement.querySelector('.promotions-mobile-heading p')).toBeNull();
    expect(fixture.nativeElement.querySelector('.promotions-sidebar-heading p')).toBeNull();
    expect(fixture.nativeElement.querySelector('.promotion-banner-action')?.textContent).toContain('¡LA QUIERO!');
  });

  it('opens the complete banner in the mobile detail sheet and activates the promotion from its action', () => {
    component.promotions.set([TEST_PROMOTION]);
    const openOrderSheet = vi.spyOn(component, 'openOrderSheet').mockImplementation(() => {});
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.mobile-promotion-card') as HTMLButtonElement).click();
    fixture.detectChanges();

    const dialog = document.body.querySelector('.promotion-details-dialog');
    expect(dialog).toBeTruthy();
    expect(dialog?.querySelector('.promotion-details-header')?.textContent).toContain('Promoción');
    expect(dialog?.querySelector('.promotion-details-header')?.textContent).not.toContain('vigente');
    expect(dialog?.querySelector('.promotion-details-activate')?.textContent).toContain('¡LA QUIERO!');
    expect((dialog?.querySelector('.promotion-details-image') as HTMLImageElement).src).toBe(TEST_PROMOTION.bannerImage);

    (dialog?.querySelector('.promotion-details-activate') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(component.appliedPromotionCode()).toBe('BROWNIE50');
    expect(component.completedBoxes()).toHaveLength(2);
    expect(openOrderSheet).toHaveBeenCalledOnce();
    component.closePromotionDetails();
  });

  it('publishes a crawlable item list linking to each published cookie and sets the menu canonical', () => {
    const script = document.getElementById('starkies-catalog-structured-data') as HTMLScriptElement | null;
    expect(script).toBeTruthy();
    const data = JSON.parse(script?.textContent ?? '{}') as {
      '@graph': Array<Record<string, unknown> & { '@type': string }>;
    };
    const collection = data['@graph'].find(node => node['@type'] === 'CollectionPage');
    const mainEntity = collection?.['mainEntity'] as {
      itemListElement?: Array<{ name?: string; url?: string; position?: number }>;
    } | undefined;
    expect(mainEntity?.itemListElement).toHaveLength(13);
    expect(mainEntity?.itemListElement?.[0]).toMatchObject({
      name: 'Brownie Classic',
      url: 'https://starkies.lat/galletas/brownie-classic/1',
      position: 1,
    });
    expect(data['@graph'].some(node => node['@type'] === 'Product')).toBe(false);
    expect(component.getProductDetailUrl(TEST_PRODUCTS[0])).toBe('/galletas/brownie-classic/1');
    expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe('https://starkies.lat/menu');
    expect(document.getElementById('starkies-site-structured-data')).toBeNull();
  });

  it('shows the floating next-step panel only after the current box is complete', () => {
    expect(fixture.nativeElement.querySelector('.complete-box-actions')).toBeNull();

    for (let index = 0; index < 10; index++) component.changeQuantity('1', 1);
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('.complete-box-actions') as HTMLElement | null;
    expect(panel).toBeTruthy();
    expect(panel?.textContent).toContain('¡Tu caja está lista!');
    expect(panel?.textContent).toContain('Agregar otra caja');
    expect(panel?.textContent).toContain('Continuar al carrito');
    expect(panel?.querySelector('.complete-box-buttons')?.children).toHaveLength(2);
  });

  it('saves the completed box and returns to box selection when adding another box', () => {
    for (let index = 0; index < 10; index++) component.changeQuantity('1', 1);
    fixture.detectChanges();

    const addAnotherButton = fixture.nativeElement.querySelector('.next-box-button') as HTMLButtonElement;
    addAnotherButton.click();
    fixture.detectChanges();

    expect(component.completedBoxes()).toHaveLength(1);
    expect(component.totalBoxCurrent()).toBe(0);
    expect(component.isBoxComplete()).toBe(false);
    expect(fixture.nativeElement.querySelector('.complete-box-actions')).toBeNull();
    expect(component.categoryFilter()).toBe('Galletas clásicas');
  });

  it('opens the cart from the floating continue button', () => {
    for (let index = 0; index < 10; index++) component.changeQuantity('1', 1);
    fixture.detectChanges();
    const openCart = vi.spyOn(component, 'openOrderSheet').mockImplementation(() => {});

    const continueButton = fixture.nativeElement.querySelector('.continue-cart-button') as HTMLButtonElement;
    continueButton.click();

    expect(openCart).toHaveBeenCalledOnce();
  });

  it('renders the approved compact category filter row', () => {
    const filters = [...fixture.nativeElement.querySelectorAll('.filter-button') as NodeListOf<HTMLElement>]
      .map(button => button.textContent?.trim());
    expect(filters).toEqual(['Todas', 'Clásicas', 'NY Style']);
    expect(fixture.nativeElement.querySelectorAll('.category-title')).toHaveLength(0);
  });

  it('matches the approved HTML box-card labels without adding price rows', () => {
    const choices = [...fixture.nativeElement.querySelectorAll('.box-choice') as NodeListOf<HTMLElement>];
    expect(choices.map(choice => choice.querySelector('strong')?.textContent?.trim())).toEqual([
      'Caja de 10 clásicas',
      'Caja de 6 NY Style',
      'Caja mixta',
    ]);
    expect(choices.map(choice => choice.querySelector('small')?.textContent?.trim())).toEqual([
      '10 galletas clásicas',
      '6 galletas NY Style',
      '4 clásicas + 4 NY Style',
    ]);
    expect(fixture.nativeElement.querySelectorAll('.box-choice-bottom')).toHaveLength(0);
  });

  it('places new cookies first, the best seller second, and least-sold cookies before the second best seller', () => {
    const products = [
      { id: 'top', tag: undefined },
      { id: 'second', tag: undefined },
      { id: 'least', tag: undefined },
      { id: 'middle', tag: undefined },
      { id: 'new', tag: 'Nuevo' },
    ];
    const ranked = rankCatalogProducts(products, new Map([
      ['top', 100], ['second', 80], ['middle', 20], ['least', 2],
    ]));
    expect(ranked.map(product => product.id)).toEqual(['new', 'top', 'least', 'middle', 'second']);
    expect(ranked[0].tag).toBe('Nuevo');
    expect(ranked[1].tag).toBe('Más vendida');
  });

  it('filters products by the selected category', () => {
    component.setCategoryFilter('Galletas NY');
    expect(component.filteredProducts().every(product => product.isNy)).toBe(true);
    component.setCategoryFilter('Todas');
    expect(component.filteredProducts().length).toBeGreaterThan(1);
  });

  it('counts the selected cookies and marks a completed box for the cart tooltip', () => {
    component.selectPresentation(BOX_PRESENTATIONS[0]);
    for (let index = 0; index < 10; index += 1) component.changeQuantity('1', 1);
    expect(component.cartItemCount()).toBe(10);
    expect(component.isBoxComplete()).toBe(true);
  });

  it('filters products by name and description', () => {
    component.setTabSearch('carrot');
    expect(component.filteredProducts().map(product => product.name)).toEqual(['Sunny Carrot']);
  });

  it('keeps both category filters visible and disables flavours incompatible with the selected box', () => {
    expect(component.selectedPresentation().id).toBe('clasicas');
    expect(component.categories()).toEqual(['Galletas clásicas', 'Galletas NY']);
    expect(component.filteredProducts()).toHaveLength(13);
    expect(component.canAddProduct('6')).toBe(false);

    component.setCategoryFilter('Galletas NY');
    expect(component.filteredProducts().every(product => product.isNy)).toBe(true);

    component.selectPresentation(BOX_PRESENTATIONS[1]);
    expect(component.categoryFilter()).toBe('Galletas NY');
    expect(component.canAddProduct('6')).toBe(true);

    component.selectPresentation(BOX_PRESENTATIONS[2]);
    expect(component.categoryFilter()).toBe('Todas');
    expect(component.filteredProducts()).toHaveLength(13);
  });

  it('prevents adding unavailable cookies', () => {
    component.selectPresentation(BOX_PRESENTATIONS[0]);
    component.changeQuantity('5', 1);
    expect(component.getQuantity('5')).toBe(0);
  });

  it('enforces the selected box composition', () => {
    component.selectPresentation(BOX_PRESENTATIONS[0]);
    for (let index = 0; index < 12; index += 1) component.changeQuantity('1', 1);
    expect(component.getQuantity('1')).toBe(10);
    expect(component.currentClasicasCount()).toBe(10);
    expect(component.isBoxComplete()).toBe(true);
  });

  it('switches between delivery and pickup and only requires an address for delivery', () => {
    component.setFulfillmentMode('pickup');
    expect(component.fulfillmentMode()).toBe('pickup');
    expect(component.orderForm.zone?.name).toBe('Retiro en tienda');
    expect(component.shippingFee()).toBe(0);

    component.setFulfillmentMode('delivery');
    expect(component.fulfillmentMode()).toBe('delivery');
    expect(component.orderForm.zone).toBeNull();
  });

  it('computes the total with delivery', () => {
    component.completedBoxes.set([{ presentation: BOX_PRESENTATIONS[0], items: { '1': 10 } }]);
    component.setDeliveryZone(TEST_ZONES[0]);
    expect(component.grandTotal()).toBeCloseTo(6.99, 2);
    component.setDeliveryZone(TEST_ZONES[3]);
    expect(component.shippingFee()).toBe(4.5);
    expect(component.grandTotal()).toBeCloseTo(10.5, 2);
    component.setDeliveryZone(TEST_ZONES[5]);
    expect(component.grandTotal()).toBeCloseTo(6, 2);
  });

  it('places the discount code after the cart contents', async () => {
    component.completedBoxes.set([{ presentation: BOX_PRESENTATIONS[0], items: { '1': 10 } }]);
    component.openOrderSheet();
    await fixture.whenStable();

    const summary = document.body.querySelector('.cart-step') as HTMLElement;
    const cartBox = summary.querySelector('.cart-box') as HTMLElement;
    const promotionPanel = summary.querySelector('.promotion-code-panel') as HTMLElement;
    expect(summary.lastElementChild).toBe(promotionPanel);
    expect(cartBox.compareDocumentPosition(promotionPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    component.closeOrderSheet();
  });

  it('asks before clearing and only clears after confirmation', () => {
    component.promotions.set([TEST_PROMOTION]);
    component.completedBoxes.set([{ presentation: BOX_PRESENTATIONS[0], items: { '1': 10 } }]);
    component.appliedPromotionCode.set('BROWNIE50');
    component.promotionCodeInput = 'BROWNIE50';
    component.changeQuantity('2', 1);
    expect(component.cartItemCount()).toBe(11);
    const dialog = TestBed.inject(MatDialog);
    const openSpy = vi.spyOn(dialog, 'open').mockReturnValue({ afterClosed: () => of(false) } as any);
    component.openClearCartConfirmation();
    expect(openSpy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ role: 'alertdialog' }));
    expect(component.completedBoxes()).toHaveLength(1);
    expect(component.totalBoxCurrent()).toBe(1);
    openSpy.mockReturnValue({ afterClosed: () => of(true) } as any);
    component.openClearCartConfirmation();
    expect(component.completedBoxes()).toHaveLength(0);
    expect(component.currentBoxItems()).toEqual({});
    expect(component.appliedPromotionCode()).toBe('');
    expect(component.promotionCodeInput).toBe('');
    expect(window.sessionStorage.getItem('starkies.catalog.cart.v1')).toBeNull();
  });
  it('submits an order and clears the cart only after the API confirms it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, orderId: 'SK-20261019-ABC123', documentShortCode: 'ABC123', total: 6.99 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    component.completedBoxes.set([{ presentation: BOX_PRESENTATIONS[0], items: { '1': 10 } }]);
    component.orderForm.name = 'Cliente de prueba';
    component.orderForm.phone = '0991234567';
    component.setDeliveryZone(TEST_ZONES[0]);
    component.orderForm.address = 'Av. de prueba 123';
    component.orderForm.date = component.today();

    try {
      await component.submitOrder();
      expect(fetchMock).toHaveBeenCalledWith('/api/orders', expect.objectContaining({ method: 'POST' }));
      expect(component.orderSuccess()?.id).toBe('SK-20261019-ABC123');
      const confirmation = component.orderSuccess();
      expect(confirmation?.documentUrl).toBe(new URL('/p/ABC123', window.location.origin).toString());
      const whatsappMessage = new URL(confirmation?.whatsappUrl ?? '').searchParams.get('text') ?? '';
      expect(whatsappMessage).toContain(confirmation?.documentUrl);
      expect(whatsappMessage).toContain('Enviaré mi ubicación exacta por WhatsApp para la entrega.');
      expect(whatsappMessage).not.toContain('SK-20261019-ABC123');
      expect(component.completedBoxes()).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the cart if the order API rejects the request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Servicio no configurado' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    component.completedBoxes.set([{ presentation: BOX_PRESENTATIONS[0], items: { '1': 10 } }]);
    component.orderForm.name = 'Cliente de prueba';
    component.orderForm.phone = '0991234567';
    component.setDeliveryZone(TEST_ZONES[0]);
    component.orderForm.address = 'Av. de prueba 123';
    component.orderForm.date = component.today();

    try {
      await component.submitOrder();
      expect(component.orderError()).toContain('Servicio no configurado');
      expect(component.completedBoxes()).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
