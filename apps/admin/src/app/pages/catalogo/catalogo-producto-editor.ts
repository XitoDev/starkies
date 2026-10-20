import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Recipe } from 'shared';
import { DataService } from '../../services/data.service';
import { RecipeImageService } from '../../services/recipe-image.service';

@Component({
  selector: 'app-catalogo-producto-editor',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, FormsModule, RouterLink],
  template: `
    @if (recipe(); as item) {
      <section class="editor">
        <p class="eyebrow">Mi negocio / Catálogo / Producto</p>
        <header><div><h1>{{ item.name }}</h1><p>Personaliza cómo se presenta esta galleta en el catálogo público.</p></div><a routerLink="/catalogo" class="close" aria-label="Volver al catálogo">×</a></header>
        <div class="actions"><a class="secondary" [routerLink]="['/recetas', item.id, 'editar']">Editar receta y foto ↗</a></div>
        <form (ngSubmit)="save()">
          <label class="visibility"><input type="checkbox" [(ngModel)]="visible" name="visible"> Visible en el catálogo</label>
          <label>Etiqueta · opcional<select [(ngModel)]="label" name="label"><option value="">Sin etiqueta</option>@for(tag of labels;track tag){<option [value]="tag">{{ tag }}</option>}</select></label>
          <button class="text-action" type="button" (click)="addLabel()">＋ Nueva etiqueta</button>
          <fieldset><legend>Color de la etiqueta</legend><div class="colors">@for(color of colors;track color.name){<button type="button" [class.selected]="labelColor===color.name" [style.background]="color.background" [style.color]="color.foreground" (click)="labelColor=color.name">{{ color.name }}</button>}</div></fieldset>
          <label>Descripción para clientes<textarea rows="4" maxlength="500" [(ngModel)]="description" name="description" placeholder="Describe la galleta para tus clientes"></textarea></label>
          <div class="price"><span>Precio de venta sincronizado con Finanzas</span><strong>{{ item.price | currency:'USD' }}</strong><small>Se actualiza automáticamente desde Productos y precios.</small></div>
          @if(error()){<p class="error" role="alert">{{ error() }}</p>}
          <footer><a class="secondary" routerLink="/catalogo">Cancelar</a><button type="submit" [disabled]="saving()">{{ saving()?'Guardando…':'Listo' }}</button></footer>
        </form>
      </section>
    } @else {
      <section class="editor"><h1>No encontramos este producto</h1><p>Puede que se haya eliminado o que los datos todavía se estén cargando.</p><a class="secondary" routerLink="/catalogo">Volver al catálogo</a></section>
    }
  `,
  styles: [`
    :host{display:block;min-width:0;color:#30263a}.editor{max-width:850px;margin:0 auto;padding:clamp(20px,3vw,38px);border:1px solid #eee7f2;border-radius:18px;background:#fff}.eyebrow{margin:0 0 14px;color:#8056ad;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase}header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}h1{margin:0;font-size:28px;font-weight:500;letter-spacing:-1px}header p{margin:9px 0 0;color:#95899d;font-size:13px;line-height:1.5}.close{display:grid;place-items:center;width:38px;height:38px;border-radius:9px;background:#f6f0fa;color:#9d86b2;text-decoration:none;font-size:28px}.actions{margin:22px 0 26px}form{display:grid;gap:22px}label{display:grid;gap:9px;color:#947da5;font-size:12px}input:not([type=checkbox]),select,textarea{width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid #e5d9ed;border-radius:9px;background:#fff;color:#5b4d65;font:inherit;font-size:13px}.visibility{display:flex;align-items:center;gap:12px;color:#403449;font-size:14px}.visibility input{width:17px;height:17px;accent-color:#8056ad}.text-action{justify-self:start;padding:0;border:0;background:transparent;color:#9a75b4;font-size:12px;cursor:pointer}fieldset{margin:0;padding:0;border:0}legend{margin-bottom:14px;color:#947da5;font-size:12px}.colors{display:flex;flex-wrap:wrap;gap:9px}.colors button{min-height:42px;padding:0 14px;border:2px solid transparent;border-radius:9px;font-size:12px;cursor:pointer}.colors button.selected{outline:2px solid #4d365d;outline-offset:2px}.price{display:grid;gap:13px;padding:22px;border-radius:13px;background:#f4ebf8}.price span{font-size:13px}.price strong{font-size:30px}.price small{color:#a08eab;font-size:11px;line-height:1.5}footer{display:flex;justify-content:flex-start;gap:10px;margin-top:8px}.secondary,footer button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border:1px solid #e8e0ed;border-radius:9px;background:#fff;color:#6c5b79;text-decoration:none;font-size:12px;font-weight:700;cursor:pointer}footer button{border:0;background:#8056ad;color:#fff}.error{padding:12px;border-radius:8px;background:#fff0f0;color:#a44855;font-size:12px}@media(max-width:520px){.editor{padding:20px 15px}footer{flex-direction:column-reverse}footer>*{width:100%;box-sizing:border-box}}
  `]
})
export class CatalogoProductoEditor {
  private readonly data = inject(DataService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly productId = signal(this.route.snapshot.paramMap.get('productId') ?? '');
  readonly recipe = computed(() => this.data.recipes().find(item => item.id === this.productId()) ?? null);
  readonly labels = ['Más vendido', 'Nuevo', 'Favorito', 'Edición limitada'];
  readonly colors = [
    {name:'Morado',background:'#8056ad',foreground:'#fff'},
    {name:'Rosa suave',background:'#f5d8d1',foreground:'#5b4543'},
    {name:'Crema',background:'#eee5f2',foreground:'#4d4057'},
    {name:'Arena',background:'#e9ddd3',foreground:'#55473f'},
    {name:'Azul',background:'#4f6f9f',foreground:'#fff'},
    {name:'Verde',background:'#55775f',foreground:'#fff'},
    {name:'Coral',background:'#a65b50',foreground:'#fff'},
    {name:'Dorado',background:'#b58a3e',foreground:'#2e2519'},
    {name:'Ciruela',background:'#7b5678',foreground:'#fff'},
  ];
  visible = true;
  label = '';
  labelColor = 'Morado';
  description = '';
  readonly saving = signal(false);
  readonly error = signal('');

  constructor() {
    effect(() => {
      const item = this.recipe();
      if (!item) return;
      this.visible = item.catalogVisible !== false;
      this.label = item.catalogLabel ?? '';
      this.labelColor = item.catalogLabelColor ?? 'Morado';
      this.description = item.catalogDescription ?? '';
    });
  }
  async addLabel(): Promise<void> {
    const value = window.prompt('Nombre de la nueva etiqueta');
    if (!value?.trim()) return;
    this.label = value.trim();
  }
  async save(): Promise<void> {
    const item = this.recipe();
    if (!item || this.saving()) return;
    this.saving.set(true); this.error.set('');
    try {
      await this.data.saveRecipe({...item,catalogVisible:this.visible,catalogLabel:this.label.trim(),catalogLabelColor:this.labelColor,catalogDescription:this.description.trim()} as Recipe);
      await this.router.navigate(['/catalogo']);
    } catch(error) { this.error.set(error instanceof Error ? error.message : 'No se pudo guardar el producto.'); }
    finally { this.saving.set(false); }
  }
}