import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { WorkexecService } from '../../services/workexec.service';
import { EstimateSummaryResponse, PageState } from '../../models/workexec.models';

/**
 * EstimateSummaryPageComponent — Story 234 (CAP-002)
 * Route: /app/workexec/estimates/:estimateId/summary
 * operationIds: createEstimateSnapshot, getEstimateById, getEstimateSummary
 *
 * Read-only, snapshot-based customer-facing estimate summary.
 * Hides internal fields (cost/margin). Shows terms/disclaimers and expiry.
 * CTA navigates to Submit for Approval.
 */
@Component({
  selector: 'app-estimate-summary-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './estimate-summary-page.component.html',
  styleUrl: './estimate-summary-page.component.css',
})
export class EstimateSummaryPageComponent implements OnInit {
  private readonly workexec   = inject(WorkexecService);
  private readonly route      = inject(ActivatedRoute);
  private readonly router     = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageState    = signal<PageState>('loading');
  readonly summary      = signal<EstimateSummaryResponse | null>(null);
  readonly errorMessage = signal<string | null>(null);

  estimateId = '';

  ngOnInit(): void {
    this.estimateId = this.route.snapshot.paramMap.get('estimateId') ?? '';
    this.loadSummary();
  }

  loadSummary(): void {
    this.pageState.set('loading');
    // First create snapshot to capture immutable state, then load summary
    this.workexec.createEstimateSnapshot(this.estimateId).pipe(
      switchMap(() => this.workexec.getEstimateSummary(this.estimateId)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: summary => {
        this.summary.set(summary);
        this.pageState.set('ready');
      },
      error: err => {
        // Fall back to just loading summary if snapshot fails (may already exist)
        this.workexec.getEstimateSummary(this.estimateId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: summary => {
              this.summary.set(summary);
              this.pageState.set('ready');
            },
            error: err2 => {
              this.pageState.set('error');
              this.errorMessage.set(err2.status === 404 ? 'Estimate not found.' : 'Failed to load estimate summary.');
            },
          });
      },
    });
  }

  proceedToApproval(): void {
    this.router.navigate(['/app/workexec/estimates', this.estimateId, 'approval', 'submit']);
  }

  isExpired(): boolean {
    const exp = this.summary()?.expiresAt;
    return !!exp && new Date(exp) < new Date();
  }

  canSubmit(): boolean {
    const s = this.summary();
    return s?.status === 'DRAFT' && !this.isExpired();
  }
}
