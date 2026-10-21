export const LEGACY_RECIPE_IMAGE_FILES: Readonly<Record<string, string>> = {
  '6539b2bd-5e58-4485-8ff9-b625d1aa6147': 'recipe-6539b2bd-5e58-4485-8ff9-b625d1aa6147.jpg',
  '202edec5-9b83-4e9b-a466-c32bd1a05d44': 'recipe-202edec5-9b83-4e9b-a466-c32bd1a05d44.jpg',
  '85e499f3-37c9-4701-bf89-5176007ce546': 'recipe-85e499f3-37c9-4701-bf89-5176007ce546.png',
  '02885ca5-c58c-48a7-b116-cd614290c697': 'recipe-02885ca5-c58c-48a7-b116-cd614290c697.png',
  'f126ae46-9eee-4ac2-8cff-d2f9543d708e9': 'recipe-f126ae46-9eee-4ac2-8cff-d2f9543d3d74b4.png',
  '5cbf3e5f-edb0-490b-b544-8741ba6cffe7': 'recipe-5cbf3e5f-edb0-490b-b544-8741ba6cffe7.png',
  '99e32e0c-61fb-41b1-8018-fa18ef655750': 'recipe-99e32e0c-61fb-41b1-8018-fa18ef655750.png',
  '0794f338-588b-460d-b002-ee4e614826c9': 'recipe-0794f338-588b-460d-b002-ee4e614826c9.png',
  '5954e0af-d58c-40ce-a79d-cbcff10c7b78': 'recipe-5954e0af-d58c-40ce-a79d-cbcff10c7b78.png',
  'e9005152-d579-444f-905f-a06a5ad3d74b': 'recipe-e9005152-d579-444f-905f-a06a5ad3d74b.jpg',
};
export const LEGACY_RECIPE_IMAGE_CDN_BASE =
  'https://cdn.jsdelivr.net/gh/XitoDev/starkies@eed4ced5756232d2957340e18b86d18877e833ae/public/images/';
export function resolveLegacyRecipeImage(imagePath: string, fallbackId?: string): string | undefined {
  if (!imagePath) return undefined;
  if (imagePath.startsWith('/api/recipe-image')) {
    let imageId = fallbackId ?? '';
    try { imageId = new URL(imagePath, 'https://starkies.lat').searchParams.get('id') || imageId; } catch { /* use fallback */ }
    const fileName = LEGACY_RECIPE_IMAGE_FILES[imageId];
    return fileName ? LEGACY_RECIPE_IMAGE_CDN_BASE + encodeURIComponent(fileName) : undefined;
  }
  return imagePath;
}
