export function resolveLegacyProductImage(
  imagePath: string | undefined,
  fallbackId: string | undefined,
  imageFiles: Readonly<Record<string, string>>,
  cdnBaseUrl: string,
): string | undefined;
