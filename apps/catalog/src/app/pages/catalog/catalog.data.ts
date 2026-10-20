import type { BoxPresentation, DeliveryZone } from './catalog.models.js';

export const BOX_PRESENTATIONS: BoxPresentation[] = [
  { id: 'clasicas', name: 'Caja solo clásicas', desc: '10 clásicas', price: 6, reqClasicas: 10, reqNY: 0 },
  { id: 'ny', name: 'Caja solo New York', desc: '6 New York', price: 7.8, reqClasicas: 0, reqNY: 6 },
  { id: 'mixta', name: 'Caja mitad New York, mitad clásicas', desc: '4 clásicas + 4 New York', price: 7.6, reqClasicas: 4, reqNY: 4 },
];

/** Shared fallback also used by admin when the business has no saved delivery zones. */
export const DEFAULT_DELIVERY_ZONES: DeliveryZone[] = [
  { id: 'kennedy', name: 'Kennedy', fee: 0.99 },
  { id: 'norte', name: 'Norte', fee: 3.5 },
  { id: 'centro', name: 'Centro', fee: 3.99 },
  { id: 'sur', name: 'Sur', fee: 4.5 },
  { id: 'daule-samborondon', name: 'Daule/Samborondón', fee: 5.99 },
  { id: 'retiro', name: 'Retiro en tienda', fee: 0 },
];


/**
 * New cookies lead, the best seller follows, then the remaining cookies are
 * ordered from lowest sales to highest to give slower sellers more visibility.
 */
export function rankCatalogProducts<T extends { id: string; tag?: string }>(
  products: T[],
  salesCounts: ReadonlyMap<string, number>,
): T[] {
  const label = (product: T) => (product.tag ?? '').trim().toLocaleLowerCase('es');
  const isNew = (product: T) => label(product) === 'nuevo';
  const previousBestSeller = (product: T) => label(product) === 'más vendida';
  const bestSeller = products.filter(product => !isNew(product)).reduce<T | null>((best, product) => {
    const sold = salesCounts.get(product.id) ?? 0;
    return sold > 0 && (!best || sold > (salesCounts.get(best.id) ?? 0)) ? product : best;
  }, null);
  return products.map((product, index) => {
    const tag = isNew(product) ? 'Nuevo'
      : bestSeller?.id === product.id ? 'Más vendida'
      : previousBestSeller(product) ? undefined : product.tag;
    return { product: { ...product, tag }, index };
  }).sort((a, b) => {
    const aNew = isNew(a.product), bNew = isNew(b.product);
    if (aNew !== bNew) return aNew ? -1 : 1;
    const aBest = bestSeller?.id === a.product.id, bBest = bestSeller?.id === b.product.id;
    if (aBest !== bBest) return aBest ? -1 : 1;
    const salesDifference = (salesCounts.get(a.product.id) ?? 0) - (salesCounts.get(b.product.id) ?? 0);
    return salesDifference || a.index - b.index;
  }).map(item => item.product);
}
