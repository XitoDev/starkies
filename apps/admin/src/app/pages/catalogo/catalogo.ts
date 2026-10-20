import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideDynamicIcon, LucideStore, LucideSettings } from '@lucide/angular';
import { DataService } from '../../services/data.service';
import { RecipeImageService } from '../../services/recipe-image.service';

@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  templateUrl: './catalogo.html',
  styleUrls: ['./catalogo.css']
})
export class Catalogo {
  private readonly dataService = inject(DataService);
  private readonly recipeImageService = inject(RecipeImageService);

  readonly icons = { Store: LucideStore, Settings: LucideSettings };
  readonly recipes = this.dataService.recipes;
  readonly catalogItems = computed(() => this.recipes().filter(recipe => !recipe.archived));

  getImageUrl(imagePath: string | undefined): string {
    return this.recipeImageService.getImageUrl(imagePath);
  }

  onImageError(event: Event): void {
    const image = event.target as HTMLImageElement;
    if (image.src.endsWith('/images/recipe-placeholder.svg')) return;
    image.src = '/images/recipe-placeholder.svg';
  }
}