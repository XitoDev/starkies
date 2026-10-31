import assert from 'node:assert/strict';
import test from 'node:test';
import { collectImageRecordFailures } from './r2-image-audit.mjs';

const imageUrl = 'https://images.starkies.lat/images/' + 'a'.repeat(64) + '.webp';

test('accepts complete canonical recipe and public catalog image records', () => {
  assert.deepEqual(collectImageRecordFailures({
    recipes: [{ id: 'cookie-1', data: { image: imageUrl, archived: false } }],
    publicProducts: [{ id: 'cookie-1', data: { image: imageUrl } }],
    drafts: [{ id: 'cookie-1', data: { description: 'Classic cookie' } }],
  }), []);
});

test('blocks published recipes without an image but allows hidden or archived recipes without a public record', () => {
  assert.deepEqual(collectImageRecordFailures({
    recipes: [
      { id: 'active-cookie', data: { archived: false } },
      { id: 'hidden-cookie', data: { archived: false, catalogVisible: false } },
      { id: 'archived-cookie', data: { archived: true } },
    ],
    publicProducts: [],
    drafts: [],
  }), ['Published recipe active-cookie has no image in recipes.image.']);
});

test('blocks public catalog records without an image', () => {
  assert.deepEqual(collectImageRecordFailures({
    recipes: [],
    publicProducts: [{ id: 'orphan-public-cookie', data: { name: 'Cookie' } }],
    drafts: [],
  }), ['Public catalog product orphan-public-cookie has no image in publicCatalog.image.']);
});

test('blocks mismatched canonical images and obsolete image fields', () => {
  assert.deepEqual(collectImageRecordFailures({
    recipes: [{ id: 'cookie-1', data: { image: imageUrl, catalogImage: '' } }],
    publicProducts: [{ id: 'cookie-1', data: { image: 'https://images.starkies.lat/other.webp', catalogImage: null } }],
    drafts: [{ id: 'cookie-1', data: { image: '', catalogImage: '' } }],
  }), [
    'recipes/cookie-1 still contains the obsolete catalogImage field.',
    'The image in recipes/cookie-1 does not match publicCatalog/cookie-1.',
    'publicCatalog/cookie-1 still contains the obsolete catalogImage field.',
    'catalogDrafts/cookie-1 still contains the obsolete image field image.',
    'catalogDrafts/cookie-1 still contains the obsolete image field catalogImage.',
  ]);
});
