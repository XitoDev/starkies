import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideDynamicIcon,
  LucideDollarSign,
  LucideTrendingUp,
  LucideTrendingDown,
  LucideWallet,
  LucidePackage,
  LucidePlus,
  LucideReceipt,
  LucideX,
} from '@lucide/angular';
import { CashMovement } from 'shared';
import { DataService } from '../../services/data.service';

type PurchaseForm = {
  ingredientId: string;
  quantity: number;
  unitCost: number;
  date: string;
  note: string;
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
  imports: [CommonModule, LucideDynamicIcon],
  templateUrl: './finanzas.html',
  styleUrls: ['./finanzas.css']
})
export class Finanzas {
  private readonly dataService = inject(DataService);

  readonly icons = {
    DollarSign: LucideDollarSign,
    TrendingUp: LucideTrendingUp,
    TrendingDown: LucideTrendingDown,
    Wallet: LucideWallet,
    Package: LucidePackage,
    Plus: LucidePlus,
    Receipt: LucideReceipt,
    X: LucideX,
  };

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
  readonly purchaseTotal = computed(() => Math.round(this.purchaseForm().quantity * this.purchaseForm().unitCost * 100) / 100);

  setTab(tab: 'movimientos' | 'compras' | 'gastos'): void {
    this.activeTab.set(tab);
  }

  openPurchaseForm(): void {
    const ingredient = this.dataService.ingredients()[0];
    this.purchaseForm.set({
      ingredientId: ingredient?.id ?? '',
      quantity: 1,
      unitCost: ingredient?.costPerUnit ?? 0,
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
    }));
  }

  updatePurchaseText(field: 'date' | 'note', value: string): void {
    this.purchaseForm.update(current => ({ ...current, [field]: value }));
  }

  updatePurchaseNumber(field: 'quantity' | 'unitCost', value: string): void {
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
    const amount = Math.round(values.quantity * values.unitCost * 100) / 100;

    if (!ingredient) {
      this.formError.set('Selecciona un insumo registrado antes de guardar la compra.');
      return;
    }
    if (!Number.isFinite(values.quantity) || values.quantity <= 0) {
      this.formError.set('La cantidad comprada debe ser mayor que cero.');
      return;
    }
    if (!Number.isFinite(values.unitCost) || values.unitCost <= 0 || amount <= 0) {
      this.formError.set('El costo por unidad debe ser mayor que cero.');
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
      quantity: values.quantity,
      unitCost: values.unitCost,
    };

    this.saving.set(true);
    this.formError.set('');
    this.notice.set('');
    try {
      await this.dataService.recordIngredientPurchase(movement);
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
    return { ingredientId: '', quantity: 1, unitCost: 0, date: this.today(), note: '' };
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