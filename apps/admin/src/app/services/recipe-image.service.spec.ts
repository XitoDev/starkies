import { RecipeImageService } from './recipe-image.service';

describe('RecipeImageService', () => {
  const service = new RecipeImageService();
  const managedImage = 'https://images.starkies.lat/images/' + 'a'.repeat(64) + '.webp';

  it('returns the canonical R2 image URL unchanged', () => {
    expect(service.getImageUrl(managedImage)).toBe(managedImage);
  });

  it('keeps supported local static image paths', () => {
    expect(service.getImageUrl('/images/recipe-placeholder.svg')).toBe('/images/recipe-placeholder.svg');
  });

  it('uses the placeholder when the image is missing', () => {
    expect(service.getImageUrl(undefined)).toBe('/images/recipe-placeholder.svg');
    expect(service.getImageUrl('  ')).toBe('/images/recipe-placeholder.svg');
  });
});
