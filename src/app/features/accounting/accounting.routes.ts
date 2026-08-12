import { Routes } from '@angular/router';
import { AccountingComponent } from './accounting.component';

export const ACCOUNTING_ROUTES: Routes = [
  {
    path: '',
    component: AccountingComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/landing/accounting-landing-page.component').then(
            m => m.AccountingLandingPageComponent,
          ),
      },
      {
        path: 'events',
        loadComponent: () =>
          import('./pages/ingestion-monitor/ingestion-monitor-list/ingestion-monitor-list-page.component').then(
            m => m.IngestionMonitorListPageComponent,
          ),
      },
      {
        path: 'events/contract',
        loadComponent: () =>
          import('./pages/event-envelope-contract/event-envelope-contract-page.component').then(
            m => m.EventEnvelopeContractPageComponent,
          ),
      },
      {
        path: 'events/submit',
        loadComponent: () =>
          import('./pages/ingestion-submit/ingestion-submit-page.component').then(
            m => m.IngestionSubmitPageComponent,
          ),
      },
      {
        path: 'events/failed',
        redirectTo: 'events?processingStatus=FAILED,QUARANTINED',
        pathMatch: 'full',
      },
      {
        path: 'events/:eventId',
        loadComponent: () =>
          import('./pages/ingestion-monitor/ingestion-monitor-detail/ingestion-monitor-detail-page.component').then(
            m => m.IngestionMonitorDetailPageComponent,
          ),
      },
      {
        path: 'posting-rules',
        loadComponent: () =>
          import('./pages/posting-rules/posting-rules-list/posting-rules-list-page.component').then(
            m => m.PostingRulesListPageComponent,
          ),
      },
      {
        path: 'posting-rules/:ruleSetId',
        loadComponent: () =>
          import('./pages/posting-rules/posting-rules-detail/posting-rules-detail-page.component').then(
            m => m.PostingRulesDetailPageComponent,
          ),
      },
      {
        path: 'payments/apply',
        loadComponent: () =>
          import('./pages/payment-apply/payment-apply-page.component').then(
            m => m.PaymentApplyPageComponent,
          ),
      },
      {
        path: 'credit-memos',
        loadComponent: () =>
          import('./pages/credit-memo/credit-memo-list/credit-memo-list-page.component').then(
            m => m.CreditMemoListPageComponent,
          ),
      },
      {
        path: 'credit-memos/new',
        loadComponent: () =>
          import('./pages/credit-memo/credit-memo-create/credit-memo-create-page.component').then(
            m => m.CreditMemoCreatePageComponent,
          ),
      },
      {
        path: 'credit-memos/:memoId',
        loadComponent: () =>
          import('./pages/credit-memo/credit-memo-detail/credit-memo-detail-page.component').then(
            m => m.CreditMemoDetailPageComponent,
          ),
      },
      {
        path: 'vendor-payments',
        loadComponent: () =>
          import('./pages/vendor-payment/vendor-payment-list/vendor-payment-list-page.component').then(
            m => m.VendorPaymentListPageComponent,
          ),
      },
      {
        path: 'vendor-payments/new',
        loadComponent: () =>
          import('./pages/vendor-payment/vendor-payment-new/vendor-payment-new-page.component').then(
            m => m.VendorPaymentNewPageComponent,
          ),
      },
      {
        path: 'vendor-payments/:paymentId',
        loadComponent: () =>
          import('./pages/vendor-payment/vendor-payment-detail/vendor-payment-detail-page.component').then(
            m => m.VendorPaymentDetailPageComponent,
          ),
      },
      // ── Payables → Vendor invoices (issue #192, CAP-321) ──────────────────
      //
      // These are an accounting surface: an AP user reviews what arrived,
      // what it linked to and what is flagged before a payment run, so the
      // route lives here per #192 §4 ("Accounting → Payables → Vendor
      // invoices"). The *components* stay in `positivity/` and this feature
      // only lazy-loads them, so no supplier HTTP call and no supplier model
      // enters the accounting domain (ADR-0010) — the same containment
      // `inventory` keeps for the transmission and shipment panels.
      //
      // `exceptions` is declared before `:invoiceId` on purpose: Angular
      // matches in order, and the reverse would resolve the worklist as an
      // invoice whose id is the literal string "exceptions".
      {
        path: 'payables/vendor-invoices',
        pathMatch: 'full',
        loadComponent: () =>
          import(
            '../positivity/pages/vendor-invoice-list/vendor-invoice-list-page.component'
          ).then(m => m.VendorInvoiceListPageComponent),
      },
      {
        path: 'payables/vendor-invoices/exceptions',
        pathMatch: 'full',
        data: { exceptionsOnly: true },
        loadComponent: () =>
          import(
            '../positivity/pages/vendor-invoice-list/vendor-invoice-list-page.component'
          ).then(m => m.VendorInvoiceListPageComponent),
      },
      {
        path: 'payables/vendor-invoices/:invoiceId',
        loadComponent: () =>
          import(
            '../positivity/pages/vendor-invoice-detail/vendor-invoice-detail-page.component'
          ).then(m => m.VendorInvoiceDetailPageComponent),
      },
      {
        path: 'reports/labor-overhead',
        loadComponent: () =>
          import('./pages/reports/labor-overhead/labor-overhead-report-page.component').then(
            m => m.LaborOverheadReportPageComponent,
          ),
      },
      {
        path: 'invoices/:invoiceId/payment-status',
        loadComponent: () =>
          import('./pages/invoice-payment-status/invoice-payment-status-page.component').then(
            m => m.InvoicePaymentStatusPageComponent,
          ),
      },
    ],
  },
];
