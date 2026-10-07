import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { canAccess } from '../../../../core/security/route-access';
import { ACCOUNTING_PAGE, ACCOUNTING_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { LocaleService } from '../../../../core/services/locale.service';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { MoneyPipe } from '../../../../shared/money.pipe';
import {
  ApplyResult,
  MatchLine,
  OpenInvoice,
  OpenInvoicesList,
  RemainderCredit,
  WaitingPayment,
} from '../../models/customer-payments.models';
import { CustomerPaymentsService } from '../../services/customer-payments.service';
import { toBankRecFailure } from '../../services/bank-reconciliation.service';
import { toDatePipeInput } from '../../utils/date-only.util';
import { HomeRegion } from '../../utils/home-region';
import {
  AmountError,
  TypedAmount,
  canKeepCredit,
  formatAmountInput,
  fromMinor,
  isPossibleDuplicate,
  parseTypedAmount,
  paymentMethodKey,
  paymentReasonKey,
  toMinor,
} from '../../utils/payment-match';
import { uuidV7 } from '../../utils/uuid-v7.util';
import { HelpDisclosureComponent } from '../help-disclosure/help-disclosure.component';

/** What happens to an amount left over after the apply (§5.3 item 5, S35). */
export type LeftoverChoice = 'CREDIT' | 'REFUND';

/**
 * The match panel's state (story "State model"): `editing → submitting →
 * applied`, with `unknown` when the apply's outcome could not be confirmed;
 * after an apply with a left-over, `crediting` (S35) and, for a refund,
 * `refunding → done | refund-failed`.
 */
export type MatchPhase =
  | 'editing'
  | 'submitting'
  | 'unknown'
  | 'crediting'
  | 'credit-unknown'
  | 'refunding'
  | 'refund-failed'
  | 'done';

/** A message for the panel and, once, for the host's polite status region. */
export interface MatchMessage {
  readonly key: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly tone: 'error' | 'success';
}

/** The apply landed: the host re-reads its lists. */
export interface PaymentApplied {
  readonly paymentId: string;
}

/** One typed row of the draft, keyed by invoice id. */
interface DraftRow {
  readonly ticked: boolean;
  readonly text: string;
}

/** An open invoice as the panel renders it. */
export interface MatchRow {
  readonly invoice: OpenInvoice;
  readonly suggested: boolean;
  readonly ticked: boolean;
  readonly text: string;
  readonly amount: TypedAmount;
  /** The typed amount is more than the invoice's still-owed (§4.4 item 5, Spec discrepancy 4). */
  readonly overBalance: boolean;
  /** The field's error key, when ticked and not sendable. */
  readonly errorKey: string | null;
}

/** The apply's result as rendered: the server's figures, with the invoice numbers the panel held. */
export interface ResultLine {
  readonly invoiceNumber: string | null;
  readonly appliedAmount: number | null;
  readonly balanceAfter: number | null;
}

const AMOUNT_ERROR_KEYS: Readonly<Record<AmountError, string>> = {
  INVALID: 'ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.ERROR_AMOUNT_INVALID',
  PRECISION: 'ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.ERROR_AMOUNT_PRECISION',
  MINIMUM: 'ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.ERROR_AMOUNT_MINIMUM',
};

const OVER_BALANCE_KEY = 'ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.ERROR_AMOUNT_OVER_BALANCE';

/** Phases in which a write is in flight or its outcome is open: the draft is locked. */
const LOCKED_PHASES: ReadonlySet<MatchPhase> = new Set(['submitting', 'unknown', 'crediting', 'credit-unknown', 'refunding']);

/** No status (network, timeout) or a server failure: the write may have landed (§8.2). */
function outcomeUnknown(status: number): boolean {
  return status === 0 || status >= 500;
}

/**
 * The selected-payment panel (CAP:550 S6, SPEC-accounting-workspace §5.3
 * items 4–5): the customer's open invoices with checkboxes and amounts, the
 * preview (Payment · Applying · Left over), the left-over choice, the
 * consequence sentence and Apply. Used by the Customer payments page and by
 * the home's "Payment ready to match" detail panel (§5.1).
 *
 * The panel owns its reads and writes:
 * - The open-invoices read is a {@link HomeRegion} keyed by the payment, so a
 *   late answer for another payment never renders (ADR-0063 §1).
 * - The preview sums only typed amounts, in integer minor units; the server's
 *   answer replaces it (P7).
 * - One `applicationRequestId` (UUIDv7) per intent: created when the payment
 *   is selected; reused for a double click, a retry, a timeout or an unknown
 *   outcome (the draft is locked until then); rotated after a confirmed
 *   success, Start over, another payment or any refusal (§8.2). The remainder
 *   credit and the refund carry their own keys.
 * - Apply gates on `accounting:payment:apply` and Refund on
 *   `accounting:customer-credit:refund`, at the control and in the handler;
 *   an unknown `perm_bits` claim follows `canAccess` (ADR-0040 §6a).
 *
 * The host shows announcements once, in its own `role="status"` region
 * (`announce`), and re-reads its lists on `applied` and `changed`.
 */
@Component({
  selector: 'app-payment-match',
  standalone: true,
  imports: [DatePipe, MoneyPipe, TranslatePipe, ModalDialogDirective, HelpDisclosureComponent],
  templateUrl: './payment-match.component.html',
  styleUrls: ['../../bank-reconciliation-shared.css', './payment-match.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Formats the amounts an announcement names, once, when it is made.
  providers: [MoneyPipe],
})
export class PaymentMatchComponent {
  private readonly auth = inject(AuthService);
  private readonly service = inject(CustomerPaymentsService);
  private readonly locale = inject(LocaleService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly money = inject(MoneyPipe);

  readonly payment = input.required<WaitingPayment>();
  /**
   * Inside the home's detail panel, which carries its own h3 "Payment ready to
   * match": the panel then renders no heading of its own and its subheadings
   * are h4; on the Customer payments page it opens with an h2 and h3s.
   */
  readonly embedded = input(false);

  readonly applied = output<PaymentApplied>();
  /**
   * An apply was sent for this payment: the host keeps the payment selected
   * (even once a re-read drops it from its list) until the person picks
   * another, so the chain apply → credit → refund is never torn down mid-flight.
   */
  readonly writeStarted = output<PaymentApplied>();
  /**
   * The apply was refused (4xx): nothing was written, so the host stops
   * holding the payment and lets its list decide again (ADR-0063 §1). Emitted
   * before `changed`, so the re-read that follows can drop a payment that left.
   */
  readonly writeReleased = output<PaymentApplied>();
  /** The payment changed under the person (a refusal), or its remainder moved: the host re-reads its list. */
  readonly changed = output<void>();
  readonly announce = output<MatchMessage>();

  private readonly heading = viewChild<ElementRef<HTMLElement>>('matchHeading');
  private readonly resultHeading = viewChild<ElementRef<HTMLElement>>('resultHeading');
  private readonly retryButton = viewChild<ElementRef<HTMLElement>>('retryButton');

  // ── Gates ─────────────────────────────────────────────────────────────
  readonly canApply = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_PAGE.customerPayments }));
  readonly canRefund = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.customerCreditRefund }));
  readonly codes = {
    apply: ACCOUNTING_PAGE.customerPayments[0],
    refund: ACCOUNTING_SECTION.customerCreditRefund[0],
  } as const;

  // ── The customer's open invoices ──────────────────────────────────────
  readonly invoices = new HomeRegion<OpenInvoicesList>(ok => this.onInvoicesSettled(ok));
  /** The invoices answering the selected payment, never another's (ADR-0063 §1); none once refused (ADR-0064 §6). */
  readonly invoicesData = computed(() =>
    !this.invoices.denied() && this.invoices.dataKey() === this.payment().paymentId ? this.invoices.data() : null,
  );
  /** Apply waits for an OK read of this payment's invoices (story "Alternate and error flows"). */
  readonly invoicesReady = computed(
    () => this.invoices.status() === 'OK' && this.invoices.dataKey() === this.payment().paymentId,
  );

  // ── Draft ─────────────────────────────────────────────────────────────
  private readonly draft = signal<ReadonlyMap<string, DraftRow>>(new Map());
  readonly filterText = signal('');
  readonly leftoverChoice = signal<LeftoverChoice>('CREDIT');

  readonly phase = signal<MatchPhase>('editing');
  readonly message = signal<MatchMessage | null>(null);
  readonly result = signal<{ readonly result: ApplyResult; readonly lines: readonly ResultLine[] } | null>(null);
  readonly credit = signal<RemainderCredit | null>(null);
  readonly refunded = signal<number | null>(null);
  readonly refundDialogOpen = signal(false);
  /**
   * A credit kept instead of refunded because its amount was not the one the
   * person confirmed: offered for a fresh confirmation of the served amount.
   */
  readonly refundOffer = signal<RemainderCredit | null>(null);
  readonly keptRefundDialogOpen = signal(false);

  readonly locked = computed(() => LOCKED_PHASES.has(this.phase()));
  readonly duplicate = computed(() => isPossibleDuplicate(this.payment()));
  readonly keepsCredit = computed(() => canKeepCredit(this.payment()));

  private readonly suggestedIds = computed(
    () => new Set(this.payment().suggestedInvoices.map(invoice => invoice.invoiceId)),
  );

  /** Every open invoice of this payment's customer, with its draft row. */
  readonly rows = computed<MatchRow[]>(() => {
    const draft = this.draft();
    const suggested = this.suggestedIds();
    return (this.invoicesData()?.items ?? []).map(invoice => {
      const row = draft.get(invoice.invoiceId);
      const ticked = row?.ticked ?? false;
      const text = row?.text ?? '';
      const amount = parseTypedAmount(text);
      const owed = toMinor(invoice.balanceDue);
      const overBalance = amount.minor !== null && owed !== null && amount.minor > owed;
      return {
        invoice,
        suggested: suggested.has(invoice.invoiceId),
        ticked,
        text,
        amount,
        overBalance,
        errorKey: !ticked ? null : amount.error ? AMOUNT_ERROR_KEYS[amount.error] : overBalance ? OVER_BALANCE_KEY : null,
      };
    });
  });

  /** "Search other invoices" narrows by invoice number; a ticked invoice always stays in view. */
  readonly visibleRows = computed(() => {
    const needle = this.filterText().trim().toLowerCase();
    if (!needle) return this.rows();
    return this.rows().filter(row => row.ticked || (row.invoice.invoiceNumber ?? '').toLowerCase().includes(needle));
  });

  // ── Preview (P7: typed amounts only, in minor units) ──────────────────
  readonly unappliedMinor = computed(() => toMinor(this.payment().unappliedAmount) ?? 0);
  private readonly tickedRows = computed(() => this.rows().filter(row => row.ticked));
  readonly tickedCount = computed(() => this.tickedRows().length);
  readonly applyingMinor = computed(() =>
    this.tickedRows().reduce((sum, row) => sum + (row.errorKey ? 0 : (row.amount.minor ?? 0)), 0),
  );
  readonly leftOverMinor = computed(() => this.unappliedMinor() - this.applyingMinor());
  readonly overMinor = computed(() => Math.max(0, -this.leftOverMinor()));
  readonly hasFieldErrors = computed(() => this.tickedRows().some(row => row.errorKey !== null));

  readonly applying = computed(() => fromMinor(this.applyingMinor()));
  readonly leftOver = computed(() => fromMinor(Math.max(0, this.leftOverMinor())));
  readonly excess = computed(() => fromMinor(this.overMinor()));

  /** The left-over choice is offered for a remainder of a payment that may keep a credit (never walk-in / CASH). */
  readonly offerLeftover = computed(() => this.keepsCredit() && this.leftOverMinor() > 0);
  /** Refund is never chosen without its permission, whatever was clicked before (ADR-0040 §6a). */
  readonly effectiveChoice = computed<LeftoverChoice>(() =>
    this.leftoverChoice() === 'REFUND' && this.canRefund() ? 'REFUND' : 'CREDIT',
  );

  /** Apply can be pressed: permitted, invoices read, something sendable ticked, nothing over, nothing in flight. */
  readonly applyEnabled = computed(
    () =>
      this.canApply() &&
      this.phase() === 'editing' &&
      this.invoicesReady() &&
      this.tickedCount() > 0 &&
      !this.hasFieldErrors() &&
      this.overMinor() === 0,
  );

  /** "Apply {X}", "Apply {X} and keep {Y} as credit" or "Apply {X} and refund {Y}". */
  readonly applyLabelKey = computed(() => {
    if (!this.offerLeftover()) return 'ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.APPLY';
    return this.effectiveChoice() === 'REFUND'
      ? 'ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.APPLY_AND_REFUND'
      : 'ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.APPLY_AND_KEEP';
  });

  readonly toDate = toDatePipeInput;
  readonly methodKey = paymentMethodKey;
  readonly reasonKey = paymentReasonKey;

  // ── Keys (§8.2) ───────────────────────────────────────────────────────
  /** The apply's idempotency key for the current intent. */
  private applicationRequestId = uuidV7();
  /** The remainder credit's key, made with the left-over choice. */
  private creditRequestId = uuidV7();
  /** The refund's key, made when its confirmation opens. */
  private refundRequestId: string | null = null;
  /** The left-over (cents) the person confirmed for refund; a refund of any other amount is never sent. */
  private confirmedRefundMinor: number | null = null;
  /** The lines of the apply whose outcome is open, for Try again. */
  private lastLines: readonly MatchLine[] = [];
  /** The remainder credit or refund in flight, for its retry. */
  private pendingCredit: { readonly paymentId: string; readonly expected: number; readonly refund: boolean } | null = null;
  /** Ticked invoices sent with an apply the server refused with 409; named once the re-read lands. */
  private conflictCheck: readonly OpenInvoice[] | null = null;

  /** Bumped on every reset: a write's late answer for an earlier payment or intent never touches the panel (ADR-0063 §1). */
  private intent = 0;
  private writeSubscription: Subscription | null = null;
  private trackedPaymentId: string | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.invoices.dispose();
      this.intent++;
    });
    // A new payment discards the draft, rotates every key and reads its customer's invoices.
    effect(() => {
      const paymentId = this.payment().paymentId;
      if (paymentId === this.trackedPaymentId) return;
      this.trackedPaymentId = paymentId;
      untracked(() => this.resetForPayment());
    });
  }

  /** The current request key, for the spec only. */
  currentApplicationRequestId(): string {
    return this.applicationRequestId;
  }

  private resetForPayment(): void {
    this.intent++;
    this.writeSubscription = null;
    this.invoices.reset();
    this.filterText.set('');
    this.result.set(null);
    this.credit.set(null);
    this.refunded.set(null);
    this.message.set(null);
    this.refundDialogOpen.set(false);
    this.keptRefundDialogOpen.set(false);
    this.refundOffer.set(null);
    this.conflictCheck = null;
    this.pendingCredit = null;
    this.restoreSuggestions();
    this.rotateKeys();
    this.phase.set('editing');
    this.loadInvoices();
  }

  private loadInvoices(): void {
    const payment = this.payment();
    this.invoices.load(this.service.openInvoices(payment.customerId), payment.paymentId);
  }

  private rotateKeys(): void {
    this.applicationRequestId = uuidV7();
    this.creditRequestId = uuidV7();
    this.refundRequestId = null;
    this.confirmedRefundMinor = null;
    this.lastLines = [];
  }

  /** Suggested invoices pre-ticked with the served suggested amount; nothing else ticked. */
  private restoreSuggestions(): void {
    const locale = this.locale.currentLocale();
    const draft = new Map<string, DraftRow>();
    for (const invoice of this.payment().suggestedInvoices) {
      const minor = toMinor(invoice.suggestedAmount);
      draft.set(invoice.invoiceId, { ticked: true, text: minor === null ? '' : formatAmountInput(minor, locale) });
    }
    this.draft.set(draft);
    this.leftoverChoice.set('CREDIT');
  }

  // ── Editing ───────────────────────────────────────────────────────────
  /** Ticking pre-fills the suggested amount, else the still-owed amount. */
  toggle(row: MatchRow, ticked: boolean): void {
    if (this.locked() || this.phase() === 'done') return;
    const draft = new Map(this.draft());
    let text = draft.get(row.invoice.invoiceId)?.text ?? '';
    if (ticked && !text.trim()) {
      const suggestion = this.payment().suggestedInvoices.find(invoice => invoice.invoiceId === row.invoice.invoiceId);
      const minor = toMinor(suggestion?.suggestedAmount ?? row.invoice.balanceDue);
      text = minor === null ? '' : formatAmountInput(minor, this.locale.currentLocale());
    }
    draft.set(row.invoice.invoiceId, { ticked, text });
    this.draft.set(draft);
    this.clearRefusal();
  }

  setAmount(row: MatchRow, text: string): void {
    if (this.locked() || this.phase() === 'done') return;
    const draft = new Map(this.draft());
    draft.set(row.invoice.invoiceId, { ticked: draft.get(row.invoice.invoiceId)?.ticked ?? row.ticked, text });
    this.draft.set(draft);
    this.clearRefusal();
  }

  chooseLeftover(choice: LeftoverChoice): void {
    if (this.locked()) return;
    if (choice === 'REFUND' && !this.canRefund()) return;
    if (choice !== this.leftoverChoice()) this.creditRequestId = uuidV7();
    this.leftoverChoice.set(choice);
  }

  /** A refusal's message stays until the person changes the draft. */
  private clearRefusal(): void {
    if (this.message()?.tone === 'error' && this.phase() === 'editing') this.message.set(null);
  }

  /** Start over: the suggestions come back, the key rotates and the invoices are read again. */
  startOver(): void {
    const phase = this.phase();
    if (phase !== 'editing' && phase !== 'unknown' && phase !== 'done') return;
    const wasUnknown = phase === 'unknown';
    this.intent++;
    this.result.set(null);
    this.credit.set(null);
    this.refunded.set(null);
    this.message.set(null);
    this.refundDialogOpen.set(false);
    this.keptRefundDialogOpen.set(false);
    this.refundOffer.set(null);
    this.conflictCheck = null;
    this.pendingCredit = null;
    this.restoreSuggestions();
    this.rotateKeys();
    this.phase.set('editing');
    this.loadInvoices();
    // A fresh intent holds nothing: the host lets its list decide again, so a payment an
    // unconfirmed apply used up closes on the re-read instead of offering a second apply (ADR-0063).
    this.writeReleased.emit({ paymentId: this.payment().paymentId });
    // An apply whose outcome was never confirmed may have landed: the host's list says.
    if (wasUnknown) this.changed.emit();
    this.focusAfterRender(() => this.heading()?.nativeElement.focus());
  }

  retryInvoices(): void {
    this.loadInvoices();
  }

  // ── Apply ─────────────────────────────────────────────────────────────
  /** Apply, re-checked here: permission, a sendable draft, nothing in flight. A refund confirms first. */
  submit(): void {
    if (!this.applyEnabled()) return;
    if (this.offerLeftover() && this.effectiveChoice() === 'REFUND') {
      this.refundRequestId = uuidV7();
      this.refundDialogOpen.set(true);
      return;
    }
    this.runApply(this.currentLines(), this.offerLeftover() ? 'CREDIT' : null);
  }

  /** The refund confirmation's "Apply and refund": the refund permission is re-checked at click time. */
  confirmRefund(): void {
    if (!this.refundDialogOpen()) return;
    this.refundDialogOpen.set(false);
    if (!this.canRefund() || !this.applyEnabled() || !this.offerLeftover()) return;
    this.confirmedRefundMinor = this.leftOverMinor();
    this.runApply(this.currentLines(), 'REFUND');
  }

  cancelRefund(): void {
    this.refundDialogOpen.set(false);
    this.refundRequestId = null;
  }

  /** Try again after an unknown outcome: the same key and the same lines, so a replay returns the first result. */
  retryApply(): void {
    if (this.phase() !== 'unknown' || !this.canApply() || this.lastLines.length === 0) return;
    this.runApply(this.lastLines, this.lastPlan);
  }

  private lastPlan: LeftoverChoice | null = null;

  private currentLines(): MatchLine[] {
    return this.tickedRows().map(row => ({ invoiceId: row.invoice.invoiceId, amount: fromMinor(row.amount.minor ?? 0) }));
  }

  private runApply(lines: readonly MatchLine[], plan: LeftoverChoice | null): void {
    const payment = this.payment();
    const intent = this.intent;
    const key = this.applicationRequestId;
    const sentInvoices = this.tickedRows().map(row => row.invoice);
    const numbers = new Map((this.invoicesData()?.items ?? []).map(invoice => [invoice.invoiceId, invoice.invoiceNumber]));
    this.lastLines = lines;
    this.lastPlan = plan;
    this.phase.set('submitting');
    this.message.set(null);
    this.writeStarted.emit({ paymentId: payment.paymentId });
    this.writeSubscription = this.service
      .applyPayment(payment.paymentId, key, lines)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.applied.emit({ paymentId: payment.paymentId });
          if (intent !== this.intent) return;
          this.onApplied(payment, result, numbers, plan);
        },
        error: (error: unknown) => {
          const failure = toBankRecFailure(error);
          if (intent !== this.intent) {
            if (!outcomeUnknown(failure.status)) this.changed.emit();
            return;
          }
          this.onApplyRefused(failure.status, failure.code, sentInvoices);
        },
      });
  }

  private onApplied(
    payment: WaitingPayment,
    result: ApplyResult,
    numbers: ReadonlyMap<string, string | null>,
    plan: LeftoverChoice | null,
  ): void {
    // Confirmed: the next intent gets a new key (§8.2).
    this.applicationRequestId = uuidV7();
    this.lastLines = [];
    this.result.set({
      result,
      lines: result.lines.map(line => ({
        invoiceNumber: line.invoiceId ? (numbers.get(line.invoiceId) ?? null) : null,
        appliedAmount: line.appliedAmount,
        balanceAfter: line.balanceAfter,
      })),
    });
    this.loadInvoices();
    const remaining = toMinor(result.remainingAmount) ?? 0;
    if (plan && remaining > 0 && result.remainingAmount !== null && this.keepsCredit()) {
      this.runCredit({ paymentId: payment.paymentId, expected: result.remainingAmount, refund: plan === 'REFUND' });
    } else {
      this.finish({
        key: 'ACCOUNTING.CUSTOMER_PAYMENTS.RESULT.ANNOUNCE_APPLIED',
        params: { amount: this.format(result.appliedAmount, result.currency ?? payment.currency) },
        tone: 'success',
      });
    }
    this.focusAfterRender(() => this.resultHeading()?.nativeElement.focus());
  }

  private onApplyRefused(status: number, code: string | null, sent: readonly OpenInvoice[]): void {
    if (!outcomeUnknown(status)) this.writeReleased.emit({ paymentId: this.payment().paymentId });
    if (outcomeUnknown(status)) {
      // The apply may have landed: same key, locked draft, Try again (§8.2).
      this.phase.set('unknown');
      this.say({ key: 'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.APPLY_UNKNOWN', params: {}, tone: 'error' });
      this.focusAfterRender(() => this.retryButton()?.nativeElement.focus());
      return;
    }
    // Refused: nothing was applied and the intent changes, so the key rotates.
    this.rotateKeys();
    this.phase.set('editing');
    if (status === 403) {
      this.say({ key: 'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.APPLY_FORBIDDEN', params: { permission: this.codes.apply }, tone: 'error' });
      return;
    }
    if (status === 409) {
      this.conflictCheck = sent;
      this.say({ key: 'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.APPLY_CONFLICT', params: {}, tone: 'error' });
      this.loadInvoices();
      return;
    }
    if (code === 'CURRENCY_NOT_SUPPORTED') {
      this.say({ key: 'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.CURRENCY', params: {}, tone: 'error' });
      return;
    }
    if (status === 400 || status === 404) {
      // The payment changed, was used up or vanished: typed amounts for invoices still open are kept.
      this.say({ key: 'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.APPLY_CHANGED', params: {}, tone: 'error' });
      this.loadInvoices();
      this.changed.emit();
      return;
    }
    this.say({ key: 'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.APPLY_OTHER', params: {}, tone: 'error' });
  }

  /** After a 409, the invoices re-read: a sent invoice that is no longer open is unticked and named. */
  private onInvoicesSettled(ok: boolean): void {
    const sent = this.conflictCheck;
    if (!sent || !ok) return;
    this.conflictCheck = null;
    const open = new Set((this.invoicesData()?.items ?? []).map(invoice => invoice.invoiceId));
    const stale = sent.filter(invoice => !open.has(invoice.invoiceId));
    if (stale.length === 0) return;
    const draft = new Map(this.draft());
    for (const invoice of stale) draft.set(invoice.invoiceId, { ticked: false, text: '' });
    this.draft.set(draft);
    this.say({
      key: 'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.APPLY_CONFLICT_NAMED',
      params: { invoices: stale.map(invoice => invoice.invoiceNumber ?? '—').join(', ') },
      tone: 'error',
    });
  }

  // ── Keep as credit, then refund (S35) ─────────────────────────────────
  private runCredit(plan: { readonly paymentId: string; readonly expected: number; readonly refund: boolean }): void {
    // Its own write: re-checked here, so a permission revoked while the apply was in flight sends nothing (ADR-0040 §6a).
    if (!this.canApply()) {
      this.pendingCredit = null;
      this.finish({
        key: 'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.CREDIT_FORBIDDEN',
        params: { permission: this.codes.apply },
        tone: 'error',
      });
      return;
    }
    const intent = this.intent;
    this.pendingCredit = plan;
    this.phase.set('crediting');
    this.writeSubscription = this.service
      .creditRemainder(plan.paymentId, plan.expected, this.creditRequestId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: credit => {
          this.changed.emit();
          if (intent !== this.intent) return;
          this.credit.set(credit);
          if (plan.refund) {
            this.runRefund(credit);
            return;
          }
          this.pendingCredit = null;
          this.finish({
            key: 'ACCOUNTING.CUSTOMER_PAYMENTS.RESULT.ANNOUNCE_KEPT',
            params: { amount: this.format(credit.amount, credit.currency ?? this.payment().currency) },
            tone: 'success',
          });
        },
        error: (error: unknown) => {
          if (intent !== this.intent) return;
          this.onCreditRefused(toBankRecFailure(error));
        },
      });
  }

  private onCreditRefused(failure: { status: number; code: string | null }): void {
    if (outcomeUnknown(failure.status)) {
      this.phase.set('credit-unknown');
      this.say({ key: 'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.CREDIT_UNKNOWN', params: {}, tone: 'error' });
      this.focusAfterRender(() => this.retryButton()?.nativeElement.focus());
      return;
    }
    this.pendingCredit = null;
    const key =
      failure.status === 403
        ? 'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.CREDIT_FORBIDDEN'
        : failure.code === 'CASH_CUSTOMER_CREDIT_NOT_ALLOWED'
          ? 'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.CREDIT_WALK_IN'
          : failure.code === 'CURRENCY_NOT_SUPPORTED'
            ? 'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.CREDIT_CURRENCY'
            : failure.code === 'PAYMENT_REMAINDER_CHANGED' || failure.code === 'PAYMENT_NOT_AVAILABLE'
              ? 'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.CREDIT_CHANGED'
              : 'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.CREDIT_OTHER';
    this.creditRequestId = uuidV7();
    // The apply stands; the remainder stays on the payment, which the host re-reads.
    this.changed.emit();
    this.finish({ key, params: { permission: this.codes.apply }, tone: 'error' });
  }

  /** Try again after the remainder credit's outcome was unknown: the same key. */
  retryCredit(): void {
    const plan = this.pendingCredit;
    if (this.phase() !== 'credit-unknown' || !plan || !this.canApply()) return;
    this.runCredit(plan);
  }

  /**
   * Refunds a kept credit, but only with the refund permission held now and
   * only for the amount the person confirmed (cents). Otherwise the credit
   * stays a credit and the panel says so; a different amount is offered for a
   * fresh confirmation (story PROPOSED 8, ADR-0040 §6a.4).
   */
  private runRefund(credit: RemainderCredit): void {
    const amount = this.format(credit.amount, credit.currency ?? this.payment().currency);
    if (!this.canRefund()) {
      this.pendingCredit = null;
      this.finish({
        key: 'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.REFUND_FORBIDDEN',
        params: { permission: this.codes.refund, amount },
        tone: 'error',
      });
      return;
    }
    if (toMinor(credit.amount) !== this.confirmedRefundMinor) {
      this.pendingCredit = null;
      this.refundOffer.set(credit);
      this.finish({ key: 'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.REFUND_AMOUNT_CHANGED', params: { amount }, tone: 'error' });
      return;
    }
    const intent = this.intent;
    const requestId = this.refundRequestId ?? uuidV7();
    this.refundRequestId = requestId;
    this.phase.set('refunding');
    this.writeSubscription = this.service
      .refundCredit(credit.creditId, credit.amount, requestId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (intent !== this.intent) return;
          this.pendingCredit = null;
          this.refunded.set(credit.amount);
          this.finish({
            key: 'ACCOUNTING.CUSTOMER_PAYMENTS.RESULT.ANNOUNCE_REFUNDED',
            params: { amount: this.format(credit.amount, credit.currency ?? this.payment().currency) },
            tone: 'success',
          });
          this.focusAfterRender(() => this.resultHeading()?.nativeElement.focus());
        },
        error: (error: unknown) => {
          if (intent !== this.intent) return;
          const failure = toBankRecFailure(error);
          this.phase.set('refund-failed');
          this.say({
            key:
              failure.status === 403
                ? 'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.REFUND_FORBIDDEN'
                : 'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.REFUND_FAILED',
            params: {
              permission: this.codes.refund,
              amount: this.format(credit.amount, credit.currency ?? this.payment().currency),
            },
            tone: 'error',
          });
          this.focusAfterRender(() => (this.retryButton() ?? this.resultHeading())?.nativeElement.focus());
        },
      });
  }

  /** Opens the confirmation for refunding a credit kept at a different amount; its own new key. */
  openKeptRefund(): void {
    if (!this.refundOffer() || !this.canRefund() || this.phase() !== 'done') return;
    this.refundRequestId = uuidV7();
    this.keptRefundDialogOpen.set(true);
  }

  cancelKeptRefund(): void {
    this.keptRefundDialogOpen.set(false);
  }

  /** The person confirmed the served amount: refund exactly that. */
  confirmKeptRefund(): void {
    const credit = this.refundOffer();
    if (!this.keptRefundDialogOpen() || !credit) return;
    this.keptRefundDialogOpen.set(false);
    if (!this.canRefund()) return;
    this.refundOffer.set(null);
    this.confirmedRefundMinor = toMinor(credit.amount);
    this.runRefund(credit);
  }

  /** Try the refund again: the same key, permission re-checked at click time. */
  retryRefund(): void {
    const credit = this.credit();
    if (this.phase() !== 'refund-failed' || !credit || !this.canRefund()) return;
    this.runRefund(credit);
  }

  /** The refund can be retried: its outcome was not a refusal of permission. */
  readonly refundRetryOffered = computed(
    () => this.phase() === 'refund-failed' && this.canRefund() && this.message()?.key === 'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.REFUND_FAILED',
  );

  private format(value: number | null, currency: string | null): string {
    return this.money.transform(value, currency) ?? '';
  }

  private finish(message: MatchMessage): void {
    this.phase.set('done');
    this.say(message);
  }

  private say(message: MatchMessage): void {
    this.message.set(message);
    this.announce.emit(message);
  }

  /** Moves focus to the panel heading (small screens on selection). */
  focusHeading(): void {
    this.heading()?.nativeElement.focus();
  }

  rowId(row: MatchRow, part: string): string {
    return `match-${part}-${row.invoice.invoiceId}`;
  }

  private focusAfterRender(focus: () => void): void {
    afterNextRender(focus, { injector: this.injector });
  }
}
