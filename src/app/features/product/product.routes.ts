import { Routes } from '@angular/router';
import { ProductComponent } from './product.component';

export const PRODUCT_ROUTES: Routes = [
  {
    path: '',
    component: ProductComponent,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/catalog/product-list/product-list.component').then(
            m => m.ProductListComponent,
          ),
      },
      {
        path: 'catalog/:productId',
        loadComponent: () =>
          import('./pages/catalog/product-detail/product-detail.component').then(
            m => m.ProductDetailComponent,
          ),
      },
      {
        path: 'pricing/price-books',
        loadComponent: () =>
          import('./pages/pricing/price-books/price-books.component').then(
            m => m.PriceBooksComponent,
          ),
      },
      {
        path: 'pricing/msrp',
        loadComponent: () =>
          import('./pages/pricing/msrp/msrp.component').then(
            m => m.MsrpComponent,
          ),
      },
      {
        path: 'pricing/location-overrides',
        loadComponent: () =>
          import('./pages/pricing/location-overrides/location-overrides.component').then(
            m => m.LocationOverridesComponent,
          ),
      },
      {
        path: 'inventory/availability',
        loadComponent: () =>
          import('./pages/inventory/availability/availability.component').then(
            m => m.AvailabilityComponent,
          ),
      },
      {
        path: 'inventory/feeds',
        loadComponent: () =>
          import('./pages/inventory/feeds/feeds.component').then(
            m => m.FeedsComponent,
          ),
      },
      {
        path: 'location/locations-roster',
        loadComponent: () =>
          import('./pages/location/locations-roster/locations-roster.component').then(
            m => m.LocationsRosterComponent,
          ),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
