
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { finalize } from 'rxjs/operators';
import { INVENTORY_PAGE } from '../../../../../core/security/route-permissions';
import { AuthService } from '../../../../../core/services/auth.service';
import { PutawayTask } from '../../../models/inventory.models';
import { InventoryDomainService } from '../../../services/inventory.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-putaway-execute',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './putaway-execute.component.html',
  styleUrl: './putaway-execute.component.css',
})
export class PutawayExecuteComponent {
  private readonly inventoryService = inject(InventoryDomainService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly task = signal<PutawayTask | null>(null);
  readonly targetStorageLocationId = signal('');
  readonly submitting = signal(false);

  /**
   * `executePutawayTask` is a write (`PutawayExecuteController.executePutaway`,
   * `@PreAuthorize('inventory:putaway:execute')`), but the route only admits on
   * `inventory:putaway:view`, so the submit control and `completePutaway` each
   * gate on this write code independently (ADR-0040 §6a.1). Unknown-permission
   * fallback matches `PickExecutePageComponent.canExecute` (issue #347 group 5).
   */
  readonly canExecute = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(INVENTORY_PAGE.putawayExecute),
  );

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
          const found = tasks.find(t => t.taskId === taskId) ?? null;
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
    if (!task || !this.canExecute()) {
      return;
    }

    this.submitting.set(true);
    this.errorKey.set(null);

    this.inventoryService
      .executePutawayTask(task.taskId, {
        skuId: task.productId,
        sourceLocationId: task.sourceLocationId,
        destinationLocationId: this.targetStorageLocationId(),
        quantity: task.quantity,
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
