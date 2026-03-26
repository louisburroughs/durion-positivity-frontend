import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { debounceTime, switchMap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { WorkexecService } from '../../services/workexec.service';
import {
  EstimateItemResponse,
  EstimateResponse,
  PageState,
  TotalsState,
  WorkorderResponse,
} from '../../models/workexec.models';

/**
 * EstimateDetailPageComponent — Story 236 (CAP-002)
 * Route: /app/workexec/estimates/:estimateId
 * operationIds: calculateEstimateTotals, getEstimateById
 *
 * CAP-004 additions:
 *   Story 231 — Validate Promotion Preconditions: gate "Promote to Work Order" on
 *               estimate status === 'APPROVED' and approved snapshot present.
 *   Story 228 — Enforce Idempotent Promotion: Idempotency-Key header, disable on click,
 *               409 → navigate to existing workorder, 5xx → safe-retry message.
 *   Story 227 — Handle Partial Approval Promotion: display approved vs declined scope
 *               before promotion confirm, show partialApproval summary post-promote.
 */
@Component({
  selector: 'app-estimate-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './estimate-detail-page.component.html',
  styleUrl: './estimate-detail-page.component.css',
})
export class EstimateDetailPageComponent implements OnInit {
  private readonly workexec   = inject(WorkexecService);
  private readonly route      = inject(ActivatedRoute);
  private readonly router     = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageState    = signal<PageState>('loading');
  readonly totalsState  = signal<TotalsState>('idle');
  readonly estimate     = signal<EstimateResponse | null>(null);
  readonly items        = signal<EstimateItemResponse[]>([]);
  readonly errorMessage = signal<string | null>(null);
  readonly taxBlocked   = signal(false);

  // ── CAP-004: Promotion state (Stories 231, 228, 227) ─────────────────────
  /** Promotion flow state machine */
  readonly promoteState = signal<'idle' | 'loading' | 'conflict' | 'success' | 'error'>('idle');
  readonly promoteError = signal<string | null>(null);
  /** workorderId resolved on 409 conflict (Story 228) */
  readonly conflictWorkorderId = signal<string | null>(null);
  /** approved vs declined scope for partial promotion display (Story 227) */
  readonly approvedItems = signal<EstimateItemResponse[]>([]);
  readonly declinedItems = signal<EstimateItemResponse[]>([]);
  readonly showPartialScope = signal(false);

  estimateId = '';

  private readonly recalcTrigger$ = new Subject<void>();

  ngOnInit(): void {
    this.estimateId = this.route.snapshot.paramMap.get('estimateId') ?? '';

    // Debounced recalculation pipeline
    this.recalcTrigger$.pipe(
      debounceTime(350),
      switchMap(() => this.workexec.calculateEstimateTotals(this.estimateId)),
      switchMap(() => this.workexec.getEstimateById(this.estimateId)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: est => {
        this.estimate.set(est);
        this.items.set(est.items ?? []);
        this.totalsState.set('updated');
        this.taxBlocked.set(false);
        this.buildApprovalScope(est);
      },
      error: err => {
        const code = err.error?.code ?? '';
        if (code === 'ERR_CONFIG_JURISDICTION_NOT_FOUND' || code === 'ERR_TAX_CODE_MISSING') {
          this.totalsState.set('blocked-config');
          this.taxBlocked.set(true);
        } else {
          this.totalsState.set('error');
        }
      },
    });

    this.loadEstimate();
  }

  loadEstimate(): void {
    this.pageState.set('loading');
    this.workexec.getEstimateById(this.estimateId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: est => {
          this.estimate.set(est);
          this.items.set(est.items ?? []);
          this.pageState.set('ready');
          this.recalcTrigger$.next();
          this.buildApprovalScope(est);
        },
        error: err => {
          this.pageState.set('error');
          this.errorMessage.set(err.status === 404 ? 'Estimate not found.' : 'Failed to load estimate.');
        },
      });
  }

  recalculate(): void {
    this.totalsState.set('recalculating');
    this.recalcTrigger$.next();
  }

  navigateToSubmit(): void {
    this.router.navigate(['/app/workexec/estimates', this.estimateId, 'approval', 'submit']);
  }

  partItems(): EstimateItemResponse[] {
    return this.items().filter(i => i.itemType === 'PART');
  }

  laborItems(): EstimateItemResponse[] {
    return this.items().filter(i => i.itemType === 'LABOR');
  }

  canSubmitForApproval(): boolean {
    const est = this.estimate();
    return est?.status === 'DRAFT' && !this.taxBlocked() && this.totalsState() !== 'blocked-config';
  }

  // ── CAP-004: Promotion logic ───────────────────────────────────────────────

  /** Story 231: precondition check — APPROVED status required */
  canPromote(): boolean {
    const est = this.estimate();
    return est?.status === 'APPROVED' && this.promoteState() === 'idle';
  }

  /**
   * Story 227: Build approved vs declined item scope for partial-approval display.
   * Items with lineItemApprovalStatus === 'APPROVED' are promoted; others are excluded.
   */
  private buildApprovalScope(est: EstimateResponse): void {
    const allItems = est.items ?? [];
    if (est.status === 'APPROVED') {
      const approved = allItems.filter(i => (i as any).lineItemApprovalStatus !== 'DECLINED');
      const declined = allItems.filter(i => (i as any).lineItemApprovalStatus === 'DECLINED');
      this.approvedItems.set(approved);
      this.declinedItems.set(declined);
      this.showPartialScope.set(declined.length > 0);
    }
  }

  /**
   * Story 228 + 231: Promote to Work Order with Idempotency-Key.
   * 409 → resolve existing workorderId and offer navigation.
   * 5xx → safe-retry message.
   */
  promoteToWorkorder(): void {
    if (!this.canPromote()) return;
    this.promoteState.set('loading');
    this.promoteError.set(null);
    this.conflictWorkorderId.set(null);

    const idempotencyKey = uuidv4();
    this.workexec.promoteEstimateToWorkorder(this.estimateId, idempotencyKey)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result: WorkorderResponse) => {
          this.promoteState.set('success');
          this.router.navigate(['/app/workexec/workorders', result.id]);
        },
        error: (err) => {
          const status = err?.status ?? 0;
          if (status === 409) {
            // Story 228: idempotent conflict — extract existing workorderId
            const existingId: string | undefined =
              err?.error?.existingWorkorderId ??
              err?.error?.id ??
              err?.error?.workorderId;
            this.conflictWorkorderId.set(existingId ?? null);
            this.promoteState.set('conflict');
          } else if (status >= 500 || status === 0) {
            // Story 228: safe-retry guidance for 5xx/network
            this.promoteError.set(
              'This action may have already succeeded. Check your work orders list before retrying to avoid creating a duplicate.',
            );
            this.promoteState.set('error');
          } else {
            this.promoteError.set(
              err?.error?.message ?? 'Promotion failed. Please check the estimate status and try again.',
            );
            this.promoteState.set('error');
          }
        },
      });
  }

  navigateToConflictWorkorder(): void {
    const id = this.conflictWorkorderId();
    if (id) this.router.navigate(['/app/workexec/workorders', id]);
  }

  resetPromoteState(): void {
    this.promoteState.set('idle');
    this.promoteError.set(null);
    this.conflictWorkorderId.set(null);
  }
}
