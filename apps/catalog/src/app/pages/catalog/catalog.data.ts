import { BoxPresentation, DeliveryZone } from './catalog.models';

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
