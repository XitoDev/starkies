import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  resolveCanonicalImage,
  resolveLegacyImageReference,
} from './product-image-migration-utils.mjs';

const imageMap = JSON.parse(await readFile(new URL('../public/images/image-map.json', import.meta.url), 'utf8'));
const productImages = new Map(Object.entries(imageMap.images)
  .filter(([key]) => key.startsWith('product:'))
  .map(([key, value]) => [key.slice('product:'.length), value.url]));

test('resolves legacy recipe-image endpoint IDs through the current product image map', () => {
  const legacyIds = [
    'e9005152-d579-444f-905f-a06a5ad3d74b',
    '0794f338-588b-460d-b002-ee4e614826c9',
    '5cbf3e5f-edb0-490b-b544-8741ba6cffe7',
    '202edec5-9b83-4e9b-a466-c32bd1a05d44',
    '5954e0af-d58c-40ce-a79d-cbcff10c7b78',
    '85e499f3-37c9-4701-bf89-5176007ce546',
    '99e32e0c-61fb-41b1-8018-fa18ef655750',
    '02885ca5-c58c-48a7-b116-cd614290c697',
  ];

  for (const id of legacyIds) {
    assert.equal(
      resolveLegacyImageReference('/api/recipe-image?id=' + id, productImages),
      productImages.get(id),
      'Expected legacy image ' + id + ' to resolve to its current product image',
    );
  }
});

test('resolves legacy recipe- and catalog-prefixed filenames by their UUID', () => {
  const id = '0a783c0b-8993-41a0-b986-b03b57674ca9';
  const expected = productImages.get(id);
  assert.equal(
    resolveLegacyImageReference('/images/recipe-' + id + '-d5d8d5a1-6607-4675-9912-2c90047da608.png', productImages),
    expected,
  );
  assert.equal(
    resolveLegacyImageReference('https://cdn.example.test/catalog-' + id + '.png', productImages),
    expected,
  );
});

test('uses a product document map entry first and does not report same-image legacy references as conflicts', () => {
  const id = '0a783c0b-8993-41a0-b986-b03b57674ca9';
  const canonical = productImages.get(id);
  const oldReference = '/api/recipe-image?id=' + id;
  const result = resolveCanonicalImage(
    { image: oldReference },
    { image: oldReference },
    { image: oldReference },
    canonical,
    productImages,
  );

  assert.equal(result.canonical, canonical);
  assert.equal(result.source, 'image-map:product');
  assert.equal(result.unresolved.length, 0);
  assert.equal(result.conflicts.length, 0);
});

test('recovers an old API image ID even when it differs from the product document ID', () => {
  const oldImageId = 'e9005152-d579-444f-905f-a06a5ad3d74b';
  const result = resolveCanonicalImage(
    { image: '/api/recipe-image?id=' + oldImageId },
    { image: '/api/recipe-image?id=' + oldImageId },
    {},
    undefined,
    productImages,
  );

  assert.equal(result.canonical, productImages.get(oldImageId));
  assert.equal(result.source, 'catalogDrafts.image');
  assert.equal(result.resolution, 'legacy-image-map');
  assert.equal(result.unresolved.length, 0);
  assert.equal(result.legacyImageResolutions.length, 2);
});

test('keeps an unknown legacy image unresolved instead of deleting or replacing it', () => {
  const missingId = '66bc3507-c45d-4767-bfbe-584d814d98ad';
  const oldReference = '/api/recipe-image?id=' + missingId;
  const result = resolveCanonicalImage(
    { image: oldReference },
    {},
    {},
    undefined,
    productImages,
  );

  assert.equal(result.canonical, '');
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.unresolved[0].value, oldReference);
});
