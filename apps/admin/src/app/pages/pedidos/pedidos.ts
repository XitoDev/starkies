import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAngularModule,
  Search,
  ShoppingBag,
  Users,
  Eye,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-angular';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-pedidos',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './pedidos.html',
  styleUrls: ['./pedidos.css']
})
export class Pedidos {
  private dataService = inject(DataService);

  readonly icons = { ShoppingBag, Users, Search, Eye, CheckCircle, XCircle, Clock };

  orders = this.dataService.orders;
  customers = this.dataService.customers;

  // Estado para controlar qué pestaña está activa
  activeTab = signal<'pedidos' | 'clientes'>('pedidos');
  searchTerm = signal<string>('');

  // Filtro de Pedidos
  filteredOrders = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const all = this.orders() || [];
    if (!term) return all;
    return all.filter(o =>
      o.id.toLowerCase().includes(term) ||
      this.getCustomerName(o.customerId).toLowerCase().includes(term)
    );
  });

  // Filtro de Clientes
  filteredCustomers = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const all = this.customers() || [];
    if (!term) return all;
    return all.filter(c => c.name.toLowerCase().includes(term));
  });

  setTab(tab: 'pedidos' | 'clientes') {
    this.activeTab.set(tab);
    this.searchTerm.set(''); // Limpiamos la búsqueda al cambiar de pestaña
  }

  onSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchTerm.set(input.value);
  }

  getCustomerName(customerId: string): string {
    const customer = this.customers().find(c => c.id === customerId);
    return customer ? customer.name : 'Cliente Desconocido';
  }
}
