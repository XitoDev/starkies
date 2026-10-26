import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Component, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { FirebaseClientService } from '../../core/firebase/firebase-client.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  template: `
    <header class="topbar">
      <div class="breadcrumb" aria-label="Ubicación actual">
        <span>Mi negocio</span><span class="breadcrumb-chevron" aria-hidden="true">›</span><strong>{{ currentPage() }}</strong>
      </div>
      <div class="topbar-actions">
        <button matButton="outlined" class="settings-button" type="button" [matMenuTriggerFor]="settingsMenu" aria-label="Abrir configuración">
          <mat-icon fontSet="material-symbols-rounded" aria-hidden="true">settings</mat-icon><span>Configuración</span>
        </button>
        <mat-menu #settingsMenu="matMenu" xPosition="before" yPosition="below">
          <button mat-menu-item type="button" [disabled]="loggingOut()" (click)="logout()">
            <mat-icon fontSet="material-symbols-rounded" aria-hidden="true">logout</mat-icon>
            <span>{{ loggingOut() ? 'Cerrando sesión…' : 'Cerrar sesión' }}</span>
          </button>
        </mat-menu>
        @if (logoutMessage()) { <span class="logout-error" role="status" aria-live="polite">{{ logoutMessage() }}</span> }
      </div>
    </header>
  `,
  styles: [`
    .topbar{min-height:80px;flex:0 0 80px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:0 42px;background:#fff;border-bottom:1px solid #eee7f2;position:sticky;top:0;z-index:90}
    .breadcrumb{display:flex;align-items:center;gap:16px;min-width:0;color:#a195aa;font-size:12px}.breadcrumb-chevron{font-size:22px;line-height:1;color:#b8adbf}.breadcrumb strong{color:#65586d;font-weight:500}
    .topbar-actions{position:relative;display:flex;align-items:center;justify-content:flex-end;gap:10px;min-width:0}
    .settings-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:0 14px;border-radius:10px;color:#6c5b79;background:#fff;font-size:12px;font-weight:600;white-space:nowrap}
    .settings-button mat-icon{width:19px;height:19px;font-size:19px}
    .logout-error{position:absolute;top:calc(100% + 7px);right:0;z-index:2;max-width:280px;padding:9px 12px;border:1px solid #f0d3d5;border-radius:9px;background:#fff;color:#a44855;font-size:11px;line-height:1.45;box-shadow:0 8px 22px rgb(48 38 58 / 8%)}
    @media(max-width:760px){.topbar{min-height:66px;flex-basis:66px;padding:0 18px;gap:10px}.breadcrumb{gap:9px}.settings-button{min-height:38px;gap:5px;padding:0 10px;font-size:11px}.settings-button mat-icon{width:17px;height:17px;font-size:17px}}
  `]
})
export class Topbar {
  readonly currentPage = signal('Resumen');
  readonly loggingOut = signal(false);
  readonly logoutMessage = signal('');
  private readonly labels: Record<string, string> = {
    resumen:'Resumen', estadisticas:'Estadísticas', recetas:'Recetas', ingredientes:'Insumos',
    inventario:'Inventario', produccion:'Producción', catalogo:'Catálogo', pedidos:'Pedidos', finanzas:'Finanzas',
  };
  constructor(private readonly router: Router, private readonly firebase: FirebaseClientService) {
    this.updatePage(router.url);
    router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => this.updatePage(event.urlAfterRedirects));
  }
  private updatePage(url: string): void {
    const segment = url.split('?')[0].split('/').filter(Boolean)[0] ?? 'resumen';
    this.currentPage.set(this.labels[segment] ?? 'Mi negocio');
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
    } finally { this.loggingOut.set(false); }
  }
}