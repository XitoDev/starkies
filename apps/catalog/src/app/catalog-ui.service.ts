import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CatalogUiService {
  readonly cartItemCount = signal(0);
  readonly openOrderRequest = signal(0);

  requestOrderOpen(): void {
    this.openOrderRequest.update(request => request + 1);
  }
}
