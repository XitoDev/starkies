import { Routes } from '@angular/router';
import { Recetas } from './pages/recetas/recetas';
import { MasaBaseEditor } from './pages/recetas/masa-base-editor';
import { Ingredientes, Inventario } from './pages/ingredientes/ingredientes';
import { Produccion } from './pages/produccion/produccion';
import { Catalogo } from './pages/catalogo/catalogo';
import { Pedidos } from './pages/pedidos/pedidos';
import { ClienteEditor } from './pages/pedidos/cliente-editor';
import { PedidoRuta } from './pages/pedidos/pedido-ruta';
import { CatalogoProductoEditor } from './pages/catalogo/catalogo-producto-editor';
import { Finanzas } from './pages/finanzas/finanzas';
import { Login } from './pages/login/login';
import { Migration } from './pages/migration/migration';
import { adminAuthGuard } from './core/firebase/admin-auth.guard';
import { businessDataReadyGuard } from './core/firebase/business-data-ready.guard';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'migracion', component: Migration, canActivate: [adminAuthGuard] },
  { path: '', redirectTo: 'resumen', pathMatch: 'full' },
  { path: 'resumen', loadComponent: () => import('./pages/resumen/resumen').then(module => module.Resumen), canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'recetas/masas-base/nueva', component: MasaBaseEditor, canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'recetas/masas-base/:baseId/editar', component: MasaBaseEditor, canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'recetas/:recipeId/editar', component: Recetas, canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'recetas', component: Recetas, canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'ingredientes', component: Ingredientes, canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'inventario', component: Inventario, canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'produccion', component: Produccion, canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'catalogo/productos/:productId', component: CatalogoProductoEditor, canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'catalogo', component: Catalogo, canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'pedidos/clientes/:customerId/editar', component: ClienteEditor, canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'pedidos/:orderId/editar', component: PedidoRuta, canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'pedidos/:orderId', component: PedidoRuta, canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'pedidos', component: Pedidos, canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'finanzas', component: Finanzas, canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: '**', redirectTo: 'resumen' },
];
