import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DataService } from '../../services/data.service';
import { RecipeImageService } from '../../services/recipe-image.service';
import { Recipe } from 'shared';
import { DEFAULT_DELIVERY_ZONES } from '../../../../../catalog/src/app/pages/catalog/catalog.data';

interface DeliveryZone { id: string; name: string; fee: number; }
@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, FormsModule, MatButtonModule, MatIconModule, MatInputModule],
  templateUrl: './catalogo.html',
  styleUrls: ['./catalogo.css']
})
export class Catalogo {
  private readonly dataService = inject(DataService);
  private readonly recipeImageService = inject(RecipeImageService);
  private readonly router = inject(Router);
  readonly recipes = this.dataService.recipes;
  readonly categoryFilter = signal('Todos');
  readonly settingsOpen = signal(false);
  readonly zones = signal<DeliveryZone[]>([]);
  readonly saving = signal(false);
  readonly visibilityUpdatingId = signal<string | null>(null);
  readonly deletingId = signal<string | null>(null);
  readonly notice = signal('');
  readonly error = signal('');
  private readonly initialized = signal(false);
  readonly categories = computed(() => Array.from(new Set(this.recipes().filter(item => !item.archived).map(item => item.category.trim() || 'Sin categoría'))).sort((a,b) => a.localeCompare(b,'es')));
  readonly catalogItems = computed(() => this.recipes().filter(item => !item.archived && (this.categoryFilter() === 'Todos' || (item.category.trim() || 'Sin categoría') === this.categoryFilter())));
  readonly productCount = computed(() => this.recipes().filter(item => !item.archived).length);
  readonly visibleCount = computed(() => this.recipes().filter(item => !item.archived && item.catalogVisible !== false).length);
  constructor() {
    void this.dataService.loadCollections(['recipes', 'catalogDrafts', 'deliveryZones']);
    effect(() => {
      const state = this.dataService.rawState();
      if (!state || this.initialized()) return;
      const configured = state['deliveryZones'];
      const catalogSettings = state['catalogSettings'] as Record<string, unknown> | undefined;
      const configuredZones = Array.isArray(configured) && configured.length ? configured : null;
      const catalogZonesValue = catalogSettings?.['deliveryZones'];
      const catalogZones = Array.isArray(catalogZonesValue) && catalogZonesValue.length ? catalogZonesValue : null;
      const hasStoredZones = configuredZones !== null || catalogZones !== null;
      const zones = configuredZones ?? catalogZones ?? DEFAULT_DELIVERY_ZONES;
      this.zones.set(zones.map((zone, index) => {
        const item = zone as Partial<DeliveryZone>;
        return {id:String(item.id ?? `zone-${index+1}`),name:String(item.name ?? ''),fee:Math.max(0,Number(item.fee ?? 0))};
      }));
      this.initialized.set(true);
      if (!hasStoredZones) {
        void this.dataService.saveBusinessSetting('deliveryZones', this.zones()).catch(error => {
          this.error.set(error instanceof Error ? error.message : 'No se pudieron inicializar las tarifas de entrega.');
        });
      }
    });
  }
  categoryCount(category: string): number { return this.recipes().filter(recipe => !recipe.archived && (recipe.category.trim() || 'Sin categoría') === category).length; }
  getImageUrl(imagePath: string | undefined): string { return this.recipeImageService.getImageUrl(imagePath); }
  onImageError(event: Event): void { const image = event.target as HTMLImageElement; if (!image.src.endsWith('/images/recipe-placeholder.svg')) image.src = '/images/recipe-placeholder.svg'; }
  async toggleVisibility(item: Recipe): Promise<void> {
    if (this.visibilityUpdatingId()) return;
    const visible = item.catalogVisible === false;
    this.visibilityUpdatingId.set(item.id);
    this.error.set('');
    this.notice.set('');
    try {
      await this.dataService.setRecipeCatalogVisibility(item.id, visible);
      this.notice.set(visible ? 'Producto visible en el catálogo público.' : 'Producto oculto del catálogo público.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo cambiar la visibilidad.');
    } finally {
      this.visibilityUpdatingId.set(null);
    }
  }

  async deleteProduct(item: Recipe): Promise<void> {
    if (this.deletingId()) return;
    const confirmed = window.confirm('¿Eliminar "' + item.name + '"? Esta acción eliminará la receta y su publicación del catálogo público. No se puede deshacer.');
    if (!confirmed) return;
    this.deletingId.set(item.id);
    this.error.set('');
    this.notice.set('');
    try {
      await this.dataService.deleteRecipe(item.id);
      this.notice.set('"' + item.name + '" se eliminó correctamente.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo eliminar el producto.');
    } finally {
      this.deletingId.set(null);
    }
  }
  addZone(): void { this.zones.update(zones => [...zones,{id:crypto.randomUUID(),name:'Nueva zona',fee:0}]); }
  removeZone(index:number):void { if(!window.confirm('¿Eliminar esta zona de entrega?')) return; this.zones.update(zones=>zones.filter((_,i)=>i!==index)); }
  moveZone(index:number,delta:number):void { this.zones.update(zones=>{const next=[...zones],to=index+delta;if(to<0||to>=next.length)return next;[next[index],next[to]]=[next[to],next[index]];return next;}); }
  async saveZones():Promise<void> {
    if(this.saving())return;
    const zones=this.zones().map(zone=>({...zone,name:zone.name.trim(),fee:Number(zone.fee)}));
    if(zones.some(zone=>!zone.name||!Number.isFinite(zone.fee)||zone.fee<0)){this.error.set('Cada zona necesita un nombre y una tarifa igual o mayor que cero.');return;}
    this.saving.set(true);this.error.set('');
    try { await this.dataService.saveBusinessSetting('deliveryZones',zones); this.zones.set(zones);this.settingsOpen.set(false);this.notice.set('Las tarifas de entrega se guardaron correctamente.'); }
    catch(error){this.error.set(error instanceof Error?error.message:'No se pudieron guardar las tarifas.');}
    finally{this.saving.set(false);}
  }
  openProduct(item: Recipe): void {
    void this.router.navigate(['/catalogo/productos', item.id]);
  }

  openProductFromKeyboard(event: KeyboardEvent, item: Recipe): void {
    if (event.target !== event.currentTarget) return;
    if (event.key === ' ') event.preventDefault();
    this.openProduct(item);
  }

  async syncCatalog():Promise<void>{this.notice.set('');this.error.set('');await this.dataService.loadFromCloud();if(this.dataService.error())this.error.set(this.dataService.error());else this.notice.set('Catálogo sincronizado con los datos guardados.');}
}