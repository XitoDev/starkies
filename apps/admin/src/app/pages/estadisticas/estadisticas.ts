import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Order, Recipe } from 'shared';
import { DataService } from '../../services/data.service';

type StatsPeriod = '7' | '30' | '90' | 'all';
type RawRecord = Record<string, unknown>;
interface RankedProduct { id: string; name: string; quantity: number; }
interface RankedBox { id: string; label: string; quantity: number; }
interface RankedPromotion { id: string; code: string; name: string; orders: number; discount: number; }
interface WeekdayCount { key: string; label: string; count: number; }
const WEEKDAYS: Omit<WeekdayCount, 'count'>[] = [
  { key: 'mon', label: 'Lun' }, { key: 'tue', label: 'Mar' }, { key: 'wed', label: 'Mié' },
  { key: 'thu', label: 'Jue' }, { key: 'fri', label: 'Vie' }, { key: 'sat', label: 'Sáb' }, { key: 'sun', label: 'Dom' },
];
const WEEKDAY_INDEX: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
function asRecords(value: unknown): RawRecord[] {
  return Array.isArray(value) ? value.filter((item): item is RawRecord => typeof item === 'object' && item !== null && !Array.isArray(item)) : [];
}
function asRecord(value: unknown): RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as RawRecord : {};
}
function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}
function asQuantity(value: unknown): number {
  const quantity = Number(value ?? 0);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

@Component({
  selector: 'app-estadisticas',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, MatIconModule],
  templateUrl: './estadisticas.html',
  styleUrl: './estadisticas.css',
})
export class Estadisticas {
  readonly data = inject(DataService);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly period = signal<StatsPeriod>('30');
  readonly weekdays = WEEKDAYS;

  readonly rawOrdersById = computed(() => {
    const entries: [string, RawRecord][] = [];
    for (const record of asRecords(this.data.rawState()?.['orders'])) {
      const id = asText(record['id'] ?? record['code']);
      if (id) entries.push([id, record]);
    }
    return new Map(entries);
  });

  readonly validOrders = computed(() => this.data.orders().filter(order => order.status !== 'CANCELLED' && this.isWithinPeriod(order)));

