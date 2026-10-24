import { Routes } from '@angular/router';
import { adminAuthGuard } from './core/firebase/admin-auth.guard';
import { businessDataReadyGuard } from './core/firebase/business-data-ready.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login/login').then(module => module.Login) },
  { path: 'migracion', loadComponent: () => import('./pages/migration/migration').then(module => module.Migration), canActivate: [adminAuthGuard] },
  { path: '', redirectTo: 'resumen', pathMatch: 'full' },
  { path: 'resumen', loadComponent: () => import('./pages/resumen/resumen').then(module => module.Resumen), canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'recetas/masas-base/nueva', loadComponent: () => import('./pages/recetas/masa-base-editor').then(module => module.MasaBaseEditor), canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'recetas/masas-base/:baseId/editar', loadComponent: () => import('./pages/recetas/masa-base-editor').then(module => module.MasaBaseEditor), canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'recetas/:recipeId/editar', loadComponent: () => import('./pages/recetas/recetas').then(module => module.Recetas), canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'recetas', loadComponent: () => import('./pages/recetas/recetas').then(module => module.Recetas), canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'ingredientes', loadComponent: () => import('./pages/ingredientes/ingredientes').then(module => module.Ingredientes), canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'inventario', loadComponent: () => import('./pages/ingredientes/ingredientes').then(module => module.Inventario), canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'produccion', loadComponent: () => import('./pages/produccion/produccion').then(module => module.Produccion), canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'catalogo/productos/:productId', loadComponent: () => import('./pages/catalogo/catalogo-producto-editor').then(module => module.CatalogoProductoEditor), canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'catalogo', loadComponent: () => import('./pages/catalogo/catalogo').then(module => module.Catalogo), canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'pedidos/clientes/nuevo', loadComponent: () => import('./pages/pedidos/cliente-editor').then(module => module.ClienteEditor), canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'pedidos/clientes/:customerId/editar', redirectTo: '/pedidos/clientes/:customerId', pathMatch: 'full' },
  { path: 'pedidos/clientes/:customerId', loadComponent: () => import('./pages/pedidos/cliente-editor').then(module => module.ClienteEditor), canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'pedidos/nuevo', loadComponent: () => import('./pages/pedidos/pedido-ruta').then(module => module.PedidoRuta), canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'pedidos/:orderId/editar', redirectTo: '/pedidos/:orderId', pathMatch: 'full' },
  { path: 'pedidos/:orderId', loadComponent: () => import('./pages/pedidos/pedido-ruta').then(module => module.PedidoRuta), canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'pedidos', loadComponent: () => import('./pages/pedidos/pedidos').then(module => module.Pedidos), canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: 'finanzas', loadComponent: () => import('./pages/finanzas/finanzas').then(module => module.Finanzas), canActivate: [adminAuthGuard, businessDataReadyGuard] },
  { path: '**', redirectTo: 'resumen' },
];
