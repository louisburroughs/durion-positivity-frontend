import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WorkexecService } from '../../services/workexec.service';
import { EstimateItemResponse, EstimateResponse, LineItemApprovalDto, PageState } from '../../models/workexec.models';

/**
 * ApprovalPartialPageComponent — Story 269 (CAP-003)
 * Route: /app/workexec/estimates/:estimateId/approval/partial
 * operationId: approveEstimate (with lineItemApprovals[])
 *   (Contract normalization: operation_ids was empty in AGENT_WORKSET.yaml.
 *   OpenAPI inspection identifies `approveEstimate` with `lineItemApprovals`
 *   array for selective line item approval/rejection.)
 *
 * Loads estimate line items, allows per-item approve/decline decisions,
 * submits as atomic idempotent confirmation.
 */
@Component({
  selector: 'app-approval-partial-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './approval-partial-page.component.html',
  styleUrl: './approval-partial-page.component.css',
})
export class ApprovalPartialPageComponent implements OnInit {
  private readonly workexec   = inject(WorkexecService);
  private readonly route      = inject(ActivatedRoute);
  private readonly router     = inject(Router);
  private readonly fb         = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageState    = signal<PageState>('loading');
  readonly submitState  = signal<'idle' | 'saving' | 'success' | 'error'>('idle');
  readonly estimate     = signal<EstimateResponse | null>(null);
  readonly errorMessage = signal<string | null>(null);

  estimateId = '';

  /** Per-item approval decisions: key = itemId, value = true (approved) / false (declined) */
  readonly lineDecisions = signal<Record<string, boolean>>({});
  /** Rejection reasons for declined items */
  readonly rejectionReasons = signal<Record<string, string>>({});

  readonly headerForm = this.fb.nonNullable.group({
    customerId: ['', Validators.required],
    notes: [''],
    purchaseOrderNumber: [''],
  });

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
          // Initialize all items as approved by default
          const decisions: Record<string, boolean> = {};
          for (const item of est.items ?? []) decisions[item.id] = true;
          this.lineDecisions.set(decisions);
          this.pageState.set('ready');
        },
        error: err => {
          this.pageState.set('error');
          this.errorMessage.set(err.status === 404 ? 'Estimate not found.' : 'Failed to load estimate.');
        },
      });
  }

  setDecision(itemId: string, approved: boolean): void {
    this.lineDecisions.set({ ...this.lineDecisions(), [itemId]: approved });
    if (approved) {
      // Clear rejection reason if re-approved
      const reasons = { ...this.rejectionReasons() };
      delete reasons[itemId];
      this.rejectionReasons.set(reasons);
    }
  }

  setRejectionReason(itemId: string, reason: string): void {
    this.rejectionReasons.set({ ...this.rejectionReasons(), [itemId]: reason });
  }

  items(): EstimateItemResponse[] {
    return this.estimate()?.items ?? [];
  }

  submitPartialApproval(): void {
    if (this.headerForm.invalid) {
      this.headerForm.markAllAsTouched();
      return;
    }

    const lineItemApprovals: LineItemApprovalDto[] = this.items().map(item => ({
      lineItemId: item.id,
      approved: this.lineDecisions()[item.id] ?? true,
      rejectionReason: this.lineDecisions()[item.id] === false
        ? (this.rejectionReasons()[item.id] || 'Declined by customer')
        : undefined,
    }));

    this.submitState.set('saving');
    this.errorMessage.set(null);

    const { customerId, notes, purchaseOrderNumber } = this.headerForm.getRawValue();

    this.workexec.approveEstimate(this.estimateId, {
      customerId,
      lineItemApprovals,
      notes: notes || undefined,
      purchaseOrderNumber: purchaseOrderNumber || undefined,
    }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: est => {
          this.estimate.set(est);
          this.submitState.set('success');
        },
        error: err => {
          this.submitState.set('error');
          const body = err.error;
          if (err.status === 409) {
            this.errorMessage.set('Estimate was modified concurrently. Reloading…');
            this.loadEstimate();
          } else if (err.status === 400 && (body?.code === 'APPROVAL_EXPIRED' || body?.message?.toLowerCase().includes('expired'))) {
            this.pageState.set('expired');
            this.errorMessage.set('Approval window has expired.');
          } else {
            this.errorMessage.set(body?.message ?? 'Failed to record partial approval.');
          }
        },
      });
  }

  approvedCount(): number {
    return Object.values(this.lineDecisions()).filter(v => v).length;
  }

  declinedCount(): number {
    return Object.values(this.lineDecisions()).filter(v => !v).length;
  }
}
