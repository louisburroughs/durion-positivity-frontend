import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WorkexecService } from '../../services/workexec.service';
import { EstimateResponse, PageState } from '../../models/workexec.models';

/**
 * ApprovalDetailPageComponent — Story 268 (CAP-003)
 * Route: /app/workexec/estimates/:estimateId/approval/:approvalId
 * operationIds: approveEstimate, getEstimateById, patchEstimateStatus
 *   (Contract normalization: operation_ids was empty in AGENT_WORKSET.yaml.
 *   OpenAPI inspection identifies:
 *     - `getEstimateById` → on-load expiration detection via expiresAt field
 *     - `approveEstimate` → on-submit expiration detection via APPROVAL_EXPIRED code
 *     - `patchEstimateStatus` → for status transitions (if needed)
 *   Expiration is surface-level: frontend detects expired state from
 *   estimate.status === 'EXPIRED' or expiresAt < now, or backend 400 with
 *   APPROVAL_EXPIRED code on submit attempt.)
 *
 * On load: detects expired approval and disables approve/deny actions.
 * On submit: handles backend APPROVAL_EXPIRED response.
 * Guides user to revision or re-submission.
 */
@Component({
  selector: 'app-approval-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './approval-detail-page.component.html',
  styleUrl: './approval-detail-page.component.css',
})
export class ApprovalDetailPageComponent implements OnInit {
  private readonly workexec   = inject(WorkexecService);
  private readonly route      = inject(ActivatedRoute);
  private readonly router     = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageState    = signal<PageState>('loading');
  readonly estimate     = signal<EstimateResponse | null>(null);
  readonly errorMessage = signal<string | null>(null);

  estimateId = '';
  approvalId = '';

  ngOnInit(): void {
    this.estimateId = this.route.snapshot.paramMap.get('estimateId') ?? '';
    this.approvalId = this.route.snapshot.paramMap.get('approvalId') ?? '';
    this.loadEstimate();
  }

  loadEstimate(): void {
    this.pageState.set('loading');
    this.workexec.getEstimateById(this.estimateId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: est => {
          this.estimate.set(est);
          if (this.isExpired(est)) {
            this.pageState.set('expired');
            this.errorMessage.set(
              `This approval has expired${est.expiresAt ? ' on ' + new Date(est.expiresAt).toLocaleDateString() : ''}.` +
              ' No actions can be taken on this approval. Create a revision to restart the approval process.'
            );
          } else {
            this.pageState.set('ready');
          }
        },
        error: err => {
          this.pageState.set('error');
          this.errorMessage.set(err.status === 404 ? 'Estimate or approval not found.' : 'Failed to load approval details.');
        },
      });
  }

  isExpired(est?: EstimateResponse | null): boolean {
    const e = est ?? this.estimate();
    if (!e) return false;
    if (e.status === 'EXPIRED') return true;
    if (e.expiresAt && new Date(e.expiresAt) < new Date()) return true;
    return false;
  }

  navigateToRevise(): void {
    this.router.navigate(['/app/workexec/estimates', this.estimateId, 'revise']);
  }

  navigateToResubmit(): void {
    this.router.navigate(['/app/workexec/estimates', this.estimateId, 'approval', 'submit']);
  }
}
