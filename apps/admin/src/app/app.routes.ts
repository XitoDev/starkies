import { Routes } from '@angular/router';
import { Recetas } from './pages/recetas/recetas';
import { Ingredientes } from './pages/ingredientes/ingredientes';
import { Produccion } from './pages/produccion/produccion';
import { Catalogo } from './pages/catalogo/catalogo';
import { Pedidos } from './pages/pedidos/pedidos';
import { Finanzas } from './pages/finanzas/finanzas';

export const routes: Routes = [
  { path: '', redirectTo: 'recetas', pathMatch: 'full' },
  { path: 'recetas', component: Recetas },
  { path: 'ingredientes', component: Ingredientes },
  { path: 'produccion', component: Produccion },
  { path: 'catalogo', component: Catalogo },
  { path: 'pedidos', component: Pedidos },
  { path: 'finanzas', component: Finanzas },
  { path: '**', redirectTo: 'recetas' }
];
