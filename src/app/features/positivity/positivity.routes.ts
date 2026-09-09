import { Routes } from '@angular/router';
import { POSITIVITY_PAGE } from '../../core/security/route-permissions';

/**
 * Positivity (supplier connectivity) routes, lazily mounted at `/app/positivity`.
 *
 * The mount point in `app.routes.ts` carries `data: { roles: ['ROLE_ADMIN'] }`,
 * so every route below inherits the admin gate via `rolesChildGuard`.
 *
 * Each route also declares the permission its primary read needs
 * (`POSITIVITY_PAGE`), decoded from the JWT `perm_bits` claim. Write boundaries
 * (`supplier:profile:write`, `supplier:transmission:resolve`) stay unmodelled —
 * gating a page on a secondary action would refuse readers who legitimately
 * belong there — so the backend's `403` remains the authority for those and is
 * rendered as a restricted state by the relevant screen.
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
    data: { permissions: POSITIVITY_PAGE.profiles },
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/profile-list/supplier-profile-list-page.component').then(
        m => m.SupplierProfileListPageComponent,
      ),
  },
  {
    path: 'exchanges',
    data: { permissions: POSITIVITY_PAGE.exchangeAudit },
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/exchange-audit-list/exchange-audit-list-page.component').then(
        m => m.ExchangeAuditListPageComponent,
      ),
  },
  {
    path: 'exchanges/:exchangeId',
    data: { permissions: POSITIVITY_PAGE.exchangeAudit },
    loadComponent: () =>
      import('./pages/exchange-audit-detail/exchange-audit-detail-page.component').then(
        m => m.ExchangeAuditDetailPageComponent,
      ),
  },
  {
    path: 'manual-review',
    data: { permissions: POSITIVITY_PAGE.manualReview },
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/manual-review-queue/manual-review-queue-page.component').then(
        m => m.ManualReviewQueuePageComponent,
      ),
  },
  {
    path: 'profiles/:vendorProfileId',
    data: { permissions: POSITIVITY_PAGE.profiles },
    loadComponent: () =>
      import('./pages/profile-detail/supplier-profile-detail-page.component').then(
        m => m.SupplierProfileDetailPageComponent,
      ),
  },
];
