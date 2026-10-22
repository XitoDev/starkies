import { Component, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Sidebar } from './components/sidebar/sidebar';
import { Topbar } from './components/topbar/topbar';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Sidebar, Topbar],
  template: `
    @if (isBareRoute()) {
      <router-outlet></router-outlet>
    } @else {
      <div class="app-layout">
        <app-sidebar></app-sidebar>
        <div class="main-wrapper">
          <app-topbar></app-topbar>
          <main class="content-area">
            <router-outlet></router-outlet>
          </main>
        </div>
      </div>
    }
  `,
  styles: [`
    .app-layout {
      display: flex;
      min-height: 100vh;
      background: var(--sk-page, #f9f7fa);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    .main-wrapper {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .content-area {
      flex: 1;
      min-width: 0;
      padding: 42px;
    }

    @media (max-width: 760px) {
      .content-area { padding: 26px 18px; }
    }
  `]
})
export class App {
  readonly isBareRoute = signal(false);

  private isBarePath(url: string): boolean {
    return url.startsWith('/login') || url.startsWith('/migracion');
  }

  constructor(router: Router) {
    this.isBareRoute.set(this.isBarePath(router.url));
    router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.isBareRoute.set(this.isBarePath(event.urlAfterRedirects)));
  }
}