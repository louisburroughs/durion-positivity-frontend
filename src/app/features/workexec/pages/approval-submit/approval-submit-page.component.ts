import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WorkexecService } from '../../services/workexec.service';
import { EstimateResponse, PageState } from '../../models/workexec.models';

/**
 * ApprovalSubmitPageComponent — Story 233 (CAP-003)
 * Route: /app/workexec/estimates/:estimateId/approval/submit
 * operationId: submitForApproval
 *   (Contract normalization: AGENT_WORKSET.yaml listed `createEstimate`; actual
 *   operation per OpenAPI is `submitForApproval` at
 *   POST /v1/workorders/estimates/{estimateId}/submit-for-approval)
 *
 * Submits a DRAFT estimate for customer approval.
 * Displays resulting status + approvalRequestId.
 * Idempotency-Key on submit.
 */
@Component({
  selector: 'app-approval-submit-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './approval-submit-page.component.html',
  styleUrl: './approval-submit-page.component.css',
})
export class ApprovalSubmitPageComponent implements OnInit {
  private readonly workexec   = inject(WorkexecService);
  private readonly route      = inject(ActivatedRoute);
  private readonly router     = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageState    = signal<PageState>('loading');
  readonly submitState  = signal<'idle' | 'confirming' | 'saving' | 'success' | 'error'>('idle');
  readonly estimate     = signal<EstimateResponse | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors  = signal<Array<{ field: string; message: string }>>([]);

  estimateId = '';

  ngOnInit(): void {
    this.estimateId = this.route.snapshot.paramMap.get('estimateId') ?? '';
    this.loadEstimate();
  }

  loadEstimate(): void {
    this.pageState.set('loading');
    this.workexec.getEstimateById(this.estimateId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: est => {
          this.estimate.set(est);
          this.pageState.set(est.status === 'DRAFT' ? 'ready' : 'error');
          if (est.status !== 'DRAFT') {
            this.errorMessage.set(`Estimate is in "${est.status}" status and cannot be submitted for approval.`);
          }
        },
        error: err => {
          this.pageState.set('error');
          this.errorMessage.set(err.status === 404 ? 'Estimate not found.' : 'Failed to load estimate.');
        },
      });
  }

  confirmSubmit(): void {
    this.submitState.set('confirming');
  }

  cancelSubmit(): void {
    this.submitState.set('idle');
  }

  executeSubmit(): void {
    this.submitState.set('saving');
    this.errorMessage.set(null);
    this.fieldErrors.set([]);

    this.workexec.submitForApproval(this.estimateId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: est => {
          this.estimate.set(est);
          this.submitState.set('success');
        },
        error: err => {
          this.submitState.set('error');
          const body = err.error;
          if (body?.fieldErrors?.length) {
            this.fieldErrors.set(body.fieldErrors);
          } else if (err.status === 400) {
            this.errorMessage.set(body?.message ?? 'Estimate is incomplete or cannot be submitted.');
          } else if (err.status === 403) {
            this.pageState.set('access-denied');
            this.errorMessage.set('You do not have permission to submit estimates for approval.');
          } else {
            this.errorMessage.set(body?.message ?? 'Failed to submit estimate for approval.');
          }
        },
      });
  }
}
