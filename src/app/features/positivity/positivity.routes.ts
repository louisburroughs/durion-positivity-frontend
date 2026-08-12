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
 *   /app/positivity/enrichment/unmatched                   MKCAT enrichment worklist
 *   /app/positivity/profiles/:vendorProfileId              profile detail (tabs)
 *   /app/positivity/profiles/:vendorProfileId/unmatched-lines   PRICAT worklist
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
    path: 'enrichment/unmatched',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/enrichment-unmatched/enrichment-unmatched-page.component').then(
        m => m.EnrichmentUnmatchedPageComponent,
      ),
  },
  {
    path: 'profiles/:vendorProfileId/unmatched-lines',
    loadComponent: () =>
      import('./pages/pricat-unmatched-lines/pricat-unmatched-lines-page.component').then(
        m => m.PricatUnmatchedLinesPageComponent,
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
