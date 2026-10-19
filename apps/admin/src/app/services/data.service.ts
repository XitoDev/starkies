import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Ingredient, Recipe, Order, Customer, StarkiesBackup } from 'shared';

const STORAGE_KEY = 'starkies_db_v1';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  ingredients = signal<Ingredient[]>([]);
  recipes = signal<Recipe[]>([]);
  customers = signal<Customer[]>([]);
  orders = signal<Order[]>([]);

  constructor(private http: HttpClient) {
    this.initData();
  }

  private initData(): void {
    const localData = localStorage.getItem(STORAGE_KEY);
    if (localData) {
      const db: StarkiesBackup = JSON.parse(localData);
      this.loadState(db);
    } else {
      // Cargar seed inicial del JSON de respaldo
      this.http.get<StarkiesBackup>('assets/seed.json').subscribe({
        next: (seed) => {
          this.saveToStorage(seed);
          this.loadState(seed);
        },
        error: (err) => console.error('Error al cargar seed.json:', err)
      });
    }
  }

  private loadState(data: StarkiesBackup): void {
    this.ingredients.set(data.ingredients || []);
    this.recipes.set(data.recipes || []);
    this.customers.set(data.customers || []);
    this.orders.set(data.orders || []);
  }

  private saveToStorage(data: StarkiesBackup): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  exportBackup(): void {
    const currentData = localStorage.getItem(STORAGE_KEY);
    if (!currentData) return;

    const blob = new Blob([currentData], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `StarKies-respaldo-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}
