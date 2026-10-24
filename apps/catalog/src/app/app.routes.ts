import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/landing/landing').then(m => m.Landing)
  },
  {
    path: 'menu',
    loadComponent: () => import('./pages/catalog/catalog').then(m => m.Catalog)
  },
  { path: '**', redirectTo: '' }
];
