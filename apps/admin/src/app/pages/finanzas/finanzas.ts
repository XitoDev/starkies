import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAngularModule,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  Package
} from 'lucide-angular';

@Component({
  selector: 'app-finanzas',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './finanzas.html',
  styleUrls: ['./finanzas.css']
})
export class Finanzas {
  readonly icons = { DollarSign, TrendingUp, TrendingDown, Wallet, Package };

  activeTab = signal<'movimientos' | 'compras' | 'gastos'>('movimientos');

  // Data temporal (mock) para la UI de finanzas
  cashMovements = signal<any[]>([]);

  setTab(tab: 'movimientos' | 'compras' | 'gastos') {
    this.activeTab.set(tab);
  }
}
