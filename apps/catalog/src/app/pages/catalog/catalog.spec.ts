import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Catalog } from './catalog';
import { BOX_PRESENTATIONS, rankCatalogProducts } from './catalog.data';
import { DeliveryZone, Product } from './catalog.models';

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

  it('creates the public catalog and delivery options', () => {
    expect(component).toBeTruthy();
    expect(component.products().length).toBe(13);
    expect(component.presentations).toEqual(BOX_PRESENTATIONS);
    expect(component.zones).toEqual(TEST_ZONES);
    expect(component.fulfillmentMode()).toBe('pickup');
    expect(component.orderForm.zone?.name).toBe('Retiro en tienda');
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
