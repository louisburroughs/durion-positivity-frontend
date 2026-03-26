import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { debounceTime, switchMap } from 'rxjs/operators';
import { WorkexecService } from '../../services/workexec.service';
import { EstimateItemResponse, EstimateResponse, PageState, TotalsState } from '../../models/workexec.models';

/**
 * EstimateDetailPageComponent — Story 236 (CAP-002)
 * Route: /app/workexec/estimates/:estimateId
 * operationIds: calculateEstimateTotals, getEstimateById
 *
 * Displays the estimate workspace with inline totals panel.
 * Triggers calculateEstimateTotals on load and after item mutations.
 * Blocks Submit for Approval CTA when tax config is missing.
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
}
