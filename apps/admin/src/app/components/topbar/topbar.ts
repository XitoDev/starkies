import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="topbar">
      <div class="topbar-status">
        <span class="status-badge">Ecuador (USD $)</span>
      </div>
    </header>
  `,
  styles: [`
    .topbar {
      height: 60px;
      background-color: #ffffff;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 0 2rem;
      position: sticky;
      top: 0;
      z-index: 90;
    }

    .status-badge {
      background-color: #f3f4f6;
      color: #374151;
      font-size: 0.8rem;
      padding: 0.35rem 0.75rem;
      border-radius: 9999px;
      font-weight: 500;
    }
  `]
})
export class Topbar {}
