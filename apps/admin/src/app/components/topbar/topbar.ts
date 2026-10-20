import { Component, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

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

    @media (max-width: 760px) {
      .topbar {
        min-height: 66px;
        flex-basis: 66px;
        padding: 0 18px;
        gap: 10px;
      }

      .breadcrumb { gap: 9px; }
      .today { display: none; }
    }
  `]
})
export class Topbar {
  readonly currentPage = signal('Recetas');
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

  constructor(private readonly router: Router) {
    this.updatePage(router.url);
    router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.updatePage(event.urlAfterRedirects));
  }

  private updatePage(url: string): void {
    const segment = url.split('?')[0].split('/').filter(Boolean)[0] ?? 'recetas';
    this.currentPage.set(this.labels[segment] ?? 'Mi negocio');
  }
}