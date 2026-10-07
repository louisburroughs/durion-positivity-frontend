import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  InjectionToken,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription, map } from 'rxjs';
import { canAccess } from '../../../../core/security/route-access';
import { ACCOUNTING_PAGE, ACCOUNTING_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { MoneyPipe } from '../../../../shared/money.pipe';
import { HelpDisclosureComponent } from '../../components/help-disclosure/help-disclosure.component';
import {
  MatchMessage,
  PaymentApplied,
  PaymentMatchComponent,
} from '../../components/payment-match/payment-match.component';
import { HomePageState } from '../../models/accounting-home.models';
import {
  AutomaticApplication,
  AutomaticApplicationsList,
  ReceivablesTotals,
  WaitingPayment,
  WaitingPaymentsList,
} from '../../models/customer-payments.models';
import { toBankRecFailure } from '../../services/bank-reconciliation.service';
import { CustomerPaymentsService } from '../../services/customer-payments.service';
import { toDatePipeInput } from '../../utils/date-only.util';
import { toIsoDate } from '../../utils/date-window.util';
import { HomeRegion } from '../../utils/home-region';
import { isPossibleDuplicate, paymentMethodKey } from '../../utils/payment-match';

/** The page's clock. Tests inject a fixed instant; "today" is re-read on every load (ADR-0038). */
export const CUSTOMER_PAYMENTS_CLOCK = new InjectionToken<() => Date>('CUSTOMER_PAYMENTS_CLOCK', {
  providedIn: 'root',
  factory: () => () => new Date(),
});

/** Phone and small-tablet widths, where the selected payment stacks below the list (§5.7). */
export const SMALL_SCREEN_QUERY = '(width <= 767px)';

/** "This week": applications made in the last seven local days. */
export const AUTOMATIC_WINDOW_DAYS = 7;

/** A reason for Undo, as `reversePaymentApplication` requires (10–1000 characters). */
export const UNDO_REASON_MIN = 10;
export const UNDO_REASON_MAX = 1000;

/** The undo outcomes with their own copy; anything else reads as "not undone". */
const UNDO_ERROR_KEYS: Readonly<Record<string, string>> = {
  WHOLE_REQUEST_REVERSAL_REQUIRED: 'ACCOUNTING.CUSTOMER_PAYMENTS.AUTOMATIC.ERROR.WHOLE_REQUEST',
};

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Customer payments (CAP:550 S6; SPEC-accounting-workspace §5.3, §8.1 row
 * `payments`): the header with its four steps, the served stat cards, the
 * payments waiting to be matched, "Matched automatically this week" and the
 * selected payment's match panel ({@link PaymentMatchComponent}).
 *
 * Each read is a {@link HomeRegion} with its own status and sequence, keyed by
 * what it answers; a refused read names its permission and stops rendering
 * (ADR-0063, ADR-0064 §6). The list and the cards are gated on the codes their
 * reads enforce; Undo on `accounting:payment:reverse` at the control and in
 * the handler (ADR-0040 §6a). Amounts render as served; payment, customer and
 * application ids live only in requests and the `paymentId` query parameter
 * (P7, P8).
 */
@Component({
  selector: 'app-customer-payments-page',
  standalone: true,
  imports: [DatePipe, MoneyPipe, RouterLink, TranslatePipe, ModalDialogDirective, HelpDisclosureComponent, PaymentMatchComponent],
  templateUrl: './customer-payments-page.component.html',
  styleUrls: ['../../bank-reconciliation-shared.css', './customer-payments-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerPaymentsPageComponent {
  private readonly auth = inject(AuthService);
  private readonly service = inject(CustomerPaymentsService);
  private readonly route = inject(ActivatedRoute);
  private readonly clock = inject(CUSTOMER_PAYMENTS_CLOCK);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  private readonly match = viewChild(PaymentMatchComponent);
  private readonly listHeading = viewChild<ElementRef<HTMLElement>>('listHeading');
  private readonly automaticHeading = viewChild<ElementRef<HTMLElement>>('automaticHeading');

  // ── Page state (ADR-0031) ──────────────────────────────────────────────
  readonly state = signal<HomePageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly today = signal(startOfLocalDay(this.clock()));

  // ── Gates (the unknown-perm_bits case follows canAccess) ────────────────
  readonly canSeePayments = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_PAGE.customerPayments }));
  readonly canSeeCards = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.homeReceivablesLane }));
  readonly canOpenWhoOwesWhat = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.booksSummary }));
  readonly canUndo = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.paymentReverse }));
  readonly codes = {
    apply: ACCOUNTING_PAGE.customerPayments[0],
    reporting: ACCOUNTING_SECTION.homeReceivablesLane[0],
    reverse: ACCOUNTING_SECTION.paymentReverse[0],
  } as const;

  // ── Regions ────────────────────────────────────────────────────────────
  readonly payments = new HomeRegion<WaitingPaymentsList>(ok => this.onPaymentsSettled(ok));
  readonly receivables = new HomeRegion<ReceivablesTotals>(() => this.settlePage());
  readonly automatic = new HomeRegion<AutomaticApplicationsList>();
  private readonly allRegions: readonly HomeRegion<unknown>[] = [this.payments, this.receivables, this.automatic];

  private readonly asOfKey = computed(() => toIsoDate(this.today()));
  /** The start of the automatic window: local midnight seven days back (ADR-0038 §8), as an instant. */
  readonly since = computed(() => {
    const today = this.today();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() - AUTOMATIC_WINDOW_DAYS).toISOString();
  });

  /** Every data view requires `!denied()` and the key it answers (ADR-0063 §1, ADR-0064 §6). */
  // ...and the live permission: data read before a code was revoked stops rendering at once (ADR-0040, ADR-0064 §6).
  readonly paymentsData = computed(() =>
    this.canSeePayments() && !this.payments.denied() && this.payments.dataKey() === 'AVAILABLE'
      ? this.payments.data()
      : null,
  );
  readonly receivablesData = computed(() =>
    this.canSeeCards() && !this.receivables.denied() && this.receivables.dataKey() === this.asOfKey()
      ? this.receivables.data()
      : null,
  );
  readonly automaticData = computed(() =>
    this.canSeePayments() && !this.automatic.denied() && this.automatic.dataKey() === this.since()
      ? this.automatic.data()
      : null,
  );

  // ── Selection ─────────────────────────────────────────────────────────
  /** The selected payment as last seen: it stays while the panel shows its result, even once it leaves the list. */
  readonly selected = signal<WaitingPayment | null>(null);
  /** The panel showed an apply result for this payment: keep it after it leaves the list. */
  private resultFor: string | null = null;
  private readonly queryPaymentId = toSignal(
    this.route.queryParamMap.pipe(map(params => params.get('paymentId'))),
    { initialValue: this.route.snapshot?.queryParamMap?.get('paymentId') ?? null },
  );
  /** The `paymentId` query parameter was applied, or found not waiting (said once). */
  private queryHandled: string | null = null;
  readonly queryNotWaiting = signal(false);

  readonly methodKey = paymentMethodKey;
  readonly possibleDuplicate = isPossibleDuplicate;
  readonly toDate = toDatePipeInput;

  // ── Undo (S2) ─────────────────────────────────────────────────────────
  readonly undoTarget = signal<AutomaticApplication | null>(null);
  readonly undoReason = signal('');
  readonly undoing = signal(false);
  readonly undoErrorKey = signal<{ key: string; params: Readonly<Record<string, unknown>> } | null>(null);
  readonly undoReasonValid = computed(() => {
    const length = this.undoReason().trim().length;
    return length >= UNDO_REASON_MIN && length <= UNDO_REASON_MAX;
  });
  readonly undoMin = UNDO_REASON_MIN;
  readonly undoMax = UNDO_REASON_MAX;
  private undoSubscription: Subscription | null = null;
  private undoToken = 0;

  /** The page's polite announcement: one live region outside every `@if` (ADR-0029 §8.8). */
  readonly announcement = signal<{ key: string; params: Readonly<Record<string, unknown>> } | null>(null);

  /** `tid|sub` the held data belongs to; seeded so the effect's first run is not a change (S4 precedent). */
  private trackedIdentity = this.identity();

  constructor() {
    this.destroyRef.onDestroy(() => {
      for (const region of this.allRegions) region.dispose();
      this.undoToken++;
      this.undoSubscription?.unsubscribe();
    });
    // ADR-0063 §7: another tenant or person invalidates every read in flight and clears the page.
    effect(() => {
      const identity = this.identity();
      if (identity === this.trackedIdentity) return;
      this.trackedIdentity = identity;
      untracked(() => {
        this.resetForIdentity();
        this.refresh();
      });
    });
    // A `paymentId` query parameter (S4's home links here) preselects once the list holds it.
    effect(() => {
      this.queryPaymentId();
      this.paymentsData();
      untracked(() => this.applyQuerySelection());
    });
    this.refresh();
  }

  /** `tid|sub`, each half percent-encoded so no value can contain the delimiter. */
  private identity(): string {
    const part = (value: string | null | undefined): string => encodeURIComponent(value?.trim() ?? '');
    return `${part(this.auth.tenantId())}|${part(this.auth.currentUserClaims()?.sub)}`;
  }

  private resetForIdentity(): void {
    for (const region of this.allRegions) region.reset();
    this.undoToken++;
    this.undoSubscription?.unsubscribe();
    this.undoSubscription = null;
    this.undoing.set(false);
    this.undoTarget.set(null);
    this.undoReason.set('');
    this.undoErrorKey.set(null);
    this.selected.set(null);
    this.resultFor = null;
    this.writeInFlightFor.set(null);
    this.queryHandled = null;
    this.queryNotWaiting.set(false);
    this.announcement.set(null);
    this.state.set('idle');
    this.errorKey.set(null);
  }

  // ── Loading ───────────────────────────────────────────────────────────
  /** Reads every permitted region that has not been refused (ADR-0064 §6). */
  refresh(): void {
    this.today.set(startOfLocalDay(this.clock()));
    if (this.state() !== 'ready') {
      this.state.set('loading');
      this.errorKey.set(null);
    }
    if (this.canSeePayments()) {
      if (!this.payments.denied()) this.loadPayments();
      if (!this.automatic.denied()) this.loadAutomatic();
    }
    if (this.canSeeCards() && !this.receivables.denied()) this.loadReceivables();
    this.settlePage();
  }

  private loadPayments(): void {
    this.payments.load(this.service.waitingPayments(), 'AVAILABLE');
  }

  private loadReceivables(): void {
    const asOf = this.asOfKey();
    this.receivables.load(this.service.receivablesTotals(asOf), asOf);
  }

  private loadAutomatic(): void {
    const since = this.since();
    this.automatic.load(this.service.automaticApplications(since), since);
  }

  /**
   * Re-reads "today" (ADR-0038 §6). The aging and the automatic window are
   * keyed by the date, so once local midnight has passed each permitted one
   * is read again for the new day; otherwise its held data no longer matches
   * the current key and the section would render nothing.
   */
  private advanceToday(): void {
    this.today.set(startOfLocalDay(this.clock()));
    if (this.canSeeCards() && !this.receivables.denied() && this.receivables.issuedKey() !== this.asOfKey()) {
      this.loadReceivables();
    }
    if (this.canSeePayments() && !this.automatic.denied() && this.automatic.issuedKey() !== this.since()) {
      this.loadAutomatic();
    }
  }

  retryPayments(): void {
    this.advanceToday();
    this.loadPayments();
    this.focusAfterRender(() => this.listHeading()?.nativeElement.focus());
  }

  retryReceivables(): void {
    const before = this.receivables.issuedKey();
    this.advanceToday();
    // advanceToday already read it for a new day; otherwise this is the retry's own read.
    if (this.receivables.issuedKey() === before) this.loadReceivables();
  }

  retryAutomatic(): void {
    const before = this.automatic.issuedKey();
    this.advanceToday();
    if (this.automatic.issuedKey() === before) this.loadAutomatic();
    this.focusAfterRender(() => this.automaticHeading()?.nativeElement.focus());
  }

  /**
   * `ready` once the list has answered; `error` only when the list failed for a
   * reason other than authorization — a refused list names its permission
   * instead (ADR-0064 §4, §6).
   */
  private settlePage(): void {
    if (!this.canSeePayments()) {
      this.state.set('ready');
      this.errorKey.set(null);
      return;
    }
    const status = this.payments.status();
    if (status === 'PENDING') return;
    if (status === 'FAILED' && !this.payments.denied() && !this.paymentsData()) {
      this.state.set('error');
      this.errorKey.set('ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.LOAD');
      return;
    }
    this.state.set('ready');
    this.errorKey.set(null);
  }

  /**
   * The list answered. The selected payment follows its re-read row; one that
   * left the list keeps its panel only while that panel shows an apply result,
   * otherwise the selection clears and focus moves to the list heading.
   */
  private onPaymentsSettled(ok: boolean): void {
    this.settlePage();
    if (this.payments.denied()) {
      // Refused: nothing read under this permission keeps rendering, the panel included (ADR-0064 §6).
      this.selected.set(null);
      this.writeInFlightFor.set(null);
      this.resultFor = null;
      return;
    }
    if (!ok) return;
    const current = this.selected();
    if (!current) return;
    const fresh = this.paymentsData()?.items.find(item => item.paymentId === current.paymentId) ?? null;
    if (fresh) {
      this.selected.set(fresh);
      return;
    }
    if (this.resultFor === current.paymentId) return;
    this.selected.set(null);
    this.writeInFlightFor.set(null);
    this.focusAfterRender(() => this.listHeading()?.nativeElement.focus());
  }

  private applyQuerySelection(): void {
    const paymentId = this.queryPaymentId();
    if (!paymentId || this.queryHandled === paymentId) return;
    const list = this.paymentsData();
    if (!list) return;
    this.queryHandled = paymentId;
    const payment = list.items.find(item => item.paymentId === paymentId);
    if (payment) {
      this.select(payment);
    } else {
      this.queryNotWaiting.set(true);
    }
  }

  // ── Selection ─────────────────────────────────────────────────────────
  /** The selected panel's apply / credit / refund request is in flight (between `writeStarted` and its settle or release). */
  private readonly writeInFlightFor = signal<string | null>(null);
  /**
   * While a write is in flight no other payment can be chosen: switching would
   * reset the panel and rotate the key while the first request is unresolved,
   * so A → B → A could apply A twice (AC 3, ADR-0063 §1). The lock holds only
   * while the writing payment is still the selected panel.
   */
  readonly paymentLock = computed(() => {
    const writing = this.writeInFlightFor();
    return !!writing && writing === this.selected()?.paymentId && !this.payments.denied();
  });

  /** Another payment discards the draft and rotates its key (the panel does both on a new payment). */
  select(payment: WaitingPayment): void {
    if (!this.canSeePayments()) return;
    if (this.paymentLock() && this.selected()?.paymentId !== payment.paymentId) return;
    this.queryNotWaiting.set(false);
    if (this.selected()?.paymentId !== payment.paymentId) {
      this.resultFor = null;
      // Only reachable with the lock off: any flag left by a panel that went away (and took its
      // cancelled request with it) must not lock the newly chosen payment.
      this.writeInFlightFor.set(null);
    }
    this.selected.set(payment);
    if (this.isSmallScreen()) this.focusAfterRender(() => this.match()?.focusHeading());
  }

  /** After an Undo, the list and the cards re-read, and the automatic window once (advanceToday may already have read it). */
  private reloadAutomaticAfterUndo(): void {
    const before = this.automatic.issuedKey();
    this.reloadAfterWrite();
    if (this.canSeePayments() && !this.automatic.denied() && this.automatic.issuedKey() === before) this.loadAutomatic();
  }

  /** The apply was refused (4xx): nothing was written, so the payment is no longer held against the list. */
  onWriteReleased(event: PaymentApplied): void {
    if (this.writeInFlightFor() === event.paymentId) this.writeInFlightFor.set(null);
    if (this.resultFor !== event.paymentId) return;
    this.resultFor = null;
    // A list read that settled while the apply was pending may already have dropped the payment:
    // settle the selection against the current list now (ADR-0063 §1).
    if (this.payments.status() === 'OK') this.onPaymentsSettled(true);
  }

  /** An apply was sent: the payment stays selected until the person picks another, whatever the list says. */
  onWriteStarted(event: PaymentApplied): void {
    if (this.selected()?.paymentId !== event.paymentId) return;
    this.resultFor = event.paymentId;
    this.writeInFlightFor.set(event.paymentId);
  }

  /** Nothing of the panel's write chain is in flight: other payments can be chosen again. */
  onWriteSettled(event: PaymentApplied): void {
    if (this.writeInFlightFor() === event.paymentId) this.writeInFlightFor.set(null);
  }

  onApplied(event: PaymentApplied): void {
    if (this.selected()?.paymentId === event.paymentId) this.resultFor = event.paymentId;
    this.reloadAfterWrite();
  }

  onChanged(): void {
    this.reloadAfterWrite();
  }

  onAnnounce(message: MatchMessage): void {
    this.announcement.set({ key: message.key, params: message.params });
  }

  /** After a write, the list and the cards re-read under the same guards as the first load (ADR-0063 §5). */
  private reloadAfterWrite(): void {
    const agingKey = this.receivables.issuedKey();
    this.advanceToday();
    if (this.canSeePayments() && !this.payments.denied()) this.loadPayments();
    // advanceToday already re-read the aging when the day changed; otherwise re-read it for the write.
    if (this.canSeeCards() && !this.receivables.denied() && this.receivables.issuedKey() === agingKey) {
      this.loadReceivables();
    }
  }

  // ── Matched automatically this week: Undo ─────────────────────────────
  openUndo(row: AutomaticApplication): void {
    if (!this.canUndo() || !row.undoOffered || this.undoing()) return;
    this.undoTarget.set(row);
    this.undoReason.set('');
    this.undoErrorKey.set(null);
  }

  /** Closes the dialog; `ModalDialogDirective` returns focus to the Undo that opened it. */
  closeUndo(): void {
    if (this.undoing()) return;
    this.undoTarget.set(null);
    this.undoReason.set('');
    this.undoErrorKey.set(null);
  }

  /** Undo, re-checked here: permission, the served offer, a 10–1000-character reason and nothing in flight. */
  confirmUndo(): void {
    const row = this.undoTarget();
    if (!row || !this.canUndo() || !row.undoOffered || this.undoing() || !this.undoReasonValid()) return;
    const token = ++this.undoToken;
    this.undoing.set(true);
    this.undoErrorKey.set(null);
    this.undoSubscription = this.service
      .reverseApplication(row.applicationId, this.undoReason().trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (token !== this.undoToken) return;
          this.undoing.set(false);
          this.undoTarget.set(null);
          this.undoReason.set('');
          this.announcement.set({
            key: 'ACCOUNTING.CUSTOMER_PAYMENTS.AUTOMATIC.UNDONE',
            params: { invoice: row.invoiceNumber ?? '' },
          });
          // The payment reappears under Payments waiting; the row now reads Undone.
          this.reloadAutomaticAfterUndo();
          // The Undo that opened the dialog is gone after the re-read: focus the section heading.
          this.focusAfterRender(() => this.automaticHeading()?.nativeElement.focus());
        },
        error: (error: unknown) => {
          if (token !== this.undoToken) return;
          this.undoing.set(false);
          const failure = toBankRecFailure(error);
          if (failure.status === 403) {
            this.undoErrorKey.set({
              key: 'ACCOUNTING.CUSTOMER_PAYMENTS.AUTOMATIC.ERROR.FORBIDDEN',
              params: { permission: this.codes.reverse },
            });
            return;
          }
          if (failure.status === 0 || failure.status >= 500) {
            // The reversal may have landed and it carries no request key: retire this attempt so it can
            // never be sent twice. Only a row that still serves UNDO after the re-read offers it again.
            this.undoTarget.set(null);
            this.undoReason.set('');
            this.announcement.set({ key: 'ACCOUNTING.CUSTOMER_PAYMENTS.AUTOMATIC.ERROR.UNKNOWN', params: {} });
            this.reloadAutomaticAfterUndo();
            this.focusAfterRender(() => this.automaticHeading()?.nativeElement.focus());
            return;
          }
          const known = failure.code ? UNDO_ERROR_KEYS[failure.code] : undefined;
          this.undoErrorKey.set({ key: known ?? 'ACCOUNTING.CUSTOMER_PAYMENTS.AUTOMATIC.ERROR.OTHER', params: {} });
          // Whatever happened, the list says what stands now.
          this.loadAutomatic();
        },
      });
  }

  isSmallScreen(): boolean {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(SMALL_SCREEN_QUERY).matches
      : false;
  }

  private focusAfterRender(focus: () => void): void {
    afterNextRender(focus, { injector: this.injector });
  }
}
