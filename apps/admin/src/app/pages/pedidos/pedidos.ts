import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { DataService } from '../../services/data.service';
import { Order } from 'shared';

@Component({
  selector: 'app-pedidos',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, RouterLink, MatButtonModule, MatIconModule, MatInputModule, MatMenuModule],
  templateUrl: './pedidos.html',
  styleUrls: ['./pedidos.css']
})
export class Pedidos implements OnDestroy {
  readonly data = inject(DataService);
  private readonly router = inject(Router);
  readonly orders = this.data.orders;
  readonly customers = this.data.customers;
  readonly activeTab = signal<'pedidos' | 'clientes'>(this.router.parseUrl(this.router.url).queryParams['vista'] === 'clientes' ? 'clientes' : 'pedidos');
  readonly customerView = signal<'grid' | 'table'>('grid');
  readonly searchTerm = signal('');
  readonly searchOrderResults = signal<Order[] | null>(null);
  readonly searchCustomerResults = signal<import('shared').Customer[] | null>(null);
  readonly searchPending = signal(false);
  readonly statusFilter = signal<'ALL' | Order['status']>('ALL');
  readonly notice = signal('');
  readonly error = signal('');
  readonly syncing = signal(false);
  readonly pendingOrderCount = this.data.pendingOrderCount;
  readonly statusOptions: { value: Order['status']; label: string }[] = [
    { value: 'PENDING', label: 'Pendiente' },
    { value: 'PREPARING', label: 'En preparación' },
    { value: 'READY', label: 'Listo para entregar' },
    { value: 'DELIVERED', label: 'Entregado' },
    { value: 'CANCELLED', label: 'Cancelado' },
  ];
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchRequestId = 0;

  constructor() {
    void this.data.loadCollections(['customers']).catch(() => undefined);
    void this.data.loadOrdersPage(true, this.statusFilter());
    void this.data.refreshPendingOrderCount().catch(() => undefined);
  }

  readonly filteredOrders = computed(() => {
    const term = this.searchTerm().trim();
    const source = term.length >= 2 ? (this.searchOrderResults() ?? []) : this.orders();
    return [...source].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  });

  readonly filteredCustomers = computed(() => {
    const term = this.searchTerm().trim();
    return term.length >= 2 ? (this.searchCustomerResults() ?? []) : this.customers();
  });

  displayOrderId(id: string): string { return id.replace(/-/g, '').slice(-6).toUpperCase(); }

  setSearchTerm(value: string): void {
    const previousTerm = this.searchTerm().trim();
    this.searchTerm.set(value);
    this.searchOrderResults.set(null);
    this.searchCustomerResults.set(null);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const requestId = ++this.searchRequestId;
    const term = value.trim();
    if (term.length < 2) {
      this.searchPending.set(false);
      if (previousTerm.length >= 2 && this.activeTab() === 'pedidos') void this.data.loadOrdersPage(true, this.statusFilter());
      return;
    }
    this.searchPending.set(true);
    this.searchTimer = setTimeout(async () => {
      try {
        if (this.activeTab() === 'pedidos') {
          const results = await this.data.searchOrders(term, this.statusFilter());
          if (requestId === this.searchRequestId) this.searchOrderResults.set(results);
        } else {
          const results = await this.data.searchCustomers(term);
          if (requestId === this.searchRequestId) this.searchCustomerResults.set(results);
        }
      } catch (error) {
        if (requestId === this.searchRequestId) this.error.set(error instanceof Error ? error.message : 'No se pudo realizar la búsqueda.');
      } finally {
        if (requestId === this.searchRequestId) this.searchPending.set(false);
      }
    }, 350);
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchRequestId++;
  }

  setTab(tab: 'pedidos' | 'clientes'): void {
    this.activeTab.set(tab);
    this.setSearchTerm('');
    this.error.set('');
    this.notice.set('');
    if (tab === 'clientes') {
      void this.data.loadCollections(['customers'], true);
      void this.data.loadAllOrders();
    } else {
      void this.data.loadOrdersPage(true, this.statusFilter());
    }
  }

  registerActive(): void {
    if (this.activeTab() === 'pedidos') void this.router.navigate(['/pedidos', 'nuevo']);
    else void this.router.navigate(['/pedidos', 'clientes', 'nuevo']);
  }

  registerCustomOrder(): void {
    if (this.activeTab() !== 'pedidos') return;
    void this.router.navigate(['/pedidos', 'nuevo'], { queryParams: { tipo: 'personalizado' } });
  }

  toggleCustomerView(): void {
    this.customerView.update(view => view === 'grid' ? 'table' : 'grid');
  }

  setStatusFilter(value: string): void {
    this.statusFilter.set(value as 'ALL' | Order['status']);
    const term = this.searchTerm().trim();
    if (term.length >= 2) this.setSearchTerm(term);
    else void this.data.loadOrdersPage(true, this.statusFilter());
  }

