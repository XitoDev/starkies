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
   * Las imágenes descargadas están en /public/images del repositorio y se sirven
   * desde jsDelivr. El JSON conserva los IDs de imagen del GPT Site original;
   * por eso mantenemos un mapa entre esos IDs y los nombres reales de archivo.
   *
   * Solo incluimos asociaciones comprobadas. Las demás siguen usando el endpoint
   * original hasta identificar con certeza qué archivo corresponde a cada receta.
   */
  private readonly imageFilesById: Record<string, string> = {
    '6539b2bd-5e58-4485-8ff9-b625d1aa6147': 'recipe-6539b2bd-5e58-4485-8ff9-b625d1aa6147.jpg',
    '202edec5-9b83-4e9b-a466-c32bd1a05d44': 'recipe-image.jpg',
  };

  getImageUrl(imagePath: string | undefined): string {
    if (!imagePath?.trim()) return '/images/recipe-placeholder.svg';

    if (imagePath.startsWith('/api/recipe-image')) {
      const imageId = new URL(imagePath, 'https://starkies-admin.milkyflame1.chatgpt.site')
        .searchParams.get('id');
      const fileName = imageId ? this.imageFilesById[imageId] : undefined;

      if (fileName) {
        return `https://cdn.jsdelivr.net/gh/XitoDev/starkies@main/public/images/${encodeURIComponent(fileName)}`;
      }

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
