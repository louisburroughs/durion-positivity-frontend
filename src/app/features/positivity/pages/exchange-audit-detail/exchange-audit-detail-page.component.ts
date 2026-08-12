import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription, distinctUntilChanged, map } from 'rxjs';
import {
  SupplierStatusChipComponent,
  SupplierStatusTone,
} from '../../components/supplier-status-chip/supplier-status-chip.component';
import { SupplierExchangeAuditService } from '../../services/supplier-exchange-audit.service';
import {
  ExchangeAuditRecord,
  ExchangeOutcome,
  ExchangePayloadView,
} from '../../models/supplier-exchange.models';
import {
  KNOWN_EXCHANGE_OUTCOMES,
  KNOWN_SUPPLIER_CAPABILITIES,
} from '../../utils/supplier-capability-keys';
import { mapSupplierError } from '../../utils/supplier-error.util';

type PageState = 'idle' | 'loading' | 'ready' | 'error' | 'forbidden';

/**
 * Payload pane state.
 *
 * `payload-restricted` is its own state, distinct from `error`: the metadata
 * loaded fine, the caller simply lacks the tighter audit-payload permission
 * (ADR-0050 §7). `metadata-only`, `purged` and `not-captured` are likewise not
 * errors — they are three different, normal reasons for a null payload, and
 * collapsing them into one message would leave an operator unable to tell
 * "policy said no", "it aged out" and "there was never a body" apart.
 */
type PayloadState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'payload-restricted'
  | 'purged'
  | 'metadata-only'
  | 'not-captured'
  | 'error';

const OUTCOME_TONES: Readonly<Record<string, SupplierStatusTone>> = {
  SUCCESS: 'success',
  FAILURE: 'danger',
  TIMEOUT: 'warning',
  REJECTED: 'warning',
  CIRCUIT_OPEN: 'danger',
};

/**
 * Exchange audit detail: metadata header, the retry sequence, and the two-pane
 * request/response view (issue #188).
 *
 * ── Retries are separate rows ────────────────────────────────────────────────
 * One logical supplier call becomes several audit rows sharing a
 * `correlationId`, with a 1-based `attempt`. Looking at a single row therefore
 * tells you almost nothing about whether the call eventually succeeded, so this
 * page traces the whole correlation (oldest first — the order it happened) and
 * shows the sequence alongside the row you opened.
 *
 * ── Payload access ───────────────────────────────────────────────────────────
 * Reading payload content is a separate, individually audited call: an access
 * record naming the caller is written in the same transaction, and the content
 * is withheld if that record cannot be written. It answers `403` without the
 * tighter permission. This frontend has no fine-grained permission API, so that
 * `403` is treated as the authoritative answer and rendered as a dedicated
 * restricted pane rather than guessed at client-side.
 *
 * When `redacted` is true the documents are **not** the wire bytes: sensitive
 * fields were replaced at capture time and the originals were never persisted,
 * so they cannot be recovered from anywhere. The pane says so, because an
 * operator comparing against a vendor's records needs to know the difference.
 *
 * The screen is read-only — no retry, no replay.
 */
