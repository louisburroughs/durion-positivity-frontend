import { Routes } from '@angular/router';

/**
 * Positivity (supplier connectivity) routes, lazily mounted at `/app/positivity`.
 *
 * The mount point in `app.routes.ts` carries `data: { roles: ['ROLE_ADMIN'] }`,
 * so every route below inherits the admin gate via `rolesChildGuard`.
 *
 * Finer permission boundaries (`supplier:profile:write`, `supplier:audit:read`)
 * are **not** modelled client-side: this frontend has no fine-grained permission
 * API, and the JWT permission claim is opaque. The backend's `403` is treated as
 * the authority and rendered as a restricted state by the relevant screen.
 *
 * Route tree:
 *   /app/positivity                                        profile list
 *   /app/positivity/exchanges                              exchange audit list
 *   /app/positivity/exchanges/:exchangeId                  exchange audit detail
 *   /app/positivity/profiles/:vendorProfileId              profile detail (tabs)
 *
 * The enrichment worklist, manual-review queue, unlinked shipments, stock
 * snapshot and PRICAT worklist routes were retired in #201: the generated
 * `@durion-sdk/supplier` client publishes no read operation for them, and a
 * route that can only 404 is not a feature.
 */
export const POSITIVITY_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/profile-list/supplier-profile-list-page.component').then(
        m => m.SupplierProfileListPageComponent,
      ),
  },
  {
    path: 'exchanges',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/exchange-audit-list/exchange-audit-list-page.component').then(
        m => m.ExchangeAuditListPageComponent,
      ),
  },
  {
    path: 'exchanges/:exchangeId',
    loadComponent: () =>
      import('./pages/exchange-audit-detail/exchange-audit-detail-page.component').then(
        m => m.ExchangeAuditDetailPageComponent,
      ),
  },
  {
    path: 'profiles/:vendorProfileId',
    loadComponent: () =>
      import('./pages/profile-detail/supplier-profile-detail-page.component').then(
        m => m.SupplierProfileDetailPageComponent,
      ),
  },
];
