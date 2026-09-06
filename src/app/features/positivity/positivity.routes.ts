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
 *   /app/positivity/manual-review                          manual-review worklist (#216)
 *   /app/positivity/profiles/:vendorProfileId              profile detail (tabs, incl. PRICAT #213 and stock #217)
 *
 * The unlinked-shipments worklist stays retired **by decision** (#201, #215):
 * `listPurchaseOrderTransmissionEvents` now covers what a shipment-event
 * timeline would have shown, and no endpoint exists for an unlinked-events
 * surface. The PRICAT worklist, manual-review queue and stock-snapshot view
 * were restored in #213/#216/#217 once backend PR #1644 shipped real reads for
 * them; see each page/panel's own doc comment for the operations used.
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
    path: 'manual-review',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/manual-review-queue/manual-review-queue-page.component').then(
        m => m.ManualReviewQueuePageComponent,
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
