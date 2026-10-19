import {
  LucideDynamicIcon,
  LucideUtensils,
  LucidePackage,
  LucideFactory,
  LucideStore,
  LucideShoppingBag,
  LucideDollarSign,
  LucideDownload,
} from '@lucide/angular';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, LucideDynamicIcon],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css'
})
export class Sidebar {
  private dataService = inject(DataService);

  readonly icons = { Utensils: LucideUtensils, Package: LucidePackage, Factory: LucideFactory, Store: LucideStore, ShoppingBag: LucideShoppingBag, DollarSign: LucideDollarSign, Download: LucideDownload };

  navItems = [
    { label: 'Recetas', path: '/recetas', icon: LucideUtensils },
    { label: 'Ingredientes', path: '/ingredientes', icon: LucidePackage },
    { label: 'Producción', path: '/produccion', icon: LucideFactory },
    { label: 'Catálogo', path: '/catalogo', icon: LucideStore },
    { label: 'Pedidos', path: '/pedidos', icon: LucideShoppingBag },
    { label: 'Finanzas', path: '/finanzas', icon: LucideDollarSign }
  ];

  exportBackup(): void {
    this.dataService.exportBackup();
  }
}
