import { Routes } from '@angular/router';
import { POSITIVITY_PAGE } from '../../core/security/route-permissions';

/**
 * Vendor master routes (CAP:550 S30, #469), lazily mounted at
 * `/app/positivity/vendors` by a sibling entry in `app.routes.ts` declared
 * **before** the `ROLE_ADMIN` positivity group, so that gate never applies here.
 * The mount admits on `supplier:vendor:read` (`POSITIVITY_PAGE.vendors`);
 * `new` additionally needs `supplier:vendor:write`.
 *
 * Route tree:
 *   /app/positivity/vendors                 vendor list
 *   /app/positivity/vendors/new             Add vendor (`?returnTo=` Bills to pay or one draft bill)
 *   /app/positivity/vendors/:vendorId       vendor detail — the stable target other pages link to
 */
export const VENDOR_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/vendor-list/vendor-list-page.component').then(m => m.VendorListPageComponent),
  },
  {
    path: 'new',
    data: { permissions: POSITIVITY_PAGE.vendorCreate },
    loadComponent: () =>
      import('./pages/vendor-create/vendor-create-page.component').then(m => m.VendorCreatePageComponent),
  },
  {
    path: ':vendorId',
    loadComponent: () =>
      import('./pages/vendor-detail/vendor-detail-page.component').then(m => m.VendorDetailPageComponent),
  },
];
