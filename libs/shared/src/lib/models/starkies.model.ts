export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  stock: number;
  costPerUnit: number;
  /** Numeric quantity as printed on the supplier package; see packageUnit. */
  packageQuantityGrams?: number;
  /** Supplier package unit; normalized internally to g or ml. */
  packageUnit?: string;
  /** Total purchase price for the supplier package. */
  packagePrice?: number;
  brand?: string;
  minStock?: number;
  supplyGroup?: string;
  foodGroup?: string;
  ingredientGroup?: string;
}

export interface RecipeSection {
  name: string; // 'masa' | 'relleno' | 'decoración'
  ingredients: {
    ingredientId: string;
    quantity: number;
  }[];
}

export interface Recipe {
  id: string;
  name: string;
  category: string;
  yield: number; // Cantidad por tanda
  price: number;
  /** Image used by the recipe editor and internal recipe cards. */
  image?: string;
  /** Independent image displayed in the public customer catalog. */
  catalogImage?: string;
  catalogVisible?: boolean;
  catalogLabel?: string;
  catalogLabelColor?: string;
  catalogDescription?: string;
  archived?: boolean;
  archivedAt?: string;
  baseId?: string;
  baseGramsPerCookie?: number;
  sections: RecipeSection[];
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  address?: string;
}

export interface OrderItem {
  recipeId: string;
  name?: string;
  quantity: number;
  unitPrice: number;
}

export type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED';
export type OrderPaymentMethod = 'TRANSFER' | 'CASH';

export interface Order {
  id: string;
  customerId: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  createdAt: string;
  deliveryDate?: string;
  deliveryMethod?: string;
  deliveryAddress?: string;
  deliveryTime?: string;
  zone?: string;
  notes?: string;
  cookieName?: string;
  shippingFee?: number;
  isPaid?: boolean;
  paymentMethod?: OrderPaymentMethod;
}

export interface CashMovement {
  id: string;
  date: string;
  description: string;
  type: 'IN' | 'OUT';
  amount: number;
  category: string;
  subcategory?: string;
  ingredientId?: string;
  ingredientName?: string;
  ingredientUnit?: string;
  quantity?: number;
  unitCost?: number;
  brand?: string;
  packageQuantityGrams?: number;
  packageUnit?: string;
  packagePrice?: number;
}


