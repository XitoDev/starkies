export const LEGACY_PRODUCT_IMAGE_FILES: Readonly<Record<string, string>> = {
  '02885ca5-c58c-48a7-b116-cd614290c697': '02885ca5-c58c-48a7-b116-cd614290c697.png',
  '0794f338-588b-460d-b002-ee4e614826c9': '0794f338-588b-460d-b002-ee4e614826c9.png',
  '0a783c0b-8993-41a0-b986-b03b57674ca9': '0a783c0b-8993-41a0-b986-b03b57674ca9-ade40aeb-b2ff-4c3e-8ec6-fe9364df1485.png',
  '1b601e8d-17da-4f66-909d-5324bce3acfe': '1b601e8d-17da-4f66-909d-5324bce3acfe-c28bc795-6020-411e-9b87-5f179c0c7019.png',
  '202edec5-9b83-4e9b-a466-c32bd1a05d44': '202edec5-9b83-4e9b-a466-c32bd1a05d44.jpg',
  '5954e0af-d58c-40ce-a79d-cbcff10c7b78': '5954e0af-d58c-40ce-a79d-cbcff10c7b78.png',
  '5cbf3e5f-edb0-490b-b544-8741ba6cffe7': '5cbf3e5f-edb0-490b-b544-8741ba6cffe7.png',
  '6539b2bd-5e58-4485-8ff9-b625d1aa6147': '6539b2bd-5e58-4485-8ff9-b625d1aa6147.jpg',
  '85e499f3-37c9-4701-bf89-5176007ce546': '85e499f3-37c9-4701-bf89-5176007ce546.png',
  '93492b6c-f402-4ca3-9ccd-9dfbd957c40a': '93492b6c-f402-4ca3-9ccd-9dfbd957c40a-55f6444e-79a8-4dcb-b5a0-78dfd3cf18be.png',
  '99e32e0c-61fb-41b1-8018-fa18ef655750': '99e32e0c-61fb-41b1-8018-fa18ef655750.png',
  'e9005152-d579-444f-905f-a06a5ad3d74b': 'e9005152-d579-444f-905f-a06a5ad3d74b.jpg',
  'f126ae46-9eee-4ac2-8cff-d2f954d708e9': 'f126ae46-9eee-4ac2-8cff-d2f954d708e9.png',
};
export const LEGACY_PRODUCT_IMAGE_CDN_BASE =
  'https://cdn.jsdelivr.net/gh/XitoDev/starkies@85d0471f159ead399e104254ee7af1890e7d502f/public/images/products/';

export function resolveLegacyRecipeImage(imagePath: string, fallbackId?: string): string | undefined {
  if (!imagePath) return undefined;
  const isLegacyApiPath = imagePath.startsWith('/api/recipe-image');
  const isLegacyFilePath = imagePath.startsWith('recipe-') || imagePath.startsWith('catalog-')
    || imagePath.includes('/recipe-') || imagePath.includes('/catalog-');
  if (!isLegacyApiPath && !isLegacyFilePath) return imagePath;
  let imageId = fallbackId ?? '';
  if (isLegacyApiPath) {
    try { imageId = new URL(imagePath, 'https://starkies.lat').searchParams.get('id') || imageId; } catch { /* use fallback */ }
  }
  if (!LEGACY_PRODUCT_IMAGE_FILES[imageId]) {
    imageId = Object.keys(LEGACY_PRODUCT_IMAGE_FILES).find(id => imagePath.includes(id)) ?? '';
  }
  const fileName = LEGACY_PRODUCT_IMAGE_FILES[imageId];
  return fileName ? LEGACY_PRODUCT_IMAGE_CDN_BASE + encodeURIComponent(fileName) : undefined;
}
