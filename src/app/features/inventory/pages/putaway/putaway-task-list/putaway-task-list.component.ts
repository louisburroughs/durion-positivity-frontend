import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PutawayTask } from '../../../models/inventory.models';
import { InventoryDomainService } from '../../../services/inventory.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-putaway-task-list',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './putaway-task-list.component.html',
  styleUrl: './putaway-task-list.component.css',
})
export class PutawayTaskListComponent {
  private readonly inventoryService = inject(InventoryDomainService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly tasks = signal<PutawayTask[]>([]);

  constructor() {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.inventoryService
      .getPutawayTasks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: tasks => {
          this.tasks.set(tasks);
          this.state.set(tasks.length ? 'ready' : 'empty');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.PUTAWAY.LIST.ERROR.LOAD');
        },
      });
  }

  selectTask(id: string): void {
    this.router.navigate(['/app/inventory/putaway/tasks', id]);
  }
}
