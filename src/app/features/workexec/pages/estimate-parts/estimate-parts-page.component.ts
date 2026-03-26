import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { WorkexecService } from '../../services/workexec.service';
import { EstimateItemResponse, EstimateResponse, PageState } from '../../models/workexec.models';

/**
 * EstimatePartsPageComponent — Story 238 (CAP-002)
 * Route: /app/workexec/estimates/:estimateId/parts
 * operationIds: addEstimateItem, calculateEstimateTotals, getEstimateById, updateEstimateItem
 */
@Component({
  selector: 'app-estimate-parts-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './estimate-parts-page.component.html',
  styleUrl: './estimate-parts-page.component.css',
})
export class EstimatePartsPageComponent implements OnInit {
  private readonly workexec    = inject(WorkexecService);
  private readonly route       = inject(ActivatedRoute);
  private readonly router      = inject(Router);
  private readonly fb          = inject(FormBuilder);
  private readonly destroyRef  = inject(DestroyRef);

  readonly state         = signal<PageState>('loading');
  readonly saveState     = signal<'idle' | 'saving' | 'success' | 'error'>('idle');
  readonly estimate      = signal<EstimateResponse | null>(null);
  readonly items         = signal<EstimateItemResponse[]>([]);
  readonly errorMessage  = signal<string | null>(null);
  readonly fieldErrors   = signal<Record<string, string>>({});

  estimateId = '';

  readonly addForm = this.fb.nonNullable.group({
    description: ['', Validators.required],
    quantity:    [1, [Validators.required, Validators.min(0.0001)]],
    unitPrice:   [0, [Validators.required, Validators.min(0)]],
    taxCode:     [''],
    productId:   [''],
  });

  ngOnInit(): void {
    this.estimateId = this.route.snapshot.paramMap.get('estimateId') ?? '';
    this.loadEstimate();
  }

  loadEstimate(): void {
    this.state.set('loading');
    this.workexec.getEstimateById(this.estimateId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: est => {
          this.estimate.set(est);
          this.items.set(est.items ?? []);
          this.state.set('ready');
        },
        error: err => {
          this.state.set('error');
          this.errorMessage.set(err.status === 404 ? 'Estimate not found.' : 'Failed to load estimate.');
        },
      });
  }

  addItem(): void {
    if (this.addForm.invalid) {
      this.addForm.markAllAsTouched();
      return;
    }
    this.saveState.set('saving');
    this.errorMessage.set(null);
    this.fieldErrors.set({});

    const { description, quantity, unitPrice, taxCode, productId } = this.addForm.getRawValue();

    this.workexec.addEstimateItem(this.estimateId, {
      itemType: 'PART',
      description,
      quantity,
      unitPrice,
      taxCode: taxCode || undefined,
      productId: productId || undefined,
    }).pipe(
      switchMap(() => this.workexec.calculateEstimateTotals(this.estimateId)),
      switchMap(() => this.workexec.getEstimateById(this.estimateId)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: est => {
        this.estimate.set(est);
        this.items.set(est.items ?? []);
        this.saveState.set('success');
        this.addForm.reset({ quantity: 1, unitPrice: 0 });
      },
      error: err => {
        this.saveState.set('error');
        const body = err.error;
        if (body?.fieldErrors?.length) {
          const map: Record<string, string> = {};
          for (const fe of body.fieldErrors) map[fe.field] = fe.message;
          this.fieldErrors.set(map);
        } else if (err.status === 409) {
          this.errorMessage.set('Estimate is not in DRAFT status and cannot be edited.');
        } else {
          this.errorMessage.set(body?.message ?? 'Failed to add part.');
        }
      },
    });
  }

  fieldError(name: string): string | null {
    return this.fieldErrors()[name] ?? null;
  }

  goBack(): void {
    this.router.navigate(['/app/workexec/estimates', this.estimateId]);
  }
}
