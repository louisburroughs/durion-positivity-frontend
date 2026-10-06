import { inject } from '@angular/core';
import { RedirectFunction, Router, Routes } from '@angular/router';
import { ACCOUNTING_PAGE } from '../../core/security/route-permissions';
import { AccountingComponent } from './accounting.component';

/**
 * `events/failed` is a bookmark onto the event list pre-filtered to failed
 * events. A static `redirectTo` string treats `?` as route text, so the query
 * must be built as a UrlTree (#201). The list endpoint filters on exactly one
 * status and ignores a value it cannot parse (a comma list included), so this
 * names the single `FAILED` status.
 */
export const redirectFailedEvents: RedirectFunction = () =>
  inject(Router).createUrlTree(['/app/accounting/events'], {
    queryParams: { processingStatus: 'FAILED' },
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
        // The accounting home (CAP:550 S4, SPEC-accounting-workspace §8.1): open to
        // anyone the group gate admits; each region gates on its own read.
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/home/accounting-home-page.component').then(m => m.AccountingHomePageComponent),
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
        // Customer payments (CAP:550 S6, §8.1). `?paymentId=` preselects a payment; the id is never shown.
        path: 'payments',
        data: { permissions: ACCOUNTING_PAGE.customerPayments },
        loadComponent: () =>
          import('./pages/customer-payments/customer-payments-page.component').then(
            m => m.CustomerPaymentsPageComponent,
          ),
      },
      {
        // The old Apply payment page (payment id + JSON) is gone; bookmarks land on Customer payments.
        path: 'payments/apply',
        data: { permissions: ACCOUNTING_PAGE.customerPayments },
        redirectTo: 'payments',
        pathMatch: 'full',
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
        path: 'periods',
        data: { permissions: ACCOUNTING_PAGE.periodClose },
        loadComponent: () =>
          import('./pages/period-close/period-close-page.component').then(m => m.PeriodClosePageComponent),
      },
      {
        // Your books (CAP:550 S5, §8.1): any-of gate; each tab gates on its own read.
        path: 'books',
        data: { permissions: ACCOUNTING_PAGE.books },
        loadComponent: () => import('./pages/books/books-page.component').then(m => m.BooksPageComponent),
      },
      {
        // Routed by id so a reload or shared link can fetch it; the page shows only `JE-YYYYMM-n` (P8).
        path: 'books/entries/:journalEntryId',
        data: { permissions: ACCOUNTING_PAGE.journalEntry },
        loadComponent: () =>
          import('./pages/journal-entry-detail/journal-entry-detail-page.component').then(
            m => m.JournalEntryDetailPageComponent,
          ),
      },
      {
        path: 'bank-accounts',
        data: { permissions: ACCOUNTING_PAGE.bankAccounts },
        loadComponent: () =>
          import('./pages/bank-accounts/bank-accounts-page.component').then(m => m.BankAccountsPageComponent),
      },
      {
        path: 'bank-accounts/:glAccountId/import',
        data: { permissions: ACCOUNTING_PAGE.bankImport },
        loadComponent: () =>
          import('./pages/bank-import/bank-import-page.component').then(m => m.BankImportPageComponent),
      },
      {
        path: 'bank-accounts/:glAccountId/statements/new',
        data: { permissions: ACCOUNTING_PAGE.bankStatementEntry },
        loadComponent: () =>
          import('./pages/bank-statement-entry/bank-statement-entry-page.component').then(
            m => m.BankStatementEntryPageComponent,
          ),
      },
      {
        path: 'bank-imports/:importId',
        data: { permissions: ACCOUNTING_PAGE.bankImport },
        loadComponent: () =>
          import('./pages/bank-import/bank-import-page.component').then(m => m.BankImportPageComponent),
      },
      {
        path: 'reconciliations/:reconciliationId',
        data: { permissions: ACCOUNTING_PAGE.reconciliationWorkspace },
        loadComponent: () =>
          import('./pages/reconciliation-workspace/reconciliation-workspace-page.component').then(
            m => m.ReconciliationWorkspacePageComponent,
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
