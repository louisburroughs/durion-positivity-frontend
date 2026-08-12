import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { mapSupplierError } from '../../utils/supplier-error.util';

type PageState = 'idle' | 'loading' | 'ready' | 'error' | 'forbidden';

/**
 * Payload pane state. `payload-restricted` is its own state, distinct from
 * `error`: the metadata loaded fine, the caller simply lacks the tighter
 * audit-payload permission (ADR-0050 §7).
 */
type PayloadState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'payload-restricted'
  | 'payload-purged'
  | 'metadata-only'
  | 'error';

const OUTCOME_TONES: Readonly<Record<ExchangeOutcome, SupplierStatusTone>> = {
  SUCCESS: 'success',
  FAILURE: 'danger',
  TIMEOUT: 'warning',
  REJECTED: 'warning',
  CIRCUIT_OPEN: 'danger',
};

/**
 * Exchange audit detail: metadata header plus the two-pane request/response
 * view (issue #188).
 *
 * Payload access is a separate, tighter permission than reading exchange
 * metadata. This frontend has no fine-grained permission API — `AuthService`
 * exposes roles only and the JWT permission claim is opaque — so the payload
 * endpoint's `403` is treated as the authoritative answer and rendered as a
 * dedicated `payload-restricted` pane. Guessing at permissions client-side would
 * either hide a pane the user is entitled to or promise one they are not.
 *
 * Payloads are rendered exactly as delivered: redaction happens server-side and
 * this component never attempts to reverse or reveal it. Two further honest
 * states are distinguished from an outright failure: `metadata-only` (capture is
 * disabled for the binding) and `payload-purged` (the record aged past its
 * retention window).
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

  readonly payloadState = signal<PayloadState>('idle');
  readonly payloadErrorKey = signal<string | null>(null);
  readonly payload = signal<ExchangePayloadView | null>(null);

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
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.AUDIT.ERROR.LOAD_DETAIL');
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }

  loadPayload(exchangeId: string): void {
    this.payloadState.set('loading');
    this.payloadErrorKey.set(null);

    this.service
      .getExchangePayload(exchangeId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: view => {
          this.payload.set(view);
          if (view.payloadPurgedAt) {
            this.payloadState.set('payload-purged');
            return;
          }
          if (view.captureLevel === 'METADATA_ONLY') {
            this.payloadState.set('metadata-only');
            return;
          }
          this.payloadState.set('ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.AUDIT.ERROR.LOAD_PAYLOAD');
          if (outcome.kind === 'forbidden') {
            // Backend `403` is the permission authority; render the restricted pane.
            this.payload.set(null);
            this.payloadState.set('payload-restricted');
            this.payloadErrorKey.set('POSITIVITY.AUDIT.PAYLOAD.RESTRICTED');
            return;
          }
          this.payload.set(null);
          this.payloadState.set('error');
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
