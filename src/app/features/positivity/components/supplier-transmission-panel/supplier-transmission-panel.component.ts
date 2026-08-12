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
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription, forkJoin } from 'rxjs';
import { SupplierOrderTransmissionService } from '../../services/supplier-order-transmission.service';
import {
  SupplierLineConfirmationOutcome,
  SupplierOrderStatusEvent,
  SupplierOrderTransmission,
  SupplierTransmissionState,
} from '../../models/supplier-order-transmission.models';
import { mapSupplierError } from '../../utils/supplier-error.util';
import { toDatePipeInput } from '../../utils/supplier-freshness.util';
import { StalenessIndicatorComponent } from '../staleness-indicator/staleness-indicator.component';
import {
  SupplierEventTimelineComponent,
  SupplierTimelineEntry,
} from '../supplier-event-timeline/supplier-event-timeline.component';
import { SupplierManualReviewActionsComponent } from '../supplier-manual-review-actions/supplier-manual-review-actions.component';
import { SupplierStatusChipComponent, SupplierStatusTone } from '../supplier-status-chip/supplier-status-chip.component';

type PanelState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

/** Tone + glyph per transmission state. Colour is redundant with the text label. */
const STATE_TONES: Readonly<Record<SupplierTransmissionState, SupplierStatusTone>> = {
  QUEUED: 'neutral',
  SENT: 'info',
  CONFIRMED: 'success',
  PARTIALLY_CONFIRMED: 'warning',
  REJECTED: 'danger',
  MANUAL_REVIEW: 'warning',
};

const STATE_ICONS: Readonly<Record<SupplierTransmissionState, string>> = {
  QUEUED: 'schedule',
  SENT: 'send',
  CONFIRMED: 'check_circle',
  PARTIALLY_CONFIRMED: 'rule',
  REJECTED: 'cancel',
  MANUAL_REVIEW: 'fact_check',
};

const OUTCOME_TONES: Readonly<Record<SupplierLineConfirmationOutcome, SupplierStatusTone>> = {
  ACCEPTED: 'success',
  REJECTED: 'danger',
  BACKORDERED: 'warning',
  PENDING: 'neutral',
};

const OUTCOME_ICONS: Readonly<Record<SupplierLineConfirmationOutcome, string>> = {
  ACCEPTED: 'check_circle',
  REJECTED: 'cancel',
  BACKORDERED: 'schedule',
  PENDING: 'hourglass_empty',
};

/**
 * Vendor transmission panel for a committed purchase order (issue #191).
 *
 * ── Open question #191 §8, ruled: po-detail hosts this ──────────────────────
 * `po-detail` renders an order that has already been committed, read-only; it is
 * the screen a procurement user opens to ask "what is happening with this
 * order?". `po-form` edits lines before commitment — a transmission state cannot
 * exist there — and receiving is about goods that have physically arrived, which
 * is downstream of the question this panel answers. So the panel lives on
 * `po-detail`, and the inventory host gains imports and markup only: no supplier
 * HTTP call and no supplier model crosses into the inventory domain (ADR-0010).
 *
 * ── This panel can never damage its host ────────────────────────────────────
 * It owns its own `state`/`errorKey` signals and injects its own service, like
 * the availability panel from wave B. A vendor outage or a `403` lands here and
 * nowhere else: the purchase order keeps rendering its lines, receipts and
 * totals exactly as before.
 *
 * ── No re-send path exists, deliberately ────────────────────────────────────
 * There is no control on this panel that re-transmits an order, and the service
 * behind it has no such method. A `MANUAL_REVIEW` order is ambiguous *because*
 * the vendor may already hold it; a retry button would convert that ambiguity
 * into a duplicate physical delivery. The only actions rendered are the ones the
 * backend delivers in `resolutionActions`, each behind a confirmation naming
 * that risk. `supplier-transmission-panel.component.spec.ts` asserts the absence
 * of any re-send affordance, and so does `po-detail.component.spec.ts`.
 *
 * ── A raced resolution refreshes rather than dead-ends ──────────────────────
 * A `409` means the vendor moved while the operator was deciding. The panel
 * re-reads the transmission and shows a translated notice instead of an error
 * banner over facts that are already out of date: the operator's next decision
 * should be made against what the vendor says now.
 */
