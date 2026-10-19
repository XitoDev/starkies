import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Store, Settings, Eye } from 'lucide-angular';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './catalogo.html',
  styleUrls: ['./catalogo.css']
})
export class Catalogo {
  private dataService = inject(DataService);
  readonly icons = { Store, Settings, Eye };

  // Leemos las recetas directamente del servicio
  recipes = this.dataService.recipes;

  // Lista de productos que se mostrarán en el catálogo público
  catalogItems = computed(() => this.recipes());
}
