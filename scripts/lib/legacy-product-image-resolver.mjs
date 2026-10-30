export function resolveLegacyProductImage(imagePath, fallbackId, imageFiles, cdnBaseUrl) {
  const value = typeof imagePath === 'string' ? imagePath.trim() : '';
  if (!value) return undefined;

  let pathname = value;
  let legacyImageId = '';
  try {
    const parsed = new URL(value, 'https://starkies.lat');
    pathname = parsed.pathname;
    if (pathname === '/api/recipe-image') legacyImageId = parsed.searchParams.get('id')?.trim() ?? '';
  } catch {
    // Keep the original path for legacy filename matching.
  }

  const legacyFileMatch = pathname.match(/(?:^|\/)(?:recipe|catalog)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=[.-]|$)/i);
  const isLegacyApiPath = pathname === '/api/recipe-image';
  const isLegacyFilePath = Boolean(legacyFileMatch);

  if (!isLegacyApiPath && !isLegacyFilePath) return value;

  const candidates = [legacyImageId, legacyFileMatch?.[1] ?? '', fallbackId?.trim() ?? ''];
  const imageId = candidates.find(candidate => candidate && Object.hasOwn(imageFiles, candidate));
  if (!imageId) return undefined;

  const fileName = imageFiles[imageId];
  return typeof fileName === 'string' && fileName
    ? cdnBaseUrl + encodeURIComponent(fileName)
    : undefined;
}
