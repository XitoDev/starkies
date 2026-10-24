import { Component } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [FormsModule, RouterLink],
  styleUrl: './landing.css',
  templateUrl: './landing.html',
})
export class Landing {
  phone = '';
  name = '';
  quantity: number | null = null;
  cookieType = '';
  notes = '';
  formError = '';

  sendQuote(form: NgForm): void {
    this.formError = '';
    if (!form.valid) {
      this.formError = 'Revisa los campos obligatorios y asegúrate de que el teléfono y la cantidad sean válidos.';
      return;
    }
    if (this.quantity !== null && (!Number.isInteger(Number(this.quantity)) || Number(this.quantity) < 1 || Number(this.quantity) > 5000)) {
      this.formError = 'La cantidad debe ser un número entero entre 1 y 5000.';
      return;
    }
    const lines = [
      '¡Hola StarKies! Quisiera cotizar un pedido personalizado de galletas.',
      '',
      'Teléfono / WhatsApp: ' + this.phone.trim(),
      'Nombre: ' + this.name.trim(),
      'Cantidad aproximada: ' + (this.quantity ? this.quantity + ' galletas' : 'Por definir'),
      'Tipo de galletas: ' + (this.cookieType || 'Por definir'),
      'Notas adicionales: ' + (this.notes.trim() || 'Sin notas adicionales'),
    ];
    const url = 'https://wa.me/593979075202?text=' + encodeURIComponent(lines.join('\n'));
    const popup = window.open(url, '_blank');
    if (popup) popup.opener = null;
    else this.formError = 'No pudimos abrir WhatsApp. Permite las ventanas emergentes o escríbenos al 0979075202.';
  }
}
