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
 *   /app/positivity/orders/manual-review                   ambiguous transmission queue
 *   /app/positivity/shipments/unlinked                     unlinked shipment events
 *   /app/positivity/stock-snapshots                        vendor stock snapshot view
 *   /app/positivity/profiles/:vendorProfileId              profile detail (tabs)
 *   /app/positivity/profiles/:vendorProfileId/unmatched-lines   PRICAT worklist
 *
 * ── Open question #193 §7, ruled ────────────────────────────────────────────
 * The stock snapshot lives here rather than under Inventory. It is vendor-
 * reported informational data — what a supplier claims it holds — and Inventory
 * answers a different question: what this business owns. Filing the two under
 * one menu invites the one arithmetic that must never happen (#193 §4).
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
    path: 'orders/manual-review',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/manual-review-queue/manual-review-queue-page.component').then(
        m => m.ManualReviewQueuePageComponent,
      ),
  },
  {
    path: 'shipments/unlinked',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/shipment-events-unlinked/shipment-events-unlinked-page.component').then(
        m => m.ShipmentEventsUnlinkedPageComponent,
      ),
  },
  {
    path: 'stock-snapshots',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/stock-snapshot/stock-snapshot-page.component').then(
        m => m.StockSnapshotPageComponent,
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
