import { Injectable } from '@angular/core';
import { resolveLegacyRecipeImage } from 'shared';

const ORIGINAL_SITE = 'https://starkies-admin.milkyflame1.chatgpt.site';

@Injectable({ providedIn: 'root' })
export class RecipeImageService {
  getImageUrl(imagePath: string | undefined): string {
    if (!imagePath?.trim()) return '/images/recipe-placeholder.svg';

    const resolved = resolveLegacyRecipeImage(imagePath);
    if (resolved && resolved !== imagePath) return resolved;
    if (imagePath.startsWith('/api/recipe-image')) return ORIGINAL_SITE + imagePath;
    if (/^https?:\/\//i.test(imagePath)) return imagePath;
    return imagePath.startsWith('/') ? imagePath : '/' + imagePath;
  }
}