  getCustomerName(id: string): string {
    const direct = this.customers().find(customer => customer.id === id);
    if (direct) return direct.name;
    const order = this.orders().find(item => item.customerId === id);
    const rawState = this.data.rawState?.();
    const rawOrders = Array.isArray(rawState?.['orders']) ? rawState['orders'] as Record<string, unknown>[] : [];
    const rawOrder = order ? rawOrders.find(item => String(item['id'] ?? item['code'] ?? '') === order.id) : undefined;
    const phone = this.normalizePhone(String(rawOrder?.['phone'] ?? ''));
    const matched = phone ? this.customers().find(customer => this.normalizePhone(customer.phone ?? '') === phone) : undefined;
    const legacyName = typeof rawOrder?.['customer'] === 'string' ? String(rawOrder['customer']).trim().toLocaleLowerCase('es') : '';
    const matchedByName = legacyName ? this.customers().find(customer => customer.name.trim().toLocaleLowerCase('es') === legacyName) : undefined;
    return matched?.name ?? matchedByName?.name ?? (typeof rawOrder?.['customer'] === 'string' && rawOrder['customer'] ? String(rawOrder['customer']) : 'Cliente desconocido');
  }

  private getOrdersForCustomer(id: string): Order[] {
    const customer = this.customers().find(item => item.id === id);
    const rawState = this.data.rawState?.();
    const rawOrders = Array.isArray(rawState?.['orders']) ? rawState['orders'] as Record<string, unknown>[] : [];
    const customerPhone = this.normalizePhone(customer?.phone ?? '');
    const customerName = customer?.name.trim().toLocaleLowerCase('es') ?? '';
    return this.orders().filter(order => {
      if (order.customerId === id) return true;
      const raw = rawOrders.find(item => String(item['id'] ?? item['code'] ?? '') === order.id);
      if (!raw) return false;
      const orderPhone = this.normalizePhone(String(raw['phone'] ?? ''));
      if (customerPhone.length >= 7 && orderPhone.length >= 7) return customerPhone === orderPhone;
      const orderName = String(raw['customer'] ?? '').trim().toLocaleLowerCase('es');
      return Boolean(customerName && orderName && customerName === orderName);
    });
  }

  getCustomerOrderCount(id: string): number { return this.getOrdersForCustomer(id).length; }
  getCookieCount(order: Order): number { return order.items.reduce((sum, item) => sum + item.quantity, 0); }
  getCustomerTotal(id: string): number { return this.getOrdersForCustomer(id).filter(order => order.status !== 'CANCELLED').reduce((sum, order) => sum + order.total, 0); }
  getCustomerOutstanding(id: string): number { return this.getOrdersForCustomer(id).filter(order => order.status === 'PENDING').reduce((sum, order) => sum + order.total, 0); }
  getInitials(name: string): string { return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toLocaleUpperCase('es'); }

  statusLabel(status: Order['status']): string {
    return status === 'PENDING' ? 'Pendiente'
      : status === 'PREPARING' ? 'En preparación'
      : status === 'READY' ? 'Listo para entregar'
      : status === 'DELIVERED' ? 'Entregado'
      : 'Cancelado';
  }

  private normalizePhone(value: string): string { return value.replace(/\D/g, '').replace(/^593/, '0'); }

  async changeOrderStatus(order: Order, status: Order['status']): Promise<void> {
    if (order.status === status) return;
    this.error.set('');
    this.notice.set('');
    try {
      await this.data.updateOrderStatus(order.id, status);
      this.notice.set('Estado del pedido actualizado.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo actualizar el estado del pedido.');
    }
  }

  async syncCatalog(): Promise<void> {
    if (this.syncing()) return;
    this.syncing.set(true);
    this.notice.set('');
    this.error.set('');
    try {
      await this.data.loadFromCloud(undefined, true);
      if (this.data.error()) this.error.set(this.data.error());
      else this.notice.set('Datos actualizados desde Firebase.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudieron actualizar los datos.');
    } finally {
      this.syncing.set(false);
    }
  }

  async deleteOrder(order: Order): Promise<void> {
    this.error.set('');
    this.notice.set('');
    if (!window.confirm('¿Eliminar el pedido #' + order.id + '? Esta acción no se puede deshacer.')) return;
    try {
      await this.data.deleteOrder(order.id);
      this.notice.set('Pedido eliminado.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo eliminar el pedido.');
    }
  }

  async deleteCustomer(customerId: string, name: string): Promise<void> {
    if (!window.confirm('¿Eliminar los datos de ' + name + '? Se conservará el historial de pedidos, pero se quitarán sus datos personales.')) return;
    this.error.set('');
    this.notice.set('');
    try {
      await this.data.deleteCustomer(customerId);
      this.notice.set('Datos personales del cliente eliminados; el historial se conservó.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo eliminar el cliente.');
    }
  }
}