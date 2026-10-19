import { LucideDynamicIcon, LucideDollarSign, LucideTrendingUp, LucideTrendingDown, LucideWallet, LucidePackage } from '@lucide/angular';

@Component({
  selector: 'app-finanzas',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  templateUrl: './finanzas.html',
  styleUrls: ['./finanzas.css']
})
export class Finanzas {
  readonly icons = { LucideDollarSign, LucideTrendingUp, LucideTrendingDown, LucideWallet, LucidePackage };

  activeTab = signal<'movimientos' | 'compras' | 'gastos'>('movimientos');

  // Data temporal (mock) para la UI de finanzas
  cashMovements = signal<any[]>([]);

  setTab(tab: 'movimientos' | 'compras' | 'gastos') {
    this.activeTab.set(tab);
  }
}
