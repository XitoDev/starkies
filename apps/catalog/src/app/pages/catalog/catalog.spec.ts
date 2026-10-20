import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Catalog } from './catalog';
import { BOX_PRESENTATIONS, CATALOG_PRODUCTS, DELIVERY_ZONES } from './catalog.data';

describe('Catalog', () => {
  let component: Catalog;
  let fixture: ComponentFixture<Catalog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Catalog] }).compileComponents();
    fixture = TestBed.createComponent(Catalog);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('creates the public catalog and delivery options', () => {
    expect(component).toBeTruthy();
    expect(component.products().length).toBe(13);
    expect(component.presentations).toEqual(BOX_PRESENTATIONS);
    expect(component.zones).toEqual(DELIVERY_ZONES);
  });

  it('filters products by name and description', () => {
    component.setTabSearch('carrot');
    expect(component.filteredProducts().map(product => product.name)).toEqual(['Sunny Carrot']);
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

  it('computes the total with delivery', () => {
    component.completedBoxes.set([{ presentation: BOX_PRESENTATIONS[0], items: { '1': 10 } }]);
    component.orderForm.zone = DELIVERY_ZONES[0];
    expect(component.grandTotal()).toBeCloseTo(6.99, 2);
  });

  it('submits an order and clears the cart only after the API confirms it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, orderId: 'SK-20261019-ABC123', total: 6.99 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    component.completedBoxes.set([{ presentation: BOX_PRESENTATIONS[0], items: { '1': 10 } }]);
    component.orderForm.name = 'Cliente de prueba';
    component.orderForm.phone = '0991234567';
    component.orderForm.zone = DELIVERY_ZONES[0];
    component.orderForm.address = 'Av. de prueba 123';
    component.orderForm.date = component.today();

    try {
      await component.submitOrder();
      expect(fetchMock).toHaveBeenCalledWith('/api/orders', expect.objectContaining({ method: 'POST' }));
      expect(component.orderSuccess()?.id).toBe('SK-20261019-ABC123');
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
    component.orderForm.zone = DELIVERY_ZONES[0];
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
