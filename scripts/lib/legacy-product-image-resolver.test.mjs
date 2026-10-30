import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLegacyProductImage } from './legacy-product-image-resolver.mjs';

const productId = '02885ca5-c58c-48a7-b116-cd614290c697';
const otherProductId = '0794f338-588b-460d-b002-ee4e614826c9';
const imageFiles = {
  [productId]: productId + '.png',
  [otherProductId]: otherProductId + '.png',
};
const cdnBaseUrl = 'https://cdn.example.test/products/';

test('uses the product ID when a legacy API image ID is not mapped', () => {
  assert.equal(
    resolveLegacyProductImage('/api/recipe-image?id=legacy-image-document', productId, imageFiles, cdnBaseUrl),
    cdnBaseUrl + productId + '.png',
  );
});

test('prefers a mapped legacy image ID over the product fallback', () => {
  assert.equal(
    resolveLegacyProductImage('/api/recipe-image?id=' + productId, otherProductId, imageFiles, cdnBaseUrl),
    cdnBaseUrl + productId + '.png',
  );
});

test('uses the product ID when a legacy filename ID is not mapped', () => {
  assert.equal(
    resolveLegacyProductImage('/images/recipe-11111111-1111-4111-8111-111111111111.png', productId, imageFiles, cdnBaseUrl),
    cdnBaseUrl + productId + '.png',
  );
});

test('preserves non-legacy image URLs unchanged', () => {
  const url = 'https://images.starkies.lat/images/abc.webp';
  assert.equal(resolveLegacyProductImage(url, productId, imageFiles, cdnBaseUrl), url);
});

test('does not invent a mapping when neither legacy nor product IDs exist', () => {
  assert.equal(
    resolveLegacyProductImage('/api/recipe-image?id=unknown-image', 'unknown-product', imageFiles, cdnBaseUrl),
    undefined,
  );
});
