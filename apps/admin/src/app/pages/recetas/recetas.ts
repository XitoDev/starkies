import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideDynamicIcon, LucideSearch, LucideTag, LucideChartPie, LucideDollarSign } from '@lucide/angular';
import { DataService } from '../../services/data.service';
@Component({
  selector: 'app-recetas',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  templateUrl: './recetas.html',
  styleUrls: ['./recetas.css']
})
export class Recetas {
  private dataService = inject(DataService);

  readonly icons = { Search: LucideSearch, Tag: LucideTag, PieChart: LucideChartPie, DollarSign: LucideDollarSign };

  // Leemos las recetas desde el servicio
  recipes = this.dataService.recipes;

  // Extraemos las categorías únicas para los filtros
  categories = computed(() => {
    const cats = new Set(this.recipes().map(r => r.category));
    return ['Todas', ...Array.from(cats)];
  });

  selectedCategory = signal<string>('Todas');

  // Recetas filtradas según la categoría seleccionada
  filteredRecipes = computed(() => {
    const cat = this.selectedCategory();
    const all = this.recipes();
    if (cat === 'Todas') return all;
    return all.filter(r => r.category === cat);
  });

  setCategory(cat: string): void {
    this.selectedCategory.set(cat);
  }

  /**
   * Las imágenes del respaldo son referencias al endpoint del GPT Site original,
   * no archivos locales. Conservamos temporalmente esa referencia absoluta para
   * que las fotos sigan visibles mientras las migramos a Firebase Storage.
   */
  getImageUrl(imagePath: string | undefined): string {
    if (!imagePath?.trim()) return '/images/recipe-placeholder.svg';

    if (imagePath.startsWith('/api/recipe-image')) {
      return `https://starkies-admin.milkyflame1.chatgpt.site${imagePath}`;
    }

    return imagePath;
  }

  onImageError(event: Event): void {
    const image = event.target as HTMLImageElement;
    if (image.src.endsWith('/images/recipe-placeholder.svg')) return;
    image.src = '/images/recipe-placeholder.svg';
  }
}
