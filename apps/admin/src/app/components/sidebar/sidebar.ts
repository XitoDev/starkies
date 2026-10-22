import { MatButtonModule } from '@angular/material/button';
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { FirebaseClientService } from '../../core/firebase/firebase-client.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, MatIconModule, MatButtonModule, MatMenuModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css'
})
export class Sidebar {
  private router = inject(Router);
  private firebase = inject(FirebaseClientService);

  readonly loggingOut = signal(false);
  readonly logoutMessage = signal('');
  navItems = [
    { label: 'Resumen', path: '/resumen', icon: 'dashboard' },
    { label: 'Recetas', path: '/recetas', icon: 'cookie' },
    { label: 'Insumos', path: '/ingredientes', icon: 'science' },
    { label: 'Inventario', path: '/inventario', icon: 'inventory_2' },
    { label: 'Producción', path: '/produccion', icon: 'precision_manufacturing' },
    { label: 'Catálogo', path: '/catalogo', icon: 'storefront' },
    { label: 'Pedidos', path: '/pedidos', icon: 'shopping_bag' },
    { label: 'Finanzas', path: '/finanzas', icon: 'payments' }
  ];

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