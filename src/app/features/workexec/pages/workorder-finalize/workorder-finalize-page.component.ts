import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';
import {
  BillableScopeSnapshot,
  FinalizeWorkorderRequest,
  WorkorderSnapshotHistoryEntry,
} from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';

type PageState = 'loading' | 'ready' | 'error';
type FinalizeState = 'idle' | 'loading' | 'success' | 'error';

/**
 * WorkorderFinalizePageComponent — Story 216: Finalize Billable Scope Snapshot.
 *
 * Route: /app/workexec/workorders/:workorderId/finalize
 *
 * Allows Service Advisors to finalize a work order for billing, creating an
 * immutable billable scope snapshot. Displays snapshot history.
 */
@Component({
  selector: 'app-workorder-finalize-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './workorder-finalize-page.component.html',
  styleUrl: './workorder-finalize-page.component.css',
})
export class WorkorderFinalizePageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(WorkexecService);
  private readonly destroyRef = inject(DestroyRef);

  readonly workorderId = signal<string>('');
  readonly pageState = signal<PageState>('loading');
  readonly snapshots = signal<WorkorderSnapshotHistoryEntry[]>([]);
  readonly errorMessage = signal<string | null>(null);

  /** Finalize form */
  readonly poNumber = signal('');
  readonly finalizeState = signal<FinalizeState>('idle');
  readonly finalizeError = signal<string | null>(null);
  readonly finalizeResult = signal<BillableScopeSnapshot | null>(null);

  readonly hasActiveSnapshot = computed(() =>
    this.snapshots().some(s => s.status === 'ACTIVE'),
  );

  readonly canFinalize = computed(
    () => !this.hasActiveSnapshot() && this.finalizeState() !== 'loading',
  );

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('workorderId') ?? '';
    this.workorderId.set(id);
    this.loadSnapshots(id);
  }

  private loadSnapshots(id: string): void {
    this.pageState.set('loading');
    this.service
      .getSnapshotHistory(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (snaps) => {
          this.snapshots.set(snaps);
          this.pageState.set('ready');
        },
        error: (err) => {
          const status = err?.status ?? 0;
          if (status === 404) {
            this.snapshots.set([]);
            this.pageState.set('ready');
          } else {
            this.errorMessage.set('Failed to load snapshot history. Please try again.');
            this.pageState.set('error');
          }
        },
      });
  }

  finalizeForBilling(): void {
    if (!this.canFinalize()) return;
    const id = this.workorderId();
    this.finalizeState.set('loading');
    this.finalizeError.set(null);
    const body: FinalizeWorkorderRequest = {
      snapshotType: 'BILLABLE_SNAPSHOT',
      poNumber: this.poNumber() || undefined,
    };
    this.service
      .finalizeWorkorder(id, body, uuidv4())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.finalizeResult.set(res);
          this.finalizeState.set('success');
          this.loadSnapshots(id);
        },
        error: (err) => {
          this.finalizeState.set('error');
          const status = err?.status ?? 0;
          this.finalizeError.set(
            status === 409
              ? 'An active billable snapshot already exists for this work order.'
              : status === 400
                ? err?.error?.message ?? 'Finalization requirements not met. Check for unauthorized items or missing totals.'
                : 'Failed to finalize. Please try again.',
          );
        },
      });
  }

  goBack(): void {
    this.router.navigate(['/app/workexec/workorders', this.workorderId()]);
  }

  refresh(): void {
    this.loadSnapshots(this.workorderId());
  }
}
