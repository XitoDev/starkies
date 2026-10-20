import { Component, Inject } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-catalog-order-sheet',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, FormsModule, MatBottomSheetModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  templateUrl: './catalog-order-sheet.html',
  styleUrls: ['./catalog-order-sheet.css'],
})
export class CatalogOrderSheetComponent {
  readonly catalog: any;
  constructor(@Inject(MAT_BOTTOM_SHEET_DATA) data: { catalog: any }) {
    this.catalog = data.catalog;
  }
}
