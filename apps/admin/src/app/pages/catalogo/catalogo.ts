import { LucideDynamicIcon, LucideStore, LucideSettings, LucideEye } from '@lucide/angular';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  templateUrl: './catalogo.html',
  styleUrls: ['./catalogo.css']
})
export class Catalogo {
  private dataService = inject(DataService);
  readonly icons = { Store: LucideStore, Settings: LucideSettings, Eye: LucideEye };

  // Leemos las recetas directamente del servicio
  recipes = this.dataService.recipes;

  // Lista de productos que se mostrarán en el catálogo público
  catalogItems = computed(() => this.recipes());
}
