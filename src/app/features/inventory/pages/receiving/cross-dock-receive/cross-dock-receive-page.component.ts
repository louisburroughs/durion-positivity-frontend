import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  CrossDockReceiveRequest,
  CrossDockReceiveResult,
  WorkorderCrossDockRef,
} from '../../../models/inventory.models';
import { InventoryReceivingService } from '../../../services/inventory-receiving.service';

type PageState = 'idle' | 'loading' | 'ready' | 'reviewing' | 'submitting' | 'success' | 'error';

@Component({
  selector: 'app-cross-dock-receive-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './cross-dock-receive-page.component.html',
  styleUrl: './cross-dock-receive-page.component.css',
})
export class CrossDockReceivePageComponent {
  private readonly receivingService = inject(InventoryReceivingService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);

  readonly shipmentId = signal<string | null>(null);
  readonly searchQuery = signal<string>('');
  readonly workorders = signal<WorkorderCrossDockRef[]>([]);

  readonly sessionId = signal<string>('');
  readonly receivingLineId = signal<string>('');
  readonly workorderId = signal<string>('');
  readonly workorderLineId = signal<string>('');
  readonly quantity = signal<number>(0);
  readonly overrideReasonCode = signal<string>('');

  readonly result = signal<CrossDockReceiveResult | null>(null);

  constructor() {
    const shipmentId = this.route.snapshot.queryParamMap.get('shipmentId');
    this.shipmentId.set(shipmentId);
  }

  searchWorkorders(query: string): void {
    const normalizedQuery = query.trim();
    this.searchQuery.set(normalizedQuery);

    if (!normalizedQuery) {
      this.workorders.set([]);
      this.state.set('idle');
      return;
    }

    this.state.set('loading');
    this.errorKey.set(null);

    this.receivingService
      .searchWorkordersForCrossDock(normalizedQuery)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: refs => {
          this.workorders.set(refs);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.RECEIVING.CROSS_DOCK.ERROR.SEARCH');
        },
      });
  }

  beginReview(): void {
    if (!this.hasValidSubmissionInputs()) {
      this.state.set('error');
      this.errorKey.set('INVENTORY.RECEIVING.CROSS_DOCK.ERROR.VALIDATION');
      return;
    }

    this.state.set('reviewing');
    this.errorKey.set(null);
  }

  confirmCrossDockReceipt(): void {
    if (!this.hasValidSubmissionInputs()) {
      this.state.set('error');
      this.errorKey.set('INVENTORY.RECEIVING.CROSS_DOCK.ERROR.VALIDATION');
      return;
    }

    const request: CrossDockReceiveRequest = {
      sessionId: this.sessionId().trim(),
      receivingLineId: this.receivingLineId().trim(),
      workorderId: this.workorderId().trim(),
      workorderLineId: this.workorderLineId().trim(),
      quantity: this.quantity(),
      overrideReasonCode: this.overrideReasonCode().trim() || undefined,
    };

    this.state.set('submitting');
    this.errorKey.set(null);

    this.receivingService
      .submitCrossDockReceipt(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.result.set(result);
          this.state.set('success');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.RECEIVING.CROSS_DOCK.ERROR.SUBMIT');
        },
      });
  }

  private hasValidSubmissionInputs(): boolean {
    return this.sessionId().trim().length > 0
      && this.receivingLineId().trim().length > 0
      && this.workorderId().trim().length > 0
      && this.workorderLineId().trim().length > 0
      && Number.isFinite(this.quantity())
      && this.quantity() > 0;
  }
}
