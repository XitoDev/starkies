import { Injectable } from '@angular/core';

const RECIPE_IMAGE_PLACEHOLDER = '/images/recipe-placeholder.svg';
const LEGACY_IMAGE_PATH = /^\/api\/recipe-image(?:[?#]|$)|^\/images\/(?:products\/|promotions\/|recipe-|catalog-)/i;
const LEGACY_IMAGE_CDN = /^https?:\/\/cdn\.jsdelivr\.net\/gh\/XitoDev\/starkies@[^/]+\/public\/images\/(?:products|promotions)\//i;

@Injectable({ providedIn: 'root' })
export class RecipeImageService {
  getImageUrl(imagePath: string | undefined, _fallbackId?: string): string {
    const value = imagePath?.trim();
    if (!value || LEGACY_IMAGE_PATH.test(value) || LEGACY_IMAGE_CDN.test(value)) return RECIPE_IMAGE_PLACEHOLDER;
    if (/^https?:\/\//i.test(value)) return value;
    return value.startsWith('/') ? value : '/' + value;
  }
}
