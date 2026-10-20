export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  stock: number;
  costPerUnit: number;
  minStock?: number;
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
  image?: string;
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

export interface Order {
  id: string;
  customerId: string;
  items: OrderItem[];
  total: number;
  status: 'PENDING' | 'DELIVERED' | 'CANCELLED';
  createdAt: string;
  deliveryDate?: string;
  zone?: string;
  notes?: string;
  cookieName?: string;
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
}

export interface StarkiesBackup {
  ingredients: Ingredient[];
  recipes: Recipe[];
  customers: Customer[];
  orders: Order[];
  cashMovements?: CashMovement[];
  inventoryAdjustments?: any[];
  catalogSettings?: any;
}
