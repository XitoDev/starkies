import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideDynamicIcon,
  LucideUtensils,
  LucidePackage,
  LucideFactory,
  LucideStore,
  LucideShoppingBag,
  LucideDollarSign,
  LucideDownload,
} from '@lucide/angular';
import { FirebaseClientService } from '../../core/firebase/firebase-client.service';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, LucideDynamicIcon],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css'
})
export class Sidebar {
  private dataService = inject(DataService);
  private router = inject(Router);
  private firebase = inject(FirebaseClientService);

  readonly loggingOut = signal(false);
  readonly logoutMessage = signal('');
  readonly icons = { Utensils: LucideUtensils, Package: LucidePackage, Factory: LucideFactory, Store: LucideStore, ShoppingBag: LucideShoppingBag, DollarSign: LucideDollarSign, Download: LucideDownload };

  navItems = [
    { label: 'Productos', path: '/recetas', icon: LucideUtensils },
    { label: 'Ingredientes', path: '/ingredientes', icon: LucidePackage },
    { label: 'Producción', path: '/produccion', icon: LucideFactory },
    { label: 'Catálogo', path: '/catalogo', icon: LucideStore },
    { label: 'Pedidos', path: '/pedidos', icon: LucideShoppingBag },
    { label: 'Finanzas', path: '/finanzas', icon: LucideDollarSign }
  ];

  exportBackup(): void {
    this.dataService.exportBackup();
  }

  async logout(): Promise<void> {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    this.logoutMessage.set('');

    try {
      await this.firebase.signOut();
      await this.router.navigateByUrl('/login');
    } catch {
      this.logoutMessage.set('No se pudo cerrar la sesión. Comprueba tu conexión e inténtalo otra vez.');
    } finally {
      this.loggingOut.set(false);
    }
  }
}