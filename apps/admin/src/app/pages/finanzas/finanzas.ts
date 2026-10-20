import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideDynamicIcon, LucideDollarSign, LucideTrendingUp, LucideTrendingDown, LucideWallet, LucidePackage } from '@lucide/angular';
import { DataService } from '../../services/data.service';

type CashMovement = {
  id: string;
  date: string;
  description: string;
  type: 'IN' | 'OUT';
  amount: number;
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

  readonly icons = { DollarSign: LucideDollarSign, TrendingUp: LucideTrendingUp, TrendingDown: LucideTrendingDown, Wallet: LucideWallet, Package: LucidePackage };
  readonly activeTab = signal<'movimientos' | 'compras' | 'gastos'>('movimientos');

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
        };
      })
      .filter((item): item is CashMovement => item !== null)
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  readonly visibleMovements = computed(() => {
    if (this.activeTab() === 'movimientos') return this.cashMovements();
    const categoryWords = this.activeTab() === 'compras' ? ['compra', 'purchase', 'insumo'] : ['gasto', 'expense', 'fijo'];
    return this.cashMovements().filter(movement =>
      categoryWords.some(word => movement.category.includes(word) || movement.description.toLocaleLowerCase().includes(word)),
    );
  });

  readonly incomeTotal = computed(() => this.cashMovements().filter(item => item.type === 'IN').reduce((sum, item) => sum + item.amount, 0));
  readonly expenseTotal = computed(() => this.cashMovements().filter(item => item.type === 'OUT').reduce((sum, item) => sum + item.amount, 0));
  readonly availableCash = computed(() => this.incomeTotal() - this.expenseTotal());
  readonly inventoryValue = computed(() => this.dataService.ingredients().reduce((sum, item) => sum + item.stock * item.costPerUnit, 0));

  setTab(tab: 'movimientos' | 'compras' | 'gastos'): void {
    this.activeTab.set(tab);
  }
}