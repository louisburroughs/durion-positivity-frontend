import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { ReplenishmentTask } from '../../../models/inventory.models';
import { InventoryService } from '../../../services/inventory.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-replenishment-task-list',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './replenishment-task-list.component.html',
  styleUrl: './replenishment-task-list.component.css',
})
export class ReplenishmentTaskListComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly tasks = signal<ReplenishmentTask[]>([]);

  constructor() {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.inventoryService
      .getReplenishmentTasks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: tasks => {
          this.tasks.set(tasks);
          this.state.set(tasks.length ? 'ready' : 'empty');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.REPLENISHMENT.LIST.ERROR.LOAD');
        },
      });
  }
}
