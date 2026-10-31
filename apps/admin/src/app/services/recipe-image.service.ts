import { Injectable } from '@angular/core';

const RECIPE_IMAGE_PLACEHOLDER = '/images/recipe-placeholder.svg';

@Injectable({ providedIn: 'root' })
export class RecipeImageService {
  getImageUrl(imagePath: string | undefined): string {
    const value = imagePath?.trim();
    if (!value) return RECIPE_IMAGE_PLACEHOLDER;
    if (/^https?:\/\//i.test(value)) return value;
    return value.startsWith('/') ? value : '/' + value;
  }
}
