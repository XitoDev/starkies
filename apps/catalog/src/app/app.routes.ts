import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/catalog/catalog').then(m => m.Catalog)
  }
];
