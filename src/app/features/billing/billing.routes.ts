import { Routes } from '@angular/router';
import { BILLING_PAGE } from '../../core/security/route-permissions';
import { BillingComponent } from './billing.component';

/**
 * Billing feature routes
 * Capability: CAP-007 (Convert Workorder to Invoice)
 * Wave C — stories 213, 212, 211, 210, 209
 */
/**
 * Pages declare the permission their primary read needs (`BILLING_PAGE`), on top of
 * the group gate `/app/billing` already carries. `rolesChildGuard` runs at every
 * level, so both must pass. See `core/security/route-permissions.ts` for how
 * each code was traced to the backend controller that enforces it.
 */
export const BILLING_ROUTES: Routes = [
  {
    path: '',
    component: BillingComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/landing/billing-landing-page.component').then(
            m => m.BillingLandingPageComponent,
          ),
      },
      /** Stories 209–213 (CAP-007): Invoice detail, totals, traceability, adjustments, issue */
      {
        path: 'invoices/:invoiceId',
        data: { permissions: BILLING_PAGE.invoiceView },
        loadComponent: () =>
          import('./pages/invoice-detail/invoice-detail-page.component').then(
            m => m.InvoiceDetailPageComponent,
          ),
      },
      {
        path: 'invoices/:invoiceId/payment-capture',
        loadComponent: () =>
          import('./pages/payment-capture/payment-capture-page.component').then(
            m => m.PaymentCapturePageComponent,
          ),
      },
      {
        path: 'invoices/:invoiceId/payments/:paymentId/void-refund',
        loadComponent: () =>
          import('./pages/payment-void-refund/payment-void-refund-page.component').then(
            m => m.PaymentVoidRefundPageComponent,
          ),
      },
      {
        path: 'invoices/:invoiceId/receipts',
        loadComponent: () =>
          import('./pages/receipt/receipt-page.component').then(
            m => m.ReceiptPageComponent,
          ),
      },
      {
        path: 'invoices/:invoiceId/receipts/:receiptId',
        loadComponent: () =>
          import('./pages/receipt/receipt-page.component').then(
            m => m.ReceiptPageComponent,
          ),
      },
    ],
  },
];

