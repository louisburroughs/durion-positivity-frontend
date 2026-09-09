import { Routes } from '@angular/router';
import { PRODUCT_PAGE } from '../../core/security/route-permissions';
import { ProductComponent } from './product.component';

/**
 * Pages declare the permission their primary read needs (`PRODUCT_PAGE`), on top of
 * the group gate `/app/product` already carries. `rolesChildGuard` runs at every
 * level, so both must pass. See `core/security/route-permissions.ts` for how
 * each code was traced to the backend controller that enforces it.
 */
export const PRODUCT_ROUTES: Routes = [
  {
    path: '',
    component: ProductComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/landing/product-landing-page.component').then(
            m => m.ProductLandingPageComponent,
          ),
      },
      {
        path: 'catalog',
        data: { permissions: PRODUCT_PAGE.catalog },
        loadComponent: () =>
          import('./pages/catalog/product-list/product-list.component').then(
            m => m.ProductListComponent,
          ),
      },
      {
        path: 'catalog/:productId',
        data: { permissions: PRODUCT_PAGE.catalog },
        loadComponent: () =>
          import('./pages/catalog/product-detail/product-detail.component').then(
            m => m.ProductDetailComponent,
          ),
      },
      {
        path: 'catalog/enrichment/unmatched',
        data: { permissions: PRODUCT_PAGE.treadDesign },
        loadComponent: () =>
          import('./pages/catalog/tread-design-unmatched/tread-design-unmatched-page.component').then(
            m => m.TreadDesignUnmatchedPageComponent,
          ),
      },
      {
        path: 'catalog/enrichment/review/:treadDesignId',
        data: { permissions: PRODUCT_PAGE.treadDesign },
        loadComponent: () =>
          import('./pages/catalog/tread-design-review/tread-design-review-page.component').then(
            m => m.TreadDesignReviewPageComponent,
          ),
      },
      {
        path: 'pricing/price-books',
        data: { permissions: PRODUCT_PAGE.priceBooks },
        loadComponent: () =>
          import('./pages/pricing/price-books/price-books.component').then(
            m => m.PriceBooksComponent,
          ),
      },
      {
        path: 'pricing/msrp',
        data: { permissions: PRODUCT_PAGE.msrp },
        loadComponent: () =>
          import('./pages/pricing/msrp/msrp.component').then(
            m => m.MsrpComponent,
          ),
      },
      {
        path: 'pricing/location-overrides',
        data: { permissions: PRODUCT_PAGE.locationOverrides },
        loadComponent: () =>
          import('./pages/pricing/location-overrides/location-overrides.component').then(
            m => m.LocationOverridesComponent,
          ),
      },
      {
        path: 'inventory/availability',
        data: { permissions: PRODUCT_PAGE.availability },
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
        data: { permissions: PRODUCT_PAGE.locationsRoster },
        loadComponent: () =>
          import('./pages/location/locations-roster/locations-roster.component').then(
            m => m.LocationsRosterComponent,
          ),
      },
      {
        path: 'bulk-import/catalog',
        data: { permissions: PRODUCT_PAGE.bulkImport },
        loadComponent: () =>
          import('./pages/bulk-import/catalog-bulk-import-page.component').then(
            m => m.CatalogBulkImportPageComponent,
          ),
      },
      {
        path: 'bulk-import/price',
        data: { permissions: PRODUCT_PAGE.bulkImport },
        loadComponent: () =>
          import('./pages/bulk-import/price-bulk-import-page.component').then(
            m => m.PriceBulkImportPageComponent,
          ),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
