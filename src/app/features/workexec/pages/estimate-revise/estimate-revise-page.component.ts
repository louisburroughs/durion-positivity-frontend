import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { WorkexecService } from '../../services/workexec.service';
import { EstimateResponse, PageState } from '../../models/workexec.models';

/**
 * EstimateRevisePageComponent — Story 235 (CAP-002)
 * Route: /app/workexec/estimates/:estimateId/revise
 * operationIds: createEstimate, getEstimateById, patchEstimateStatus, reopenEstimate
 *
 * Creates a new estimate version linked to the prior (immutable) version.
 * Invalidates prior approvals when revising from approval-pending context.
 */
@Component({
  selector: 'app-estimate-revise-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './estimate-revise-page.component.html',
  styleUrl: './estimate-revise-page.component.css',
})
export class EstimateRevisePageComponent implements OnInit {
  private readonly workexec   = inject(WorkexecService);
  private readonly route      = inject(ActivatedRoute);
  private readonly router     = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageState    = signal<PageState>('loading');
  readonly reviseState  = signal<'idle' | 'confirming' | 'saving' | 'success' | 'error'>('idle');
  readonly estimate     = signal<EstimateResponse | null>(null);
  readonly newEstimate  = signal<EstimateResponse | null>(null);
  readonly errorMessage = signal<string | null>(null);

  estimateId = '';

  /** States from which revision is allowed */
  private readonly revisionAllowedStates = new Set(['DRAFT', 'PENDING_APPROVAL']);

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
          this.pageState.set(this.canRevise(est) ? 'ready' : 'error');
          if (!this.canRevise(est)) {
            this.errorMessage.set(`Estimates in status "${est.status}" cannot be revised.`);
          }
        },
        error: err => {
          this.pageState.set('error');
          this.errorMessage.set(err.status === 404 ? 'Estimate not found.' : 'Failed to load estimate.');
        },
      });
  }

  canRevise(est: EstimateResponse): boolean {
    return this.revisionAllowedStates.has(est.status);
  }

  confirmRevise(): void {
    this.reviseState.set('confirming');
  }

  cancelRevise(): void {
    this.reviseState.set('idle');
  }

  executeRevise(): void {
    const est = this.estimate();
    if (!est) return;
    this.reviseState.set('saving');
    this.errorMessage.set(null);

    // Reopen if in PENDING_APPROVAL to invalidate prior approval, then create new version
    const revise$ = est.status === 'PENDING_APPROVAL'
      ? this.workexec.reopenEstimate(this.estimateId).pipe(
          switchMap(() => this.workexec.createEstimate({
            customerId: est.customerId,
            vehicleId: est.vehicleId,
            crmPartyId: est.crmPartyId ?? est.customerId,
            crmVehicleId: est.crmVehicleId ?? est.vehicleId,
            crmContactIds: est.crmContactIds ?? [],
          }))
        )
      : this.workexec.createEstimate({
          customerId: est.customerId,
          vehicleId: est.vehicleId,
          crmPartyId: est.crmPartyId ?? est.customerId,
          crmVehicleId: est.crmVehicleId ?? est.vehicleId,
          crmContactIds: est.crmContactIds ?? [],
        });

    revise$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: newEst => {
        this.newEstimate.set(newEst);
        this.reviseState.set('success');
        // Navigate to new estimate workspace
        this.router.navigate(['/app/workexec/estimates', newEst.id]);
      },
      error: err => {
        this.reviseState.set('error');
        this.errorMessage.set(err.error?.message ?? 'Failed to create revision.');
      },
    });
  }
}
