import { Routes } from '@angular/router';
import { LocationComponent } from './location.component';

export const LOCATION_ROUTES: Routes = [
  {
    path: '',
    component: LocationComponent,
    children: [
      {
        path: 'locations/new',
        loadComponent: () =>
          import('./pages/location-edit/location-edit-page.component')
            .then(m => m.LocationEditPageComponent),
      },
      {
        path: 'locations/:locationId/defaults',
        loadComponent: () =>
          import('./pages/location-defaults/location-defaults-page.component')
            .then(m => m.LocationDefaultsPageComponent),
      },
      {
        path: 'locations/:id',
        loadComponent: () =>
          import('./pages/location-edit/location-edit-page.component')
            .then(m => m.LocationEditPageComponent),
      },
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
      {
        path: 'storage-locations',
        loadComponent: () =>
          import('./pages/storage-locations/storage-locations-page.component')
            .then(m => m.StorageLocationsPageComponent),
      },
      {
        path: 'location-sync',
        loadComponent: () =>
          import('./pages/location-sync/location-sync-page.component')
            .then(m => m.LocationSyncPageComponent),
      },
    ],
  },
];
