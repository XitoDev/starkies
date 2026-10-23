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
  constructor() { void this.data.loadOrdersPage(true, this.statusFilter()); void this.data.refreshPendingOrderCount().catch(() => undefined); }
    readonly orders = this.data.orders;
  readonly customers = this.data.customers;
  readonly activeTab = signal<'pedidos'|'clientes'>(this.router.parseUrl(this.router.url).queryParams['vista']==='clientes'?'clientes':'pedidos');
  readonly searchTerm = signal('');
  readonly searchOrderResults = signal<Order[] | null>(null);
  readonly searchCustomerResults = signal<import('shared').Customer[] | null>(null);
  readonly searchPending = signal(false);
  readonly openOrderActions = signal<string | null>(null);
  displayOrderId(id: string): string { return id.replace(/-/g, '').slice(-6).toUpperCase(); }
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchRequestId = 0;
  readonly statusFilter = signal<'ALL' | Order['status']>('ALL');
  readonly orderMenuId = signal<string|null>(null);
  readonly customerMenuId = signal<string|null>(null);
  readonly notice = signal('');
  readonly error = signal('');
  readonly pendingOrderCount = this.data.pendingOrderCount;
  readonly filteredOrders = computed(() => {
    const term = this.searchTerm().trim();
    const source = term.length >= 2 ? (this.searchOrderResults() ?? []) : this.orders();
    return [...source].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  });
  readonly filteredCustomers = computed(() => {
    const term = this.searchTerm().trim();
    return term.length >= 2 ? (this.searchCustomerResults() ?? []) : this.customers();
  });
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
    }, 1000);
  }
  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchRequestId++;
  }
  setTab(tab:'pedidos'|'clientes'):void{this.activeTab.set(tab);this.setSearchTerm('');this.orderMenuId.set(null);this.customerMenuId.set(null);if(tab==='clientes')void this.data.loadAllOrders();else void this.data.loadOrdersPage(true,this.statusFilter());}
  setStatusFilter(value: string): void { this.statusFilter.set(value as 'ALL' | Order['status']); const term=this.searchTerm().trim(); if(term.length>=2) this.setSearchTerm(term); else void this.data.loadOrdersPage(true, this.statusFilter()); }
  getCustomerName(id:string):string{return this.customers().find(customer=>customer.id===id)?.name??'Cliente desconocido';}
  getCustomerOrderCount(id:string):number{return this.orders().filter(order=>order.customerId===id).length;}
  getCookieCount(order:Order):number{return order.items.reduce((sum,item)=>sum+item.quantity,0);}
  getCustomerTotal(id:string):number{return this.orders().filter(order=>order.customerId===id&&order.status!=='CANCELLED').reduce((sum,order)=>sum+order.total,0);}
  getCustomerOutstanding(id:string):number{return this.orders().filter(order=>order.customerId===id&&order.status==='PENDING').reduce((sum,order)=>sum+order.total,0);}
  getInitials(name:string):string{return name.trim().split(/\s+/).slice(0,2).map(part=>part[0]??'').join('').toLocaleUpperCase('es');}
  statusLabel(status:Order['status']):string{return status==='PENDING'?'Pendiente':status==='PREPARING'?'En preparación':status==='READY'?'Listo':status==='DELIVERED'?'Entregado':'Cancelado';}
  async syncCatalog():Promise<void>{this.notice.set('');this.error.set('');await this.data.loadFromCloud();if(this.data.error())this.error.set(this.data.error());else this.notice.set('Datos sincronizados correctamente.');}
  async deleteOrder(order:Order):Promise<void>{this.orderMenuId.set(null);if(!window.confirm(`¿Eliminar el pedido #${order.id}? Esta acción no se puede deshacer.`))return;try{await this.data.deleteOrder(order.id);this.notice.set(`Pedido #${order.id} eliminado.`);}catch(error){this.error.set(error instanceof Error?error.message:'No se pudo eliminar el pedido.');}}
  async deleteCustomer(customerId:string,name:string):Promise<void>{this.customerMenuId.set(null);if(!window.confirm(`¿Eliminar los datos de ${name}? Se conservará el historial de pedidos, pero se quitarán el teléfono y la dirección.`))return;try{await this.data.deleteCustomer(customerId);this.notice.set('Datos personales del cliente eliminados; el historial de pedidos se conservó.');}catch(error){this.error.set(error instanceof Error?error.message:'No se pudo eliminar el cliente.');}}
}