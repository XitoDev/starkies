import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Search, AlertTriangle, Plus, Edit2 } from 'lucide-angular';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-ingredientes',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './ingredientes.html',
  styleUrls: ['./ingredientes.css']
})
export class Ingredientes {
  private dataService = inject(DataService);

  readonly icons = { Search, AlertTriangle, Plus, Edit2 };

  ingredients = this.dataService.ingredients;
  searchTerm = signal<string>('');

  // Filtramos la tabla según lo que el usuario escriba
  filteredIngredients = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const all = this.ingredients() || [];
    if (!term) return all;
    return all.filter(ing => ing.name.toLowerCase().includes(term));
  });

  onSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchTerm.set(input.value);
  }

  // Verifica si el stock es menor o igual al mínimo establecido
  isLowStock(stock: number, minStock?: number): boolean {
    if (minStock === undefined || minStock === null) return false;
    return stock <= minStock;
  }
}
