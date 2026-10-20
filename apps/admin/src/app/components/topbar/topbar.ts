import { Component, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { FirebaseClientService } from '../../core/firebase/firebase-client.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  template: `
    <header class="topbar">
      <div class="breadcrumb" aria-label="Ubicación actual">
        <span>Mi negocio</span>
        <span class="breadcrumb-chevron" aria-hidden="true">›</span>
        <strong>{{ currentPage() }}</strong>
      </div>
      <div class="topbar-actions">
        <time class="today">{{ today }}</time>
        @if (logoutMessage()) {
          <span class="logout-error" role="status" aria-live="polite">{{ logoutMessage() }}</span>
        }
        <button
          type="button"
          class="logout-button"
          [disabled]="loggingOut()"
          (click)="logout()"
        >
          <span aria-hidden="true">↪</span>
          {{ loggingOut() ? 'Cerrando sesión…' : 'Cerrar sesión' }}
        </button>
      </div>
    </header>
  `,
  styles: [`
    .topbar {
      min-height: 80px;
      flex: 0 0 80px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding: 0 42px;
      background: #fff;
      border-bottom: 1px solid #eee7f2;
      position: sticky;
      top: 0;
      z-index: 90;
    }

    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 0;
      color: #a195aa;
      font-size: 12px;
    }

    .breadcrumb-chevron {
      font-size: 22px;
      line-height: 1;
      color: #b8adbf;
    }

    .breadcrumb strong {
      color: #65586d;
      font-weight: 500;
    }

    .topbar-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 18px;
      min-width: 0;
    }

    .today {
      flex: 0 0 auto;
      color: #9d91a5;
      font-size: 11px;
      white-space: nowrap;
    }

    .logout-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 38px;
      padding: 0 13px;
      border: 1px solid #e8deef;
      border-radius: 10px;
      background: #fff;
      color: #75518e;
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
      cursor: pointer;
      transition: background-color .15s ease, border-color .15s ease;
    }

    .logout-button:hover:not(:disabled) {
      background: #f8f2fc;
      border-color: #d7c4e7;
    }

    .logout-button:focus-visible {
      outline: 3px solid #bba0d1;
      outline-offset: 3px;
    }

    .logout-button:disabled {
      cursor: progress;
      opacity: .65;
    }

    .logout-error {
      max-width: 240px;
      color: #a23b43;
      font-size: 11px;
      line-height: 1.4;
    }

    @media (max-width: 760px) {
      .topbar {
        min-height: 66px;
        flex-basis: 66px;
        padding: 0 18px;
        gap: 10px;
      }

      .breadcrumb { gap: 9px; }
      .topbar-actions { gap: 8px; }
      .today { display: none; }
      .logout-button { min-height: 36px; padding: 0 9px; font-size: 11px; }
      .logout-error { max-width: 110px; }
    }

    @media (max-width: 390px) {
      .logout-button { gap: 4px; padding: 0 7px; }
      .logout-error { display: none; }
    }
  `]
})
export class Topbar {
  readonly currentPage = signal('Recetas');
  readonly loggingOut = signal(false);
  readonly logoutMessage = signal('');
  readonly today = new Intl.DateTimeFormat('es-EC', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  private readonly labels: Record<string, string> = {
    recetas: 'Recetas',
    ingredientes: 'Ingredientes',
    produccion: 'Producción',
    catalogo: 'Catálogo',
    pedidos: 'Pedidos',
    finanzas: 'Finanzas',
  };

  constructor(
    private readonly router: Router,
    private readonly firebase: FirebaseClientService,
  ) {
    this.updatePage(router.url);
    router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.updatePage(event.urlAfterRedirects));
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

  private updatePage(url: string): void {
    const segment = url.split('?')[0].split('/').filter(Boolean)[0] ?? 'recetas';
    this.currentPage.set(this.labels[segment] ?? 'Mi negocio');
  }
}
