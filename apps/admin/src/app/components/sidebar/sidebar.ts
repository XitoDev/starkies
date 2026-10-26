import { MatButtonModule } from '@angular/material/button';
import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, MatIconModule, MatButtonModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css'
})
export class Sidebar {
  private dataService = inject(DataService);
  readonly pendingOrderCount = computed(() => this.dataService.orders().filter(order => order.status === 'PENDING').length);
  navItems = [
    { label: 'Resumen', path: '/resumen', icon: 'dashboard' },
    { label: 'Estadísticas', path: '/estadisticas', icon: 'monitoring' },
    { label: 'Recetas', path: '/recetas', icon: 'cookie' },
    { label: 'Insumos', path: '/ingredientes', icon: 'science' },
    { label: 'Inventario', path: '/inventario', icon: 'inventory_2' },
    { label: 'Producción', path: '/produccion', icon: 'precision_manufacturing' },
    { label: 'Catálogo', path: '/catalogo', icon: 'storefront' },
    { label: 'Pedidos', path: '/pedidos', icon: 'shopping_bag' },
    { label: 'Finanzas', path: '/finanzas', icon: 'payments' }
  ];
}