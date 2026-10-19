import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Sidebar } from './components/sidebar/sidebar';
import { Topbar } from './components/topbar/topbar';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Sidebar, Topbar],
  template: `
    <div class="app-layout">
      <app-sidebar></app-sidebar>
      <div class="main-wrapper">
        <app-topbar></app-topbar>
        <main class="content-area">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
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
  `]
})
export class App {}