@Component({
  selector: 'app-exchange-audit-detail-page',
  standalone: true,
  imports: [DatePipe, RouterLink, TranslatePipe, SupplierStatusChipComponent],
  templateUrl: './exchange-audit-detail-page.component.html',
  styleUrls: ['../../positivity-shared.css', './exchange-audit-detail-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExchangeAuditDetailPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(SupplierExchangeAuditService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly exchange = signal<ExchangeAuditRecord | null>(null);
  readonly exchangeId = signal<string | null>(null);

  readonly payloadErrorKey = signal<string | null>(null);
  readonly payload = signal<ExchangePayloadView | null>(null);

  /** How the payload *call* ended. What that means for the pane is derived below. */
  private readonly payloadLoad = signal<
    'idle' | 'loading' | 'loaded' | 'restricted' | 'error'
  >('idle');

  /**
   * The pane's state.
   *
   * Derived rather than assigned because it depends on **two** responses that
   * race: the payload body and the summary's `payloadsPurgedAt`. Setting it from
   * whichever callback happened to land first would make "purged" and "never
   * captured" depend on network timing.
   */
  readonly payloadState = computed<PayloadState>(() => {
    switch (this.payloadLoad()) {
      case 'idle':
        return 'idle';
      case 'loading':
        return 'loading';
      case 'restricted':
        return 'payload-restricted';
      case 'error':
        return 'error';
      default:
        break;
    }

    const view = this.payload();
    if (!view) {
      return 'error';
    }
    // METADATA_ONLY first: that level never captured content at all.
    if (view.captureLevel === 'METADATA_ONLY') {
      return 'metadata-only';
    }
    if (view.requestPayload !== null || view.responsePayload !== null) {
      return 'ready';
    }
    // Only the summary can tell "aged out" from "there was never a body".
    return this.exchange()?.payloadsPurgedAt ? 'purged' : 'not-captured';
  });

  /** Every attempt of this logical call, oldest first. */
  readonly attempts = signal<ExchangeAuditRecord[]>([]);
  readonly attemptsFailed = signal(false);

  /** A retry sequence is only worth showing when there was more than one attempt. */
  readonly hasRetrySequence = computed(() => this.attempts().length > 1);

  /**
   * True at `METADATA_ONLY`, where the query string is stripped and the stored
   * value is the path alone — so it must not be labelled as a full URI.
   */
  readonly endpointIsPathOnly = computed(
    () => this.exchange()?.captureLevel === 'METADATA_ONLY',
  );

  constructor() {
    effect(onCleanup => {
      const sub: Subscription = this.route.paramMap
        .pipe(
          map(params => params.get('exchangeId')),
          distinctUntilChanged(),
        )
        .subscribe(exchangeId => {
          this.exchangeId.set(exchangeId);
          if (exchangeId) {
            this.loadExchange(exchangeId);
            this.loadPayload(exchangeId);
          }
        });

      onCleanup(() => sub.unsubscribe());
    });
  }

  outcomeTone(outcome: ExchangeOutcome): SupplierStatusTone {
    return OUTCOME_TONES[outcome] ?? 'neutral';
  }

  isKnownOutcome(outcome: ExchangeOutcome): boolean {
    return KNOWN_EXCHANGE_OUTCOMES.includes(outcome);
  }

  isKnownCapability(capability: string): boolean {
    return KNOWN_SUPPLIER_CAPABILITIES.includes(capability);
  }

  loadExchange(exchangeId: string): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.service
      .getExchange(exchangeId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: record => {
          this.exchange.set(record);
          this.state.set('ready');
          this.loadAttempts(record.correlationId);
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.AUDIT.ERROR.LOAD_DETAIL');
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }

  /**
   * Trace the correlation.
   *
   * Deliberately non-fatal: the row itself has loaded, so a failure here costs
   * the retry sequence and nothing else.
   */
  private loadAttempts(correlationId: string): void {
    if (!correlationId) {
      this.attempts.set([]);
      return;
    }

    this.attemptsFailed.set(false);
    this.service
      .traceCorrelation(correlationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: page => this.attempts.set(page.items),
        error: () => {
          this.attempts.set([]);
          this.attemptsFailed.set(true);
        },
      });
  }

  loadPayload(exchangeId: string): void {
    this.payloadLoad.set('loading');
    this.payloadErrorKey.set(null);

    this.service
      .getExchangePayload(exchangeId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: view => {
          this.payload.set(view);
          this.payloadLoad.set('loaded');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.AUDIT.ERROR.LOAD_PAYLOAD');
          this.payload.set(null);
          if (outcome.kind === 'forbidden') {
            // Backend `403` is the permission authority; render the restricted pane.
            this.payloadLoad.set('restricted');
            this.payloadErrorKey.set('POSITIVITY.AUDIT.PAYLOAD.RESTRICTED');
            return;
          }
          this.payloadLoad.set('error');
          this.payloadErrorKey.set(outcome.errorKey);
        },
      });
  }

  reload(): void {
    const exchangeId = this.exchangeId();
    if (exchangeId) {
      this.loadExchange(exchangeId);
      this.loadPayload(exchangeId);
    }
  }
}
