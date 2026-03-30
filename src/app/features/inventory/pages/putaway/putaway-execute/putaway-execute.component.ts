import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { finalize } from 'rxjs/operators';
import { PutawayTask } from '../../../models/inventory.models';
import { InventoryDomainService } from '../../../services/inventory.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-putaway-execute',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './putaway-execute.component.html',
  styleUrl: './putaway-execute.component.css',
})
export class PutawayExecuteComponent {
  private readonly inventoryService = inject(InventoryDomainService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly task = signal<PutawayTask | null>(null);
  readonly targetStorageLocationId = signal('');
  readonly submitting = signal(false);

  constructor() {
    const taskId = this.route.snapshot.paramMap.get('taskId');
    if (taskId) {
      this.loadTask(taskId);
    }
  }

  loadTask(taskId: string): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.inventoryService
      .getPutawayTasks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: tasks => {
          const found = tasks.find(t => t.putawayTaskId === taskId) ?? null;
          this.task.set(found);
          this.state.set(found ? 'ready' : 'empty');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.PUTAWAY.EXECUTE.ERROR.LOAD');
        },
      });
  }

  updateTargetLocation(v: string): void {
    this.targetStorageLocationId.set(v);
  }

  completePutaway(): void {
    const task = this.task();
    if (!task) {
      return;
    }

    this.submitting.set(true);
    this.errorKey.set(null);

    this.inventoryService
      .completePutawayTask(task.putawayTaskId, {
        putawayTaskId: task.putawayTaskId,
        targetStorageLocationId: this.targetStorageLocationId(),
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: () => {
          this.router.navigate(['/app/inventory/putaway/tasks']);
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.PUTAWAY.EXECUTE.ERROR.COMPLETE');
        },
      });
  }

  goBack(): void {
    this.router.navigate(['/app/inventory/putaway/tasks']);
  }
}
