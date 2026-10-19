import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Factory, Plus, Calendar, CheckCircle } from 'lucide-angular';

@Component({
  selector: 'app-produccion',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './produccion.html',
  styleUrls: ['./produccion.css']
})
export class Produccion {
  readonly icons = { Factory, Plus, Calendar, CheckCircle };

  // Como la producción se calcula al vuelo o se guarda en un historial,
  // aquí simulamos una lista vacía temporalmente para la UI.
  productionHistory = signal<any[]>([]);
  searchTerm = signal<string>('');

  onSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchTerm.set(input.value);
  }
}
