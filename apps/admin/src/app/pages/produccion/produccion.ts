import { LucideDynamicIcon, LucideFactory, LucidePlus, LucideCalendar, LucideCircleCheck } from '@lucide/angular';

@Component({
  selector: 'app-produccion',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  templateUrl: './produccion.html',
  styleUrls: ['./produccion.css']
})
export class Produccion {
  readonly icons = { Factory: LucideFactory, Plus: LucidePlus, Calendar: LucideCalendar, CheckCircle: LucideCircleCheck };

  // Como la producción se calcula al vuelo o se guarda en un historial,
  // aquí simulamos una lista vacía temporalmente para la UI.
  productionHistory = signal<any[]>([]);
  searchTerm = signal<string>('');

  onSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchTerm.set(input.value);
  }
}
