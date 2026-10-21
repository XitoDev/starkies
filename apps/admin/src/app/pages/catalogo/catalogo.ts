import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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
  readonly showHidden = signal(false);
  readonly openMenuId = signal<string | null>(null);
  readonly settingsOpen = signal(false);
  readonly zones = signal<DeliveryZone[]>([]);
  readonly saving = signal(false);
  readonly notice = signal('');
  readonly error = signal('');
  private readonly initialized = signal(false);
  readonly categories = computed(() => Array.from(new Set(this.recipes().filter(item => !item.archived).map(item => item.category.trim() || 'Sin categoría'))).sort((a,b) => a.localeCompare(b,'es')));
  readonly catalogItems = computed(() => this.recipes().filter(item => !item.archived && (this.showHidden() || item.catalogVisible !== false) && (this.categoryFilter() === 'Todos' || item.category === this.categoryFilter())));
  readonly visibleCount = computed(() => this.recipes().filter(item => !item.archived && item.catalogVisible !== false).length);
  constructor() {
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
  categoryCount(category: string): number { return this.recipes().filter(recipe => !recipe.archived && recipe.category === category).length; }
  labelBackground(color?: string): string { return ({'Morado':'#8056ad','Rosa suave':'#f5d8d1','Crema':'#eee5f2','Arena':'#e9ddd3','Azul':'#4f6f9f','Verde':'#55775f','Coral':'#a65b50','Dorado':'#b58a3e','Ciruela':'#7b5678'} as Record<string,string>)[color ?? 'Morado'] ?? '#8056ad'; }
  labelForeground(color?: string): string { return ['Morado','Azul','Verde','Coral','Ciruela'].includes(color ?? 'Morado') ? '#fff' : '#51445b'; }
  getImageUrl(imagePath: string | undefined): string { return this.recipeImageService.getImageUrl(imagePath); }
  onImageError(event: Event): void { const image = event.target as HTMLImageElement; if (!image.src.endsWith('/images/recipe-placeholder.svg')) image.src = '/images/recipe-placeholder.svg'; }
  async toggleVisibility(item: Recipe): Promise<void> {
    this.openMenuId.set(null); this.error.set(''); this.notice.set('');
    try { await this.dataService.setRecipeCatalogVisibility(item.id, item.catalogVisible===false); this.notice.set(item.catalogVisible===false ? 'Producto visible en el catálogo.' : 'Producto oculto del catálogo.'); }
    catch(error) { this.error.set(error instanceof Error?error.message:'No se pudo cambiar la visibilidad.'); }
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