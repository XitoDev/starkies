import { BoxPresentation, DeliveryZone, Product } from './catalog.models';
const IMAGE_BASE = 'https://cdn.jsdelivr.net/gh/XitoDev/starkies@eed4ced5756232d2957340e18b86d18877e833ae/public/images/';
export const BOX_PRESENTATIONS: BoxPresentation[] = [
  { id: 'clasicas', name: 'Caja solo clásicas', desc: '10 clásicas', price: 6, reqClasicas: 10, reqNY: 0 },
  { id: 'ny', name: 'Caja solo New York', desc: '6 New York', price: 7.8, reqClasicas: 0, reqNY: 6 },
  { id: 'mixta', name: 'Caja mitad New York, mitad clásicas', desc: '4 clásicas + 4 New York', price: 7.6, reqClasicas: 4, reqNY: 4 },
];
export const CATALOG_PRODUCTS: Product[] = [
  { id: '1', name: 'Brownie Classic', category: 'Galletas clásicas', description: 'Galleta de 30 g con masa de cacao y una textura craquelada, estilo brownie.', tag: 'Más vendido', price: .6, isNy: false, stock: true, image: IMAGE_BASE + 'recipe-6539b2bd-5e58-4485-8ff9-b625d1aa6147.jpg' },
  { id: '2', name: 'Avena Classic', category: 'Galletas clásicas', description: 'Galleta de 30 g elaborada con avena en hojuelas y un toque de vainilla.', price: .6, isNy: false, stock: true, image: IMAGE_BASE + 'recipe-202edec5-9b83-4e9b-a466-c32bd1a05d44.jpg' },
  { id: '3', name: 'Chispas de Chocolate Classic', category: 'Galletas clásicas', description: 'Galleta de 30 g con masa de vainilla y chispas de chocolate.', price: .6, isNy: false, stock: true, image: '/images/chispas-chocolate-classic.webp' },
  { id: '4', name: 'Canela Classic', category: 'Galletas clásicas', description: 'Galleta de 30 g con masa de vainilla y un toque de canela.', price: .6, isNy: false, stock: true, image: IMAGE_BASE + 'recipe-e9005152-d579-444f-905f-a06a5ad3d74b.jpg' },
  { id: '5', name: 'Red Velvet Classic', category: 'Galletas clásicas', description: 'Galleta de 30 g con masa red velvet y trocitos de chocolate blanco.', tag: 'Agotado', price: .6, isNy: false, stock: false },
  { id: '6', name: 'Sunny Carrot', category: 'Galletas NY', description: 'Galleta de 60 g con zanahoria rallada y cobertura de frosting de queso crema.', price: 1.3, isNy: true, stock: true, image: IMAGE_BASE + 'recipe-85e499f3-37c9-4701-bf89-5176007ce546.png' },
  { id: '7', name: 'Chips Stars', category: 'Galletas NY', description: 'Galleta de 60 g con masa de vainilla, chispas de chocolate y decorada con chocolate derretido.', tag: 'Nuevo', price: 1.3, isNy: true, stock: true, image: IMAGE_BASE + 'recipe-02885ca5-c58c-48a7-b116-cd614290c697.png' },
  { id: '8', name: 'Velvet Kiss', category: 'Galletas NY', description: 'Galleta de 60 g con masa red velvet, trocitos de chocolate blanco y decorada con chocolate blanco derretido.', price: 1.3, isNy: true, stock: true, image: IMAGE_BASE + 'recipe-f126ae46-9eee-4ac2-8cff-d2f954d708e9.png' },
  { id: '9', name: 'Cinna Moon', category: 'Galletas NY', description: 'Galleta de 60 g con canela y decorada con glaseado cremoso.', price: 1.3, isNy: true, stock: true, image: IMAGE_BASE + 'recipe-5cbf3e5f-edb0-490b-b544-8741ba6cffe7.png' },
  { id: '10', name: 'Nuti Dream', category: 'Galletas NY', description: 'Galleta de 60 g con masa de vainilla y decorada con Nutella.', price: 1.3, isNy: true, stock: true, image: IMAGE_BASE + 'recipe-99e32e0c-61fb-41b1-8018-fa18ef655750.png' },
  { id: '11', name: 'Lemon Glow', category: 'Galletas NY', description: 'Galleta de 60 g con sabor a limón, cobertura de frosting blanco y ralladura de limón.', tag: 'Recomendado', price: 1.3, isNy: true, stock: true, image: IMAGE_BASE + 'recipe-0794f338-588b-460d-b002-ee4e614826c9.png' },
  { id: '12', name: 'Brownie Bliss', category: 'Galletas NY', description: 'Galleta de 60 g con masa de brownie de chocolate y decorada con chocolate derretido.', tag: 'Más vendido', price: 1.3, isNy: true, stock: true, image: IMAGE_BASE + 'recipe-5954e0af-d58c-40ce-a79d-cbcff10c7b78.png' },
  { id: '13', name: 'Choco Meteor', category: 'Galletas NY', description: 'Galleta de 60 g con masa de cacao y chispas de chocolate.', price: 1.3, isNy: true, stock: true, image: '/images/choco-meteor.webp' },
];
export const DELIVERY_ZONES: DeliveryZone[] = [
  { id: '1', name: 'Kennedy', fee: .99 }, { id: '2', name: 'Norte', fee: 3.5 },
  { id: '3', name: 'Centro', fee: 3.99 }, { id: '4', name: 'Sur', fee: 4.5 },
  { id: '5', name: 'Daule/Samborondón', fee: 5.99 }, { id: '6', name: 'Retiro en tienda', fee: 0 },
];
