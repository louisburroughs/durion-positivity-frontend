import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { StalenessIndicatorComponent } from '../staleness-indicator/staleness-indicator.component';
import {
  SupplierStatusChipComponent,
  SupplierStatusTone,
} from '../supplier-status-chip/supplier-status-chip.component';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  SupplierBindingHealth,
  SupplierBreakerState,
  SupplierHealthStatus,
} from '../../models/supplier-profile.models';
import { mapSupplierError } from '../../utils/supplier-error.util';

type PanelState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

const STATUS_TONES: Readonly<Record<SupplierHealthStatus, SupplierStatusTone>> = {
  HEALTHY: 'success',
  DEGRADED: 'warning',
  FAILING: 'danger',
  NOT_CONFIGURED: 'neutral',
  UNKNOWN: 'neutral',
};

const BREAKER_TONES: Readonly<Record<SupplierBreakerState, SupplierStatusTone>> = {
  CLOSED: 'success',
  HALF_OPEN: 'warning',
  OPEN: 'danger',
  UNKNOWN: 'neutral',
};

/**
 * Health tab of the vendor-profile detail screen.
 *
 * Strictly read-only: the breaker and health chips reflect what the backend
 * reports and expose no reset, trip, or retry control. Operating the breaker is
 * a backend concern; showing an admin a button that silently does nothing (or
 * worse, half-works) would be a lie about the system's shape.
 *
 * The panel distinguishes the backend's snapshot time (`observedAt`) from the
 * moment this page fetched it, via the shared staleness indicator, using the
 * backend-delivered threshold.
 */
@Component({
  selector: 'app-supplier-health-panel',
  standalone: true,
  imports: [DatePipe, TranslatePipe, SupplierStatusChipComponent, StalenessIndicatorComponent],
  templateUrl: './supplier-health-panel.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-health-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierHealthPanelComponent {
  private readonly service = inject(SupplierProfileService);
  private readonly destroyRef = inject(DestroyRef);

  readonly vendorProfileId = input.required<string>();

  readonly state = signal<PanelState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly health = signal<SupplierBindingHealth[]>([]);
  /** When this client last received a snapshot — distinct from `observedAt`. */
  readonly fetchedAt = signal<string | null>(null);

  /** Oldest sample in the set: the most conservative as-of value for the whole panel. */
  readonly oldestObservedAt = computed<string | null>(() => {
    const times = this.health()
      .map(entry => entry.observedAt)
      .filter((value): value is string => !!value)
      .sort();
    return times[0] ?? null;
  });

  /** Tightest non-zero threshold across the snapshots; 0 when none is delivered. */
  readonly stalenessThresholdMinutes = computed(() => {
    const thresholds = this.health()
      .map(entry => entry.stalenessThresholdMinutes)
      .filter(value => Number.isFinite(value) && value > 0);
    return thresholds.length > 0 ? Math.min(...thresholds) : 0;
  });

  constructor() {
    effect(onCleanup => {
      const profileId = this.vendorProfileId();
      if (!profileId) {
        return;
      }

      this.state.set('loading');
      this.errorKey.set(null);

      const sub: Subscription = this.service.getHealth(profileId).subscribe({
        next: entries => {
          this.health.set(entries);
          this.fetchedAt.set(new Date().toISOString());
          this.state.set(entries.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.HEALTH.ERROR.LOAD');
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });

      onCleanup(() => sub.unsubscribe());
    });
  }

  statusTone(status: SupplierHealthStatus): SupplierStatusTone {
    return STATUS_TONES[status] ?? 'neutral';
  }

  breakerTone(breaker: SupplierBreakerState): SupplierStatusTone {
    return BREAKER_TONES[breaker] ?? 'neutral';
  }

  reload(): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.service
      .getHealth(this.vendorProfileId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: entries => {
          this.health.set(entries);
          this.fetchedAt.set(new Date().toISOString());
          this.state.set(entries.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.HEALTH.ERROR.LOAD');
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }
}
