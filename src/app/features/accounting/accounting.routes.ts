import { inject } from '@angular/core';
import { RedirectFunction, Router, Routes } from '@angular/router';
import { ACCOUNTING_PAGE } from '../../core/security/route-permissions';
import { AccountingComponent } from './accounting.component';

/**
 * `events/failed` is a bookmark onto the event list pre-filtered to the
 * failure statuses. A static `redirectTo` string treats `?` as route text, so
 * the query must be built as a UrlTree (#201).
 */
export const redirectFailedEvents: RedirectFunction = () =>
  inject(Router).createUrlTree(['/app/accounting/events'], {
    queryParams: { processingStatus: 'FAILED,QUARANTINED' },
  });

/**
 * Pages declare the permission their primary read needs (`ACCOUNTING_PAGE`), on
 * top of the group gate `/app/accounting` already carries. `rolesChildGuard`
 * runs at every level, so both must pass. See `core/security/route-permissions.ts`
 * for how each code was traced to the backend controller that enforces it.
 */
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
        data: { permissions: ACCOUNTING_PAGE.events },
        loadComponent: () =>
          import('./pages/ingestion-monitor/ingestion-monitor-list/ingestion-monitor-list-page.component').then(
            m => m.IngestionMonitorListPageComponent,
          ),
      },
      {
        path: 'events/contract',
        data: { permissions: ACCOUNTING_PAGE.events },
        loadComponent: () =>
          import('./pages/event-envelope-contract/event-envelope-contract-page.component').then(
            m => m.EventEnvelopeContractPageComponent,
          ),
      },
      {
        path: 'events/submit',
        data: { permissions: ACCOUNTING_PAGE.eventsSubmit },
        loadComponent: () =>
          import('./pages/ingestion-submit/ingestion-submit-page.component').then(
            m => m.IngestionSubmitPageComponent,
          ),
      },
      {
        path: 'events/failed',
        data: { permissions: ACCOUNTING_PAGE.events },
        redirectTo: redirectFailedEvents,
        pathMatch: 'full',
      },
      {
        path: 'events/:eventId',
        data: { permissions: ACCOUNTING_PAGE.events },
        loadComponent: () =>
          import('./pages/ingestion-monitor/ingestion-monitor-detail/ingestion-monitor-detail-page.component').then(
            m => m.IngestionMonitorDetailPageComponent,
          ),
      },
      {
        path: 'posting-rules',
        data: { permissions: ACCOUNTING_PAGE.postingRules },
        loadComponent: () =>
          import('./pages/posting-rules/posting-rules-list/posting-rules-list-page.component').then(
            m => m.PostingRulesListPageComponent,
          ),
      },
      {
        path: 'posting-rules/:ruleSetId',
        data: { permissions: ACCOUNTING_PAGE.postingRules },
        loadComponent: () =>
          import('./pages/posting-rules/posting-rules-detail/posting-rules-detail-page.component').then(
            m => m.PostingRulesDetailPageComponent,
          ),
      },
      {
        path: 'payments/apply',
        data: { permissions: ACCOUNTING_PAGE.paymentApply },
        loadComponent: () =>
          import('./pages/payment-apply/payment-apply-page.component').then(
            m => m.PaymentApplyPageComponent,
          ),
      },
      {
        path: 'credit-memos',
        data: { permissions: ACCOUNTING_PAGE.creditMemoView },
        loadComponent: () =>
          import('./pages/credit-memo/credit-memo-list/credit-memo-list-page.component').then(
            m => m.CreditMemoListPageComponent,
          ),
      },
      {
        path: 'credit-memos/new',
        data: { permissions: ACCOUNTING_PAGE.creditMemoCreate },
        loadComponent: () =>
          import('./pages/credit-memo/credit-memo-create/credit-memo-create-page.component').then(
            m => m.CreditMemoCreatePageComponent,
          ),
      },
      {
        path: 'credit-memos/:memoId',
        data: { permissions: ACCOUNTING_PAGE.creditMemoView },
        loadComponent: () =>
          import('./pages/credit-memo/credit-memo-detail/credit-memo-detail-page.component').then(
            m => m.CreditMemoDetailPageComponent,
          ),
      },
      {
        path: 'vendor-payments',
        data: { permissions: ACCOUNTING_PAGE.vendorPaymentView },
        loadComponent: () =>
          import('./pages/vendor-payment/vendor-payment-list/vendor-payment-list-page.component').then(
            m => m.VendorPaymentListPageComponent,
          ),
      },
      {
        path: 'vendor-payments/new',
        data: { permissions: ACCOUNTING_PAGE.vendorPaymentExecute },
        loadComponent: () =>
          import('./pages/vendor-payment/vendor-payment-new/vendor-payment-new-page.component').then(
            m => m.VendorPaymentNewPageComponent,
          ),
      },
      {
        path: 'vendor-payments/:paymentId',
        data: { permissions: ACCOUNTING_PAGE.vendorPaymentView },
        loadComponent: () =>
          import('./pages/vendor-payment/vendor-payment-detail/vendor-payment-detail-page.component').then(
            m => m.VendorPaymentDetailPageComponent,
          ),
      },
      {
        path: 'payables/vendor-invoices',
        data: { permissions: ACCOUNTING_PAGE.vendorInvoices },
        loadComponent: () =>
          import('./pages/payables/vendor-invoices-list/vendor-invoices-list-page.component').then(
            m => m.VendorInvoicesListPageComponent,
          ),
      },
      {
        path: 'payables/vendor-invoices/exceptions',
        data: { permissions: ACCOUNTING_PAGE.vendorInvoices },
        loadComponent: () =>
          import(
            './pages/payables/vendor-invoices-exceptions/vendor-invoices-exceptions-page.component'
          ).then(m => m.VendorInvoicesExceptionsPageComponent),
      },
      {
        path: 'payables/vendor-invoices/:billId',
        data: { permissions: ACCOUNTING_PAGE.vendorInvoiceDetail },
        loadComponent: () =>
          import('./pages/payables/vendor-invoice-detail/vendor-invoice-detail-page.component').then(
            m => m.VendorInvoiceDetailPageComponent,
          ),
      },
      {
        path: 'reports/labor-overhead',
        data: { permissions: ACCOUNTING_PAGE.laborOverheadReport },
        loadComponent: () =>
          import('./pages/reports/labor-overhead/labor-overhead-report-page.component').then(
            m => m.LaborOverheadReportPageComponent,
          ),
      },
      {
        path: 'invoices/:invoiceId/payment-status',
        data: { permissions: ACCOUNTING_PAGE.invoicePaymentStatus },
        loadComponent: () =>
          import('./pages/invoice-payment-status/invoice-payment-status-page.component').then(
            m => m.InvoicePaymentStatusPageComponent,
          ),
      },
    ],
  },
];