  readonly productSales = computed<RankedProduct[]>(() => {
    const totals = new Map<string, RankedProduct>();
    for (const order of this.validOrders()) {
      for (const item of this.getOrderItems(order)) {
        if (!item.quantity) continue;
        const id = item.id || 'name:' + item.name.toLocaleLowerCase('es');
        const current = totals.get(id);
        if (current) current.quantity += item.quantity;
        else totals.set(id, { id, name: item.name || this.recipeName(item.id), quantity: item.quantity });
      }
    }
    return [...totals.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'es'));
  });
  readonly productRanking = computed(() => this.productSales().slice(0, 10));
  readonly unitsSold = computed(() => this.productSales().reduce((sum, item) => sum + item.quantity, 0));

  readonly boxSales = computed<RankedBox[]>(() => {
    const totals = new Map<string, RankedBox>();
    for (const order of this.validOrders()) {
      const raw = this.rawOrdersById().get(order.id);
      for (const box of this.getBoxRecords(raw)) {
        const label = this.getBoxLabel(box);
        const id = label.toLocaleLowerCase('es');
        const current = totals.get(id);
        if (current) current.quantity++;
        else totals.set(id, { id, label, quantity: 1 });
      }
    }
    return [...totals.values()].sort((a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label, 'es'));
  });
  readonly boxRanking = computed(() => this.boxSales().slice(0, 6));
  readonly totalBoxes = computed(() => this.boxSales().reduce((sum, item) => sum + item.quantity, 0));
  readonly orderCount = computed(() => this.validOrders().length);
  readonly deliveredRevenue = computed(() => this.validOrders().filter(order => order.status === 'DELIVERED')
    .reduce((sum, order) => sum + Math.max(0, Number(order.total) || 0), 0));
  readonly pendingCount = computed(() => this.validOrders()
    .filter(order => order.status === 'PENDING' || order.status === 'PREPARING' || order.status === 'READY').length);
  readonly promotionOrders = computed(() => this.validOrders().filter(order => {
    const raw = this.rawOrdersById().get(order.id);
    return asQuantity(raw?.['discount']) > 0;
  }));
  readonly promotionOrderCount = computed(() => this.promotionOrders().length);
  readonly promotionDiscountTotal = computed(() => this.promotionOrders().reduce((sum, order) => {
    return sum + asQuantity(this.rawOrdersById().get(order.id)?.['discount']);
  }, 0));
  readonly promotionRanking = computed<RankedPromotion[]>(() => {
    const totals = new Map<string, RankedPromotion>();
    for (const order of this.promotionOrders()) {
      const raw = this.rawOrdersById().get(order.id);
      const promotion = asRecord(raw?.['promotion']);
      const code = asText(promotion['code'] ?? raw?.['promotionCode']) || 'Sin código';
      const id = asText(promotion['id']) || code.toLocaleUpperCase('es');
      const name = asText(promotion['name'] ?? promotion['title']) || code;
      const discount = asQuantity(raw?.['discount']);
      const current = totals.get(id);
      if (current) { current.orders++; current.discount += discount; }
      else totals.set(id, { id, code, name, orders: 1, discount });
    }
    return [...totals.values()].sort((a, b) => b.orders - a.orders || b.discount - a.discount);
  });

  readonly weekdayCounts = computed<WeekdayCount[]>(() => {
    const counts = new Array<number>(7).fill(0);
    for (const order of this.validOrders()) {
      const date = this.getOrderDate(order);
      if (!date) continue;
      const shortDay = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Guayaquil' })
        .format(date).slice(0, 3).toLocaleLowerCase('en');
      const index = WEEKDAY_INDEX[shortDay];
      if (index !== undefined) counts[index]++;
    }
    return WEEKDAYS.map((day, index) => ({ ...day, count: counts[index] }));
  });
  readonly maxWeekdayCount = computed(() => Math.max(1, ...this.weekdayCounts().map(day => day.count)));
  readonly maxProductCount = computed(() => Math.max(1, ...this.productRanking().map(item => item.quantity)));
  readonly maxBoxCount = computed(() => Math.max(1, ...this.boxRanking().map(item => item.quantity)));
  readonly busiestDay = computed(() => {
    const busiest = [...this.weekdayCounts()].sort((a, b) => b.count - a.count)[0];
    return busiest && busiest.count > 0 ? busiest : null;
  });

  constructor() { void this.load(); }

  private async load(): Promise<void> {
    try {
      await this.data.loadAllOrders();
      await this.data.loadCollections(['recipes']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudieron cargar las estadísticas.');
    } finally {
      this.loading.set(false);
    }
  }

  setPeriod(value: string): void {
    if (value === '7' || value === '30' || value === '90' || value === 'all') this.period.set(value);
  }
  barWidth(value: number, maximum: number): number {
    if (value <= 0 || maximum <= 0) return 0;
    return Math.max(4, Math.round((value / maximum) * 100));
  }
  private isWithinPeriod(order: Order): boolean {
    if (this.period() === 'all') return true;
    const date = this.getOrderDate(order);
    if (!date) return false;
    return date.getTime() >= Date.now() - Number(this.period()) * 24 * 60 * 60 * 1000;
  }
  private getOrderDate(order: Order): Date | null {
    const raw = this.rawOrdersById().get(order.id);
    const candidates = [raw?.['createdAt'], raw?.['created'], raw?.['createdOn'], raw?.['orderDate'], raw?.['orderCreatedAt']];
    const explicitCreatedAt = candidates.find(candidate => typeof candidate === 'string' && candidate.trim());
    const value = typeof explicitCreatedAt === 'string' ? explicitCreatedAt : raw ? undefined : order.createdAt;
    if (typeof value !== 'string') return null;
    const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const parsed = dateOnly ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12)) : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  private getOrderItems(order: Order): { id: string; name: string; quantity: number }[] {
    const raw = this.rawOrdersById().get(order.id);
    const lines = asRecords(raw?.['lines']);
    if (lines.length) {
      return lines.map(line => {
        const id = asText(line['id'] ?? line['recipeId'] ?? line['productId']);
        return { id, name: asText(line['name']) || this.recipeName(id), quantity: asQuantity(line['qty'] ?? line['quantity'] ?? line['count']) };
      }).filter(item => item.id.toLocaleLowerCase('es') !== 'shipping' && !item.name.toLocaleLowerCase('es').startsWith('envío') && item.quantity > 0);
    }
    const rawItems = asRecords(raw?.['items']);
    if (rawItems.length) {
      return rawItems.map(item => {
        const id = asText(item['id'] ?? item['recipeId'] ?? item['productId']);
        return { id, name: asText(item['name']) || this.recipeName(id), quantity: asQuantity(item['qty'] ?? item['quantity'] ?? item['count']) };
      }).filter(item => item.quantity > 0);
    }
    const fromBoxes = this.getBoxRecords(raw).flatMap(box => this.getItemsFromBox(box));
    if (fromBoxes.length) return fromBoxes;
    return order.items.map(item => ({ id: item.recipeId, name: item.name || this.recipeName(item.recipeId), quantity: asQuantity(item.quantity) })).filter(item => item.quantity > 0);
  }
  private getItemsFromBox(box: RawRecord): { id: string; name: string; quantity: number }[] {
    const items = box['items'];
    if (Array.isArray(items)) {
      return asRecords(items).map(item => {
        const id = asText(item['id'] ?? item['recipeId'] ?? item['productId']);
        return { id, name: asText(item['name']) || this.recipeName(id), quantity: asQuantity(item['quantity'] ?? item['qty'] ?? item['count']) };
      }).filter(item => item.quantity > 0);
    }
    if (typeof items === 'object' && items !== null) {
      return Object.entries(items as RawRecord).map(([id, quantity]) => ({ id, name: this.recipeName(id), quantity: asQuantity(quantity) })).filter(item => item.quantity > 0);
    }
    return asRecords(box['lines']).map(line => {
      const id = asText(line['id'] ?? line['recipeId'] ?? line['productId']);
      return { id, name: asText(line['name']) || this.recipeName(id), quantity: asQuantity(line['qty'] ?? line['quantity']) };
    }).filter(item => item.quantity > 0);
  }
  private getBoxRecords(raw: RawRecord | undefined): RawRecord[] {
    const boxes = asRecords(raw?.['boxes']);
    return boxes.length ? boxes : asRecords(raw?.['boxOrders']);
  }
  private getBoxLabel(box: RawRecord): string {
    const presentation = asRecord(box['presentation']);
    const id = asText(box['presentationId'] ?? presentation['id'] ?? box['boxType'] ?? box['type']).toLocaleLowerCase('es');
    const name = asText(box['presentationName'] ?? presentation['name'] ?? box['name']);
    if (name) return name;
    if (id === 'clasicas' || id === 'clasica' || id === 'classic') return 'Caja solo clásicas';
    if (id === 'ny' || id === 'new-york' || id === 'newyork') return 'Caja solo New York';
    if (id === 'mixta' || id === 'mixed') return 'Caja mitad New York, mitad clásicas';
    return id ? 'Caja ' + id : 'Caja personalizada / sin presentación';
  }
  private recipeName(id: string): string {
    return this.data.recipes().find((recipe: Recipe) => recipe.id === id)?.name ?? id ?? 'Galleta sin nombre';
  }
}