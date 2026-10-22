import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { CashMovement } from 'shared';
import { DataService } from '../../services/data.service';

type PurchaseForm = {
  ingredientId: string;
  quantity: number;
  unitCost: number;
  brand: string;
  packageQuantityGrams: number;
  packageUnit: string;
  packagePrice: number;
  date: string;
  note: string;
};

type BankKey = 'ingredients' | 'expenses' | 'profit';
type FundKey = 'ingredients' | 'expenses' | 'boxes' | 'profit' | 'extraProfit';
type LedgerAction = 'boxesPurchase' | 'boxesPayment' | 'transfer';
interface FinanceLedger {
  bankBalances: Record<BankKey, number>;
  funds: Record<FundKey, { balance: number; previousBalance: number }>;
  pendingTransactions: { id: string; kind: 'boxes'; description: string; amount: number; date: string; status: 'pending' | 'paid' }[];
  history: { id: string; description: string; amount: number; date: string; status: string }[];
  processedOrderIds: string[];
}
type LedgerActionForm = { amount: number; description: string; date: string; from: BankKey | 'external'; to: BankKey; pendingId: string };
type ProductPricingEdit = { salePrice: number };
type FinanceBalanceForm = {
  bankIngredients: number; bankExpenses: number; bankProfit: number;
  fundIngredients: number; fundExpenses: number; fundBoxes: number; fundProfit: number; fundExtraProfit: number;
};

 type ExpenseForm = {
  description: string;
  amount: number;
  date: string;
  category: string;
};

