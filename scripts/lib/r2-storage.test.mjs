import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createR2Authorization,
  getR2Config,
  imageObjectKey,
  imagePublicUrl,
  isWebpBuffer,
  parseManagedImageUrl,
  r2Request,
  sha256Hex,
} from './r2-storage.mjs';

const env = {
  R2_ACCOUNT_ID: 'account123',
  R2_ACCESS_KEY_ID: 'access-key',
  R2_SECRET_ACCESS_KEY: 'secret-key',
  R2_BUCKET_NAME: 'starkies',
  R2_PUBLIC_BASE_URL: 'https://images.example.test',
};

test('creates deterministic content-addressed WebP keys', () => {
  const hash = sha256Hex(Buffer.from('same image'));
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(imageObjectKey(hash), 'images/' + hash + '.webp');
  assert.equal(imageObjectKey(hash), imageObjectKey(hash));
});

test('accepts only RIFF WebP signatures', () => {
  assert.equal(isWebpBuffer(Buffer.from('RIFF0000WEBPVP8 ')), true);
  assert.equal(isWebpBuffer(Buffer.from('RIFF0000PNG ')), false);
  assert.equal(isWebpBuffer(Buffer.from('WEBP')), false);
});

test('builds public URLs and resolves only managed image URLs', () => {
  const config = getR2Config(env);
  const hash = 'a'.repeat(64);
  const url = imagePublicUrl(config.publicBaseUrl, imageObjectKey(hash));
  assert.equal(url, 'https://images.example.test/images/' + hash + '.webp');
  assert.deepEqual(parseManagedImageUrl(url, config), { hash, key: imageObjectKey(hash) });
  assert.equal(parseManagedImageUrl('https://evil.example/images/' + hash + '.webp', config), null);
  assert.equal(parseManagedImageUrl('https://images.example.test/images/not-a-hash.webp', config), null);
});

test('signs PUT requests with Cloudflare-documented aws4fetch S3 settings', async () => {
  const config = getR2Config(env);
  const payload = Buffer.from('RIFF0000WEBP');
  const signed = await createR2Authorization({
    method: 'PUT',
    key: imageObjectKey('b'.repeat(64)),
    body: payload,
    contentType: 'image/webp',
    config,
    now: new Date('2026-10-30T12:00:00.000Z'),
  });

  assert.match(signed.url, /^https:\/\/account123\.r2\.cloudflarestorage\.com\/starkies\/images\//);
  assert.match(signed.headers.authorization, /^AWS4-HMAC-SHA256 Credential=access-key\/20261030\/auto\/s3\/aws4_request/);
  assert.match(signed.headers.authorization, /SignedHeaders=.*host/);
  assert.equal(signed.headers['content-type'], 'image/webp');
  assert.equal(signed.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(signed.body.toString(), payload.toString());
});

test('sends signed requests and surfaces R2 errors without retry storms', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (input, init) => {
    captured = { input: String(input), init };
    return new Response('ok', { status: 200 });
  };

  try {
    const response = await r2Request('PUT', 'healthchecks/probe.txt', {
      body: Buffer.from('probe'),
      contentType: 'text/plain',
      now: new Date('2026-10-30T12:00:00.000Z'),
    }, env);

    assert.equal(response.status, 200);
    assert.match(captured.input, /^https:\/\/account123\.r2\.cloudflarestorage\.com\/starkies\/healthchecks\/probe\.txt$/);
    assert.equal(captured.init.method, 'PUT');
    assert.equal(captured.init.headers.authorization.startsWith('AWS4-HMAC-SHA256'), true);
    assert.equal(Buffer.from(captured.init.body).toString(), 'probe');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
