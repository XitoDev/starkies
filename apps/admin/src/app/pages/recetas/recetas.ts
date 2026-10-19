import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideDynamicIcon, LucideChartPie, LucideDollarSign } from '@lucide/angular';
import { DataService } from '../../services/data.service';
import { Recipe } from 'shared';

type RecipeSort = 'nameAsc' | 'nameDesc' | 'yieldDesc' | 'priceDesc';
type DoughBase = {
  id?: string;
  name?: string;
  weight?: number;
  notes?: string;
  items?: unknown[];
};

@Component({
  selector: 'app-recetas',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  templateUrl: './recetas.html',
  styleUrls: ['./recetas.css']
})
export class Recetas {
  private readonly dataService = inject(DataService);

  readonly icons = { PieChart: LucideChartPie, DollarSign: LucideDollarSign };
  readonly recipes = this.dataService.recipes;
  readonly view = signal<'recipes' | 'bases'>('recipes');
  readonly showArchived = signal(false);
  readonly searchTerm = signal('');
  readonly sortBy = signal<RecipeSort>('nameAsc');
  readonly selectedCategories = signal<string[]>([]);

  readonly categories = computed(() =>
    Array.from(new Set(this.recipes().map(recipe => recipe.category.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'))
  );

  readonly activeCount = computed(() => this.recipes().filter(recipe => !recipe.archived).length);
  readonly archivedCount = computed(() => this.recipes().filter(recipe => recipe.archived).length);

  readonly doughBases = computed<DoughBase[]>(() => {
    const value = this.dataService.rawState()?.['doughBases'];
    return Array.isArray(value) ? value as DoughBase[] : [];
  });

  readonly filteredRecipes = computed(() => {
    const query = this.searchTerm().trim().toLocaleLowerCase('es');
    const selected = this.selectedCategories();
    const recipes = this.recipes().filter(recipe => {
      const archivedMatch = Boolean(recipe.archived) === this.showArchived();
      const category = recipe.category.trim();
      const categoryMatch = selected.length === 0 || selected.includes(category);
      const queryMatch = !query || recipe.name.toLocaleLowerCase('es').includes(query) || category.toLocaleLowerCase('es').includes(query);
      return archivedMatch && categoryMatch && queryMatch;
    });

    return [...recipes].sort((a, b) => {
      switch (this.sortBy()) {
        case 'nameDesc': return b.name.localeCompare(a.name, 'es');
        case 'yieldDesc': return b.yield - a.yield;
        case 'priceDesc': return b.price - a.price;
        default: return a.name.localeCompare(b.name, 'es');
      }
    });
  });

  readonly groupedRecipes = computed(() => {
    const groups = new Map<string, Recipe[]>();
    for (const recipe of this.filteredRecipes()) {
      const category = recipe.category.trim() || 'Sin categoría';
      const current = groups.get(category) ?? [];
      current.push(recipe);
      groups.set(category, current);
    }
    return Array.from(groups.entries()).map(([category, recipes]) => ({ category, recipes }));
  });

  setView(view: 'recipes' | 'bases'): void {
    this.view.set(view);
  }

  setArchiveState(archived: boolean): void {
    this.showArchived.set(archived);
    this.selectedCategories.set([]);
  }

  setSort(value: string): void {
    if (value === 'nameDesc' || value === 'yieldDesc' || value === 'priceDesc' || value === 'nameAsc') {
      this.sortBy.set(value);
    }
  }

  isCategorySelected(category: string): boolean {
    return this.selectedCategories().length === 0 || this.selectedCategories().includes(category);
  }

  toggleCategory(category: string, checked: boolean): void {
    const all = this.categories();
    const current = this.selectedCategories();

    if (current.length === 0) {
      if (!checked) this.selectedCategories.set(all.filter(item => item !== category));
      return;
    }

    const next = checked
      ? Array.from(new Set([...current, category]))
      : current.filter(item => item !== category);

    this.selectedCategories.set(next.length === all.length ? [] : next);
  }

  /**
   * Las fotos descargadas viven en el repositorio público y se sirven con jsDelivr.
   * Los nombres originales del JSON son IDs del GPT Site, así que los asociamos a
   * los nombres de archivo reales sin tener que cambiar los datos de Firestore.
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
      const imageId = new URL(imagePath, 'https://starkies-admin.milkyflame1.chatgpt.site').searchParams.get('id');
      const fileName = imageId ? this.imageFilesById[imageId] : undefined;

      if (fileName) {
        return `https://cdn.jsdelivr.net/gh/XitoDev/starkies@main/public/images/${encodeURIComponent(fileName)}`;
      }

      // Archived recipes not yet present in the downloaded image set still use the source URL.
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