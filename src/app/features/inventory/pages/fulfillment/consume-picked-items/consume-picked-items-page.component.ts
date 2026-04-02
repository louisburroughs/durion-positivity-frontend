import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PickedItemLine } from '../../../../workexec/models/workexec.models';
import { WorkexecService } from '../../../../workexec/services/workexec.service';

type PageState = 'idle' | 'loading' | 'ready' | 'submitting' | 'success' | 'error';

@Component({
  selector: 'app-consume-picked-items-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './consume-picked-items-page.component.html',
  styleUrls: ['./consume-picked-items-page.component.css'],
})
export class ConsumePickedItemsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly workexecService = inject(WorkexecService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly items = signal<PickedItemLine[]>([]);
  readonly pickedItems = this.items;
  readonly consumeQtys = signal<Record<string, number>>({});

  readonly canSubmit = computed(() => Object.values(this.consumeQtys()).some(qty => qty > 0));

  constructor() {
    this.loadPickedItems();
  }

  setConsumeQty(pickedItemId: string, quantity: number): void {
    this.updateConsumeQty(pickedItemId, quantity);
  }

  updateConsumeQty(pickedItemId: string, quantity: number): void {
    const line = this.items().find(item => item.pickedItemId === pickedItemId);
    const maxConsumable = line ? Math.max(0, line.qtyPicked - line.qtyConsumed) : 0;
    const normalized = Math.max(0, Math.min(quantity, maxConsumable));
    this.consumeQtys.update(current => ({ ...current, [pickedItemId]: normalized }));
  }

  submit(): void {
    const workorderId = this.route.snapshot.paramMap.get('workorderId');
    if (!workorderId || !this.canSubmit()) {
      return;
    }

    const lines = this.items()
      .map(item => ({
        pickedItemId: item.pickedItemId,
        quantity: this.consumeQtys()[item.pickedItemId] ?? 0,
      }))
      .filter(line => line.quantity > 0);

    if (lines.length === 0) {
      return;
    }

    this.state.set('submitting');
    this.errorKey.set(null);

    this.workexecService
      .consumePickedItems(workorderId, { lines })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.state.set('success');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.FULFILLMENT.CONSUME_PICKED_ITEMS.ERROR.SUBMIT');
        },
      });
  }

  reload(): void {
    this.loadPickedItems();
  }

  private loadPickedItems(setLoading = true): void {
    const workorderId = this.route.snapshot.paramMap.get('workorderId');
    if (!workorderId) {
      this.state.set('error');
      this.errorKey.set('INVENTORY.FULFILLMENT.CONSUME_PICKED_ITEMS.ERROR.MISSING_ID');
      return;
    }

    if (setLoading) {
      this.state.set('loading');
    }
    this.errorKey.set(null);

    this.workexecService
      .getPickedItems(workorderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: lines => {
          this.items.set(lines);
          this.consumeQtys.set({});
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.FULFILLMENT.CONSUME_PICKED_ITEMS.ERROR.LOAD');
        },
      });
  }
}
