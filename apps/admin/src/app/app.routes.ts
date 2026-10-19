import { Routes } from '@angular/router';
import { Recetas } from './pages/recetas/recetas';
import { Ingredientes } from './pages/ingredientes/ingredientes';
import { Produccion } from './pages/produccion/produccion';
import { Catalogo } from './pages/catalogo/catalogo';
import { Pedidos } from './pages/pedidos/pedidos';
import { Finanzas } from './pages/finanzas/finanzas';
import { Login } from './pages/login/login';
import { adminAuthGuard } from './core/firebase/admin-auth.guard';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: '', redirectTo: 'recetas', pathMatch: 'full' },
  { path: 'recetas', component: Recetas, canActivate: [adminAuthGuard] },
  { path: 'ingredientes', component: Ingredientes, canActivate: [adminAuthGuard] },
  { path: 'produccion', component: Produccion, canActivate: [adminAuthGuard] },
  { path: 'catalogo', component: Catalogo, canActivate: [adminAuthGuard] },
  { path: 'pedidos', component: Pedidos, canActivate: [adminAuthGuard] },
  { path: 'finanzas', component: Finanzas, canActivate: [adminAuthGuard] },
  { path: '**', redirectTo: 'recetas' },
];
