import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { WorkorderWipView } from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';

@Component({
  selector: 'app-wip-status-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
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

  private refreshSub?: Subscription;

  constructor() {
    effect(
      onCleanup => {
        this.state.set('loading');
        this.errorKey.set(null);

        const sub: Subscription = this.workexec.listActiveWorkorders().subscribe({
          next: items => {
            this.wipItems.set(items);
            this.state.set(items.length > 0 ? 'ready' : 'empty');
          },
          error: () => {
            this.state.set('error');
            this.errorKey.set('WORKEXEC.WIP.ERROR.LOAD');
          },
        });

        onCleanup(() => sub.unsubscribe());
      },
      { allowSignalWrites: true },
    );

    this.destroyRef.onDestroy(() => this.refreshSub?.unsubscribe());
  }

  refresh(): void {
    this.refreshSub?.unsubscribe();
    this.state.set('loading');
    this.errorKey.set(null);

    this.refreshSub = this.workexec
      .listActiveWorkorders()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => {
          this.wipItems.set(items);
          this.state.set(items.length > 0 ? 'ready' : 'empty');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('WORKEXEC.WIP.ERROR.LOAD');
        },
      });
  }

  openWorkorderDetail(workorderId: string): void {
    this.selectedWorkorderId.set(workorderId);
    this.router.navigate(['../workorders', workorderId], { relativeTo: this.route });
  }
}
