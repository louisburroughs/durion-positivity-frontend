import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import {
  SupplierStatusChipComponent,
  SupplierStatusTone,
} from '../supplier-status-chip/supplier-status-chip.component';
import { StalenessIndicatorComponent } from '../staleness-indicator/staleness-indicator.component';
import { SupplierAvailabilityStatus } from '../../models/supplier-availability.models';
import type { SupplierAvailabilityVendorResult } from '../../models/supplier-availability.models';
import { toDatePipeInput } from '../../utils/supplier-freshness.util';

/**
 * One vendor's availability answer (issue #190).
 *
 * Purely presentational: no injected services, no data loading. Both the Product
 * Detail section and the procurement per-line check render their results through
 * this component, so the two surfaces cannot drift on how a status reads.
 *
 * ── The no-fabricated-numbers rule (DECISION-POSITIVITY-006) ─────────────────
 * Quantities render **only** when `status === 'OK'` *and* the value is actually
 * a number. Every other case renders the status instead. There is no `?? 0`, no
 * em-dash standing in for a quantity, and no empty cell where a number belongs —
 * a counter user quoting a customer must never read an invented figure, and a
 * dash in a quantity column is read as "none available", which is a claim we
 * have no basis to make.
 *
 * ── Status is text + icon, never colour (ADR-0029, ADR-0039) ────────────────
 * The status arrives through `app-supplier-status-chip`, which always renders a
 * translated label beside a distinct glyph; tone drives colour as decoration
 * only.
 *
 * ── Two time facts stay apart ───────────────────────────────────────────────
 * The vendor's `asOf` and the platform's `fetchedAt` are rendered as separately
 * labelled values by the shared `app-staleness-indicator`, which also applies
 * the backend-delivered staleness threshold. Freshness is always shown, because
 * "we asked at 12:00 and the vendor had no timestamp" is itself the answer for a
 * degraded result.
 */
const STATUS_TONES: Readonly<Record<SupplierAvailabilityStatus, SupplierStatusTone>> = {
  OK: 'success',
  SUPPLIER_UNAVAILABLE: 'warning',
  NOT_LISTED: 'info',
  CAPABILITY_NOT_CONFIGURED: 'neutral',
};

@Component({
  selector: 'app-supplier-availability-row',
  standalone: true,
  imports: [DatePipe, TranslatePipe, SupplierStatusChipComponent, StalenessIndicatorComponent],
  templateUrl: './supplier-availability-row.component.html',
  styleUrl: './supplier-availability-row.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierAvailabilityRowComponent {
  readonly result = input.required<SupplierAvailabilityVendorResult>();

  /** Instant the platform performed the lookup. Distinct from the vendor `asOf`. */
  readonly fetchedAt = input<string | null>(null);

  /** Backend-delivered staleness threshold in minutes; `0` disables the check. */
  readonly thresholdMinutes = input<number>(0);

  /** Test seam for "now", forwarded to the staleness indicator. */
  readonly nowMs = input<number | null>(null);

  readonly status = computed(() => this.result().status);

  /** Tone read at access time, never in a field initialiser (see supplier-capability-keys). */
  readonly tone = computed<SupplierStatusTone>(() => STATUS_TONES[this.status()] ?? 'neutral');

  readonly statusLabelKey = computed(() => `POSITIVITY.AVAILABILITY.STATUS.${this.status()}`);

  readonly statusDetailKey = computed(() => `POSITIVITY.AVAILABILITY.STATUS_DETAIL.${this.status()}`);

  /**
   * True only when the vendor answered `OK` *and* sent a real number.
   *
   * An `OK` with a null quantity is a backend contract violation, not a zero, so
   * it falls through to the status-only rendering rather than printing anything.
   */
  readonly showsQuantity = computed(() => {
    const value = this.result().availableQuantity;
    return this.status() === 'OK' && typeof value === 'number' && Number.isFinite(value);
  });

  readonly quantity = computed(() => (this.showsQuantity() ? this.result().availableQuantity : null));

  readonly unitOfMeasure = computed(() => (this.showsQuantity() ? this.result().unitOfMeasure : null));

  /** Delivery estimate is only meaningful alongside an `OK` answer. */
  readonly estimate = computed(() =>
    this.status() === 'OK' ? (this.result().deliveryEstimate ?? null) : null,
  );

  /** Vendor date-only values get a local-midnight suffix before `DatePipe` (ADR-0038). */
  readonly earliestDeliveryDisplay = computed(() =>
    toDatePipeInput(this.estimate()?.earliestDeliveryDate ?? null),
  );

  readonly leadTimeDays = computed(() => {
    const days = this.estimate()?.leadTimeDays;
    return typeof days === 'number' && Number.isFinite(days) ? days : null;
  });

  readonly cutoffDisplay = computed(() => toDatePipeInput(this.estimate()?.cutoffAt ?? null));

  readonly warehouseName = computed(() => this.result().warehouseName ?? null);

  /** Backend failure code, shown as secondary detail only — never as the label. */
  readonly errorCode = computed(() =>
    this.status() === 'SUPPLIER_UNAVAILABLE' ? (this.result().errorCode ?? null) : null,
  );
}
