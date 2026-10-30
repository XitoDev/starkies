function text(value) { return typeof value === 'string' ? value.trim() : ''; }

function isLegacyImageUrl(value) {
  return /\/api\/recipe-image(?:[?#]|$)|(?:^|\/)recipe-|(?:^|\/)catalog-/i.test(text(value));
}

function isUsableImageUrl(value) {
  const image = text(value);
  if (!image || isLegacyImageUrl(image)) return false;
  return /^https?:\/\//i.test(image) || /^\/images\/products\//i.test(image);
}

/**
 * Resolve old recipe-image endpoint IDs and recipe-/catalog- filenames through
 * the current product image map. The old image ID can differ from the Firestore
 * product document ID, so this lookup must not use the product document ID.
 */
export function resolveLegacyImageReference(value, productImages) {
  const image = text(value);
  if (!image) return undefined;

  let imageId = '';
  try {
    const parsed = new URL(image, 'https://starkies.lat');
    if (parsed.pathname === '/api/recipe-image') {
      imageId = text(parsed.searchParams.get('id'));
    }
  } catch {
    // Continue with the legacy filename pattern below.
  }

  if (!imageId) {
    const match = image.match(/(?:^|\/)(?:recipe|catalog)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=[.-]|$)/i);
    imageId = match?.[1] ?? '';
  }
  return imageId ? productImages.get(imageId) : undefined;
}

function resolveCandidate(candidate, productImages) {
  const originalValue = text(candidate.value);
  if (!originalValue) return undefined;
  if (isUsableImageUrl(originalValue)) {
    return {
      source: candidate.source,
      value: originalValue,
      originalValue,
      resolution: 'direct',
    };
  }
  const mappedValue = resolveLegacyImageReference(originalValue, productImages);
  if (!mappedValue) return undefined;
  return {
    source: candidate.source,
    value: mappedValue,
    originalValue,
    resolution: 'legacy-image-map',
  };
}

export function resolveCanonicalImage(recipe, draft, publicProduct, mappedImage, productImages) {
  const catalogCandidates = [
    { source: 'catalogDrafts.image', value: draft['image'] },
    { source: 'recipes.catalogImage', value: recipe['catalogImage'] },
    { source: 'publicCatalog.image', value: publicProduct['image'] },
    { source: 'publicCatalog.catalogImage', value: publicProduct['catalogImage'] },
    { source: 'catalogDrafts.catalogImage', value: draft['catalogImage'] },
  ];
  const recipeCandidate = { source: 'recipes.image', value: recipe['image'] };
  const allRawCandidates = [...catalogCandidates, recipeCandidate];
  const resolvedCatalogCandidates = catalogCandidates
    .map(candidate => resolveCandidate(candidate, productImages))
    .filter(Boolean);
  const resolvedRecipeCandidate = resolveCandidate(recipeCandidate, productImages);
  const mappedProductCandidate = text(mappedImage)
    ? {
      source: 'image-map:product',
      value: text(mappedImage),
      originalValue: text(mappedImage),
      resolution: 'product-map',
    }
    : undefined;

  // Explicit product-map entries always win. Otherwise, keep the catalog's
  // image source priority; recipes.image is a fallback only when no catalog
  // image field is populated at all.
  const selected = mappedProductCandidate
    ?? resolvedCatalogCandidates[0]
    ?? (catalogCandidates.some(candidate => text(candidate.value)) ? undefined : resolvedRecipeCandidate);

  if (!selected) {
    const unresolved = allRawCandidates
      .filter(candidate => text(candidate.value))
      .map(candidate => ({ source: candidate.source, value: text(candidate.value) }));
    return {
      canonical: '',
      source: '',
      resolution: '',
      originalValue: '',
      unresolved,
      conflicts: [],
      legacyImageResolutions: [],
    };
  }

  const allResolvedCandidates = [
    ...(mappedProductCandidate ? [mappedProductCandidate] : []),
    ...resolvedCatalogCandidates,
    ...(resolvedRecipeCandidate ? [resolvedRecipeCandidate] : []),
  ];
  const conflicts = allResolvedCandidates
    .filter(candidate => candidate.value !== selected.value)
    .map(candidate => ({
      source: candidate.source,
      value: candidate.originalValue,
      ...(candidate.resolution === 'legacy-image-map' ? { resolvedValue: candidate.value } : {}),
    }));
  const legacyImageResolutions = allResolvedCandidates
    .filter(candidate => candidate.resolution === 'legacy-image-map')
    .map(candidate => ({
      source: candidate.source,
      originalValue: candidate.originalValue,
      canonical: candidate.value,
    }));

  return {
    canonical: selected.value,
    source: selected.source,
    resolution: selected.resolution,
    originalValue: selected.originalValue,
    unresolved: [],
    conflicts,
    legacyImageResolutions,
  };
}
