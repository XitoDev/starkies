import { Routes } from '@angular/router';
import { Recetas } from './pages/recetas/recetas';
import { Ingredientes } from './pages/ingredientes/ingredientes';
import { Produccion } from './pages/produccion/produccion';
import { Catalogo } from './pages/catalogo/catalogo';
import { Pedidos } from './pages/pedidos/pedidos';
import { Finanzas } from './pages/finanzas/finanzas';
import { Login } from './pages/login/login';
import { Migration } from './pages/migration/migration';
import { adminAuthGuard } from './core/firebase/admin-auth.guard';
import { businessDataReadyGuard } from './core/firebase/business-data-ready.guard';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'migracion', component: Migration, canActivate: [adminAuthGuard] },
  { path: '', redirectTo: 'recetas', pathMatch: 'full' },
  { path: 'recetas', component: Recetas, canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'ingredientes', component: Ingredientes, canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'produccion', component: Produccion, canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'catalogo', component: Catalogo, canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'pedidos', component: Pedidos, canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'finanzas', component: Finanzas, canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: '**', redirectTo: 'recetas' },
];
