import { Routes } from '@angular/router';
import { LOCATION_PAGE } from '../../core/security/route-permissions';
import { LocationComponent } from './location.component';

/**
 * Pages declare the permission their primary read needs (`LOCATION_PAGE`), on top of
 * the group gate `/app/location` already carries. `rolesChildGuard` runs at every
 * level, so both must pass. See `core/security/route-permissions.ts` for how
 * each code was traced to the backend controller that enforces it.
 */
export const LOCATION_ROUTES: Routes = [
  {
    path: '',
    component: LocationComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/landing/location-landing-page.component').then(
            m => m.LocationLandingPageComponent,
          ),
      },
      {
        path: 'locations/new',
        data: { permissions: LOCATION_PAGE.locationCreate },
        loadComponent: () =>
          import('./pages/location-edit/location-edit-page.component')
            .then(m => m.LocationEditPageComponent),
      },
      {
        path: 'locations/:locationId/defaults',
        data: { permissions: LOCATION_PAGE.locationView },
        loadComponent: () =>
          import('./pages/location-defaults/location-defaults-page.component')
            .then(m => m.LocationDefaultsPageComponent),
      },
      {
        path: 'locations/:id',
        data: { permissions: LOCATION_PAGE.locationView },
        loadComponent: () =>
          import('./pages/location-edit/location-edit-page.component')
            .then(m => m.LocationEditPageComponent),
      },
      {
        path: 'locations',
        data: { permissions: LOCATION_PAGE.locationView },
        loadComponent: () => import('./pages/locations/locations-page.component').then(m => m.LocationsPageComponent),
      },
      {
        path: 'bays',
        data: { permissions: LOCATION_PAGE.bays },
        loadComponent: () => import('./pages/bays/bays-page.component').then(m => m.BaysPageComponent),
      },
      {
        path: 'mobile-units',
        data: { permissions: LOCATION_PAGE.mobileUnits },
        loadComponent: () => import('./pages/mobile-units/mobile-units-page.component').then(m => m.MobileUnitsPageComponent),
      },
      {
        path: 'storage-locations',
        data: { permissions: LOCATION_PAGE.locationView },
        loadComponent: () =>
          import('./pages/storage-locations/storage-locations-page.component')
            .then(m => m.StorageLocationsPageComponent),
      },
      {
        path: 'location-sync',
        data: { permissions: LOCATION_PAGE.sync },
        loadComponent: () =>
          import('./pages/location-sync/location-sync-page.component')
            .then(m => m.LocationSyncPageComponent),
      },
      {
        path: 'bulk-import/location',
        data: { permissions: LOCATION_PAGE.bulkImport },
        loadComponent: () =>
          import('./pages/bulk-import/location-bulk-import-page.component').then(
            m => m.LocationBulkImportPageComponent,
          ),
      },
      {
        path: '**',
        redirectTo: '',
      },
    ],
  },
];
