import { BoxPresentation, DeliveryZone, Product } from './catalog.models';

export const BOX_PRESENTATIONS: BoxPresentation[] = [
  { id: 'clasicas', name: 'Caja solo clásicas', desc: '10 clásicas', price: 6.00, reqClasicas: 10, reqNY: 0 },
  { id: 'ny', name: 'Caja solo New York', desc: '6 New York', price: 7.80, reqClasicas: 0, reqNY: 6 },
  { id: 'mixta', name: 'Caja mitad New York, mitad clásicas', desc: '4 clásicas + 4 New York', price: 7.60, reqClasicas: 4, reqNY: 4 },
];

export const CATALOG_PRODUCTS: Product[] = [
  { id: '1', name: 'Brownie Classic', category: 'Galletas clásicas', description: 'Galleta de 30 g con masa de cacao y textura craquelada.', tag: 'Más vendido', price: 0.60, isNy: false, stock: true },
  { id: '2', name: 'Avena Classic', category: 'Galletas clásicas', description: 'Galleta de 30 g elaborada con avena y toque de vainilla.', price: 0.60, isNy: false, stock: true },
  { id: '3', name: 'Chispas de Chocolate Classic', category: 'Galletas clásicas', description: 'Galleta de 30 g con masa de vainilla y chispas.', price: 0.60, isNy: false, stock: true },
  { id: '4', name: 'Canela Classic', category: 'Galletas clásicas', description: 'Galleta de 30 g con masa de vainilla y toque de canela.', price: 0.60, isNy: false, stock: true },
  { id: '5', name: 'Red Velvet Classic', category: 'Galletas clásicas', description: 'Galleta de 30 g red velvet con chocolate blanco.', tag: 'Agotado', price: 0.60, isNy: false, stock: false },
  { id: '6', name: 'Sunny Carrot', category: 'Galletas NY', description: 'Galleta de 60 g con zanahoria rallada y frosting de queso crema.', price: 1.30, isNy: true, stock: true },
  { id: '7', name: 'Chips Stars', category: 'Galletas NY', description: 'Galleta de 60 g con chispas y chocolate derretido.', tag: 'Nuevo', price: 1.30, isNy: true, stock: true },
  { id: '8', name: 'Velvet Kiss', category: 'Galletas NY', description: 'Galleta de 60 g red velvet decorada con chocolate blanco.', price: 1.30, isNy: true, stock: true },
  { id: '9', name: 'Cinna Moon', category: 'Galletas NY', description: 'Galleta de 60 g con canela y glaseado cremoso.', price: 1.30, isNy: true, stock: true },
  { id: '10', name: 'Nuti Dream', category: 'Galletas NY', description: 'Galleta de 60 g con masa de vainilla y Nutella.', price: 1.30, isNy: true, stock: true },
  { id: '11', name: 'Lemon Glow', category: 'Galletas NY', description: 'Galleta de 60 g sabor a limón con frosting blanco.', tag: 'Recomendado', price: 1.30, isNy: true, stock: true },
  { id: '12', name: 'Brownie Bliss', category: 'Galletas NY', description: 'Galleta de 60 g con masa de brownie y chocolate derretido.', tag: 'Más vendido', price: 1.30, isNy: true, stock: true },
  { id: '13', name: 'Choco Meteor', category: 'Galletas NY', description: 'Galleta de 60 g con masa de cacao y chispas.', tag: 'Nuevo', price: 1.30, isNy: true, stock: true },
];

export const DELIVERY_ZONES: DeliveryZone[] = [
  { id: '1', name: 'Kennedy', fee: 0.99 },
  { id: '2', name: 'Norte', fee: 3.50 },
  { id: '3', name: 'Centro', fee: 3.99 },
  { id: '4', name: 'Sur', fee: 4.50 },
  { id: '5', name: 'Daule/Samborondón', fee: 5.99 },
  { id: '6', name: 'Retiro en tienda', fee: 0.00 },
];
