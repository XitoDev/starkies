import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideDynamicIcon, LucideChartPie, LucideDollarSign } from '@lucide/angular';
import { DataService } from '../../services/data.service';
import { RecipeImageService } from '../../services/recipe-image.service';
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
  private readonly recipeImageService = inject(RecipeImageService);

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

  getImageUrl(imagePath: string | undefined): string {
    return this.recipeImageService.getImageUrl(imagePath);
  }

  onImageError(event: Event): void {
    const image = event.target as HTMLImageElement;
    if (image.src.endsWith('/images/recipe-placeholder.svg')) return;
    image.src = '/images/recipe-placeholder.svg';
  }
}