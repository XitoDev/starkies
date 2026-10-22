import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { DataService } from '../../services/data.service';
import { Pedidos } from './pedidos';

describe('Pedidos', () => {
  let component: Pedidos;
  let fixture: ComponentFixture<Pedidos>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Pedidos],
      providers: [
        provideRouter([]),
        { provide: DataService, useValue: {
          orders: signal([]), customers: signal([]), pendingOrderCount: signal(0),
          loadOrdersPage: vi.fn(async () => undefined),
          refreshPendingOrderCount: vi.fn(async () => undefined),
        } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Pedidos);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
