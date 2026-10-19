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
    '6539b2bd-5e58-4485-8ff9-b625d1aa6147': 'recipe-6539b2bd-5e58-4485-8ff9-b625d1aa6147.jpg', // Brownie Classic
    '202edec5-9b83-4e9b-a466-c32bd1a05d44': 'recipe-image.jpg', // Avena Classic
    '85e499f3-37c9-4701-bf89-5176007ce546': 'recipe-image.png', // Sunny Carrot
    '02885ca5-c58c-48a7-b116-cd614290c697': 'recipe-image (1).png', // Chips Stars
    'f126ae46-9eee-4ac2-8cff-d2f954d708e9': 'recipe-image (2).png', // Velvet Kiss
    '5cbf3e5f-edb0-490b-b544-8741ba6cffe7': 'recipe-image (3).png', // Cinna Moon
    '99e32e0c-61fb-41b1-8018-fa18ef655750': 'recipe-image (4).png', // Nuti Dream
    '0794f338-588b-460d-b002-ee4e614826c9': 'recipe-image (5).png', // Lemon Glow
    '5954e0af-d58c-40ce-a79d-cbcff10c7b78': 'recipe-image (6).png', // Brownie Bliss
    'e9005152-d579-444f-905f-a06a5ad3d74b': 'recipe-image (1).jpg', // Canela Classic
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
