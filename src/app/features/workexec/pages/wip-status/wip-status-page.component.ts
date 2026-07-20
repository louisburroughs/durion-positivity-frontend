import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { WorkorderWipView } from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';
import { nowMs, recordOperation, recordOperationMeasurement } from '../../../../core/observability/operation-telemetry';

@Component({
  selector: 'app-wip-status-page',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './wip-status-page.component.html',
  styleUrl: './wip-status-page.component.css',
})
export class WipStatusPageComponent {
  private readonly workexec = inject(WorkexecService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly wipItems = signal<WorkorderWipView[]>([]);
  readonly selectedWorkorderId = signal<string | null>(null);
  readonly locationId = signal('');

  loadLocation(value: string): void {
    this.locationId.set(value.trim());
    this.load();
  }

  refresh(): void {
    this.load();
  }

  private load(): void {
    const locationId = this.locationId();
    if (!locationId) {
      this.state.set('idle');
      this.wipItems.set([]);
      return;
    }

    this.state.set('loading');
    this.errorKey.set(null);

    const loadStartedAt = nowMs();
    this.workexec
      .listActiveWorkorders(locationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => {
          this.wipItems.set(items);
          this.state.set(items.length > 0 ? 'ready' : 'empty');
          recordOperation({
            name: 'View Work In Progress Board',
            type: 'ui_view',
            outcome: 'success',
          });
          recordOperationMeasurement('view-work-in-progress-board', {
            duration_ms: nowMs() - loadStartedAt,
          });
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('WORKEXEC.WIP.ERROR.LOAD');
          recordOperation({
            name: 'View Work In Progress Board',
            type: 'ui_view',
            outcome: 'failure',
          });
        },
      });
  }

  openWorkorderDetail(workorderId: string): void {
    this.selectedWorkorderId.set(workorderId);
    this.router.navigate(['../workorders', workorderId], { relativeTo: this.route });
  }
}
