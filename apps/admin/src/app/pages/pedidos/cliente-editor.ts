import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Customer } from 'shared';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-cliente-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatButtonModule],
  template: `
    <section class="editor-page">
      <header class="heading">
        <div><h1>Editar cliente</h1><p>Actualiza sus datos de contacto para los próximos pedidos.</p></div>
      </header>
      @if (error()) { <p class="message error">{{ error() }}</p> }
      @if (saved()) { <p class="message success">Cliente actualizado correctamente.</p> }
      @if (!customer()) { <p class="message">No se encontró este cliente. Puede que los datos todavía se estén cargando.</p> }
      <form (ngSubmit)="save()">
        <label>Nombre<input required maxlength="100" [(ngModel)]="name" name="name" autocomplete="name"></label>
        <label>Teléfono<input maxlength="32" [(ngModel)]="phone" name="phone" autocomplete="tel"></label>
        <label>Dirección<textarea rows="3" maxlength="250" [(ngModel)]="address" name="address" autocomplete="street-address"></textarea></label>
        <footer><a matButton="outlined" class="secondary" routerLink="/pedidos">Cancelar</a><button matButton="elevated" type="submit" [disabled]="saving() || !customer()">{{ saving() ? 'Guardando…' : 'Guardar cliente' }}</button></footer>
      </form>
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0;color:#30263a}.editor-page{max-width:760px;margin:0 auto;padding:clamp(20px,4vw,44px);border:1px solid #eee7f2;border-radius:18px;background:#fff}
    .heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:28px}.heading h1{margin:0;font-size:28px;font-weight:500;letter-spacing:-1px}.heading p{margin:10px 0 0;color:#95899d;font-size:13px;line-height:1.6}
    form{display:grid;gap:22px}label{display:grid;gap:9px;color:#8d76a0;font-size:12px}input,textarea{width:100%;box-sizing:border-box;padding:14px 15px;border:1px solid #e5d9ed;border-radius:9px;background:#fff;color:#5b4d65;font:inherit;font-size:13px}textarea{resize:vertical}
    footer{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding-top:4px}button,.secondary{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 21px;border-radius:10px;font-size:12px;font-weight:750;text-decoration:none;cursor:pointer}.secondary{color:#7d6c88}button:disabled{opacity:.6;cursor:wait}
    .message{padding:12px 14px;border-radius:9px;background:#f7f0fb;color:#704795;font-size:12px}.error{background:#fff0f0;color:#a44855}.success{background:#eff8f0;color:#39744b}
    @media(max-width:600px){.editor-page{padding:22px 17px}.heading h1{font-size:24px}footer{align-items:stretch;flex-direction:column-reverse}footer>*{width:100%;box-sizing:border-box}}
  `]
})
export class ClienteEditor {
  private readonly data = inject(DataService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly customerId = signal(this.route.snapshot.paramMap.get('customerId') ?? '');
  readonly customer = computed(() => this.data.customers().find(item => item.id === this.customerId()) ?? null);
  name = '';
  phone = '';
  address = '';
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly error = signal('');

  constructor() {
    effect(() => {
      const customer = this.customer();
      if (!customer) return;
      this.name = customer.name;
      this.phone = customer.phone ?? '';
      this.address = customer.address ?? '';
    });
  }

  async save(): Promise<void> {
    const customer = this.customer();
    if (!customer || this.saving()) return;
    if (!this.name.trim()) { this.error.set('El nombre es obligatorio.'); return; }
    this.saving.set(true); this.error.set(''); this.saved.set(false);
    try {
      await this.data.saveCustomer({ ...customer, name: this.name.trim(), phone: this.phone.trim(), address: this.address.trim() } as Customer);
      this.saved.set(true);
      await this.router.navigate(['/pedidos'], { queryParams: { vista: 'clientes', actualizado: '1' } });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo guardar el cliente.');
    } finally { this.saving.set(false); }
  }
}