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
      background-color: #f9fafb;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    }
    .main-wrapper {
      flex: 1;
      margin-left: 250px;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .content-area {
      padding: 2rem;
      flex: 1;
    }
    @media (max-width: 720px) {
      .main-wrapper { margin-left: 0; }
      .content-area { padding: 1rem; }
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
