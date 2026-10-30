import { RecipeImageService } from './recipe-image.service';

describe('RecipeImageService legacy image resolution', () => {
  const service = new RecipeImageService();
  const productId = '02885ca5-c58c-48a7-b116-cd614290c697';
  const otherProductId = '0794f338-588b-460d-b002-ee4e614826c9';
  const cdnBase = 'https://cdn.jsdelivr.net/gh/XitoDev/starkies@85d0471f159ead399e104254ee7af1890e7d502f/public/images/products/';

  it('uses the recipe product ID when the legacy API image ID is not in the image map', () => {
    expect(service.getImageUrl('/api/recipe-image?id=legacy-image-document', productId))
      .toBe(cdnBase + productId + '.png');
  });

  it('keeps a mapped legacy image ID when it has a canonical asset', () => {
    expect(service.getImageUrl('/api/recipe-image?id=' + productId, otherProductId))
      .toBe(cdnBase + productId + '.png');
  });

  it('uses the product ID when a legacy filename ID is not mapped', () => {
    expect(service.getImageUrl('/images/recipe-legacy-image-document.png', productId))
      .toBe(cdnBase + productId + '.png');
  });
});
