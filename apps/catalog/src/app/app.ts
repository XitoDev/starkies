import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { siInstagram, siTiktok, siWhatsapp } from 'simple-icons';
import { CatalogUiService } from './catalog-ui.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, MatIconModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class App {
  readonly title = 'catalog';
  readonly currentYear = new Date().getFullYear();
  readonly socialIcons = { whatsapp: siWhatsapp, instagram: siInstagram, tiktok: siTiktok };
  private readonly router = inject(Router);
  private readonly catalogUi = inject(CatalogUiService);
  readonly cartItemCount = this.catalogUi.cartItemCount;

  openOrder(): void {
    if (this.router.url.startsWith('/menu')) {
      this.catalogUi.requestOrderOpen();
      return;
    }

    void this.router.navigateByUrl('/menu').then(() => this.catalogUi.requestOrderOpen());
  }
}
