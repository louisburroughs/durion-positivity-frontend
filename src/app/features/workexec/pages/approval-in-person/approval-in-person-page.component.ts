import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WorkexecService } from '../../services/workexec.service';
import { EstimateResponse, PageState } from '../../models/workexec.models';

/**
 * ApprovalInPersonPageComponent — Story 270 (CAP-003)
 * Route: /app/workexec/estimates/:estimateId/approval/in-person
 * operationIds: approveEstimate, getEstimateById
 *   (createEstimate listed in AGENT_WORKSET.yaml is not directly used here;
 *   approveEstimate is the correct operation per OpenAPI)
 *
 * Captures in-person customer approval via CLICK_CONFIRM method.
 * No signature canvas required — advisor confirms on behalf of customer present.
 */
@Component({
  selector: 'app-approval-in-person-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './approval-in-person-page.component.html',
  styleUrl: './approval-in-person-page.component.css',
})
export class ApprovalInPersonPageComponent implements OnInit {
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

  readonly approvalForm = this.fb.nonNullable.group({
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
          this.pageState.set('ready');
        },
        error: err => {
          this.pageState.set('error');
          this.errorMessage.set(err.status === 404 ? 'Estimate not found.' : 'Failed to load estimate.');
        },
      });
  }

  submitApproval(): void {
    if (this.approvalForm.invalid) {
      this.approvalForm.markAllAsTouched();
      return;
    }
    this.submitState.set('saving');
    this.errorMessage.set(null);

    const { customerId, notes, purchaseOrderNumber } = this.approvalForm.getRawValue();

    this.workexec.approveEstimate(this.estimateId, {
      customerId,
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
          } else if (err.status === 403) {
            this.pageState.set('access-denied');
            this.errorMessage.set('You are not authorized to approve this estimate.');
          } else if (err.status === 400 && (body?.code === 'APPROVAL_EXPIRED' || body?.message?.toLowerCase().includes('expired'))) {
            this.pageState.set('expired');
            this.errorMessage.set('Approval window has expired. Please create a new revision.');
          } else {
            this.errorMessage.set(body?.message ?? 'Failed to record approval.');
          }
        },
      });
  }
}
