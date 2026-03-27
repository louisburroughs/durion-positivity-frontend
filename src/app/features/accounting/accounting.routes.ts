import { Routes } from '@angular/router';
import { AccountingComponent } from './accounting.component';

export const ACCOUNTING_ROUTES: Routes = [
  {
    path: '',
    component: AccountingComponent,
    children: [
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
      { path: '**', redirectTo: 'events' },
    ],
  },
];
