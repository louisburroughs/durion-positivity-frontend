import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { SupplierShipmentService } from '../../services/supplier-shipment.service';
import { SupplierShipmentEvent } from '../../models/supplier-shipment.models';
import { mapSupplierError } from '../../utils/supplier-error.util';
import {
  SupplierEventTimelineComponent,
  SupplierTimelineEntry,
} from '../supplier-event-timeline/supplier-event-timeline.component';

type PanelState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

/**
 * Carrier/vendor event codes this UI can name.
 *
 * A display aid, never a filter: an unrecognised code is rendered verbatim on
 * the timeline, because a shipment event nobody has taught the frontend about is
 * still a shipment heading for the dock. Read through a getter, never a
 * class-field initialiser — see `utils/supplier-capability-keys.ts`.
 */
const EVENT_LABEL_KEYS: Readonly<Record<string, string>> = {
  PICKED_UP: 'POSITIVITY.SHIPMENT.EVENT.PICKED_UP',
  SHIPPED: 'POSITIVITY.SHIPMENT.EVENT.SHIPPED',
  IN_TRANSIT: 'POSITIVITY.SHIPMENT.EVENT.IN_TRANSIT',
  OUT_FOR_DELIVERY: 'POSITIVITY.SHIPMENT.EVENT.OUT_FOR_DELIVERY',
  DELIVERED: 'POSITIVITY.SHIPMENT.EVENT.DELIVERED',
  EXCEPTION: 'POSITIVITY.SHIPMENT.EVENT.EXCEPTION',
  RETURNED: 'POSITIVITY.SHIPMENT.EVENT.RETURNED',
};

const EVENT_ICONS: Readonly<Record<string, string>> = {
  PICKED_UP: 'package_2',
  SHIPPED: 'local_shipping',
  IN_TRANSIT: 'local_shipping',
  OUT_FOR_DELIVERY: 'local_shipping',
  DELIVERED: 'inventory_2',
  EXCEPTION: 'warning',
  RETURNED: 'trending_flat',
};

/**
 * Shipment-event timeline for a committed purchase order (issue #193).
 *
 * ── Placement ───────────────────────────────────────────────────────────────
 * Hosted on `po-detail` alongside the transmission panel: receiving staff open
 * the committed order to ask what is arriving and when. The inventory host gains
 * imports and markup only — no supplier HTTP call and no supplier model crosses
 * into the inventory domain (ADR-0010).
 *
 * ── Append-only, and isolated from its host ─────────────────────────────────
 * There is no dismiss, hide, acknowledge or re-order control, and the service
 * behind this panel exposes no write path at all. The panel owns its own state
 * signals, so a carrier feed outage or a `403` degrades this section and leaves
 * the purchase order itself untouched.
 *
 * ── Two time facts per event ────────────────────────────────────────────────
 * Events are ordered by the carrier's `occurredAt`; the platform's `receivedAt`
 * is shown as a separately labelled fact on the entry. A late-ingested event is
 * then visibly late *to us*, not misread as a late shipment.
 */
@Component({
  selector: 'app-supplier-shipment-panel',
  standalone: true,
  imports: [TranslatePipe, SupplierEventTimelineComponent],
  templateUrl: './supplier-shipment-panel.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-shipment-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierShipmentPanelComponent {
  private readonly service = inject(SupplierShipmentService);

  /** Platform purchase-order UUID. Null while the host resolves the route. */
  readonly purchaseOrderId = input<string | null>(null);

  readonly state = signal<PanelState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly events = signal<SupplierShipmentEvent[]>([]);

  private readonly reloadToken = signal(0);

  /** Read at access time, not at class-field-init time (bundler hazard). */
  get eventLabelKeys(): Readonly<Record<string, string>> {
    return EVENT_LABEL_KEYS;
  }

  /**
   * Events oldest-first.
   *
   * A copy is sorted, never the source array: the backend list is the record and
   * this component only chooses a reading order for it.
   */
  readonly timelineEntries = computed<SupplierTimelineEntry[]>(() =>
    this.events()
      .slice()
      .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
      .map(event => this.toTimelineEntry(event)),
  );

  constructor() {
    effect(onCleanup => {
      this.reloadToken();
      const purchaseOrderId = this.purchaseOrderId();

      if (!purchaseOrderId) {
        this.state.set('idle');
        this.errorKey.set(null);
        this.events.set([]);
        return;
      }

      this.state.set('loading');
      this.errorKey.set(null);

      const sub: Subscription = this.service.getShipmentTimeline(purchaseOrderId).subscribe({
        next: timeline => {
          this.events.set(timeline.events);
          this.state.set(timeline.events.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          this.events.set([]);
          if (err instanceof HttpErrorResponse && err.status === 404) {
            this.state.set('empty');
            this.errorKey.set(null);
            return;
          }
          const outcome = mapSupplierError(err, 'POSITIVITY.SHIPMENT.ERROR.LOAD');
          // ADR-0031: state first, then the key.
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });

      onCleanup(() => sub.unsubscribe());
    });
  }

  /** Retry after a degraded read. Re-runs the effect, cancelling anything in flight. */
  reload(): void {
    this.reloadToken.update(value => value + 1);
  }

  private toTimelineEntry(event: SupplierShipmentEvent): SupplierTimelineEntry {
    const details: SupplierTimelineEntry['details'] = [];
    if (event.eventDescription) {
      details.push({
        termKey: 'POSITIVITY.SHIPMENT.DESCRIPTION',
        value: event.eventDescription,
      });
    }
    if (event.carrierCode) {
      details.push({ termKey: 'POSITIVITY.SHIPMENT.CARRIER', value: event.carrierCode });
    }
    if (event.trackingReference) {
      details.push({ termKey: 'POSITIVITY.SHIPMENT.TRACKING', value: event.trackingReference });
    }
    if (typeof event.packageCount === 'number') {
      details.push({
        termKey: 'POSITIVITY.SHIPMENT.PACKAGES',
        value: String(event.packageCount),
      });
    }
    details.push({
      termKey: 'POSITIVITY.SHIPMENT.RECEIVED_AT',
      value: event.receivedAt,
      datetime: event.receivedAt,
    });

    const labelKey = EVENT_LABEL_KEYS[event.eventCode];
    return {
      id: event.shipmentEventId,
      occurredAt: event.occurredAt,
      labelKey: labelKey ?? null,
      labelText: labelKey ? null : event.eventCode,
      icon: EVENT_ICONS[event.eventCode] ?? 'local_shipping',
      details,
    };
  }
}
