import { Routes } from '@angular/router';
import { LocationComponent } from './location.component';

export const LOCATION_ROUTES: Routes = [
  {
    path: '',
    component: LocationComponent,
    children: [
      {
        path: 'locations',
        loadComponent: () => import('./pages/locations/locations-page.component').then(m => m.LocationsPageComponent),
      },
      {
        path: 'bays',
        loadComponent: () => import('./pages/bays/bays-page.component').then(m => m.BaysPageComponent),
      },
      {
        path: 'mobile-units',
        loadComponent: () => import('./pages/mobile-units/mobile-units-page.component').then(m => m.MobileUnitsPageComponent),
      },
    ],
  },
];
