export interface Product {
  id: string;
  name: string;
  category: string;
  description: string;
  tag?: string;
  price: number;
  isNy: boolean;
  stock: boolean;
}

export interface BoxPresentation {
  id: string;
  name: string;
  desc: string;
  price: number;
  reqClasicas: number;
  reqNY: number;
}

export interface PackedBox {
  presentation: BoxPresentation;
  items: { [productId: string]: number };
}

export interface DeliveryZone {
  id: string;
  name: string;
  fee: number;
}
