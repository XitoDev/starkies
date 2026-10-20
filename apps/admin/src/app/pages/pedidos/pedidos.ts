import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideDynamicIcon,
  LucideSearch,
  LucideShoppingBag,
  LucideUsers,
  LucideEye,
  LucideCircleCheck,
  LucideCircleX,
  LucideClock,
  LucideCalendar,
  LucidePackage,
  LucidePhone,
  LucideMapPin,
} from '@lucide/angular';
import { DataService } from '../../services/data.service';
import { Order } from 'shared';

@Component({
  selector: 'app-pedidos',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  templateUrl: './pedidos.html',
  styleUrls: ['./pedidos.css']
})
export class Pedidos {
  private readonly dataService = inject(DataService);

  readonly icons = {
    ShoppingBag: LucideShoppingBag,
    Users: LucideUsers,
    Search: LucideSearch,
    Eye: LucideEye,
    CheckCircle: LucideCircleCheck,
    XCircle: LucideCircleX,
    Clock: LucideClock,
    Calendar: LucideCalendar,
    Package: LucidePackage,
    Phone: LucidePhone,
    MapPin: LucideMapPin,
  };

  readonly orders = this.dataService.orders;
  readonly customers = this.dataService.customers;
  readonly recipes = this.dataService.recipes;
  readonly activeTab = signal<'pedidos' | 'clientes'>('pedidos');
  readonly searchTerm = signal<string>('');
  readonly selectedOrderId = signal<string | null>(null);
  readonly savingStatus = signal(false);
  readonly orderActionError = signal('');
  readonly notice = signal('');

  readonly selectedOrder = computed(() =>
    this.orders().find(order => order.id === this.selectedOrderId()) ?? null,
  );

  readonly selectedCustomer = computed(() => {
    const order = this.selectedOrder();
    return order ? this.customers().find(customer => customer.id === order.customerId) ?? null : null;
  });

  readonly pendingOrderCount = computed(() => this.orders().filter(order => order.status === 'PENDING').length);
  readonly deliveredOrderCount = computed(() => this.orders().filter(order => order.status === 'DELIVERED').length);
  readonly orderValueTotal = computed(() => this.orders().reduce((total, order) => total + order.total, 0));

  readonly filteredOrders = computed(() => {
    const term = this.searchTerm().trim().toLocaleLowerCase('es');
    const all = this.orders();
    if (!term) return all;
    return all.filter(order =>
      order.id.toLocaleLowerCase('es').includes(term)
      || this.getCustomerName(order.customerId).toLocaleLowerCase('es').includes(term)
    );
  });

  readonly filteredCustomers = computed(() => {
    const term = this.searchTerm().trim().toLocaleLowerCase('es');
    const all = this.customers();
    if (!term) return all;
    return all.filter(customer =>
      customer.name.toLocaleLowerCase('es').includes(term)
      || (customer.phone ?? '').toLocaleLowerCase('es').includes(term)
      || (customer.address ?? '').toLocaleLowerCase('es').includes(term)
    );
  });

  setTab(tab: 'pedidos' | 'clientes'): void {
    this.activeTab.set(tab);
    this.searchTerm.set('');
  }

  onSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  getCustomerName(customerId: string): string {
    const customer = this.customers().find(customer => customer.id === customerId);
    return customer ? customer.name : 'Cliente desconocido';
  }

  getRecipeName(recipeId: string): string {
    return this.recipes().find(recipe => recipe.id === recipeId)?.name ?? 'Receta no disponible';
  }

  getLineName(item: Order['items'][number]): string {
    return item.name || this.getRecipeName(item.recipeId);
  }

  getLineTotal(item: Order['items'][number]): number {
    return item.quantity * item.unitPrice;
  }

  getCustomerOrderCount(customerId: string): number {
    return this.orders().filter(order => order.customerId === customerId).length;
  }

  openOrderDetails(order: Order): void {
    this.selectedOrderId.set(order.id);
    this.orderActionError.set('');
    this.notice.set('');
  }

  closeOrderDetails(): void {
    if (this.savingStatus()) return;
    this.selectedOrderId.set(null);
    this.orderActionError.set('');
  }

  async updateOrderStatus(status: 'DELIVERED' | 'CANCELLED'): Promise<void> {
    const order = this.selectedOrder();
    if (!order || this.savingStatus()) return;

    if (order.status !== 'PENDING') {
      this.orderActionError.set('Este pedido ya no está pendiente y no admite más cambios de estado.');
      return;
    }

    if (status === 'CANCELLED' && !window.confirm(`¿Cancelar el pedido #${order.id}? Esta acción no se puede deshacer desde esta pantalla.`)) {
      return;
    }

    this.savingStatus.set(true);
    this.orderActionError.set('');
    this.notice.set('');
    try {
      await this.dataService.updateOrderStatus(order.id, status);
      this.selectedOrderId.set(null);
      this.notice.set(status === 'DELIVERED'
        ? `El pedido #${order.id} se marcó como entregado.`
        : `El pedido #${order.id} se canceló correctamente.`);
    } catch (error) {
      this.orderActionError.set(error instanceof Error ? error.message : 'No se pudo actualizar el estado del pedido.');
    } finally {
      this.savingStatus.set(false);
    }
  }
}