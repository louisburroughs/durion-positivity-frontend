import { Routes } from '@angular/router';
import { WorkexecComponent } from './workexec.component';

/**
 * Workexec feature routes
 * Capabilities: CAP-002 (Estimates), CAP-003 (Customer Approval Workflow)
 * Wave B — stories 239, 238, 237, 236, 235, 234, 233, 271, 270, 269, 268
 */
export const WORKEXEC_ROUTES: Routes = [
  {
    path: '',
    component: WorkexecComponent,
    children: [
      // ── CAP-002: Estimate Management ──────────────────────────────────────

      /** Story 239: Create Draft Estimate */
      {
        path: 'estimates/new',
        loadComponent: () =>
          import('./pages/estimate-create/estimate-create-page.component').then(
            m => m.EstimateCreatePageComponent,
          ),
      },

      /** Story 236: Estimate workspace (taxes + totals inline) */
      {
        path: 'estimates/:estimateId',
        loadComponent: () =>
          import('./pages/estimate-detail/estimate-detail-page.component').then(
            m => m.EstimateDetailPageComponent,
          ),
      },

      /** Story 238: Add Parts to Estimate */
      {
        path: 'estimates/:estimateId/parts',
        loadComponent: () =>
          import('./pages/estimate-parts/estimate-parts-page.component').then(
            m => m.EstimatePartsPageComponent,
          ),
      },

      /** Story 237: Add Labor to Estimate */
      {
        path: 'estimates/:estimateId/labor',
        loadComponent: () =>
          import('./pages/estimate-labor/estimate-labor-page.component').then(
            m => m.EstimateLaborPageComponent,
          ),
      },

      /** Story 235: Revise Estimate */
      {
        path: 'estimates/:estimateId/revise',
        loadComponent: () =>
          import('./pages/estimate-revise/estimate-revise-page.component').then(
            m => m.EstimateRevisePageComponent,
          ),
      },

      /** Story 234: Customer-Facing Estimate Summary */
      {
        path: 'estimates/:estimateId/summary',
        loadComponent: () =>
          import('./pages/estimate-summary/estimate-summary-page.component').then(
            m => m.EstimateSummaryPageComponent,
          ),
      },

      // ── CAP-003: Customer Approval Workflow ────────────────────────────────

      /** Story 233: Submit Estimate for Customer Approval */
      {
        path: 'estimates/:estimateId/approval/submit',
        loadComponent: () =>
          import('./pages/approval-submit/approval-submit-page.component').then(
            m => m.ApprovalSubmitPageComponent,
          ),
      },

      /** Story 271: Capture Digital Customer Approval */
      {
        path: 'estimates/:estimateId/approval/digital',
        loadComponent: () =>
          import('./pages/approval-digital/approval-digital-page.component').then(
            m => m.ApprovalDigitalPageComponent,
          ),
      },

      /** Story 270: Capture In-Person Customer Approval */
      {
        path: 'estimates/:estimateId/approval/in-person',
        loadComponent: () =>
          import('./pages/approval-in-person/approval-in-person-page.component').then(
            m => m.ApprovalInPersonPageComponent,
          ),
      },

      /** Story 269: Record Partial Approval */
      {
        path: 'estimates/:estimateId/approval/partial',
        loadComponent: () =>
          import('./pages/approval-partial/approval-partial-page.component').then(
            m => m.ApprovalPartialPageComponent,
          ),
      },

      /** Story 268: Handle Approval Expiration */
      {
        path: 'estimates/:estimateId/approval/:approvalId',
        loadComponent: () =>
          import('./pages/approval-detail/approval-detail-page.component').then(
            m => m.ApprovalDetailPageComponent,
          ),
      },

      { path: '**', redirectTo: 'estimates/new' },
    ],
  },
];
