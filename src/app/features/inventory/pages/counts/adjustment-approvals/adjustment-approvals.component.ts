import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { finalize } from 'rxjs/operators';
import {
  AdjustmentDetail,
  AdjustmentPageResponse,
} from '../../../models/inventory.models';
import { InventoryCycleCountService } from '../../../services/inventory-cycle-count.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-adjustment-approvals',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './adjustment-approvals.component.html',
  styleUrl: './adjustment-approvals.component.css',
})
export class AdjustmentApprovalsComponent {
  private readonly cycleCountService = inject(InventoryCycleCountService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly adjustments = signal<AdjustmentDetail[]>([]);
  readonly nextPageToken = signal<string | null>(null);
  readonly selectedAdjustment = signal<AdjustmentDetail | null>(null);
  readonly rejectionReason = signal('');
  readonly submitting = signal(false);

  constructor() {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.cycleCountService
      .queryAdjustments({})
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page: AdjustmentPageResponse) => {
          this.adjustments.set(page.items);
          this.nextPageToken.set(page.nextPageToken);
          this.state.set(page.items.length ? 'ready' : 'empty');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.COUNTS.APPROVALS.ERROR.LOAD');
        },
      });
  }

  loadMore(): void {
    const token = this.nextPageToken();
    if (!token) {
      return;
    }
    this.state.set('loading');
    this.cycleCountService
      .queryAdjustments({ pageToken: token })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page: AdjustmentPageResponse) => {
          this.adjustments.update(existing => [...existing, ...page.items]);
          this.nextPageToken.set(page.nextPageToken);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.COUNTS.APPROVALS.ERROR.LOAD');
        },
      });
  }

  selectAdjustment(adj: AdjustmentDetail): void {
    this.selectedAdjustment.set(adj);
    this.rejectionReason.set('');
  }

  approve(adjustmentId: string): void {
    this.submitting.set(true);
    this.errorKey.set(null);

    this.cycleCountService
      .approveAdjustment(adjustmentId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: updated => {
          this.adjustments.update(list =>
            list.map(a => (a.adjustmentId === adjustmentId ? updated : a)),
          );
          this.selectedAdjustment.set(null);
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.COUNTS.APPROVALS.ERROR.APPROVE');
        },
      });
  }

  reject(adjustmentId: string): void {
    this.submitting.set(true);
    this.errorKey.set(null);

    this.cycleCountService
      .rejectAdjustment(adjustmentId, this.rejectionReason())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: updated => {
          this.adjustments.update(list =>
            list.map(a => (a.adjustmentId === adjustmentId ? updated : a)),
          );
          this.selectedAdjustment.set(null);
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.COUNTS.APPROVALS.ERROR.REJECT');
        },
      });
  }

  updateRejectionReason(v: string): void {
    this.rejectionReason.set(v);
  }
}
