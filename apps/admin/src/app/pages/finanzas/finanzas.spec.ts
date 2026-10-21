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
    recipes: WritableSignal<Record<string, unknown>[]>;
    saveRecipe: ReturnType<typeof vi.fn>;
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
      recipes: signal<Record<string, unknown>[]>([]),
      saveRecipe: vi.fn(async (recipe: Record<string, unknown>) => {
        dataServiceStub.recipes.update(current => current.map(item => item['id'] === recipe['id'] ? recipe : item));
      }),
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

  it('saves manually entered current balances as the new baseline', async () => {
    component.openBalanceEditor();
    component.updateBalanceField('bankIngredients', '125.50');
    component.updateBalanceField('bankProfit', '0');
    component.updateBalanceField('fundProfit', '45.25');

    await component.saveBalances();

    expect(dataServiceStub.saveBusinessSetting).toHaveBeenCalledWith('financeLedger', expect.objectContaining({
      bankBalances: expect.objectContaining({ ingredients: 125.5, profit: 0 }),
      funds: expect.objectContaining({
        profit: { balance: 45.25, previousBalance: 45.25 },
      }),
    }));
    expect(component.editBalancesOpen()).toBe(false);
  });

  it('calculates a four-part suggested price and saves only the editable sale price', async () => {
    dataServiceStub.recipes.set([{
      id: 'lemon-cookie', name: 'Lemon Glow', category: 'Galletas NY', yield: 10, price: 1.3, archived: false,
      sections: [{ ingredients: [{ ingredientId: 'flour', quantity: 100 }] }],
    }]);
    const row = component.priceRows()[0];
    expect(row.ingredientCost).toBe(0.025);
    expect(row.expenses).toBe(0.025);
    expect(row.services).toBe(0.025);
    expect(row.suggestedPrice).toBe(0.1);
    component.updateSalePrice('lemon-cookie', '0.20');
    await component.saveProductPricing('lemon-cookie');
    expect(dataServiceStub.saveRecipe).toHaveBeenCalledWith(expect.objectContaining({ id: 'lemon-cookie', price: 0.2 }));
    expect(component.priceRows()[0].profit).toBeCloseTo(0.125);
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
