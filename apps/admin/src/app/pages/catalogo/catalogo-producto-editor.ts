import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Recipe } from 'shared';
import { DataService } from '../../services/data.service';
import { RecipeImageService } from '../../services/recipe-image.service';
import { ImageCdnUploadService } from '../../services/image-cdn-upload.service';

@Component({
  selector: 'app-catalogo-producto-editor',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, FormsModule, RouterLink, MatButtonModule, MatIconModule],
  template: `
    @if (recipe(); as item) {
      <section class="editor">
        
        <header><div><h1>{{ item.name }}</h1><p>Personaliza cómo se presenta esta galleta en el catálogo público.</p></div></header>
        <div class="actions"><a class="secondary" [routerLink]="['/recetas', item.id, 'editar']">Editar receta y foto ↗</a></div>
        <section class="catalog-image-panel" aria-label="Imagen del catálogo público">
          <h2>Imagen del catálogo público</h2>
          <p>Esta imagen es independiente de la foto que usas en Recetas.</p>
          @if(catalogImagePreview()){<img class="catalog-image-preview" [src]="catalogImagePreview()" alt="Vista previa de la imagen pública" />}
          <label class="catalog-image-picker">Elegir imagen del catálogo
            <input type="file" accept="image/jpeg,image/png,image/webp" (change)="onCatalogImageSelected($event)">
          </label>
          @if(item.catalogImage || catalogImageFile()){<button matButton="outlined" type="button" class="remove-catalog-image" (click)="removeCatalogImage()">Quitar imagen del catálogo</button>}
        </section>
        <form (ngSubmit)="save()">
          <label class="visibility"><input type="checkbox" [(ngModel)]="visible" name="visible"> Visible en el catálogo</label>
          <label>Etiqueta · opcional<select [(ngModel)]="label" name="label"><option value="">Sin etiqueta</option>@for(tag of labels;track tag){<option [value]="tag">{{ tag }}</option>}</select></label>
          <button matButton="text" class="text-action" type="button" (click)="newLabelOpen.set(!newLabelOpen())"><mat-icon fontSet="material-symbols-rounded" aria-hidden="true">add</mat-icon> Nueva etiqueta</button>
          @if(newLabelOpen()){<div class="new-label"><input aria-label="Nombre de nueva etiqueta" maxlength="40" [(ngModel)]="newLabelName" name="newLabelName" placeholder="Nombre de la etiqueta"><button matButton="text" type="button" (click)="addLabel()">Agregar</button><button matButton="text" type="button" class="cancel-label" (click)="newLabelOpen.set(false)">Cancelar</button></div>}
          <fieldset><legend>Color de la etiqueta</legend><div class="colors">@for(color of colors;track color.name){<button matButton="text" type="button" [class.selected]="labelColor===color.name" [style.background]="color.background" [style.color]="color.foreground" (click)="labelColor=color.name">{{ color.name }}</button>}</div></fieldset>
          <label>Descripción para clientes<textarea rows="4" maxlength="500" [(ngModel)]="description" name="description" placeholder="Describe la galleta para tus clientes"></textarea></label>
          <div class="price"><span>Precio de venta sincronizado con Finanzas</span><strong>{{ item.price | currency:'USD' }}</strong><small>Se actualiza automáticamente desde Productos y precios.</small></div>
          @if(error()){<p class="error" role="alert">{{ error() }}</p>}
          <footer>@if(saving()){<span class="saving-status" role="status" aria-live="polite">{{savingMessage()}}</span>}<a matButton="outlined" class="secondary" routerLink="/catalogo">Cancelar</a><button matButton="elevated" type="submit" [disabled]="saving()">{{ saving()?'Guardando…':'Guardar cambios' }}</button></footer>
        </form>
      </section>
    } @else {
      <section class="editor"><h1>No encontramos este producto</h1><p>Puede que se haya eliminado o que los datos todavía se estén cargando.</p><a class="secondary" routerLink="/catalogo">Volver al catálogo</a></section>
    }
  `,
  styles: [`
    :host{display:block;min-width:0;color:#30263a}.catalog-image-panel{display:grid;gap:10px;margin:0 0 24px;padding:18px;border:1px solid #eee7f2;border-radius:12px;background:#fdfbfe}.catalog-image-panel h2{margin:0;font-size:16px;font-weight:600}.catalog-image-panel p{margin:0;color:#95899d;font-size:12px;line-height:1.5}.catalog-image-preview{width:min(100%,280px);max-height:220px;object-fit:contain;border-radius:10px;background:#fff}.catalog-image-picker{display:inline-flex!important;align-items:center;width:fit-content;padding:11px 14px;border:1px solid #e5d9ed;border-radius:9px;background:#fff;color:#6c5b79!important;cursor:pointer}.catalog-image-picker input{max-width:100%;font-size:11px}.remove-catalog-image{justify-self:start}.editor{max-width:850px;margin:0 auto;padding:clamp(20px,3vw,38px);border:1px solid #eee7f2;border-radius:18px;background:#fff}.eyebrow{margin:0 0 14px;color:#8056ad;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase}header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}h1{margin:0;font-size:28px;font-weight:500;letter-spacing:-1px}header p{margin:9px 0 0;color:#95899d;font-size:13px;line-height:1.5}.actions{margin:22px 0 26px}form{display:grid;gap:22px}label{display:grid;gap:9px;color:#947da5;font-size:12px}input:not([type=checkbox]),select,textarea{width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid #e5d9ed;border-radius:9px;background:#fff;color:#5b4d65;font:inherit;font-size:13px}.visibility{display:flex;align-items:center;gap:12px;color:#403449;font-size:14px}.visibility input{width:17px;height:17px;accent-color:#8056ad}.text-action{justify-self:start;padding:0;border:0;background:transparent;color:#9a75b4;font-size:12px;cursor:pointer}.new-label{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.new-label input{flex:1;min-width:160px}.new-label button{min-height:38px;padding:0 12px;border:0;border-radius:8px;background:#8056ad;color:#fff;font-size:12px;cursor:pointer}.new-label .cancel-label{border:1px solid #e8e0ed;background:#fff;color:#6c5b79}fieldset{margin:0;padding:0;border:0}legend{margin-bottom:14px;color:#947da5;font-size:12px}.colors{display:flex;flex-wrap:wrap;gap:9px}.colors button{min-height:42px;padding:0 14px;border:2px solid transparent;border-radius:9px;font-size:12px;cursor:pointer}.colors button.selected{outline:2px solid #4d365d;outline-offset:2px}.price{display:grid;gap:13px;padding:22px;border-radius:13px;background:#f4ebf8}.price span{font-size:13px}.price strong{font-size:30px}.price small{color:#a08eab;font-size:11px;line-height:1.5}footer{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:8px}.saving-status{margin-right:auto;color:#8056ad;font-size:12px;line-height:1.4}.secondary,footer button[matButton="outlined"]{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border:1px solid #e8e0ed;border-radius:9px;background:#fff;color:#6c5b79;text-decoration:none;font-size:12px;font-weight:700;cursor:pointer}footer button[matButton="outlined"]{border-color:#e8e0ed;background:#fff;color:#6c5b79}.error{padding:12px;border-radius:8px;background:#fff0f0;color:#a44855;font-size:12px}@media(max-width:520px){.editor{padding:20px 15px}footer{flex-direction:column-reverse}footer>*{width:100%;box-sizing:border-box}}
  `]
})
export class CatalogoProductoEditor {
  private readonly data = inject(DataService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly imageUpload = inject(ImageCdnUploadService);
  private readonly imageService = inject(RecipeImageService);
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
  readonly catalogImagePreview = signal('');
  readonly catalogImageFile = signal<File | null>(null);
  readonly catalogImageRemoved = signal(false);
  readonly saving = signal(false);
  readonly savingMessage = signal('');
  readonly error = signal('');
  readonly newLabelOpen = signal(false);
  newLabelName = '';

  constructor() {
    effect(() => {
      const item = this.recipe();
      if (!item) return;
      this.visible = item.catalogVisible !== false;
      this.label = item.catalogLabel ?? '';
      this.labelColor = item.catalogLabelColor ?? 'Morado';
      this.description = item.catalogDescription ?? '';
      if (!this.catalogImageFile() && !this.catalogImageRemoved()) {
        this.catalogImagePreview.set(this.imageService.getImageUrl(item.catalogImage || item.image));
      }
    });
  }
  onCatalogImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
      this.error.set('Elige una imagen JPG, PNG o WebP de hasta 3 MB.');
      input.value = '';
      return;
    }
    this.catalogImageFile.set(file);
    this.catalogImageRemoved.set(false);
    this.catalogImagePreview.set(URL.createObjectURL(file));
    this.error.set('');
  }
  removeCatalogImage(): void {
    this.catalogImageFile.set(null);
    this.catalogImageRemoved.set(true);
    this.catalogImagePreview.set('');
  }
  private async uploadCatalogImage(recipeId: string): Promise<string | undefined> {
    const file = this.catalogImageFile();
    if (!file) return this.catalogImageRemoved() ? undefined : this.recipe()?.catalogImage;
    return this.imageUpload.upload(file, 'catalog', recipeId);
  }
  addLabel(): void {
    const value = this.newLabelName.trim();
    if (!value) return;
    this.label = value;
    this.newLabelName = '';
    this.newLabelOpen.set(false);
  }
  async save(): Promise<void> {
    const item = this.recipe();
    if (!item || this.saving()) return;
    this.saving.set(true); this.error.set('');
    this.savingMessage.set(this.catalogImageFile() ? 'Publicando imagen en el CDN…' : 'Guardando producto…');
    try {
      const catalogImage = await this.uploadCatalogImage(item.id);
      this.savingMessage.set('Guardando cambios del producto…');
      await this.data.saveRecipe({
        ...item,
        catalogImage: this.catalogImageRemoved() ? '' : catalogImage,
        catalogVisible:this.visible,
        catalogLabel:this.label.trim(),
        catalogLabelColor:this.labelColor,
        catalogDescription:this.description.trim(),
      } as Recipe);
      this.savingMessage.set('Guardado. Volviendo al catálogo…');
      await this.router.navigate(['/catalogo']);
    } catch(error) { this.error.set(error instanceof Error ? error.message : 'No se pudo guardar el producto.'); this.savingMessage.set(''); }
    finally { this.saving.set(false); this.savingMessage.set(''); }
  }
}