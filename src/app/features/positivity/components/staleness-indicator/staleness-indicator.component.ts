import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import {
  SupplierStatusChipComponent,
  SupplierStatusTone,
} from '../supplier-status-chip/supplier-status-chip.component';
import { isDateOnly, isStale, toDatePipeInput } from '../../utils/supplier-freshness.util';

/**
 * Shared freshness indicator for supplier data surfaces.
 *
 * The whole point of this component is that **vendor as-of time and platform
 * fetch time are different facts** and are rendered as two separately labelled
 * values (ADR-0053 §2). Fetch time is never presented as data currency, and
 * staleness is computed against the vendor as-of value only — a recent fetch of
 * old data is still old data.
 *
 * The staleness threshold is **delivered by the backend**, never guessed here,
 * so a deployment can tune it without a frontend change. A threshold of `0`
 * disables the check.
 *
 * A missing as-of value renders as *unknown*, not as *fresh* and not as *stale*.
 *
 * Date-only vendor values (`YYYY-MM-DD`) are formatted through
 * `toDatePipeInput()` so `DatePipe` does not shift them across a day boundary
 * (ADR-0038).
 */
@Component({
  selector: 'app-staleness-indicator',
  standalone: true,
  imports: [DatePipe, TranslatePipe, SupplierStatusChipComponent],
  templateUrl: './staleness-indicator.component.html',
  styleUrl: './staleness-indicator.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StalenessIndicatorComponent {
  /** Vendor-declared as-of time: an instant, or a date-only `YYYY-MM-DD` value. */
  readonly asOf = input<string | null>(null);

  /** Translation key naming the as-of fact, e.g. "Vendor effective date". */
  readonly asOfLabelKey = input<string>('POSITIVITY.FRESHNESS.AS_OF');

  /** Platform instant of the last fetch. */
  readonly fetchedAt = input<string | null>(null);

  /** Translation key naming the fetch fact. */
  readonly fetchedAtLabelKey = input<string>('POSITIVITY.FRESHNESS.FETCHED_AT');

  /** Backend-delivered staleness threshold in minutes; `0` disables the check. */
  readonly thresholdMinutes = input<number>(0);

  /** Test seam for "now". Production leaves this null and uses the construction time. */
  readonly nowMs = input<number | null>(null);

  private readonly constructedAt = signal(Date.now());

  private readonly now = computed(() => this.nowMs() ?? this.constructedAt());

  /** As-of value prepared for `DatePipe` (date-only values get a local midnight suffix). */
  readonly asOfDisplay = computed(() => toDatePipeInput(this.asOf()));

  /** `mediumDate` for a vendor date-only value; `medium` for an instant. */
  readonly asOfFormat = computed(() => (isDateOnly(this.asOf()) ? 'mediumDate' : 'medium'));

  readonly fetchedAtDisplay = computed(() => toDatePipeInput(this.fetchedAt()));

  readonly hasAsOf = computed(() => !!this.asOf());

  readonly stale = computed(() =>
    isStale(this.asOf(), this.thresholdMinutes(), this.now()),
  );

  /** `unknown` when there is no vendor timestamp at all — distinct from stale. */
  readonly freshnessLabelKey = computed(() => {
    if (!this.hasAsOf()) {
      return 'POSITIVITY.FRESHNESS.UNKNOWN';
    }
    return this.stale() ? 'POSITIVITY.FRESHNESS.STALE' : 'POSITIVITY.FRESHNESS.CURRENT';
  });

  readonly freshnessTone = computed<SupplierStatusTone>(() => {
    if (!this.hasAsOf()) {
      return 'neutral';
    }
    return this.stale() ? 'warning' : 'success';
  });
}
