import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { SupplierAvailabilityService } from '../../services/supplier-availability.service';
import { SupplierDeliveryLocationService } from '../../services/supplier-delivery-location.service';
import { SupplierAvailability } from '../../models/supplier-availability.models';
import { mapSupplierError } from '../../utils/supplier-error.util';
import { SupplierAvailabilityRowComponent } from '../supplier-availability-row/supplier-availability-row.component';

type CheckState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

let instanceCounter = 0;

/**
 * On-demand availability check for one procurement line (issue #190).
 *
 * ── Open question #190 §9, ruled: on demand only ────────────────────────────
 * Availability is **never** fetched automatically when a purchase-order line is
 * added or edited. Vendor stock APIs are quota-metered and billed, and a
 * purchase-order form is edited line by line — auto-firing would spend a call on
 * every keystroke-completed SKU, including the ones the user is about to delete,
 * and would do it again for every line on every revisit to an existing order.
 * The user asks, explicitly, per line; the answer is then labelled with the time
 * it was obtained so nobody mistakes a check from ten minutes ago for a live
 * number.
 *
 * Because the answer is a point-in-time snapshot, the result is cleared whenever
 * the SKU or quantity it was obtained for changes: showing yesterday's answer
 * against today's SKU would be worse than showing nothing.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Own state, own services, no outputs. A vendor failure here cannot reach the
 * purchase-order form's state machine, so a failed check never blocks saving the
 * order.
 */
@Component({
  selector: 'app-supplier-availability-check',
  standalone: true,
  imports: [TranslatePipe, SupplierAvailabilityRowComponent],
  templateUrl: './supplier-availability-check.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-availability-check.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierAvailabilityCheckComponent {
  private readonly availabilityService = inject(SupplierAvailabilityService);
  private readonly locations = inject(SupplierDeliveryLocationService);
  private readonly destroyRef = inject(DestroyRef);

  /** Purchase-order lines are keyed by SKU, not by catalog product id. */
  readonly sku = input<string | null>(null);

  /** Ordered quantity, forwarded as a hint so a vendor can answer against it. */
  readonly quantity = input<number | null>(null);

  /**
   * Explicit delivery location.
   *
   * Optional: when null the session-scoped selection is used, which is what the
   * purchase-order form does today via one shared picker above the line table.
   * The input exists so that a future platform location context can be piped in
   * directly without touching this component.
   */
  readonly deliveryLocationId = input<string | null>(null);

  /** Test seam for "now", forwarded to the freshness indicator on the result row. */
  readonly nowMs = input<number | null>(null);

  readonly controlId = `supplier-availability-check-${++instanceCounter}`;

  readonly state = signal<CheckState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly availability = signal<SupplierAvailability | null>(null);

  /** The SKU/quantity the current result was obtained for. */
  private readonly checkedSku = signal<string | null>(null);
  private readonly checkedQuantity = signal<number | null>(null);

  readonly effectiveLocationId = computed(
    () => this.deliveryLocationId() ?? this.locations.selectedLocationId(),
  );

  readonly canCheck = computed(
    () => !!this.sku()?.trim() && !!this.effectiveLocationId() && this.state() !== 'loading',
  );

  readonly missingLocation = computed(() => !this.effectiveLocationId());

  readonly vendors = computed(() => this.availability()?.vendors ?? []);

  readonly fetchedAt = computed(() => this.availability()?.fetchedAt ?? null);

  readonly thresholdMinutes = computed(() => this.availability()?.stalenessThresholdMinutes ?? 0);

  /**
   * True when the line changed after the check ran.
   *
   * The result is discarded rather than relabelled: a quantity for a different
   * SKU is not stale data, it is the wrong data.
   */
  readonly resultIsForCurrentLine = computed(
    () =>
      this.checkedSku() === (this.sku()?.trim() ?? null) &&
      this.checkedQuantity() === this.quantity(),
  );

  readonly showsResult = computed(
    () => (this.state() === 'ready' || this.state() === 'empty') && this.resultIsForCurrentLine(),
  );

  /** Explicit, user-initiated check. Nothing in this component calls it on its own. */
  check(): void {
    const sku = this.sku()?.trim();
    const locationId = this.effectiveLocationId();
    if (!sku || !locationId) {
      return;
    }

    const quantity = this.quantity();
    this.state.set('loading');
    this.errorKey.set(null);

    this.availabilityService
      .getAvailabilityBySku(sku, locationId, quantity ?? undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.availability.set(result);
          this.checkedSku.set(sku);
          this.checkedQuantity.set(quantity);
          this.state.set(result.vendors.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.AVAILABILITY.ERROR.CHECK');
          // ADR-0031: state first, then the key.
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
          this.availability.set(null);
          this.checkedSku.set(null);
          this.checkedQuantity.set(null);
        },
      });
  }
}
