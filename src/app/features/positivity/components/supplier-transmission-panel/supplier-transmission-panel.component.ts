import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { SupplierOrderTransmissionService } from '../../services/supplier-order-transmission.service';
import {
  SupplierOrderTransmission,
  SupplierTransmissionState,
} from '../../models/supplier-order-transmission.models';
import { mapSupplierError } from '../../utils/supplier-error.util';
import { toDatePipeInput } from '../../utils/supplier-freshness.util';
import { SupplierStatusChipComponent, SupplierStatusTone } from '../supplier-status-chip/supplier-status-chip.component';

type PanelState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

/** Tone + glyph per transmission state. Colour is redundant with the text label. */
const STATE_TONES: Readonly<Record<SupplierTransmissionState, SupplierStatusTone>> = {
  PENDING: 'info',
  DISPATCHING: 'info',
  SENT_AWAITING_RESULT: 'info',
  CONFIRMED: 'success',
  REJECTED: 'danger',
  MANUAL_REVIEW: 'warning',
  FAILED: 'danger',
  CANCELLED: 'neutral',
};

const STATE_ICONS: Readonly<Record<SupplierTransmissionState, string>> = {
  PENDING: 'schedule',
  DISPATCHING: 'outbox',
  SENT_AWAITING_RESULT: 'send',
  CONFIRMED: 'check_circle',
  REJECTED: 'cancel',
  MANUAL_REVIEW: 'rule',
  FAILED: 'error',
  CANCELLED: 'block',
};

/**
 * Vendor transmission panel for a committed purchase order (issue #191; #201).
 *
 * ── Open question #191 §8, ruled: po-detail hosts this ──────────────────────
 * `po-detail` renders an order that has already been committed, read-only; it is
 * the screen a procurement user opens to ask "what is happening with this
 * order?". The inventory host gains imports and markup only: no supplier HTTP
 * call and no supplier model crosses into the inventory domain (ADR-0010).
 *
 * ── This panel can never damage its host ────────────────────────────────────
 * It owns its own `state`/`errorKey` signals and injects its own service. A
 * vendor outage or a `403` lands here and nowhere else.
 *
 * ── No re-send path exists, deliberately ────────────────────────────────────
 * There is no control on this panel that re-transmits an order, and the service
 * behind it has no such method. A `MANUAL_REVIEW` order is ambiguous *because*
 * the vendor may already hold it; a retry button would convert that ambiguity
 * into a duplicate physical delivery. The spec asserts the absence.
 *
 * ── What is shown is what the backend publishes ─────────────────────────────
 * The generated client exposes one read: every transmission recorded for the
 * order, each with its current state and last status time. There is no
 * status-history or per-line confirmation read, so none is rendered (#201).
 */
@Component({
  selector: 'app-supplier-transmission-panel',
  standalone: true,
  imports: [DatePipe, TranslatePipe, SupplierStatusChipComponent],
  templateUrl: './supplier-transmission-panel.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-transmission-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierTransmissionPanelComponent {
  private readonly service = inject(SupplierOrderTransmissionService);

  /** Platform purchase-order UUID. Null while the host resolves the route. */
  readonly purchaseOrderId = input<string | null>(null);

  /** Human PO number. Display only — never a navigation key. */
  readonly poNumber = input<string | null>(null);

  readonly state = signal<PanelState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly transmissions = signal<SupplierOrderTransmission[]>([]);

  private readonly reloadToken = signal(0);

  /**
   * The most recently updated transmission; what the header chip summarises.
   *
   * A missing or unparseable `lastStatusAt` sorts last, and ties keep the
   * order the service returned, so the pick is deterministic.
   */
  readonly latest = computed<SupplierOrderTransmission | null>(() => {
    const list = this.transmissions();
    if (list.length === 0) {
      return null;
    }
    const statusTime = (item: SupplierOrderTransmission): number => {
      const parsed = item.lastStatusAt ? Date.parse(item.lastStatusAt) : Number.NaN;
      return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
    };
    return list
      .map((item, index) => ({ item, index, time: statusTime(item) }))
      .sort((a, b) => (b.time - a.time) || (a.index - b.index))[0].item;
  });

  readonly needsManualReview = computed(() =>
    this.transmissions().some(t => t.state === 'MANUAL_REVIEW'),
  );

  constructor() {
    effect(onCleanup => {
      this.reloadToken();
      const purchaseOrderId = this.purchaseOrderId();

      if (!purchaseOrderId) {
        this.state.set('idle');
        this.errorKey.set(null);
        this.transmissions.set([]);
        return;
      }

      this.state.set('loading');
      this.errorKey.set(null);

      const sub: Subscription = this.service.listForPurchaseOrder(purchaseOrderId).subscribe({
        next: list => {
          this.transmissions.set(list);
          this.state.set(list.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          this.transmissions.set([]);
          if (err instanceof HttpErrorResponse && err.status === 404) {
            // Not every purchase order goes out electronically. That is a fact
            // about the order, not a failure of this panel.
            this.state.set('empty');
            this.errorKey.set(null);
            return;
          }
          const outcome = mapSupplierError(err, 'POSITIVITY.TRANSMISSION.ERROR.LOAD');
          // ADR-0031: state first, then the key.
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });

      onCleanup(() => sub.unsubscribe());
    });
  }

  stateLabelKey(transmission: SupplierOrderTransmission | null): string {
    const state = transmission?.state;
    return state ? `POSITIVITY.TRANSMISSION.STATE.${state}` : 'POSITIVITY.TRANSMISSION.STATE.UNKNOWN';
  }

  stateTone(transmission: SupplierOrderTransmission | null): SupplierStatusTone {
    const state = transmission?.state;
    return state ? STATE_TONES[state] : 'neutral';
  }

  stateIcon(transmission: SupplierOrderTransmission | null): string {
    const state = transmission?.state;
    return state ? STATE_ICONS[state] : 'help';
  }

  /** Vendor-quoted delivery date prepared for `DatePipe` (ADR-0038). */
  deliveryDateFor(value: string | null | undefined): string | null {
    return toDatePipeInput(value);
  }

  /** Re-read the transmissions. Re-runs the effect, cancelling anything in flight. */
  reload(): void {
    this.reloadToken.update(value => value + 1);
  }
}