@Component({
  selector: 'app-finanzas',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatInputModule, MatSelectModule],
  templateUrl: './finanzas.html',
  styleUrls: ['./finanzas.css']
})
export class Finanzas {
  private readonly dataService = inject(DataService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly ingredients = this.dataService.ingredients;
  readonly salesStats = this.dataService.salesStats;
  readonly deliveredOrderCount = computed(() => Number(this.salesStats()['deliveredOrders'] ?? 0));
  readonly deliveredSalesRevenue = computed(() => Number(this.salesStats()['revenue'] ?? 0));
  readonly deliveredSalesUnits = computed(() => Number(this.salesStats()['unitsSold'] ?? 0));
  readonly recipes = this.dataService.recipes;
  readonly financeTab = signal<'resumen' | 'productos'>('resumen');
  readonly pricingEdits = signal<Record<string, ProductPricingEdit>>({});
  readonly categoryFilter = signal('all');
  readonly priceCategories = computed(() => Array.from(new Set(
    this.recipes().filter(recipe => !recipe.archived).map(recipe => recipe.category?.trim() || 'Sin categoría'),
  )).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })));
  readonly priceRows = computed(() => this.recipes().filter(recipe => !recipe.archived).map(recipe => {
    const ingredientCost = recipe.sections.reduce((total, section) => total + section.ingredients.reduce((sectionTotal, item) => {
      const ingredient = this.ingredients().find(entry => entry.id === item.ingredientId);
      return sectionTotal + (ingredient?.costPerUnit ?? 0) * item.quantity;
    }, 0), 0) / Math.max(1, recipe.yield);
    const suggestedPrice = ingredientCost * 4;
    const fixedProfit = ingredientCost;
    const edit = this.pricingEdits()[recipe.id];
    const storedSalePrice = this.money(recipe.price);
    const salePrice = Math.max(0, edit?.salePrice ?? (storedSalePrice > 0 ? storedSalePrice : suggestedPrice));
    const expenses = ingredientCost;
    const services = ingredientCost;
    const profit = salePrice - ingredientCost - expenses - services;
    const marginPercent = salePrice > 0 ? profit / salePrice * 100 : 0;
    const priceDifference = salePrice - suggestedPrice;
    return {
      id: recipe.id, name: recipe.name, category: recipe.category, yield: recipe.yield,
      ingredientCost, expenses, services, fixedProfit, suggestedPrice, salePrice, profit, marginPercent, priceDifference,
    };
  }).sort((a, b) => {
    const categoryOrder = (a.category || 'Sin categoría').localeCompare(
      b.category || 'Sin categoría', 'es', { sensitivity: 'base' },
    );
    return categoryOrder || a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  }));
  readonly visiblePriceRows = computed(() => this.priceRows().filter(product =>
    this.categoryFilter() === 'all' || (product.category || 'Sin categoría') === this.categoryFilter(),
  ));

  updateSalePrice(id: string, value: string): void {
    const row = this.priceRows().find(item => item.id === id);
    if (!row) return;
    const parsed = value.trim() === '' ? row.suggestedPrice : Number(value);
    const salePrice = Number.isFinite(parsed)
      ? Math.max(0, Math.round(parsed * 10000) / 10000)
      : row.suggestedPrice;
    this.pricingEdits.update(current => ({ ...current, [id]: { salePrice } }));
  }

  async saveProductPricing(id: string): Promise<void> {
    const recipe = this.recipes().find(item => item.id === id);
    const row = this.priceRows().find(item => item.id === id);
    if (!recipe || !row) return;
    const storedSalePrice = this.money(recipe.price);
    const salePrice = this.pricingEdits()[id]?.salePrice
      ?? (storedSalePrice > 0 ? storedSalePrice : row.suggestedPrice);
    try {
      await this.dataService.saveRecipe({ ...recipe, price: this.money(salePrice) });
      this.pricingEdits.update(current => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      this.ledgerNotice.set('Precio de venta guardado automáticamente.');
    } catch (error) {
      this.ledgerNotice.set(error instanceof Error ? error.message : 'No se pudo guardar el precio de venta.');
    }
  }

  readonly activeTab = signal<'movimientos' | 'compras' | 'gastos'>('movimientos');
  readonly formOpen = signal<'purchase' | 'expense' | null>(null);
  readonly saving = signal(false);
  readonly formError = signal('');
  readonly notice = signal('');
  readonly purchaseForm = signal<PurchaseForm>(this.emptyPurchaseForm());
  readonly expenseForm = signal<ExpenseForm>(this.emptyExpenseForm());

  readonly cashMovements = computed<CashMovement[]>(() => {
    const value = this.dataService.rawState()?.['cashMovements'];
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
      .map((item, index): CashMovement | null => {
        const rawType = String(item['type'] ?? '').trim().toLocaleUpperCase();
        let type: 'IN' | 'OUT' | null = null;
        if (['IN', 'INGRESO', 'INGRESOS', 'INCOME'].includes(rawType)) type = 'IN';
        if (['OUT', 'EGRESO', 'EGRESOS', 'EXPENSE', 'EXPENSES'].includes(rawType)) type = 'OUT';
        if (!type) return null;
        const rawAmount = Number(item['amount'] ?? item['value'] ?? 0);
        return {
          id: String(item['id'] ?? `movement-${index}`),
          date: String(item['date'] ?? item['createdAt'] ?? ''),
          description: String(item['description'] ?? item['name'] ?? 'Movimiento sin descripción'),
          type,
          amount: Number.isFinite(rawAmount) ? rawAmount : 0,
          category: String(item['category'] ?? item['kind'] ?? '').toLocaleLowerCase(),
          subcategory: this.asOptionalString(item['subcategory']),
          ingredientId: this.asOptionalString(item['ingredientId']),
          ingredientName: this.asOptionalString(item['ingredientName']),
          ingredientUnit: this.asOptionalString(item['ingredientUnit']),
          quantity: this.asOptionalNumber(item['quantity']),
          unitCost: this.asOptionalNumber(item['unitCost']),
        };
      })
      .filter((item): item is CashMovement => item !== null)
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  readonly visibleMovements = computed(() => {
    if (this.activeTab() === 'movimientos') return this.cashMovements();
    const categoryWords = this.activeTab() === 'compras'
      ? ['compra', 'purchase', 'insumo']
      : ['gasto', 'expense', 'fijo'];
    return this.cashMovements().filter(movement =>
      categoryWords.some(word =>
        movement.category.includes(word)
        || (movement.subcategory ?? '').toLocaleLowerCase('es').includes(word)
        || movement.description.toLocaleLowerCase('es').includes(word),
      ),
    );
  });

  readonly incomeTotal = computed(() => this.cashMovements().filter(item => item.type === 'IN').reduce((sum, item) => sum + item.amount, 0));
  readonly expenseTotal = computed(() => this.cashMovements().filter(item => item.type === 'OUT').reduce((sum, item) => sum + item.amount, 0));
  readonly availableCash = computed(() => this.incomeTotal() - this.expenseTotal());
  readonly inventoryValue = computed(() => this.dataService.ingredients().reduce((sum, item) => sum + item.stock * item.costPerUnit, 0));
  readonly purchaseTotal = computed(() => Math.round(this.purchaseForm().packagePrice * 100) / 100);
  readonly selectedIngredient = computed(() =>
    this.ingredients().find(item => item.id === this.purchaseForm().ingredientId) ?? null,
  );
  readonly purchaseUnits = computed(() => {
    const selectedUnit = this.selectedIngredient()?.unit;
    const dimension = selectedUnit === 'ml' ? 'volume' : selectedUnit === 'unidad' ? 'count' : 'mass';
    return [
      { value: 'g', label: 'Gramos (g)', dimension: 'mass' }, { value: 'kg', label: 'Kilogramos (kg)', dimension: 'mass' },
      { value: 'mg', label: 'Miligramos (mg)', dimension: 'mass' }, { value: 'lb', label: 'Libras (lb)', dimension: 'mass' },
      { value: 'oz', label: 'Onzas (oz)', dimension: 'mass' }, { value: 'ml', label: 'Mililitros (ml)', dimension: 'volume' },
      { value: 'l', label: 'Litros (l)', dimension: 'volume' }, { value: 'taza', label: 'Tazas (240 ml)', dimension: 'volume' },
      { value: 'cda', label: 'Cucharadas (15 ml)', dimension: 'volume' }, { value: 'cdta', label: 'Cucharaditas (5 ml)', dimension: 'volume' },
      { value: 'unidad', label: 'Unidades (u)', dimension: 'count' }, { value: 'pieza', label: 'Piezas (pza)', dimension: 'count' },
      { value: 'par', label: 'Pares (2 unidades)', dimension: 'count' }, { value: 'media_docena', label: 'Media docena (6 unidades)', dimension: 'count' },
      { value: 'docena', label: 'Docena (12 unidades)', dimension: 'count' },
    ].filter(unit => unit.dimension === dimension);
  });

  readonly bankCards = computed(() => {
    const ledger = this.ledger();
    return [
      { key: 'ingredients' as const, title: 'Ingredientes', balance: ledger.bankBalances.ingredients, note: 'Reposición de ingredientes', tone: 'ingredients' },
      { key: 'expenses' as const, title: 'Gastos', balance: ledger.bankBalances.expenses, note: 'Gastos + cajas', tone: 'expenses' },
      { key: 'profit' as const, title: 'Ganancia', balance: ledger.bankBalances.profit, note: 'Ganancia + ganancia extra', tone: 'profit' },
    ];
  });
  readonly totalCapital = computed(() => this.bankCards().reduce((sum, item) => sum + item.balance, 0));
  readonly pendingTransactions = computed(() => this.ledger().pendingTransactions.filter(item => item.status === 'pending'));
  readonly pendingCount = computed(() => this.pendingTransactions().length);
  readonly fundCards = computed(() => {
    const funds = this.ledger().funds;
    return [
      { key: 'ingredients' as const, title: 'Ingredientes', balance: funds.ingredients.balance, previous: funds.ingredients.previousBalance, note: 'La primera parte del costo × 3 recupera ingredientes y elaboración.', action: 'Comprar ingredientes' },
      { key: 'expenses' as const, title: 'Gastos', balance: funds.expenses.balance, previous: funds.expenses.previousBalance, note: 'La segunda parte del costo, descontando la reserva para cajas.' , action: 'Registrar pago' },
      { key: 'boxes' as const, title: 'Cajas', balance: funds.boxes.balance, previous: funds.boxes.previousBalance, note: 'El saldo de cajas conservado más las nuevas reservas, menos sus compras.', action: 'Comprar cajas' },
      { key: 'profit' as const, title: 'Ganancia', balance: funds.profit.balance, previous: funds.profit.previousBalance, note: 'La tercera parte del costo × 3. Se mantiene separada.', action: '' },
      { key: 'extraProfit' as const, title: 'Ganancia extra', balance: funds.extraProfit.balance, previous: funds.extraProfit.previousBalance, note: 'Lo cobrado por encima del costo de elaboración × 3.', action: '' },
    ].map(item => ({ ...item, variation: item.balance - item.previous }));
  });
  readonly ledgerActionOpen = signal<LedgerAction | null>(null);
  readonly ledgerActionForm = signal<LedgerActionForm>(this.emptyLedgerActionForm());
  readonly ledgerSaving = signal(false);
  readonly ledgerError = signal('');
  readonly ledgerNotice = signal('');
  readonly pendingPanelOpen = signal(false);
  readonly editBalancesOpen = signal(false);
  readonly balanceSaving = signal(false);
  readonly balanceError = signal('');
  readonly balanceForm = signal<FinanceBalanceForm>(this.emptyBalanceForm());
  private readonly salesSyncInProgress = signal(false);

  constructor() {
    this.dataService.loadCollections?.(['recipes', 'ingredients', 'cashMovements', 'financeLedger', 'finishedProductInventory']);
    const deliveredLoad = this.dataService.refreshDeliveredOrders?.();
    if (deliveredLoad) void deliveredLoad.catch(error => this.ledgerNotice.set(error.message));
    this.route.queryParamMap.subscribe(params => {
      if (params.get('action') !== 'purchase') return;
      const ingredientId = params.get('ingredientId') ?? '';
      this.openPurchaseForm();
      this.updatePurchaseIngredient(ingredientId);
      void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    });
    effect(() => {
      const state = this.dataService.rawState();
      if (!state || this.salesSyncInProgress()) return;
      const pendingSales = this.deliveredOrdersMissingFromLedger(state);
      if (!pendingSales.length) return;
      this.salesSyncInProgress.set(true);
      void this.reconcileDeliveredSales(state, pendingSales).catch(error => {
        this.ledgerNotice.set(error instanceof Error ? error.message : 'No se pudieron actualizar los fondos a partir de las ventas entregadas.');
      }).finally(() => this.salesSyncInProgress.set(false));
    });
  }

  private ledger(): FinanceLedger {
    const raw = this.dataService.rawState()?.['financeLedger'];
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const rawBanks = value['bankBalances'] && typeof value['bankBalances'] === 'object' ? value['bankBalances'] as Record<string, unknown> : {};
    const rawFunds = value['funds'] && typeof value['funds'] === 'object' ? value['funds'] as Record<string, unknown> : {};
    const fundKeys: FundKey[] = ['ingredients', 'expenses', 'boxes', 'profit', 'extraProfit'];
    const funds = Object.fromEntries(fundKeys.map(key => {
      const entry = rawFunds[key] && typeof rawFunds[key] === 'object' ? rawFunds[key] as Record<string, unknown> : {};
      return [key, { balance: this.money(entry['balance']), previousBalance: this.money(entry['previousBalance']) }];
    })) as FinanceLedger['funds'];
    const bankBalances = {
      ingredients: this.money(rawBanks['ingredients']),
      expenses: this.money(rawBanks['expenses']),
      profit: this.money(rawBanks['profit']),
    };
    const pendingTransactions = Array.isArray(value['pendingTransactions'])
      ? value['pendingTransactions'].filter((item): item is FinanceLedger['pendingTransactions'][number] => {
          if (!item || typeof item !== 'object') return false;
          const entry = item as Record<string, unknown>;
          return typeof entry['id'] === 'string' && entry['kind'] === 'boxes' && typeof entry['amount'] === 'number' && (entry['status'] === 'pending' || entry['status'] === 'paid');
        })
      : [];
    const history = Array.isArray(value['history'])
      ? value['history'].filter((item): item is FinanceLedger['history'][number] => Boolean(item && typeof item === 'object' && typeof (item as Record<string, unknown>)['id'] === 'string'))
      : [];
    const processedOrderIds = Array.isArray(value['processedOrderIds']) ? value['processedOrderIds'].filter((id): id is string => typeof id === 'string') : [];
    return { bankBalances, funds, pendingTransactions, history, processedOrderIds };
  }


  private deliveredOrdersMissingFromLedger(state: Record<string, unknown>): Record<string, unknown>[] {
    const orders = this.dataService.deliveredOrders() as unknown as Record<string, unknown>[];
    const processed = new Set(this.ledger().processedOrderIds);
    return orders.filter((value): value is Record<string, unknown> => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const order = value as Record<string, unknown>;
      const status = String(order['status'] ?? '').toLocaleLowerCase('es');
      const id = String(order['id'] ?? order['code'] ?? '');
      return Boolean(id && !processed.has(id) && (status.includes('entreg') || status === 'delivered' || status === 'completed' || status === 'complete'));
    });
  }

  private async reconcileDeliveredSales(state: Record<string, unknown>, orders: Record<string, unknown>[]): Promise<void> {
    const current = this.ledger();
    const next: FinanceLedger = {
      bankBalances: { ...current.bankBalances },
      funds: Object.fromEntries(Object.entries(current.funds).map(([key, value]) => [key, { ...value }])) as FinanceLedger['funds'],
      pendingTransactions: current.pendingTransactions.map(item => ({ ...item })),
      history: [...current.history],
      processedOrderIds: [...current.processedOrderIds],
    };
    const recipes = Array.isArray(state['recipes']) ? state['recipes'].filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : [];
    const ingredients = Array.isArray(state['ingredients']) ? state['ingredients'].filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : [];
    const costPerUnit = (recipe: Record<string, unknown>): number => {
      const sections = Array.isArray(recipe['sections']) ? recipe['sections'] : [];
      const batchCost = sections.reduce((total: number, rawSection) => {
        if (!rawSection || typeof rawSection !== 'object' || Array.isArray(rawSection)) return total;
        const section = rawSection as Record<string, unknown>;
        const items = Array.isArray(section['ingredients']) ? section['ingredients'] : [];
        return total + items.reduce((sectionTotal: number, rawItem) => {
          if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return sectionTotal;
          const item = rawItem as Record<string, unknown>;
          const ingredient = ingredients.find(entry => String(entry['id'] ?? '') === String(item['ingredientId'] ?? item['id'] ?? ''));
          const quantity = Number(item['quantity'] ?? item['qty'] ?? 0);
          const unitCost = Number(ingredient?.['costPerUnit'] ?? ingredient?.['cost'] ?? 0);
          return sectionTotal + (Number.isFinite(quantity) && quantity > 0 && Number.isFinite(unitCost) ? quantity * unitCost : 0);
        }, 0);
      }, 0);
      const yieldCount = Number(recipe['yield'] ?? 1);
      return batchCost / (Number.isFinite(yieldCount) && yieldCount > 0 ? yieldCount : 1);
    };

    for (const order of orders) {
      const orderId = String(order['id'] ?? order['code'] ?? '');
      const directLines = Array.isArray(order['lines']) ? order['lines'] : [];
      const lines = directLines.length ? directLines : (Array.isArray(order['boxOrders']) ? order['boxOrders'].flatMap(box => {
        if (!box || typeof box !== 'object' || Array.isArray(box)) return [];
        const boxLines = (box as Record<string, unknown>)['lines'];
        return Array.isArray(boxLines) ? boxLines : [];
      }) : []);
      let allocated = 0;
      const banksBeforeOrder = { ...next.bankBalances };
      const fundsBeforeOrder = Object.fromEntries(Object.entries(next.funds).map(([key, value]) => [key, { ...value }])) as FinanceLedger['funds'];
      let complete = true;
      for (const rawLine of lines) {
        if (!rawLine || typeof rawLine !== 'object' || Array.isArray(rawLine)) continue;
        const line = rawLine as Record<string, unknown>;
        const recipeId = String(line['id'] ?? line['recipeId'] ?? '');
        if (recipeId.toLocaleLowerCase() === 'shipping' || String(line['name'] ?? '').toLocaleLowerCase().startsWith('envío')) continue;
        const recipe = recipes.find(item => String(item['id'] ?? '') === recipeId);
        const quantity = Number(line['qty'] ?? line['quantity'] ?? 0);
        const unitPrice = Number(line['price'] ?? line['unitPrice'] ?? recipe?.['price'] ?? 0);
        if (!recipe || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
          complete = false;
          continue;
        }
        const unitCost = costPerUnit(recipe);
        const basePrice = unitCost * 3;
        const baseRevenue = Math.min(unitPrice, basePrice);
        const perFund = baseRevenue / 3;
        const extraProfit = Math.max(0, unitPrice - basePrice);
        const ingredientAllocation = perFund * quantity;
        const expenseAllocation = perFund * quantity;
        const profitAllocation = perFund * quantity;
        const extraAllocation = extraProfit * quantity;
        next.funds.ingredients.balance = this.money(next.funds.ingredients.balance + ingredientAllocation);
        next.funds.expenses.balance = this.money(next.funds.expenses.balance + expenseAllocation);
        next.funds.profit.balance = this.money(next.funds.profit.balance + profitAllocation);
        next.funds.extraProfit.balance = this.money(next.funds.extraProfit.balance + extraAllocation);
        next.bankBalances.ingredients = this.money(next.bankBalances.ingredients + ingredientAllocation);
        next.bankBalances.expenses = this.money(next.bankBalances.expenses + expenseAllocation);
        next.bankBalances.profit = this.money(next.bankBalances.profit + profitAllocation + extraAllocation);
        allocated += unitPrice * quantity;
      }
      if (complete && lines.length > 0) {
        next.processedOrderIds.push(orderId);
        next.history.unshift({ id: crypto.randomUUID(), description: `Distribución de venta · Pedido ${orderId}`, amount: this.money(allocated), date: String(order['date'] ?? order['createdAt'] ?? this.today()), status: 'Venta distribuida' });
      } else {
        next.bankBalances = banksBeforeOrder;
        next.funds = fundsBeforeOrder;
        allocated = 0;
      }
    }
    if (next.processedOrderIds.length === current.processedOrderIds.length) return;
    await this.dataService.saveBusinessSetting('financeLedger', next);
    this.ledgerNotice.set('Los fondos se actualizaron con las ventas entregadas.');
  }

  private money(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
  }

  private emptyBalanceForm(): FinanceBalanceForm {
    return { bankIngredients: 0, bankExpenses: 0, bankProfit: 0, fundIngredients: 0, fundExpenses: 0, fundBoxes: 0, fundProfit: 0, fundExtraProfit: 0 };
  }

  openBalanceEditor(): void {
    const ledger = this.ledger();
    this.balanceForm.set({
      bankIngredients: ledger.bankBalances.ingredients,
      bankExpenses: ledger.bankBalances.expenses,
      bankProfit: ledger.bankBalances.profit,
      fundIngredients: ledger.funds.ingredients.balance,
      fundExpenses: ledger.funds.expenses.balance,
      fundBoxes: ledger.funds.boxes.balance,
      fundProfit: ledger.funds.profit.balance,
      fundExtraProfit: ledger.funds.extraProfit.balance,
    });
    this.balanceError.set('');
    this.editBalancesOpen.set(true);
  }

  updateBalanceField(field: keyof FinanceBalanceForm, value: string): void {
    const amount = value.trim() === '' ? 0 : Number(value);
    this.balanceForm.update(current => ({
      ...current,
      [field]: Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0,
    }));
  }

  async saveBalances(): Promise<void> {
    if (this.balanceSaving()) return;
    const values = this.balanceForm();
    if (Object.values(values).some(value => !Number.isFinite(value) || value < 0)) {
      this.balanceError.set('Ingresa montos válidos iguales o mayores que cero.');
      return;
    }
    const current = this.ledger();
    const deliveredIds = (this.dataService.deliveredOrders() as unknown as Record<string, unknown>[])
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
      .filter(order => {
        const status = String(order['status'] ?? '').toLocaleLowerCase('es');
        return status.includes('entreg') || status === 'delivered' || status === 'completed' || status === 'complete';
      })
      .map(order => String(order['id'] ?? order['code'] ?? ''))
      .filter(Boolean);
    const next: FinanceLedger = {
      ...current,
      processedOrderIds: Array.from(new Set([...current.processedOrderIds, ...deliveredIds])),
      bankBalances: {
        ingredients: this.money(values.bankIngredients),
        expenses: this.money(values.bankExpenses),
        profit: this.money(values.bankProfit),
      },
      funds: {
        ingredients: { balance: this.money(values.fundIngredients), previousBalance: this.money(values.fundIngredients) },
        expenses: { balance: this.money(values.fundExpenses), previousBalance: this.money(values.fundExpenses) },
        boxes: { balance: this.money(values.fundBoxes), previousBalance: this.money(values.fundBoxes) },
        profit: { balance: this.money(values.fundProfit), previousBalance: this.money(values.fundProfit) },
        extraProfit: { balance: this.money(values.fundExtraProfit), previousBalance: this.money(values.fundExtraProfit) },
      },
      history: [{
        id: crypto.randomUUID(),
        description: 'Corrección manual de saldos iniciales',
        amount: 0,
        date: this.today(),
        status: 'Saldos actualizados',
      }, ...current.history],
    };
    this.balanceSaving.set(true);
    this.balanceError.set('');
    try {
      await this.dataService.saveBusinessSetting('financeLedger', next);
      this.editBalancesOpen.set(false);
      this.ledgerNotice.set('Saldos actuales guardados. Las variaciones de los fondos parten de estos valores.');
    } catch (error) {
      this.balanceError.set(error instanceof Error ? error.message : 'No se pudieron guardar los saldos actuales.');
    } finally {
      this.balanceSaving.set(false);
    }
  }

  private emptyLedgerActionForm(): LedgerActionForm {
    return { amount: 0, description: '', date: this.today(), from: 'ingredients', to: 'expenses', pendingId: '' };
  }

  openLedgerAction(action: LedgerAction, from: BankKey = 'ingredients'): void {
    const firstPending = this.pendingTransactions()[0];
    this.ledgerActionForm.set({
      ...this.emptyLedgerActionForm(),
      from,
      to: from === 'ingredients' ? 'expenses' : 'ingredients',
      pendingId: action === 'boxesPayment' ? firstPending?.id ?? '' : '',
      amount: action === 'boxesPayment' ? firstPending?.amount ?? 0 : 0,
      description: action === 'boxesPayment' ? firstPending?.description ?? 'Pago de cajas' : '',
    });
    this.ledgerError.set('');
    this.ledgerNotice.set('');
    this.ledgerActionOpen.set(action);
  }

  updateLedgerForm(field: keyof LedgerActionForm, value: string): void {
    this.ledgerActionForm.update(current => {
      if (field === 'amount') {
        const amount = value.trim() ? Number(value) : 0;
        return { ...current, amount: Number.isFinite(amount) ? Math.max(0, amount) : 0 };
      }
      if (field === 'from' && ['ingredients', 'expenses', 'profit', 'external'].includes(value)) {
        return { ...current, from: value as LedgerActionForm['from'] };
      }
      if (field === 'to' && ['ingredients', 'expenses', 'profit'].includes(value)) return { ...current, to: value as BankKey };
      return { ...current, [field]: value };
    });
  }

  selectPendingBoxPurchase(id: string): void {
    const pending = this.pendingTransactions().find(item => item.id === id);
    this.ledgerActionForm.update(current => ({ ...current, pendingId: id, amount: pending?.amount ?? 0, description: pending?.description ?? '' }));
  }

  async saveLedgerAction(): Promise<void> {
    const action = this.ledgerActionOpen();
    const form = this.ledgerActionForm();
    if (!action || this.ledgerSaving()) return;
    const amount = Math.round(form.amount * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) { this.ledgerError.set('El monto debe ser mayor que cero.'); return; }
    if (!this.normalizeDate(form.date)) { this.ledgerError.set('Selecciona una fecha válida.'); return; }

    const current = this.ledger();
    const next: FinanceLedger = {
      bankBalances: { ...current.bankBalances },
      funds: Object.fromEntries(Object.entries(current.funds).map(([key, value]) => [key, { ...value }])) as FinanceLedger['funds'],
      pendingTransactions: current.pendingTransactions.map(item => ({ ...item })),
      history: [...current.history],
      processedOrderIds: [...current.processedOrderIds],
    };
    const description = form.description.trim();
    if (action === 'boxesPurchase') {
      if (!description) { this.ledgerError.set('Describe la compra de cajas.'); return; }
      next.pendingTransactions.push({ id: crypto.randomUUID(), kind: 'boxes', description, amount, date: this.normalizeDate(form.date)!, status: 'pending' });
      next.history.unshift({ id: crypto.randomUUID(), description: `Compra pendiente: ${description}`, amount, date: this.normalizeDate(form.date)!, status: 'Pendiente de pago' });
    } else if (action === 'boxesPayment') {
      const pending = next.pendingTransactions.find(item => item.id === form.pendingId && item.status === 'pending');
      if (!pending) { this.ledgerError.set('Selecciona una compra de cajas pendiente de pago.'); return; }
      if (amount > pending.amount) { this.ledgerError.set('El pago no puede superar el monto pendiente de esa compra.'); return; }
      if (amount < pending.amount) { this.ledgerError.set('Para cerrar esta transacción, registra el monto pendiente completo.'); return; }
      next.bankBalances.expenses -= amount;
      next.funds.boxes.balance -= amount;
      pending.status = 'paid';
      next.history.unshift({ id: crypto.randomUUID(), description: `Pago de cajas: ${pending.description}`, amount, date: this.normalizeDate(form.date)!, status: 'Pagado' });
    } else {
      if (form.from === form.to) { this.ledgerError.set('El origen y el destino deben ser distintos.'); return; }
      if (form.from !== 'external' && next.bankBalances[form.from] < amount) { this.ledgerError.set('El saldo de la cuenta de origen es insuficiente.'); return; }
      if (form.from !== 'external') next.bankBalances[form.from] = this.money(next.bankBalances[form.from] - amount);
      next.bankBalances[form.to] = this.money(next.bankBalances[form.to] + amount);
      next.history.unshift({ id: crypto.randomUUID(), description: form.from === 'external' ? `Ingreso de capital a ${this.bankName(form.to)}` : `Transferencia de ${this.bankName(form.from)} a ${this.bankName(form.to)}`, amount, date: this.normalizeDate(form.date)!, status: 'Confirmado' });
    }

    this.ledgerSaving.set(true);
    this.ledgerError.set('');
    try {
      await this.dataService.saveBusinessSetting('financeLedger', next);
      this.ledgerActionOpen.set(null);
      this.ledgerNotice.set(action === 'boxesPurchase' ? 'Compra de cajas registrada; queda pendiente de pago.' : action === 'boxesPayment' ? 'Pago de cajas registrado correctamente.' : 'Transferencia registrada correctamente.');
    } catch (error) {
      this.ledgerError.set(error instanceof Error ? error.message : 'No se pudo guardar la operación financiera.');
    } finally {
      this.ledgerSaving.set(false);
    }
  }

  transferSourceForFund(key: FundKey): BankKey {
    if (key === 'boxes') return 'expenses';
    if (key === 'extraProfit') return 'profit';
    return key;
  }

  private bankName(key: BankKey): string {
    return ({ ingredients: 'Ingredientes', expenses: 'Gastos', profit: 'Ganancia' } as const)[key];
  }

  async applyFundPayment(kind: 'ingredients' | 'expenses', amount: number, description: string, date: string): Promise<void> {
    const current = this.ledger();
    const next: FinanceLedger = {
      bankBalances: { ...current.bankBalances },
      funds: Object.fromEntries(Object.entries(current.funds).map(([key, value]) => [key, { ...value }])) as FinanceLedger['funds'],
      pendingTransactions: current.pendingTransactions.map(item => ({ ...item })),
      history: [...current.history],
      processedOrderIds: [...current.processedOrderIds],
    };
    const bankKey: BankKey = kind;
    next.bankBalances[bankKey] = this.money(next.bankBalances[bankKey] - amount);
    next.funds[kind].balance = this.money(next.funds[kind].balance - amount);
    next.history.unshift({ id: crypto.randomUUID(), description, amount, date, status: 'Confirmado' });
    await this.dataService.saveBusinessSetting('financeLedger', next);
  }


  setTab(tab: 'movimientos' | 'compras' | 'gastos'): void {
    this.activeTab.set(tab);
  }

  openPurchaseForm(): void {
    const ingredient = this.dataService.ingredients()[0];
    this.purchaseForm.set({
      ingredientId: ingredient?.id ?? '',
      quantity: 1,
      unitCost: ingredient?.costPerUnit ?? 0,
      brand: ingredient?.brand ?? '',
      packageQuantityGrams: ingredient?.packageQuantityGrams ?? 1000,
      packageUnit: ingredient?.packageUnit ?? (ingredient?.unit === 'ml' ? 'ml' : ingredient?.unit === 'unidad' ? 'unidad' : 'g'),
      packagePrice: ingredient?.packagePrice ?? ((ingredient?.costPerUnit ?? 0) * (ingredient?.unit === 'unidad' ? 1 : ['kg', 'l'].includes(ingredient?.unit.toLocaleLowerCase('es') ?? '') ? 1 : 1000)),
      date: this.today(),
      note: '',
    });
    this.formError.set('');
    this.notice.set('');
    this.formOpen.set('purchase');
  }

  openExpenseForm(): void {
    this.expenseForm.set(this.emptyExpenseForm());
    this.formError.set('');
    this.notice.set('');
    this.formOpen.set('expense');
  }

  closeForm(): void {
    if (this.saving()) return;
    this.formOpen.set(null);
    this.formError.set('');
  }

  updatePurchaseIngredient(ingredientId: string): void {
    const ingredient = this.dataService.ingredients().find(item => item.id === ingredientId);
    this.purchaseForm.update(current => ({
      ...current,
      ingredientId,
      unitCost: ingredient?.costPerUnit ?? current.unitCost,
      brand: ingredient?.brand ?? current.brand,
      packageQuantityGrams: ingredient?.packageQuantityGrams ?? current.packageQuantityGrams,
      packageUnit: ingredient?.packageUnit ?? (ingredient?.unit === 'ml' ? 'ml' : ingredient?.unit === 'unidad' ? 'unidad' : 'g'),
      packagePrice: ingredient?.packagePrice ?? current.packagePrice,
    }));
  }

  updatePurchaseUnit(value: string): void {
    const next = this.purchaseUnits().find(unit => unit.value === value);
    if (!next) return;
    const current = this.purchaseForm();
    const old = this.purchaseUnits().find(unit => unit.value === current.packageUnit);
    const factors: Record<string, number> = { g: 1, kg: 1000, mg: 0.001, lb: 453.59237, oz: 28.349523125, ml: 1, l: 1000, taza: 240, cda: 15, cdta: 5, unidad: 1, pieza: 1, par: 2, media_docena: 6, docena: 12 };
    const quantity = old?.dimension === next.dimension
      ? current.packageQuantityGrams * factors[current.packageUnit] / factors[value]
      : current.packageQuantityGrams;
    this.purchaseForm.update(valueNow => ({ ...valueNow, packageUnit: value, packageQuantityGrams: quantity }));
  }

  updatePurchaseText(field: 'date' | 'note' | 'brand', value: string): void {
    this.purchaseForm.update(current => ({ ...current, [field]: value }));
  }

  updatePurchaseNumber(field: 'quantity' | 'unitCost' | 'packageQuantityGrams' | 'packagePrice', value: string): void {
    const parsed = value.trim() === '' ? 0 : Number(value);
    this.purchaseForm.update(current => ({
      ...current,
      [field]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
    }));
  }

  updateExpenseText(field: 'description' | 'date' | 'category', value: string): void {
    this.expenseForm.update(current => ({ ...current, [field]: value }));
  }

  updateExpenseNumber(value: string): void {
    const parsed = value.trim() === '' ? 0 : Number(value);
    this.expenseForm.update(current => ({
      ...current,
      amount: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
    }));
  }

  submitPurchaseForm(event: Event): void {
    event.preventDefault();
    void this.savePurchase();
  }

  submitExpenseForm(event: Event): void {
    event.preventDefault();
    void this.saveExpense();
  }

  async savePurchase(): Promise<void> {
    const values = this.purchaseForm();
    const ingredient = this.dataService.ingredients().find(item => item.id === values.ingredientId);
    const date = this.normalizeDate(values.date);
    const packageGrams = values.packageQuantityGrams;
    const packagePrice = Math.round(values.packagePrice * 10000) / 10000;
    const packageFactors: Record<string, number> = { g: 1, kg: 1000, mg: 0.001, lb: 453.59237, oz: 28.349523125, ml: 1, l: 1000, taza: 240, cda: 15, cdta: 5, unidad: 1, pieza: 1, par: 2, media_docena: 6, docena: 12 };
    const quantity = packageGrams * (packageFactors[values.packageUnit] ?? 1);
    const unitCost = packagePrice / Math.max(quantity, Number.EPSILON);
    const amount = Math.round(packagePrice * 100) / 100;

    if (!ingredient) {
      this.formError.set('Selecciona un insumo registrado antes de guardar la compra.');
      return;
    }
    if (!Number.isFinite(packageGrams) || packageGrams <= 0) {
      this.formError.set('La cantidad del empaque debe ser mayor que cero.');
      return;
    }
    if (!Number.isFinite(packagePrice) || packagePrice <= 0 || amount <= 0) {
      this.formError.set('El precio del empaque debe ser mayor que cero.');
      return;
    }
    if (!date) {
      this.formError.set('Selecciona una fecha válida para la compra.');
      return;
    }

    const note = values.note.trim();
    const movement: CashMovement = {
      id: crypto.randomUUID(),
      date,
      description: note ? `${note} — ${ingredient.name}` : `Compra de ${ingredient.name}`,
      type: 'OUT',
      amount,
      category: 'compra_insumo',
      subcategory: 'Compra de insumos',
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      ingredientUnit: ingredient.unit,
      quantity,
      unitCost,
      brand: values.brand.trim(),
      packageQuantityGrams: packageGrams,
      packageUnit: values.packageUnit,
      packagePrice,
    };

    this.saving.set(true);
    this.formError.set('');
    this.notice.set('');
    try {
      await this.dataService.recordIngredientPurchase(movement);
      await this.applyFundPayment('ingredients', amount, movement.description, date);
      this.formOpen.set(null);
      this.notice.set('Compra registrada y stock actualizado correctamente.');
      this.activeTab.set('compras');
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'No se pudo registrar la compra.');
    } finally {
      this.saving.set(false);
    }
  }

  async saveExpense(): Promise<void> {
    const values = this.expenseForm();
    const description = values.description.trim();
    const date = this.normalizeDate(values.date);
    const amount = Math.round(values.amount * 100) / 100;

    if (!description) {
      this.formError.set('Ingresa una descripción para el gasto.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      this.formError.set('El monto del gasto debe ser mayor que cero.');
      return;
    }
    if (!date) {
      this.formError.set('Selecciona una fecha válida para el gasto.');
      return;
    }

    const movement: CashMovement = {
      id: crypto.randomUUID(),
      date,
      description,
      type: 'OUT',
      amount,
      category: 'gasto',
      subcategory: values.category,
    };

    this.saving.set(true);
    this.formError.set('');
    this.notice.set('');
    try {
      await this.dataService.recordCashMovement(movement);
      await this.applyFundPayment('expenses', amount, movement.description, date);
      this.formOpen.set(null);
      this.notice.set('Gasto registrado correctamente.');
      this.activeTab.set('gastos');
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'No se pudo registrar el gasto.');
    } finally {
      this.saving.set(false);
    }
  }

  private emptyPurchaseForm(): PurchaseForm {
    return { ingredientId: '', quantity: 1, unitCost: 0, brand: '', packageQuantityGrams: 1000, packageUnit: 'g', packagePrice: 0, date: this.today(), note: '' };
  }

  private emptyExpenseForm(): ExpenseForm {
    return { description: '', amount: 0, date: this.today(), category: 'servicios' };
  }

  private today(): string {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 10);
  }

  private normalizeDate(value: string): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const localDate = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (localDate.getFullYear() !== year || localDate.getMonth() !== month - 1 || localDate.getDate() !== day) {
      return null;
    }
    return localDate.toISOString();
  }

  private asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private asOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }
}