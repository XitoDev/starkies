function asRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function collectImageRecordFailures({ recipes, publicProducts, drafts }) {
  const failures = [];
  const publicById = new Map(publicProducts.map(product => [product.id, asRecord(product.data)]));

  for (const { id, data } of recipes) {
    const recipe = asRecord(data);
    const image = text(recipe['image']);

    if (recipe['archived'] !== true && !image) {
      failures.push('Active recipe ' + id + ' has no image in recipes.image.');
    }
    if (Object.hasOwn(recipe, 'catalogImage')) {
      failures.push('recipes/' + id + ' still contains the obsolete catalogImage field.');
    }

    const publicProduct = publicById.get(id);
    if (publicProduct && image !== text(publicProduct['image'])) {
      failures.push('The image in recipes/' + id + ' does not match publicCatalog/' + id + '.');
    }
  }

  for (const { id, data } of publicProducts) {
    const product = asRecord(data);
    if (!text(product['image'])) {
      failures.push('Public catalog product ' + id + ' has no image in publicCatalog.image.');
    }
    if (Object.hasOwn(product, 'catalogImage')) {
      failures.push('publicCatalog/' + id + ' still contains the obsolete catalogImage field.');
    }
  }

  for (const { id, data } of drafts) {
    const draft = asRecord(data);
    for (const field of ['image', 'catalogImage']) {
      if (Object.hasOwn(draft, field)) {
        failures.push('catalogDrafts/' + id + ' still contains the obsolete image field ' + field + '.');
      }
    }
  }

  return failures;
}
