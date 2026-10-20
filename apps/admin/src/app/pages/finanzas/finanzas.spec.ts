import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Ingredient } from 'shared';
import { DataService } from '../../services/data.service';
import { Finanzas } from './finanzas';

describe('Finanzas', () => {
  let component: Finanzas;
  let fixture: ComponentFixture<Finanzas>;
  let dataServiceStub: {
    rawState: ReturnType<typeof signal<Record<string, unknown> | null>>;
    ingredients: ReturnType<typeof signal<Ingredient[]>>;
    recordCashMovement: jasmine.Spy;
    recordIngredientPurchase: jasmine.Spy;
  };

  beforeEach(async () => {
    dataServiceStub = {
      rawState: signal<Record<string, unknown> | null>({ cashMovements: [] }),
      ingredients: signal<Ingredient[]>([
        { id: 'flour', name: 'Harina', unit: 'kg', stock: 4, costPerUnit: 2.5, minStock: 1 },
      ]),
      recordCashMovement: jasmine.createSpy('recordCashMovement').and.resolveTo(),
      recordIngredientPurchase: jasmine.createSpy('recordIngredientPurchase').and.resolveTo(),
    };

    await TestBed.configureTestingModule({
      imports: [Finanzas],
      providers: [{ provide: DataService, useValue: dataServiceStub }],
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
    expect(component.purchaseForm().unitCost).toBe(2.5);
  });

  it('persists an expense as an outgoing cash movement', async () => {
    component.openExpenseForm();
    component.updateExpenseText('description', 'Electricidad');
    component.updateExpenseNumber('18.5');

    await component.saveExpense();

    expect(dataServiceStub.recordCashMovement).toHaveBeenCalledWith(jasmine.objectContaining({
      description: 'Electricidad',
      type: 'OUT',
      category: 'gasto',
      amount: 18.5,
    }));
    expect(component.formOpen()).toBeNull();
  });

  it('persists a purchase with stock and cash-flow details', async () => {
    component.openPurchaseForm();
    component.updatePurchaseNumber('quantity', '2');
    component.updatePurchaseNumber('unitCost', '3.5');

    await component.savePurchase();

    expect(dataServiceStub.recordIngredientPurchase).toHaveBeenCalledWith(jasmine.objectContaining({
      ingredientId: 'flour',
      quantity: 2,
      unitCost: 3.5,
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

    expect(dataServiceStub.recordCashMovement).not.toHaveBeenCalled();
    expect(component.formError()).toContain('descripción');
  });
}
