import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DataService } from '../../services/data.service';
import { Produccion } from './produccion';

describe('Produccion', () => {
  let component: Produccion;
  let fixture: ComponentFixture<Produccion>;
  let state: ReturnType<typeof signal<Record<string, unknown> | null>>;
  let service: Record<string, unknown>;

  beforeEach(async () => {
    state = signal({
      productionHistory: [],
      finishedProductInventory: [{ id: 'cookie', quantity: 2 }],
      productionReadyLines: [],
      doughBases: [{ id: 'base', name: 'Masa base', weight: 600, ingredients: [{ ingredientId: 'flour', quantity: 400 }] }],
    });
    service = {
      rawState: state,
      recipes: signal([{
        id: 'cookie', name: 'Galleta', category: 'Clásicas', yield: 10, price: 1,
        archived: false, baseId: 'base', baseGramsPerCookie: 30,
        sections: [{ name: 'relleno', ingredients: [{ ingredientId: 'sugar', quantity: 2 }] }],
      }]),
      ingredients: signal([
        { id: 'flour', name: 'Harina', unit: 'g', stock: 100, costPerUnit: 0.002 },
        { id: 'sugar', name: 'Azúcar', unit: 'g', stock: 20, costPerUnit: 0.001 },
      ]),
      orders: signal([{
        id: 'order-1', customerId: 'customer-1', total: 3, status: 'PENDING', createdAt: '2026-10-21',
        items: [{ recipeId: 'cookie', name: 'Galleta', quantity: 5, unitPrice: 0.6 }],
      }]),
      saveBusinessSetting: vi.fn(async (key: string, value: unknown) => {
        state.update(current => ({ ...current!, [key]: value }));
      }),
      recordProduction: vi.fn(async () => undefined),
    };

    await TestBed.configureTestingModule({
      imports: [Produccion],
      providers: [{ provide: DataService, useValue: service }],
    }).compileComponents();

    fixture = TestBed.createComponent(Produccion);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('calculates available stock, baking needs, and base dough', () => {
    expect(component.finishedInventory()[0].quantity).toBe(2);
    expect(component.commandPlan()[0].toBake).toBe(3);
    expect(component.commandPlan()[0].doughGrams).toBe(90);
    expect(component.doughPlan()[0].batchesNeeded).toBe(1);
  });

  it('persists a manual negative count', async () => {
    await component.saveInventoryCount('cookie', '-4');
    expect((service['saveBusinessSetting'] as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    expect(component.finishedInventory()[0].quantity).toBe(-4);
  });

  it('persists the command checklist', async () => {
    await component.toggleCommandReady('order-1:cookie', true);
    expect(component.commandPlan()[0].toBake).toBe(0);
  });

  it('supports producing a dough base', () => {
    component.openNewBatch('base');
    expect(component.productionType()).toBe('base');
    expect(component.estimatedYield()).toBe(600);
  });
});
