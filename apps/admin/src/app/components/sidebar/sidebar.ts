import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideAngularModule,
  Utensils,
  Package,
  Factory,
  Store,
  ShoppingBag,
  DollarSign,
  Download
} from 'lucide-angular';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css'
})
export class Sidebar {
  private dataService = inject(DataService);

  readonly icons = {
    Utensils,
    Package,
    Factory,
    Store,
    ShoppingBag,
    DollarSign,
    Download
  };

  navItems = [
    { label: 'Recetas', path: '/recetas', icon: Utensils },
    { label: 'Ingredientes', path: '/ingredientes', icon: Package },
    { label: 'Producción', path: '/produccion', icon: Factory },
    { label: 'Catálogo', path: '/catalogo', icon: Store },
    { label: 'Pedidos', path: '/pedidos', icon: ShoppingBag },
    { label: 'Finanzas', path: '/finanzas', icon: DollarSign }
  ];

  exportBackup(): void {
    this.dataService.exportBackup();
  }
}
