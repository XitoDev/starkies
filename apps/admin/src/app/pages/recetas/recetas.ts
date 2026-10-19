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

  // Mapeo temporal de imágenes: convierte '/api/recipe-image?id=...' a una ruta local
  getImageUrl(imagePath: string | undefined, recipeId: string): string {
    if (!imagePath) return 'assets/placeholder.jpg';

    // Si viene del JSON con el formato viejo de API, mapeamos al ID
    if (imagePath.includes('/api/recipe-image')) {
      // Como las tienes en public/images/, apuntamos allá
      return `images/recipe-${recipeId}.jpg`;
    }
    return imagePath;
  }
}
