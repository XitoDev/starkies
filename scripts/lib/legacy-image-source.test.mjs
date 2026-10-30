import assert from 'node:assert/strict';
import test from 'node:test';
import { detectImageContentType, fetchLegacyImage } from './legacy-image-source.mjs';

const legacyUrl = 'https://starkies-admin.milkyflame1.chatgpt.site/api/recipe-image?id=legacy-product';

test('allows only the exact legacy image origin and endpoint', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return new Response(''); };
  await assert.rejects(fetchLegacyImage('https://evil.example/api/recipe-image?id=x', { fetchImpl }), /Solo se permite/);
  await assert.rejects(fetchLegacyImage('https://starkies-admin.milkyflame1.chatgpt.site/other?id=x', { fetchImpl }), /Solo se permite/);
  await assert.rejects(fetchLegacyImage('https://starkies-admin.milkyflame1.chatgpt.site/api/recipe-image', { fetchImpl }), /Solo se permite/);
  assert.equal(called, false);
});

test('retrieves and validates a legacy WebP image', async () => {
  const payload = Buffer.from('RIFF0000WEBP');
  let request;
  const result = await fetchLegacyImage(legacyUrl, {
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return new Response(payload, { status: 200, headers: { 'content-type': 'application/octet-stream' } });
    },
  });
  assert.equal(request.url, legacyUrl);
  assert.equal(request.options.redirect, 'manual');
  assert.equal(result.contentType, 'image/webp');
  assert.deepEqual(result.bytes, payload);
});

test('rejects redirects and upstream HTTP errors without following them', async () => {
  await assert.rejects(fetchLegacyImage(legacyUrl, {
    fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/image.jpg' } }),
  }), /redirigió/);
  await assert.rejects(fetchLegacyImage(legacyUrl, {
    fetchImpl: async () => new Response('missing', { status: 404 }),
  }), /HTTP 404/);
});

test('rejects content that is not a supported image', async () => {
  await assert.rejects(fetchLegacyImage(legacyUrl, {
    fetchImpl: async () => new Response('not an image', { status: 200 }),
  }), /no devolvió una imagen/);
  assert.equal(detectImageContentType(Buffer.from('RIFF0000WEBP')), 'image/webp');
  assert.equal(detectImageContentType(Buffer.from('invalid')), null);
});

test('rejects oversized declared content before reading the body', async () => {
  await assert.rejects(fetchLegacyImage(legacyUrl, {
    fetchImpl: async () => new Response('x', { status: 200, headers: { 'content-length': String(13 * 1024 * 1024) } }),
  }), /supera el límite de 12 MB/);
});
