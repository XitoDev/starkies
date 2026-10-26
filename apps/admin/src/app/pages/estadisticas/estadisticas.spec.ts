import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Order } from 'shared';
import { DataService } from '../../services/data.service';
import { Estadisticas } from './estadisticas';

describe('Estadisticas', () => {
  let fixture: ComponentFixture<Estadisticas>;
  let component: Estadisticas;
  const ordersState = signal<Order[]>([]);
  const rawState = signal<Record<string, unknown> | null>({ orders: [] });
  const recipesState = signal([]);

  beforeEach(async () => {
    ordersState.set([]);
    rawState.set({ orders: [] });
    await TestBed.configureTestingModule({
      imports: [Estadisticas],
      providers: [{
        provide: DataService,
        useValue: { orders: ordersState, rawState, recipes: recipesState, loadAllOrders: async () => undefined, loadCollections: async () => undefined },
      }],
    }).compileComponents();
    fixture = TestBed.createComponent(Estadisticas);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('ranks cookie units and recorded box presentations while excluding cancelled orders', () => {
    const createdAt = new Date().toISOString();
    ordersState.set([
      { id: 'order-1', customerId: 'c1', createdAt, items: [{ recipeId: 'brownie', name: 'Brownie', quantity: 4, unitPrice: 1 }], total: 4, status: 'DELIVERED' },
      { id: 'order-2', customerId: 'c2', createdAt, items: [{ recipeId: 'brownie', name: 'Brownie', quantity: 2, unitPrice: 1 }, { recipeId: 'vanilla', name: 'Vainilla', quantity: 1, unitPrice: 1 }], total: 3, status: 'PENDING' },
      { id: 'order-3', customerId: 'c3', createdAt, items: [{ recipeId: 'brownie', name: 'Brownie', quantity: 50, unitPrice: 1 }], total: 50, status: 'CANCELLED' },
    ] as Order[]);
    rawState.set({ orders: [
      { id: 'order-1', createdAt, boxes: [{ presentationId: 'clasicas', presentationName: 'Caja solo clásicas' }] },
      { id: 'order-2', createdAt, boxes: [{ presentationId: 'mixta', presentationName: 'Caja mixta' }] },
      { id: 'order-3', createdAt, boxes: [{ presentationId: 'ny', presentationName: 'Caja solo NY Style' }] },
    ] });
    fixture.detectChanges();
    expect(component.orderCount()).toBe(2);
    expect(component.productRanking()[0]).toMatchObject({ name: 'Brownie', quantity: 6 });
    expect(component.unitsSold()).toBe(7);
    expect(component.boxRanking()).toHaveLength(2);
    expect(component.totalBoxes()).toBe(2);
    expect(component.deliveredRevenue()).toBe(4);
    expect(component.pendingCount()).toBe(1);
  });

  it('changes the period filter and keeps an empty result safe to render', () => {
    component.setPeriod('all');
    expect(component.period()).toBe('all');
    expect(component.productRanking()).toEqual([]);
    expect(component.busiestDay()).toBeNull();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.stats-page')).not.toBeNull();
  });
});