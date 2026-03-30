import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { finalize } from 'rxjs/operators';
import {
  CountSubmitResponse,
  CycleCountTask,
} from '../../../models/inventory.models';
import { InventoryCycleCountService } from '../../../services/inventory-cycle-count.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-count-execute',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './count-execute.component.html',
  styleUrl: './count-execute.component.css',
})
export class CountExecuteComponent {
  private readonly cycleCountService = inject(InventoryCycleCountService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly task = signal<CycleCountTask | null>(null);
  readonly countedQuantity = signal<number | null>(null);
  readonly submitting = signal(false);
  readonly submitResult = signal<CountSubmitResponse | null>(null);

  constructor() {
    const taskId = this.route.snapshot.queryParamMap.get('taskId');
    if (taskId) {
      this.loadTask(taskId);
    }
  }

  loadTask(taskId: string): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.cycleCountService
      .getCycleCountTask(taskId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: task => {
          this.task.set(task);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.COUNTS.EXECUTE.ERROR.LOAD');
        },
      });
  }

  updateCount(n: number): void {
    this.countedQuantity.set(n);
  }

  submitCount(): void {
    const task = this.task();
    const qty = this.countedQuantity();
    if (!task || qty === null) {
      return;
    }

    this.submitting.set(true);
    this.errorKey.set(null);

    this.cycleCountService
      .submitCount(task.cycleCountTaskId, {
        entries: [{ sequence: 1, countedQuantity: qty }],
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: result => {
          this.submitResult.set(result);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.COUNTS.EXECUTE.ERROR.SUBMIT');
        },
      });
  }

  goBack(): void {
    this.router.navigate(['/app/inventory/counts']);
  }
}
