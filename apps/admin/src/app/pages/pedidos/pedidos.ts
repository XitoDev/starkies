import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideDynamicIcon, LucideSearch, LucideShoppingBag, LucideUsers, LucideEye, LucideCircleCheck, LucideCircleX, LucideClock } from '@lucide/angular';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-pedidos',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  templateUrl: './pedidos.html',
  styleUrls: ['./pedidos.css']
})
export class Pedidos {
  private readonly dataService = inject(DataService);

  readonly icons = { ShoppingBag: LucideShoppingBag, Users: LucideUsers, Search: LucideSearch, Eye: LucideEye, CheckCircle: LucideCircleCheck, XCircle: LucideCircleX, Clock: LucideClock };
  readonly orders = this.dataService.orders;
  readonly customers = this.dataService.customers;
  readonly activeTab = signal<'pedidos' | 'clientes'>('pedidos');
  readonly searchTerm = signal<string>('');

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
}