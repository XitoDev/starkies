const LEGACY_IMAGE_ORIGIN = 'https://starkies-admin.milkyflame1.chatgpt.site';
const MAX_LEGACY_IMAGE_BYTES = 12 * 1024 * 1024;

export async function fetchLegacyImage(sourceUrl, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  let url;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new Error('La dirección de la imagen heredada no es válida.');
  }

  if (url.origin !== LEGACY_IMAGE_ORIGIN || url.pathname !== '/api/recipe-image' || !url.searchParams.get('id')) {
    throw new Error('Solo se permite recuperar imágenes del catálogo heredado de StarKies.');
  }

  const response = await fetchImpl(url, {
    method: 'GET',
    redirect: 'manual',
    signal: options.signal ?? AbortSignal.timeout(20000),
    headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg' },
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error('El servidor heredado redirigió la imagen. No se siguió la redirección por seguridad.');
  }
  if (!response.ok) {
    throw new Error('El servidor heredado respondió HTTP ' + response.status + ' al recuperar la imagen.');
  }

  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_LEGACY_IMAGE_BYTES) {
    throw new Error('La imagen heredada supera el límite de 12 MB.');
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('El servidor heredado devolvió una respuesta vacía.');
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_LEGACY_IMAGE_BYTES) {
        await reader.cancel();
        throw new Error('La imagen heredada supera el límite de 12 MB.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
  const contentType = detectImageContentType(bytes);
  if (!contentType) throw new Error('El servidor heredado no devolvió una imagen JPG, PNG o WebP válida.');
  return { bytes, contentType };
}

export function detectImageContentType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