@Component({
  selector: 'app-supplier-transmission-panel',
  standalone: true,
  imports: [
    DatePipe,
    TranslatePipe,
    StalenessIndicatorComponent,
    SupplierEventTimelineComponent,
    SupplierManualReviewActionsComponent,
    SupplierStatusChipComponent,
  ],
  templateUrl: './supplier-transmission-panel.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-transmission-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierTransmissionPanelComponent {
  private readonly service = inject(SupplierOrderTransmissionService);
  private readonly destroyRef = inject(DestroyRef);

  /** Platform purchase-order UUID. Null while the host resolves the route. */
  readonly purchaseOrderId = input<string | null>(null);

  /** Human PO number, echoed into the resolution confirmation. Display only. */
  readonly poNumber = input<string | null>(null);

  /** Test seam for "now", forwarded to the freshness indicator. */
  readonly nowMs = input<number | null>(null);

  readonly state = signal<PanelState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly transmission = signal<SupplierOrderTransmission | null>(null);
  readonly history = signal<SupplierOrderStatusEvent[]>([]);
  readonly resolving = signal(false);
  /** True after a `409`: the vendor moved while the operator was deciding. */
  readonly racedByVendor = signal(false);

  private readonly reloadToken = signal(0);

  readonly transmissionState = computed(() => this.transmission()?.state ?? null);

  readonly lines = computed(() => this.transmission()?.lines ?? []);

  readonly hasLines = computed(() => this.lines().length > 0);

  readonly needsManualReview = computed(() => this.transmissionState() === 'MANUAL_REVIEW');

  readonly resolutionActions = computed(() => this.transmission()?.resolutionActions ?? []);

  readonly stateLabelKey = computed(() => {
    const state = this.transmissionState();
    return state ? `POSITIVITY.TRANSMISSION.STATE.${state}` : 'POSITIVITY.TRANSMISSION.STATE.UNKNOWN';
  });

  readonly stateTone = computed<SupplierStatusTone>(() => {
    const state = this.transmissionState();
    return state ? STATE_TONES[state] : 'neutral';
  });

  readonly stateIcon = computed(() => {
    const state = this.transmissionState();
    return state ? STATE_ICONS[state] : 'help';
  });

  /**
   * Status history oldest-first.
   *
   * A copy is sorted, never the source array: the backend list is the record and
   * this component only chooses a reading order for it.
   */
  readonly timelineEntries = computed<SupplierTimelineEntry[]>(() =>
    this.history()
      .slice()
      .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
      .map(event => this.toTimelineEntry(event)),
  );

  /** Read at access time, not at class-field-init time (bundler hazard). */
  get outcomeIcons(): Readonly<Record<SupplierLineConfirmationOutcome, string>> {
    return OUTCOME_ICONS;
  }

  constructor() {
    effect(onCleanup => {
      this.reloadToken();
      const purchaseOrderId = this.purchaseOrderId();

      if (!purchaseOrderId) {
        this.state.set('idle');
        this.errorKey.set(null);
        this.transmission.set(null);
        this.history.set([]);
        return;
      }

      this.state.set('loading');
      this.errorKey.set(null);

      const sub: Subscription = forkJoin({
        transmission: this.service.getTransmission(purchaseOrderId),
        history: this.service.getStatusHistory(purchaseOrderId),
      }).subscribe({
        next: result => {
          this.transmission.set(result.transmission);
          this.history.set(result.history.events);
          this.state.set('ready');
        },
        error: (err: unknown) => {
          this.transmission.set(null);
          this.history.set([]);
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

  /** Vendor-quoted ship date prepared for `DatePipe` (ADR-0038). */
  shipDateFor(value: string | null | undefined): string | null {
    return toDatePipeInput(value);
  }

  outcomeLabelKey(outcome: SupplierLineConfirmationOutcome): string {
    return `POSITIVITY.TRANSMISSION.OUTCOME.${outcome}`;
  }

  outcomeTone(outcome: SupplierLineConfirmationOutcome): SupplierStatusTone {
    return OUTCOME_TONES[outcome] ?? 'neutral';
  }

  outcomeIcon(outcome: SupplierLineConfirmationOutcome): string {
    return OUTCOME_ICONS[outcome] ?? 'help';
  }

  /** Re-read state and history. Re-runs the effect, cancelling anything in flight. */
  reload(): void {
    this.reloadToken.update(value => value + 1);
  }

  /**
   * Apply one backend-delivered resolution action.
   *
   * `action` arrived from the backend and is posted back untouched. On `409` the
   * panel refreshes instead of erroring — see the class doc.
   */
  resolve(action: string): void {
    const purchaseOrderId = this.purchaseOrderId();
    if (!purchaseOrderId || this.resolving()) {
      return;
    }

    this.resolving.set(true);
    this.racedByVendor.set(false);

    this.service
      .resolveManualReview(purchaseOrderId, action)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.resolving.set(false);
          this.reload();
        },
        error: (err: unknown) => {
          this.resolving.set(false);
          const outcome = mapSupplierError(err, 'POSITIVITY.TRANSMISSION.ERROR.RESOLVE');
          if (outcome.kind === 'conflict') {
            // The vendor moved first. Re-read rather than arguing with it.
            this.racedByVendor.set(true);
            this.reload();
            return;
          }
          // ADR-0031: state first, then the key.
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }

  private toTimelineEntry(event: SupplierOrderStatusEvent): SupplierTimelineEntry {
    const details: SupplierTimelineEntry['details'] = [];
    if (event.state && event.vendorStatus) {
      details.push({
        termKey: 'POSITIVITY.TRANSMISSION.HISTORY.VENDOR_STATUS',
        value: event.vendorStatus,
      });
    }
    if (event.note) {
      details.push({ termKey: 'POSITIVITY.TRANSMISSION.HISTORY.NOTE', value: event.note });
    }

    if (event.state) {
      return {
        id: event.statusEventId,
        occurredAt: event.occurredAt,
        labelKey: `POSITIVITY.TRANSMISSION.STATE.${event.state}`,
        icon: STATE_ICONS[event.state],
        details,
      };
    }

    if (event.vendorStatus) {
      // Unrecognised vendor token: shown verbatim so a new vendor status
      // appears on the timeline instead of silently vanishing from the record.
      return {
        id: event.statusEventId,
        occurredAt: event.occurredAt,
        labelText: event.vendorStatus,
        icon: 'help',
        details,
      };
    }

    return {
      id: event.statusEventId,
      occurredAt: event.occurredAt,
      labelKey: 'POSITIVITY.TRANSMISSION.HISTORY.UNKNOWN_STATUS',
      icon: 'help',
      details,
    };
  }
}
