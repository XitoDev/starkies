import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-clear-cart-confirmation-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <section class="clear-cart-confirmation-dialog">
      <h2 mat-dialog-title id="clear-cart-confirmation-title">¿Vaciar tu carrito?</h2>
      <mat-dialog-content id="clear-cart-confirmation-description">
        Se eliminarán todas las cajas guardadas, la caja en curso y el código de descuento aplicado. Esta acción no se puede deshacer.
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton="outlined" type="button" class="cancel-action" [mat-dialog-close]="false">Conservar carrito</button>
        <button matButton="elevated" type="button" class="danger-action" (click)="confirm()">Vaciar carrito</button>
      </mat-dialog-actions>
    </section>
  `,
  styles: [`
    :host { display:block; color:#261f29; }
    h2[mat-dialog-title] { margin:0; padding:22px 24px 8px; color:#604a59; font:600 20px/1.3 'DM Sans',Arial,sans-serif; }
    mat-dialog-content { padding:0 24px 4px; color:#756974; font:400 14px/1.6 'DM Sans',Arial,sans-serif; }
    mat-dialog-actions { gap:8px; padding:14px 24px 22px; }
    .cancel-action { min-height:42px; border:1px solid #d7cbd2; color:#604a59; }
    .danger-action { min-height:42px; background:#a44855; color:#fff; }
    .danger-action:hover { background:#873944; }
    @media(max-width:420px) { mat-dialog-actions { flex-wrap:wrap; } mat-dialog-actions button { flex:1 1 auto; } }
  `],
})
export class ClearCartConfirmationDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ClearCartConfirmationDialogComponent>);

  confirm(): void {
    this.dialogRef.close(true);
  }
}
