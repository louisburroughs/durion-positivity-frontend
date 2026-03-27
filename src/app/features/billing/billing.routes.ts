import { Routes } from '@angular/router';
import { BillingComponent } from './billing.component';

/**
 * Billing feature routes
 * Capability: CAP-007 (Convert Workorder to Invoice)
 * Wave C — stories 213, 212, 211, 210, 209
 */
export const BILLING_ROUTES: Routes = [
  {
    path: '',
    component: BillingComponent,
    children: [
      /** Stories 209–213 (CAP-007): Invoice detail, totals, traceability, adjustments, issue */
      {
        path: 'invoices/:invoiceId',
        loadComponent: () =>
          import('./pages/invoice-detail/invoice-detail-page.component').then(
            m => m.InvoiceDetailPageComponent,
          ),
      },
    ],
  },
];

