import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of } from 'rxjs';
import { Ingredient } from 'shared';
import { DataService } from '../../services/data.service';
import { Finanzas } from './finanzas';

describe('Finanzas', () => {
  let component: Finanzas;
  let fixture: ComponentFixture<Finanzas>;
  let recordCashMovement: ReturnType<typeof vi.fn>;
  let recordIngredientPurchase: ReturnType<typeof vi.fn>;
  let dataServiceStub: {
    rawState: WritableSignal<Record<string, unknown> | null>;
    ingredients: WritableSignal<Ingredient[]>;
    recordCashMovement: typeof recordCashMovement;
    recordIngredientPurchase: typeof recordIngredientPurchase;
    saveBusinessSetting: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    recordCashMovement = vi.fn().mockResolvedValue(undefined);
    recordIngredientPurchase = vi.fn().mockResolvedValue(undefined);
    dataServiceStub = {
      rawState: signal<Record<string, unknown> | null>({ cashMovements: [] }),
      ingredients: signal<Ingredient[]>([
        { id: 'flour', name: 'Harina', unit: 'g', stock: 4000, costPerUnit: 0.0025, packageUnit: 'kg', packageQuantityGrams: 1, packagePrice: 2.5, minStock: 1000 },
      ]),
      recordCashMovement,
      recordIngredientPurchase,
      saveBusinessSetting: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [Finanzas],
      providers: [
        { provide: DataService, useValue: dataServiceStub },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Finanzas);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('prefills the purchase form with the selected ingredient cost', () => {
    component.openPurchaseForm();
    expect(component.formOpen()).toBe('purchase');
    expect(component.purchaseForm().ingredientId).toBe('flour');
    expect(component.purchaseForm().unitCost).toBe(0.0025);
  });

  it('persists an expense as an outgoing cash movement', async () => {
    component.openExpenseForm();
    component.updateExpenseText('description', 'Electricidad');
    component.updateExpenseNumber('18.5');

    await component.saveExpense();

    expect(recordCashMovement).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Electricidad',
      type: 'OUT',
      category: 'gasto',
      amount: 18.5,
    }));
    expect(component.formOpen()).toBeNull();
  });

  it('persists a purchase with stock and cash-flow details', async () => {
    component.openPurchaseForm();
    component.updatePurchaseNumber('packageQuantityGrams', '2');
    component.updatePurchaseNumber('packagePrice', '7');
    component.updatePurchaseText('brand', 'Molino');

    await component.savePurchase();

    expect(recordIngredientPurchase).toHaveBeenCalledWith(expect.objectContaining({
      ingredientId: 'flour',
      quantity: 2000,
      unitCost: 0.0035,
      brand: 'Molino',
      packageQuantityGrams: 2,
      packageUnit: 'kg',
      packagePrice: 7,
      amount: 7,
      type: 'OUT',
      category: 'compra_insumo',
    }));
    expect(component.formOpen()).toBeNull();
  });

  it('rejects an expense without a description', async () => {
    component.openExpenseForm();
    component.updateExpenseNumber('20');

    await component.saveExpense();

    expect(recordCashMovement).not.toHaveBeenCalled();
    expect(component.formError()).toContain('descripción');
  });
});
