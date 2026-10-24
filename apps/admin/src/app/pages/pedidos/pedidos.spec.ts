import { signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Order } from 'shared';
import { DataService } from '../../services/data.service';
import { Pedidos } from './pedidos';

describe('Pedidos', () => {
  let component: Pedidos;
  let fixture: ComponentFixture<Pedidos>;
  let ordersState: WritableSignal<Order[]>;
  let deleteOrderMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    ordersState = signal<Order[]>([]);
    deleteOrderMock = vi.fn(async () => undefined);
    await TestBed.configureTestingModule({
      imports: [Pedidos],
      providers: [
        provideRouter([]),
        { provide: DataService, useValue: {
          orders: ordersState,
          customers: signal([]),
          pendingOrderCount: signal(0),
          ordersPageHasMore: signal(false),
          ordersPageLoading: signal(false),
          loadOrdersPage: vi.fn(async () => undefined),
          refreshPendingOrderCount: vi.fn(async () => undefined),
          loadAllOrders: vi.fn(async () => undefined),
          searchOrders: vi.fn(async () => []),
          searchCustomers: vi.fn(async () => []),
          loadFromCloud: vi.fn(async () => undefined),
          deleteOrder: deleteOrderMock,
        } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Pedidos);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('opens order editing directly and shows a separate delete icon without a contextual menu', () => {
    ordersState.set([{
      id: 'order-123',
      customerId: 'customer-1',
      createdAt: '2026-10-24T10:00:00.000Z',
      items: [{ recipeId: 'cookie-1', name: 'Brownie', quantity: 2, unitPrice: 1 }],
      total: 2,
      status: 'PENDING',
    } as Order]);
    fixture.detectChanges();

    const editLink = fixture.nativeElement.querySelector('a.order-edit-button') as HTMLAnchorElement;
    const deleteButton = fixture.nativeElement.querySelector('button.order-delete-button') as HTMLButtonElement;

    expect(editLink).toBeTruthy();
    expect(editLink.getAttribute('href')).toContain('/pedidos/order-123/editar');
    expect(deleteButton).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.order-inline-actions')).toBeNull();
  });

  it('requires confirmation before deleting an order', async () => {
    ordersState.set([{
      id: 'order-123',
      customerId: 'customer-1',
      createdAt: '2026-10-24T10:00:00.000Z',
      items: [{ recipeId: 'cookie-1', name: 'Brownie', quantity: 2, unitPrice: 1 }],
      total: 2,
      status: 'PENDING',
    } as Order]);
    fixture.detectChanges();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const deleteButton = fixture.nativeElement.querySelector('button.order-delete-button') as HTMLButtonElement;

    deleteButton.click();
    await fixture.whenStable();
    expect(deleteOrderMock).not.toHaveBeenCalled();

    deleteButton.click();
    await fixture.whenStable();
    expect(deleteOrderMock).toHaveBeenCalledWith('order-123');
    confirm.mockRestore();
  });
});
