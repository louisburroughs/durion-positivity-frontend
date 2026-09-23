import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LocationPickerComponent } from '../../../location/components/location-picker/location-picker.component';
import { WorkorderWipView } from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';

@Component({
  selector: 'app-wip-status-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe, LocationPickerComponent],
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
  /** ADR-0063: one counter for the single writer to `wipItems`/`state`; a superseded read never lands. */
  private loadSeq = 0;

  /** Picking a location loads it straight away; clearing the picker returns to idle. */
  loadLocation(value: string): void {
    this.locationId.set(value.trim());
    this.load();
  }

  refresh(): void {
    this.load();
  }

  private load(): void {
    const locationId = this.locationId();
    const seq = ++this.loadSeq; // any read still in flight is now stale
    if (!locationId) {
      this.state.set('idle');
      this.errorKey.set(null); // ADR-0031: leaving 'error' clears the key with it
      this.wipItems.set([]);
      return;
    }

    this.state.set('loading');
    this.errorKey.set(null);

    this.workexec
      .listActiveWorkorders(locationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => {
          if (seq !== this.loadSeq) return;
          this.wipItems.set(items);
          this.state.set(items.length > 0 ? 'ready' : 'empty');
        },
        error: () => {
          if (seq !== this.loadSeq) return;
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
