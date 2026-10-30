export function fetchLegacyImage(sourceUrl: string, options?: { fetchImpl?: typeof fetch; signal?: AbortSignal }): Promise<{ bytes: Buffer; contentType: string }>;
export function detectImageContentType(bytes: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null;
