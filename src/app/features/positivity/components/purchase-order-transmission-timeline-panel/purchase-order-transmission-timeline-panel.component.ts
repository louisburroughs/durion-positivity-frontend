import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { PurchaseOrderTransmissionTimelineService } from '../../services/purchase-order-transmission-timeline.service';
import { PurchaseOrderTransmissionEvent } from '../../models/purchase-order-transmission-timeline.models';
import { mapSupplierError } from '../../utils/supplier-error.util';
import { toDatePipeInput } from '../../utils/supplier-freshness.util';

type PanelState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

/** Human labels for the event-type token; an unrecognised token still renders verbatim. */
const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set([
  'CONFIRMED',
  'REJECTED',
  'STATUS_CHANGED',
  'REVIEW_REQUIRED',
]);

/**
 * Purchase-order vendor transmission timeline (issue #215; #1638 decision 2).
 *
 * ── po-detail hosts this, read-only ─────────────────────────────────────────
 * Same placement rule as `supplier-transmission-panel` (#191 §8): po-detail
 * shows a committed order, which is when a transmission timeline can exist.
 * No supplier HTTP call and no supplier model cross into the inventory domain
 * from here (ADR-0010) — this panel talks to `@durion-sdk/order` only.
 *
 * ── This panel can never damage its host ────────────────────────────────────
 * Own `state`/`errorKey` signals, own injected service. A gateway outage lands
 * here and nowhere else.
 *
 * ── The whole history, in the server's order ────────────────────────────────
 * `listPurchaseOrderTransmissionEvents` replaces both the retired
 * shipment-event timeline and the retired transmission-status history (#201).
 * Entries are rendered in exactly the order the backend returns them —
 * vendor-clock `observedAt` ascending, tie-broken server-side — and both
 * `observedAt` and `recordedAt` are shown; they are never collapsed into one
 * timestamp.
 */
@Component({
  selector: 'app-purchase-order-transmission-timeline-panel',
  standalone: true,
  imports: [DatePipe, TranslatePipe],
  templateUrl: './purchase-order-transmission-timeline-panel.component.html',
  styleUrls: [
    '../../positivity-shared.css',
    './purchase-order-transmission-timeline-panel.component.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseOrderTransmissionTimelinePanelComponent {
  private readonly service = inject(PurchaseOrderTransmissionTimelineService);

  /** Platform purchase-order UUID. Null while the host resolves the route. */
  readonly purchaseOrderId = input<string | null>(null);

  readonly state = signal<PanelState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly events = signal<PurchaseOrderTransmissionEvent[]>([]);
  readonly page = signal(0);
  readonly totalPages = signal(0);

  /** Bumped to force a re-fetch of the current page (`reload()`). */
  private readonly reloadToken = signal(0);
  private readonly requestedPage = signal(0);

  constructor() {
    effect(onCleanup => {
      this.reloadToken();
      const purchaseOrderId = this.purchaseOrderId();
      const page = this.requestedPage();

      if (!purchaseOrderId) {
        this.state.set('idle');
        this.errorKey.set(null);
        this.events.set([]);
        return;
      }

      this.state.set('loading');
      this.errorKey.set(null);

      const sub: Subscription = this.service.listForPurchaseOrder(purchaseOrderId, page).subscribe({
        next: result => {
          this.events.set(result.items);
          this.page.set(result.page);
          this.totalPages.set(result.totalPages);
          this.state.set(result.items.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          this.events.set([]);
          if (err instanceof HttpErrorResponse && err.status === 404) {
            // An order that was never transmitted simply has an empty
            // timeline; that is a fact about the order, not a failure.
            this.state.set('empty');
            this.errorKey.set(null);
            return;
          }
          const outcome = mapSupplierError(err, 'POSITIVITY.TRANSMISSION_TIMELINE.ERROR.LOAD');
          // ADR-0031: state first, then the key.
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });

      onCleanup(() => sub.unsubscribe());
    });
  }

  readonly hasPreviousPage = () => this.page() > 0;
  readonly hasNextPage = () => this.page() + 1 < this.totalPages();
  readonly pageNumber = () => this.page() + 1;

  previousPage(): void {
    if (this.hasPreviousPage()) {
      this.requestedPage.set(this.page() - 1);
    }
  }

  nextPage(): void {
    if (this.hasNextPage()) {
      this.requestedPage.set(this.page() + 1);
    }
  }

  /** Re-read the current page. Re-runs the effect, cancelling anything in flight. */
  reload(): void {
    this.reloadToken.update(value => value + 1);
  }

  eventTypeLabelKey(event: PurchaseOrderTransmissionEvent): string {
    return KNOWN_EVENT_TYPES.has(event.eventType)
      ? `POSITIVITY.TRANSMISSION_TIMELINE.EVENT_TYPE.${event.eventType}`
      : '';
  }

  /** Date-only vendor dates prepared for `DatePipe` (ADR-0038). */
  dateOnlyFor(value: string | null): string | null {
    return toDatePipeInput(value);
  }
}
