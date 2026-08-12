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
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription, forkJoin } from 'rxjs';
import { StalenessIndicatorComponent } from '../staleness-indicator/staleness-indicator.component';
import {
  SupplierStatusChipComponent,
  SupplierStatusTone,
} from '../supplier-status-chip/supplier-status-chip.component';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import { SupplierPricatService } from '../../services/supplier-pricat.service';
import { SupplierBinding } from '../../models/supplier-profile.models';
import {
  PricatFreshness,
  PricatRun,
  PricatRunOutcome,
} from '../../models/supplier-pricat.models';
import { mapSupplierError } from '../../utils/supplier-error.util';

type PanelState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

const OUTCOME_TONES: Readonly<Record<PricatRunOutcome, SupplierStatusTone>> = {
  RUNNING: 'info',
  SUCCESS: 'success',
  PARTIAL: 'warning',
  EMPTY: 'warning',
  FAILED: 'danger',
};

/** Outcomes that produced no new data. The UI must say the previous data still stands. */
const NON_DESTRUCTIVE_OUTCOMES: readonly PricatRunOutcome[] = ['EMPTY', 'FAILED'];

const DEFAULT_POLL_MS = 3000;
const MAX_POLLS = 20;

/**
 * PRICAT tab of the vendor-profile detail screen (issue #189).
 *
 * Three behaviours are load-bearing:
 *
 * 1. **A failed or empty run never means "data was cleared."** Those runs are
 *    flagged with an explicit note that previously ingested prices remain
 *    authoritative (ADR-0053). Silence here would let an admin conclude the
 *    catalog had been wiped.
 *
 * 2. **Freshness has two clocks.** The vendor's effective date and the platform
 *    fetch time are rendered as separate facts by the shared staleness
 *    indicator; a fresh fetch of stale vendor data still reads as stale.
 *
 * 3. **"Run now" is gated by the backend, not by the client.** There is no
 *    fine-grained permission API on this frontend, so the button is offered to
 *    the admin-gated route and a `403` from the trigger endpoint is treated as
 *    the authoritative answer: the control disables itself and says so.
 *
 * A `202` response is followed by polling the run list until the new run leaves
 * `RUNNING`, so the run appears without a page reload.
 */
@Component({
  selector: 'app-supplier-pricat-panel',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    TranslatePipe,
    SupplierStatusChipComponent,
    StalenessIndicatorComponent,
  ],
  templateUrl: './supplier-pricat-panel.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-pricat-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierPricatPanelComponent {
  private readonly profileService = inject(SupplierProfileService);
  private readonly pricatService = inject(SupplierPricatService);
  private readonly destroyRef = inject(DestroyRef);

  readonly vendorProfileId = input.required<string>();

  readonly state = signal<PanelState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly runs = signal<PricatRun[]>([]);
  readonly freshness = signal<PricatFreshness | null>(null);
  readonly bindings = signal<SupplierBinding[]>([]);
  readonly triggering = signal(false);
  /** Set once the backend answers `403` to a trigger attempt. */
  readonly triggerForbidden = signal(false);
  readonly triggerAcceptedRunId = signal<string | null>(null);

  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollCount = 0;

  /** The PRICAT binding for this profile, or null when the capability is unbound. */
  readonly pricatBinding = computed<SupplierBinding | null>(
    () => this.bindings().find(binding => binding.capability === 'PRICE_CATALOG') ?? null,
  );

  readonly hasPricatBinding = computed(() => this.pricatBinding() !== null);

  readonly unmatchedCount = computed(() => this.freshness()?.unmatchedLineCount ?? 0);

  readonly canTrigger = computed(
    () => this.hasPricatBinding() && !this.triggerForbidden() && !this.triggering(),
  );

  readonly hasRunningRun = computed(() =>
    this.runs().some(run => run.outcome === 'RUNNING'),
  );

  constructor() {
    this.destroyRef.onDestroy(() => this.clearPollTimer());

    effect(onCleanup => {
      const profileId = this.vendorProfileId();
      if (!profileId) {
        return;
      }

      this.state.set('loading');
      this.errorKey.set(null);

      const sub: Subscription = forkJoin({
        runs: this.pricatService.listRuns(profileId),
        freshness: this.pricatService.getFreshness(profileId),
        bindings: this.profileService.listBindings(profileId),
      }).subscribe({
        next: result => {
          this.runs.set(result.runs);
          this.freshness.set(result.freshness);
          this.bindings.set(result.bindings);
          this.state.set(result.runs.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.PRICAT.ERROR.LOAD');
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });

      onCleanup(() => sub.unsubscribe());
    });
  }

  outcomeTone(outcome: PricatRunOutcome): SupplierStatusTone {
    return OUTCOME_TONES[outcome] ?? 'neutral';
  }

  /** True for runs that produced no new data, which must not read as data loss. */
  isNonDestructive(run: PricatRun): boolean {
    return NON_DESTRUCTIVE_OUTCOMES.includes(run.outcome);
  }

  /**
   * Trigger an on-demand run. Backend answers `202`; the panel then polls the
   * run list so the new run shows up in place.
   */
  runNow(): void {
    const binding = this.pricatBinding();
    if (!binding || this.triggerForbidden() || this.triggering()) {
      return;
    }

    this.triggering.set(true);
    this.triggerAcceptedRunId.set(null);

    this.pricatService
      .triggerRun(this.vendorProfileId(), binding.bindingId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.triggering.set(false);
          this.triggerAcceptedRunId.set(response.runId);
          this.errorKey.set(null);
          this.refreshRuns();
          this.schedulePoll(response.pollAfterMs ?? DEFAULT_POLL_MS);
        },
        error: (err: unknown) => {
          this.triggering.set(false);
          const outcome = mapSupplierError(err, 'POSITIVITY.PRICAT.ERROR.TRIGGER');
          if (outcome.kind === 'forbidden') {
            // The backend is the authority on who may trigger a run.
            this.triggerForbidden.set(true);
          }
          this.state.set('error');
          this.errorKey.set(
            outcome.kind === 'forbidden'
              ? 'POSITIVITY.PRICAT.ERROR.TRIGGER_FORBIDDEN'
              : outcome.errorKey,
          );
        },
      });
  }

  /** Reload runs and freshness in place, without navigating. */
  refreshRuns(): void {
    const profileId = this.vendorProfileId();

    forkJoin({
      runs: this.pricatService.listRuns(profileId),
      freshness: this.pricatService.getFreshness(profileId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.runs.set(result.runs);
          this.freshness.set(result.freshness);
          if (this.state() !== 'forbidden') {
            this.state.set(result.runs.length === 0 ? 'empty' : 'ready');
          }
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.PRICAT.ERROR.LOAD');
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }

  private schedulePoll(delayMs: number): void {
    this.clearPollTimer();
    this.pollCount = 0;
    this.pollTimer = setTimeout(() => this.poll(delayMs), delayMs);
  }

  private poll(delayMs: number): void {
    this.pollCount += 1;
    this.refreshRuns();

    if (this.pollCount >= MAX_POLLS || !this.hasRunningRun()) {
      this.clearPollTimer();
      return;
    }
    this.pollTimer = setTimeout(() => this.poll(delayMs), delayMs);
  }

  private clearPollTimer(): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
