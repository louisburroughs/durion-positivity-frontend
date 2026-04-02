import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PickExecuteLine, PickListView } from '../../../../workexec/models/workexec.models';
import { WorkexecService } from '../../../../workexec/services/workexec.service';

type PageState = 'idle' | 'loading' | 'ready' | 'picking' | 'complete' | 'error';

@Component({
  selector: 'app-pick-execute-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './pick-execute-page.component.html',
  styleUrls: ['./pick-execute-page.component.css'],
})
export class PickExecutePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly workexecService = inject(WorkexecService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly pickList = signal<PickListView | null>(null);
  readonly lines = signal<PickExecuteLine[]>([]);
  readonly scanInput = signal('');
  readonly scanAttempted = signal(false);
  readonly pendingLine = signal<PickExecuteLine | null>(null);
  readonly confirmQty = signal(0);

  constructor() {
    this.loadPickList();
  }

  setScanInput(value: string): void {
    this.scanInput.set(value);
    this.scanAttempted.set(false);
  }

  setConfirmQty(quantity: number): void {
    this.confirmQty.set(quantity);
  }

  reload(): void {
    this.loadPickList();
  }

  resolveScan(): void {
    const workorderId = this.route.snapshot.paramMap.get('workorderId');
    const scanValue = this.scanInput().trim();
    this.scanAttempted.set(true);
    if (!workorderId || !scanValue) {
      return;
    }

    this.state.set('picking');
    this.errorKey.set(null);

    this.workexecService
      .resolvePickScan(workorderId, { scanValue })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: resolvedLines => {
          this.lines.set(resolvedLines);
          this.pendingLine.set(resolvedLines[0] ?? null);
          this.confirmQty.set(resolvedLines[0]?.requestedQty ?? 0);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.RESOLVE_SCAN');
        },
      });
  }

  confirmLine(): void {
    const workorderId = this.route.snapshot.paramMap.get('workorderId');
    const line = this.pendingLine();
    const quantity = this.confirmQty();

    if (!workorderId || !line || quantity <= 0) {
      return;
    }

    this.state.set('picking');
    this.errorKey.set(null);

    this.workexecService
      .confirmPickLine(workorderId, {
        pickLineId: line.pickLineId,
        quantity,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: confirmedLine => {
          const updated = this.lines().map(item =>
            item.pickLineId === confirmedLine.pickLineId ? confirmedLine : item,
          );
          this.lines.set(updated);
          this.pendingLine.set(null);
          this.confirmQty.set(0);
          this.scanInput.set('');
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.CONFIRM');
        },
      });
  }

  complete(): void {
    const workorderId = this.route.snapshot.paramMap.get('workorderId');
    if (!workorderId) {
      return;
    }

    this.state.set('picking');
    this.errorKey.set(null);

    this.workexecService
      .completePickList(workorderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.state.set('complete'),
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.COMPLETE');
        },
      });
  }

  private loadPickList(): void {
    const workorderId = this.route.snapshot.paramMap.get('workorderId');
    if (!workorderId) {
      this.state.set('error');
      this.errorKey.set('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.MISSING_ID');
      return;
    }

    this.state.set('loading');
    this.errorKey.set(null);

    this.workexecService
      .getWorkorderPickList(workorderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: pickList => {
          this.pickList.set(pickList);
          this.lines.set(
            pickList.tasks.map(task => ({
              pickLineId: task.pickTaskId,
              pickTaskId: task.pickTaskId,
              productSku: task.productSku,
              requestedQty: task.requestedQty,
              confirmedQty: task.pickedQty,
              status: task.status,
            })),
          );
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.LOAD');
        },
      });
  }
}
