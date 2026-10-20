import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { DataService } from '../../services/data.service';
import { Order } from 'shared';

@Component({
  selector: 'app-pedidos',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './pedidos.html',
  styleUrls: ['./pedidos.css']
})
export class Pedidos {
  private readonly data = inject(DataService);
  private readonly router = inject(Router);
  readonly orders = this.data.orders;
  readonly customers = this.data.customers;
  readonly activeTab = signal<'pedidos'|'clientes'>(this.router.parseUrl(this.router.url).queryParams['vista']==='clientes'?'clientes':'pedidos');
  readonly searchTerm = signal('');
  readonly orderMenuId = signal<string|null>(null);
  readonly customerMenuId = signal<string|null>(null);
  readonly notice = signal('');
  readonly error = signal('');
  readonly pendingOrderCount = computed(()=>this.orders().filter(order=>order.status==='PENDING').length);
  readonly filteredOrders = computed(()=>{
    const term=this.searchTerm().trim().toLocaleLowerCase('es');
    return [...this.orders()].filter(order=>!term||order.id.toLocaleLowerCase('es').includes(term)||this.getCustomerName(order.customerId).toLocaleLowerCase('es').includes(term)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  });
  readonly filteredCustomers = computed(()=>{
    const term=this.searchTerm().trim().toLocaleLowerCase('es');
    return this.customers().filter(customer=>!term||customer.name.toLocaleLowerCase('es').includes(term)||(customer.phone??'').toLocaleLowerCase('es').includes(term)||(customer.address??'').toLocaleLowerCase('es').includes(term));
  });
  setTab(tab:'pedidos'|'clientes'):void{this.activeTab.set(tab);this.searchTerm.set('');this.orderMenuId.set(null);this.customerMenuId.set(null);}
  getCustomerName(id:string):string{return this.customers().find(customer=>customer.id===id)?.name??'Cliente desconocido';}
  getCustomerOrderCount(id:string):number{return this.orders().filter(order=>order.customerId===id).length;}
  getCookieCount(order:Order):number{return order.items.reduce((sum,item)=>sum+item.quantity,0);}
  getCustomerTotal(id:string):number{return this.orders().filter(order=>order.customerId===id&&order.status!=='CANCELLED').reduce((sum,order)=>sum+order.total,0);}
  getCustomerOutstanding(id:string):number{return this.orders().filter(order=>order.customerId===id&&order.status==='PENDING').reduce((sum,order)=>sum+order.total,0);}
  getInitials(name:string):string{return name.trim().split(/\s+/).slice(0,2).map(part=>part[0]??'').join('').toLocaleUpperCase('es');}
  statusLabel(status:Order['status']):string{return status==='PENDING'?'Pendiente':status==='DELIVERED'?'Entregado':'Cancelado';}
  async syncCatalog():Promise<void>{this.notice.set('');this.error.set('');await this.data.loadFromCloud();if(this.data.error())this.error.set(this.data.error());else this.notice.set('Datos sincronizados correctamente.');}
  async deleteOrder(order:Order):Promise<void>{this.orderMenuId.set(null);if(!window.confirm(`¿Eliminar el pedido #${order.id}? Esta acción no se puede deshacer.`))return;try{await this.data.deleteOrder(order.id);this.notice.set(`Pedido #${order.id} eliminado.`);}catch(error){this.error.set(error instanceof Error?error.message:'No se pudo eliminar el pedido.');}}
  async deleteCustomer(customerId:string,name:string):Promise<void>{this.customerMenuId.set(null);if(!window.confirm(`¿Eliminar los datos de ${name}? Se conservará el historial de pedidos, pero se quitarán el teléfono y la dirección.`))return;try{await this.data.deleteCustomer(customerId);this.notice.set('Datos personales del cliente eliminados; el historial de pedidos se conservó.');}catch(error){this.error.set(error instanceof Error?error.message:'No se pudo eliminar el cliente.');}}
}