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
}

export interface StarkiesBackup {
  ingredients: Ingredient[];
  recipes: Recipe[];
  customers: Customer[];
  orders: Order[];
  cashMovements?: any[];
  inventoryAdjustments?: any[];
  catalogSettings?: any;
}
