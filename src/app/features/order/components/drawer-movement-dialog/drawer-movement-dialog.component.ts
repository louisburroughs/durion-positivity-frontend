import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  DestroyRef,
  ElementRef,
  InjectionToken,
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
import { CashMovementApprovalRequest, CashMovementRequest } from '@durion-sdk/order';
import { Subscription } from 'rxjs';
import { v4 as uuidv4, v7 as uuidv7 } from 'uuid';
import { canAccess } from '../../../../core/security/route-access';
import { ORDER_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { MoneyPipe } from '../../../../shared/money.pipe';
import {
  DrawerApproval,
  DrawerDialogKind,
  DrawerDraft,
  DrawerOptions,
  DrawerReason,
  DrawerReasonOption,
  DrawerStatedTax,
  FLOAT_REASONS,
  PendingAttempt,
  PettyCategory,
  RecordedMovement,
  offeredReasons,
  reasonKey,
} from '../../models/register-drawer.models';
import { DrawerAttemptStore } from '../../services/drawer-attempt.store';
import {
  APPROVAL_REASON,
  DrawerFailure,
  RECORD_REASON,
  RegisterSessionService,
  classifyDrawerError,
  settlesUnknownAttempt,
} from '../../services/register-session.service';
import { parseAmount } from '../../utils/drawer-amount.util';

/** The dialog's clock, for the approval token's expiry. Tests inject a fixed instant. */
export const DRAWER_CLOCK = new InjectionToken<() => Date>('DRAWER_CLOCK', {
  providedIn: 'root',
  factory: () => () => new Date(),
});

/** Why the dialog handed the drawer back to the page: the session changed under it. */
export type DrawerSessionChange = 'GONE' | 'NOT_OPEN' | 'CONFLICT' | 'ALREADY_RECORDED';

/** A request field the form renders. */
type DrawerField = 'categoryCode' | 'amount' | 'note' | 'receiptReference' | 'bagNumber';

/** The fields each reason renders; the story fixes which are required (§4.6, AC 3). */
const RENDERED: Readonly<Record<DrawerReason, readonly DrawerField[]>> = {
  PETTY_EXPENSE: ['categoryCode', 'amount', 'note', 'receiptReference'],
  VENDOR_COD: ['amount'],
  BANK_DROP: ['bagNumber', 'amount'],
  FLOAT_INCREASE: ['amount'],
  FLOAT_DECREASE: ['amount'],
};
const REQUIRED: Readonly<Record<DrawerReason, readonly DrawerField[]>> = {
  PETTY_EXPENSE: ['categoryCode', 'amount', 'note', 'receiptReference'],
  VENDOR_COD: ['amount'],
  BANK_DROP: ['bagNumber', 'amount'],
  FLOAT_INCREASE: ['amount'],
  FLOAT_DECREASE: ['amount'],
};

/** Label of each field a 400 may name, so the refusal lists them by name. */
const FIELD_LABEL_KEYS: Readonly<Record<string, string>> = {
  amount: 'ORDER.DRAWER.DIALOG.AMOUNT',
  categoryCode: 'ORDER.DRAWER.DIALOG.CATEGORY',
  note: 'ORDER.DRAWER.DIALOG.NOTE',
  receiptReference: 'ORDER.DRAWER.DIALOG.RECEIPT_REFERENCE',
  bagNumber: 'ORDER.DRAWER.DIALOG.BAG_NUMBER',
  managerUsername: 'ORDER.DRAWER.APPROVAL.USERNAME',
  managerPassword: 'ORDER.DRAWER.APPROVAL.PASSWORD',
  supplierName: 'ORDER.DRAWER.TAX.SUPPLIER_NAME',
  supplierRegistrationNumber: 'ORDER.DRAWER.TAX.SUPPLIER_NUMBER',
  statedTaxes: 'ORDER.DRAWER.TAX.LEGEND',
};

/** The field key of one regime's tax input (the request names it `statedTaxes[i]`). */
const TAX_FIELD = 'tax:';

/** A tax refusal (S32d) and the fields it names, shown at the first of them (story item 9, AC 11). */
interface TaxFailure {
  readonly key: string;
  /** Field keys: `amount`, `supplierName`, `supplierRegistrationNumber`, `statedTaxes` (the sum) or `tax:<regime>`. */
  readonly fields: readonly string[];
  /** 503 TAX_CHECK_UNAVAILABLE: the dialog offers "Record without the number". */
  readonly withoutNumber: boolean;
}

const TAX_FAILURE_KEYS: Partial<Record<DrawerFailure['kind'], string>> = {
  TAX_IMPLAUSIBLE: 'ORDER.DRAWER.TAX.ERROR.IMPLAUSIBLE',
  TAX_REGIME_NOT_OFFERED: 'ORDER.DRAWER.TAX.ERROR.NOT_OFFERED',
  SUPPLIER_NUMBER_NOT_ACCEPTED: 'ORDER.DRAWER.TAX.ERROR.NUMBER_NOT_ACCEPTED',
  PRECISION: 'ORDER.DRAWER.TAX.ERROR.PRECISION',
  TAX_CHECK_UNAVAILABLE: 'ORDER.DRAWER.TAX.ERROR.CHECK_UNAVAILABLE',
};

/** The field each tax refusal falls back to when the server names none. */
const TAX_FAILURE_FALLBACK: Partial<Record<DrawerFailure['kind'], string>> = {
  TAX_IMPLAUSIBLE: 'statedTaxes',
  TAX_REGIME_NOT_OFFERED: 'statedTaxes',
  SUPPLIER_NUMBER_NOT_ACCEPTED: 'supplierRegistrationNumber',
  PRECISION: 'amount',
  TAX_CHECK_UNAVAILABLE: 'supplierRegistrationNumber',
};

/**
 * The dialog's field key for a field a refusal names: `statedTaxes[i].amount` / `.regime` is the
 * input of the regime sent at index i; anything else is kept as named.
 */
function fieldKeyOf(field: string, draft: DrawerDraft | undefined): string {
  const indexed = /^statedTaxes\[(\d+)\](?:\.(?:amount|regime))?$/.exec(field);
  if (!indexed) return field;
  const regime = draft?.statedTaxes?.[Number(indexed[1])]?.regime;
  return regime ? TAX_FIELD + regime : 'statedTaxes';
}

const FAILURE_KEYS: Readonly<Record<string, string>> = {
  APPROVAL_INVALID: 'ORDER.DRAWER.ERROR.APPROVAL_INVALID',
  APPROVAL_DENIED: 'ORDER.DRAWER.ERROR.APPROVAL_DENIED',
  SELF_APPROVAL: 'ORDER.DRAWER.ERROR.SELF_APPROVAL',
  TYPE_NOT_ALLOWED: 'ORDER.DRAWER.ERROR.TYPE_NOT_ALLOWED',
  CATEGORY_UNKNOWN: 'ORDER.DRAWER.ERROR.CATEGORY_UNKNOWN',
  FLOAT_NOT_RECORDED: 'ORDER.DRAWER.ERROR.FLOAT_NOT_RECORDED',
  INVALID: 'ORDER.DRAWER.ERROR.INVALID',
  FORBIDDEN: 'ORDER.DRAWER.ERROR.FORBIDDEN',
  SCOPE_DENIED: 'ORDER.DRAWER.ERROR.SCOPE_DENIED',
  REFUSED: 'ORDER.DRAWER.ERROR.REFUSED',
  UNKNOWN_OUTCOME: 'ORDER.DRAWER.ERROR.UNKNOWN_OUTCOME',
  CURRENCY_NOT_SUPPORTED: 'ORDER.DRAWER.ERROR.CURRENCY_NOT_SUPPORTED',
  CALLER_UNIDENTIFIED: 'ORDER.DRAWER.ERROR.CALLER_UNIDENTIFIED',
  APPROVAL_UNAVAILABLE: 'ORDER.DRAWER.ERROR.APPROVAL_UNAVAILABLE',
};

/** A refusal shown in the dialog's alert. */
export interface DialogFailure {
  readonly key: string;
  /** The reason named in the message ("{Reason} was just turned off"), as its translation key. */
  readonly reasonKey?: string;
  /** Labels of the fields a 400 named. */
  readonly fieldKeys?: readonly string[];
}

/**
 * A retried record whose earlier attempt is still unknown, refused before pos-order's replay check
 * (a 403): the copy makes no claim about the earlier attempt (item 6 amendment).
 */
const KEPT_ATTEMPT_KEYS: Readonly<Record<string, string>> = {
  FORBIDDEN: 'ORDER.DRAWER.ERROR.FORBIDDEN_RETRY',
  SCOPE_DENIED: 'ORDER.DRAWER.ERROR.SCOPE_DENIED_RETRY',
  REFUSED: 'ORDER.DRAWER.ERROR.REFUSED_RETRY',
};

type Draft = DrawerDraft;

/** The step-up's token, with the movement it was issued for. */
interface HeldApproval extends DrawerApproval {
  readonly boundTo: string;
}

/** The float reasons' fixed directions (§4.6): FLOAT_INCREASE puts cash in, FLOAT_DECREASE takes it out. */
const FIXED_DIRECTION: Readonly<Partial<Record<DrawerReason, 'PAID_IN' | 'PAID_OUT'>>> = {
  FLOAT_INCREASE: 'PAID_IN',
  FLOAT_DECREASE: 'PAID_OUT',
};

/** A float change always needs a manager (AC 8, AW16), whatever the served flag; others follow it. */
function alwaysNeedsManager(option: DrawerReasonOption): boolean {
  return FLOAT_REASONS.includes(option.reason) || option.alwaysNeedsManager;
}

/** A short random suffix for the credential inputs' `name`/`id` (not a secret, never sent). */
function newCredentialKey(): string {
  return uuidv4().replace(/-/g, '').slice(0, 12);
}

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
}

/**
 * Pay out / Change the float (CAP:550 S22, items 4–9): a native modal dialog that picks one of the
 * reasons the server allows now, takes its fields, and records the movement with a `requestId`
 * created when the dialog opens and reused for every retry and the approval round trip (§8.2).
 * When the server asks for a manager (or the reason always needs one, as a float change does), the
 * manager types their own username and password once, in inputs no password manager is meant to
 * save or fill and that sit in no form; they go to S16's step-up under the cashier's session and
 * are emptied, inputs and all, the moment it is sent. The single-use token it returns lives
 * only in this component until the movement is recorded or the dialog closes (AW31, ADR-0065).
 *
 * A record whose outcome is unknown is kept outside the dialog, in {@link DrawerAttemptStore}
 * (story item 6 as amended on #467): closing, reopening or leaving the page keeps its `requestId`
 * and frozen fields, and a reopened dialog restores it with Retry as the action. Only a definite
 * answer releases it ({@link settlesUnknownAttempt}).
 *
 * Every write is gated on `order:session:cash_movement` at the control and in the handler
 * (ADR-0040 §6a); the dialog never compares an amount with a limit (P7).
 */
@Component({
  selector: 'app-drawer-movement-dialog',
  standalone: true,
  imports: [TranslatePipe, MoneyPipe, ModalDialogDirective],
  templateUrl: './drawer-movement-dialog.component.html',
  styleUrl: './drawer-movement-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DrawerMovementDialogComponent implements OnInit {
  private readonly service = inject(RegisterSessionService);
  private readonly attempts = inject(DrawerAttemptStore);
  private readonly auth = inject(AuthService);
  private readonly clock = inject(DRAWER_CLOCK);
  private readonly destroyRef = inject(DestroyRef);

  readonly kind = input.required<DrawerDialogKind>();
  readonly sessionId = input.required<string>();
  /** The session's stamped currency (ADR-0067): every amount here is in it and sent with it. */
  readonly currencyCode = input.required<string>();
  readonly options = input.required<DrawerOptions>();
  /**
   * The page's session and options reads are both `'OK'` for this session right now (ADR-0064):
   * while either is pending or failed, no reason can be chosen and nothing can be submitted.
   */
  readonly optionsCurrent = input(true);
  /** The options read failed: the dialog says so and offers a re-read. */
  readonly optionsFailed = input(false);
  /** A record whose outcome is still unknown: the dialog opens on it, frozen, with Retry (item 6). */
  readonly attempt = input<PendingAttempt | null>(null);

  /** A confirmed recording: the page closes the dialog, announces it and re-reads. */
  readonly recorded = output<RecordedMovement>();
  readonly cancelled = output<void>();
  /** The session changed under the dialog (404, 409): the page closes it and re-reads the session. */
  readonly sessionChanged = output<DrawerSessionChange>();
  /** What the server allows changed (a reason switched off, a category retired, a 403): re-read the options. */
  readonly optionsStale = output<void>();

  private readonly alert = viewChild<ElementRef<HTMLElement>>('alert');
  private readonly usernameInput = viewChild<ElementRef<HTMLInputElement>>('usernameInput');
  private readonly primaryButton = viewChild<ElementRef<HTMLButtonElement>>('primaryButton');
  private readonly title = viewChild<ElementRef<HTMLElement>>('title');
  private readonly checking = viewChild<ElementRef<HTMLElement>>('checking');
  private readonly approveButton = viewChild<ElementRef<HTMLButtonElement>>('approveButton');

  // ── Form ─────────────────────────────────────────────────────────────────
  readonly reason = signal<DrawerReason | null>(null);
  readonly amountText = signal('');
  readonly categoryCode = signal('');
  readonly note = signal('');
  readonly receiptReference = signal('');
  readonly bagNumber = signal('');
  readonly managerUsername = signal('');
  readonly managerPassword = signal('');
  /** Tax as printed on the receipt, by regime (S32d): text as typed, never computed (P7). */
  readonly taxTexts = signal<Readonly<Record<string, string>>>({});
  readonly supplierName = signal('');
  /** The supplier's number as typed: held in memory only, never stored or logged (ADR-0065). */
  readonly supplierNumber = signal('');
  readonly taxFailure = signal<TaxFailure | null>(null);

  /** `details` holds the reason step (no reason chosen yet) and its fields; `approval` the manager step. */
  readonly step = signal<'details' | 'approval'>('details');
  /** The write lock: one request in flight at a time (§8.2, AC 11). */
  readonly phase = signal<'idle' | 'approving' | 'submitting'>('idle');
  readonly failure = signal<DialogFailure | null>(null);
  readonly invalidFields = signal<ReadonlySet<string>>(new Set());
  /** The last record's outcome is unknown: the primary action becomes Retry, same `requestId`. */
  readonly outcomeUnknown = signal(false);
  /**
   * The movement every send repeats exactly — after an unknown outcome, and through the approval
   * round trip that follows its retry — so a replayed first result is never announced as an edited
   * movement and one `requestId` never carries two payloads (§8.2).
   */
  readonly frozen = signal<Draft | null>(null);
  /** A step-up token is held (the token itself never sits in a signal). */
  readonly approvalHeld = signal(false);
  /**
   * The credential inputs' random `name`/`id` suffix, new each time the manager step renders, so a
   * password manager never sees a stable login field to fill or save (ADR-0065, owner decision #467).
   */
  readonly credentialKey = signal(newCredentialKey());

  /** The permission a refused write names (ADR-0040 §6a). */
  readonly cashMovementCode = ORDER_SECTION.cashMovement[0];

  readonly busy = computed(() => this.phase() !== 'idle');
  /** The movement's fields are frozen while a request is in flight or a movement is frozen. */
  readonly fieldsLocked = computed(() => this.busy() || this.frozen() !== null);
  readonly reasonsLocked = computed(() => this.fieldsLocked() || !this.optionsCurrent());
  readonly canRecord = computed(() => canAccess(this.auth, { permissions: ORDER_SECTION.cashMovement }));

  readonly offered = computed(() => offeredReasons(this.options(), this.kind()));
  /** The offered reasons, plus a frozen movement's reason even when it left the offer since. */
  readonly listed = computed<readonly DrawerReasonOption[]>(() => {
    const offered = this.offered();
    const frozen = this.frozen();
    if (!frozen || offered.some(option => option.reason === frozen.reason)) {
      return offered;
    }
    const option = this.options().reasons.find(candidate => candidate.reason === frozen.reason);
    return option ? [...offered, option] : offered;
  });
  readonly categories = computed<readonly PettyCategory[]>(() => this.options().categories);
  readonly chosen = computed<DrawerReasonOption | null>(() => {
    const reason = this.reason();
    return this.offered().find(option => option.reason === reason) ?? null;
  });
  /** The chosen reason's served option, offered now or not (direction, hints). */
  readonly reasonOption = computed<DrawerReasonOption | null>(() => {
    const reason = this.reason();
    return this.options().reasons.find(option => option.reason === reason) ?? null;
  });
  readonly selectedCategory = computed(
    () => this.categories().find(category => category.code === this.categoryCode()) ?? null,
  );
  /**
   * The regimes the chosen petty-expense category offers here and today (S32d `offeredRegimes`),
   * plus those a frozen movement stated: one tax field each. A category without any shows none,
   * and nothing here names a regime (owner direction).
   */
  readonly taxRegimes = computed<readonly string[]>(() => {
    if (this.reason() !== 'PETTY_EXPENSE') return [];
    const offered = this.selectedCategory()?.offeredRegimes ?? [];
    const frozen = (this.frozen()?.statedTaxes ?? []).map(tax => tax.regime).filter(regime => !offered.includes(regime));
    return [...offered, ...frozen];
  });
  readonly taxFieldsShown = computed(() => this.taxRegimes().length > 0);
  /** The served evidence rule, for the supplier number's hint (`| money`, never a literal). */
  readonly evidenceRule = computed(() => this.options().evidenceRule);
  /** The figures typed, by regime: a number when it reads as an amount, null when malformed. */
  private readonly typedTaxes = computed(() => {
    const currency = this.currencyCode();
    const texts = this.taxTexts();
    return this.taxRegimes()
      .map(regime => ({ regime, text: (texts[regime] ?? '').trim() }))
      .filter(entry => entry.text !== '')
      .map(entry => ({ regime: entry.regime, amount: parseAmount(entry.text, currency) }));
  });
  /** Any figure typed: the supplier's name is then required (S32d). */
  readonly taxTyped = computed(() => this.typedTaxes().length > 0);
  taxMalformed(regime: string): boolean {
    return this.typedTaxes().some(entry => entry.regime === regime && entry.amount === null);
  }
  readonly amount = computed(() => parseAmount(this.amountText(), this.currencyCode()));
  readonly rendered = computed<ReadonlySet<DrawerField>>(() => {
    const reason = this.reason();
    return new Set(reason ? RENDERED[reason] : []);
  });
  /** The story's required fields plus any the server lists that the form renders. */
  readonly required = computed<ReadonlySet<DrawerField>>(() => {
    const reason = this.reason();
    if (!reason) {
      return new Set();
    }
    const served = (this.chosen()?.requiredFields ?? []).filter((field): field is DrawerField =>
      (RENDERED[reason] as readonly string[]).includes(field),
    );
    return new Set([...REQUIRED[reason], ...served]);
  });
  readonly detailsComplete = computed(() => this.draft() !== null);
  /**
   * The reason always needs a manager: the manager step comes before the first submit. A float
   * change always does (AC 8, AW16), whatever the served flag says; other reasons follow the flag.
   */
  readonly needsManagerFirst = computed(() => {
    const chosen = this.chosen();
    return !!chosen && alwaysNeedsManager(chosen);
  });
  readonly alwaysNeedsManager = alwaysNeedsManager;

  readonly titleKey = computed(() =>
    this.kind() === 'FLOAT' ? 'ORDER.DRAWER.DIALOG.TITLE_FLOAT' : 'ORDER.DRAWER.DIALOG.TITLE_PAY_OUT',
  );
  readonly legendKey = computed(() =>
    this.kind() === 'FLOAT' ? 'ORDER.DRAWER.DIALOG.LEGEND_FLOAT' : 'ORDER.DRAWER.DIALOG.LEGEND_PAY_OUT',
  );
  readonly primaryKey = computed(() => {
    if (this.outcomeUnknown()) {
      return 'ORDER.DRAWER.DIALOG.RETRY';
    }
    return this.needsManagerFirst() && !this.approvalHeld() && !this.frozen()
      ? 'ORDER.DRAWER.DIALOG.CONTINUE_TO_MANAGER'
      : 'ORDER.DRAWER.DIALOG.RECORD';
  });
  /** Float reasons have a fixed direction; others take the served one (never a guessed OUT for a float). */
  readonly consequenceKey = computed(() => {
    const reason = this.reason();
    const direction = reason && FIXED_DIRECTION[reason] ? FIXED_DIRECTION[reason] : this.reasonOption()?.direction;
    return direction === 'PAID_IN' ? 'ORDER.DRAWER.DIALOG.CONSEQUENCE_IN' : 'ORDER.DRAWER.DIALOG.CONSEQUENCE_OUT';
  });
  readonly canSubmitDetails = computed(() => this.submitReady() && !this.busy());
  readonly canApprove = computed(() => this.approveReady() && !this.busy());
  /**
   * Record and Approve are `disabled` only while they could not be pressed at all; while a request
   * is in flight they are `aria-disabled` instead, so the pressed button keeps focus (ADR-0029 §8.7)
   * and the handlers refuse (§8.2).
   */
  readonly submitReady = computed(
    () => this.canRecord() && this.optionsCurrent() && (this.frozen() !== null || this.detailsComplete()),
  );
  readonly approveReady = computed(
    () =>
      this.canRecord() &&
      this.optionsCurrent() &&
      (this.frozen() !== null || this.detailsComplete()) &&
      this.managerUsername().trim().length > 0 &&
      this.managerPassword().length > 0,
  );

  readonly reasonLabelKey = (reason: DrawerReason): string =>
    this.kind() === 'FLOAT'
      ? reason === 'FLOAT_INCREASE'
        ? 'ORDER.DRAWER.DIALOG.FLOAT_ADD'
        : 'ORDER.DRAWER.DIALOG.FLOAT_TAKE'
      : reasonKey(reason);
  readonly reasonKeyOf = reasonKey;
  /** A Pay out reason that always needs a manager: float decreases say why, others say only that. */
  readonly managerHintKey = (reason: DrawerReason): string =>
    FLOAT_REASONS.includes(reason) ? 'ORDER.DRAWER.DIALOG.FLOAT_NOTE' : 'ORDER.DRAWER.DIALOG.ALWAYS_MANAGER_HINT';

  /** Created when the dialog opens (or restored from a pending attempt); rotates only on a definite answer. */
  private requestId = uuidv7();
  /** The approval token: never in a signal, storage or log, and dropped on success or close. */
  private approval: HeldApproval | null = null;
  private inFlight: Subscription | null = null;
  /** The record in flight, as it would be kept if its outcome became unknown. */
  private sending: PendingAttempt | null = null;
  /** Each request takes a ticket; only the current ticket may apply its answer (ADR-0063 §1). */
  private ticket = 0;

  constructor() {
    // No output on destroy (NG0953): a record still in flight is kept in the store instead.
    this.destroyRef.onDestroy(() => this.abandon());
    // A reason the server no longer offers (switched off mid-session, §9.4) leaves the form — but a
    // frozen movement keeps it: its retry is settled by the server, never by today's offer.
    effect(() => {
      const reason = this.reason();
      const offered = this.offered();
      if (reason && !this.frozen() && !offered.some(option => option.reason === reason)) {
        untracked(() => this.clearReason());
      }
    });
  }

  ngOnInit(): void {
    const attempt = this.attempt();
    if (attempt && attempt.sessionId === this.sessionId()) {
      this.restore(attempt);
    }
  }

  // ── Form handlers ────────────────────────────────────────────────────────
  chooseReason(reason: DrawerReason): void {
    if (this.reasonsLocked() || !this.offered().some(option => option.reason === reason)) {
      return;
    }
    this.reason.set(reason);
    this.invalidFields.set(new Set());
    this.taxFailure.set(null);
  }

  onAmount(event: Event): void {
    this.amountText.set(inputValue(event));
  }

  onCategory(event: Event): void {
    this.categoryCode.set(inputValue(event));
    this.taxFailure.set(null);
  }

  onNote(event: Event): void {
    this.note.set(inputValue(event));
  }

  onReceiptReference(event: Event): void {
    this.receiptReference.set(inputValue(event));
  }

  onBagNumber(event: Event): void {
    this.bagNumber.set(inputValue(event));
  }

  onTax(regime: string, event: Event): void {
    const value = inputValue(event);
    this.taxTexts.update(texts => ({ ...texts, [regime]: value }));
  }

  taxText(regime: string): string {
    return this.taxTexts()[regime] ?? '';
  }

  onSupplierName(event: Event): void {
    this.supplierName.set(inputValue(event));
  }

  onSupplierNumber(event: Event): void {
    this.supplierNumber.set(inputValue(event));
  }

  /** The field a tax refusal names (or the first of several): its message sits there. */
  readonly taxErrorAnchor = computed(() => this.taxFailure()?.fields[0] ?? null);

  taxFieldMarked(field: string): boolean {
    return !!this.taxFailure()?.fields.includes(field);
  }

  /** `aria-describedby` for a tax-section field: its hints, plus the refusal when it names the field. */
  describedBy(field: string, ...hints: (string | null)[]): string | null {
    const ids = [...hints, this.taxFieldMarked(field) ? 'drawer-tax-error' : null].filter(Boolean);
    return ids.length ? ids.join(' ') : null;
  }

  /**
   * 503 TAX_CHECK_UNAVAILABLE (S32d A4): nothing was recorded; the cashier may record the movement
   * without the supplier's number (the tax figures stay, so nothing is claimed for want of it).
   */
  recordWithoutNumber(): void {
    if (this.busy() || !this.taxFailure()?.withoutNumber) {
      return;
    }
    this.supplierNumber.set('');
    this.taxFailure.set(null);
    this.submitDetails();
  }

  onUsername(event: Event): void {
    this.managerUsername.set(inputValue(event));
  }

  onPassword(event: Event): void {
    this.managerPassword.set(inputValue(event));
  }

  /** Whether an approval token is held (tests: none survives a refusal, AC 6). */
  holdsApproval(): boolean {
    return this.approval !== null;
  }

  /** The `requestId` the next send carries (tests: it survives Cancel and reopening, item 6). */
  currentRequestId(): string {
    return this.requestId;
  }

  isInvalid(field: string): boolean {
    return this.invalidFields().has(field);
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  /** Record (or, for a reason that always needs a manager, go to the manager step first). */
  submitDetails(event?: Event): void {
    event?.preventDefault();
    if (!this.canSubmitDetails()) {
      return;
    }
    const frozen = this.frozen();
    const draft = frozen ?? this.draft();
    if (!draft) {
      return;
    }
    // A frozen movement is resent as it was: a replay answers first, so no manager step comes first.
    if (!frozen && this.needsManagerFirst() && !this.heldToken(draft)) {
      this.enterApproval();
      return;
    }
    this.record(draft);
  }

  /** Sends the manager's credentials to S16's step-up, then records with the token it returns. */
  approve(): void {
    if (!this.canApprove()) {
      return;
    }
    const draft = this.frozen() ?? this.draft();
    if (!draft) {
      return;
    }
    const request: CashMovementApprovalRequest = {
      managerUsername: this.managerUsername().trim(),
      managerPassword: this.managerPassword(),
      reason: APPROVAL_REASON[draft.reason],
      amount: draft.amount,
      currencyCode: draft.currencyCode,
      ...(draft.categoryCode ? { categoryCode: draft.categoryCode } : {}),
    };
    const approveHadFocus =
      typeof document !== 'undefined' && document.activeElement === this.approveButton()?.nativeElement;
    const ticket = ++this.ticket;
    // Sent: the credentials leave the signals now, and the inputs leave the DOM with them (the
    // template swaps them for "Checking the manager's approval…") — before any answer (ADR-0065).
    this.clearCredentials();
    this.phase.set('approving');
    this.failure.set(null);
    this.invalidFields.set(new Set());
    if (!approveHadFocus) {
      // Focus was not on Approve (a programmatic approve): land on the status that replaced the inputs.
      setTimeout(() => this.checking()?.nativeElement.focus());
    }
    this.inFlight = this.service
      .requestApproval(this.sessionId(), request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: approval => {
          if (ticket !== this.ticket) {
            return;
          }
          this.phase.set('idle');
          this.setApproval({ ...approval, boundTo: this.bindingOf(draft) });
          this.recordAfterApproval(draft);
        },
        error: (error: unknown) => {
          if (ticket !== this.ticket) {
            return;
          }
          this.phase.set('idle');
          const failure = classifyDrawerError(error, 'APPROVE');
          if (failure.kind === 'INVALID') {
            // A step-up 400 names the manager's fields: stay on the manager step to say which.
            this.invalidFields.set(new Set(failure.fields));
            this.enterApproval({ key: FAILURE_KEYS['INVALID'], fieldKeys: this.fieldLabelKeys(failure.fields) });
            return;
          }
          this.applyFailure(failure);
        },
      });
  }

  /** Back from the manager step to the movement's fields; no credential is kept. */
  backToDetails(): void {
    if (this.busy()) {
      return;
    }
    this.clearCredentials();
    this.failure.set(null);
    this.step.set('details');
    setTimeout(() => this.primaryButton()?.nativeElement.focus());
  }

  /** Asks the page to read the options again; the Retry button goes, so focus moves to the title. */
  retryOptions(): void {
    this.optionsStale.emit();
    setTimeout(() => this.title()?.nativeElement.focus());
  }

  /**
   * Cancel and Escape, always available so a hung request never traps the register in the modal. A
   * record still in flight is kept as a pending attempt (its outcome is now unknown); a frozen one
   * stays pending in the store; a plain Cancel with nothing pending starts over (item 6).
   */
  cancel(): void {
    this.abandon();
    this.cancelled.emit();
  }

  /**
   * Records after a successful step-up — or says why it cannot yet, never a silent no-op: the reason
   * left the offer (switched off), or the options are being read again (the token stays while valid).
   */
  private recordAfterApproval(draft: Draft): void {
    if (!this.outcomeUnknown() && this.chosen()?.reason !== draft.reason) {
      // Nothing was ever recorded under this id (only refused), so it may go with the movement.
      this.setApproval(null);
      this.unfreeze();
      this.requestId = uuidv7();
      this.showFailure({ key: FAILURE_KEYS['TYPE_NOT_ALLOWED'], reasonKey: reasonKey(draft.reason) });
      this.clearReason();
      return;
    }
    if (!this.optionsCurrent() || !this.canRecord()) {
      this.step.set('details');
      this.failure.set({ key: 'ORDER.DRAWER.DIALOG.APPROVED_WAITING' });
      setTimeout(() => this.alert()?.nativeElement.focus());
      return;
    }
    this.record(draft);
  }

  private record(draft: Draft): void {
    if (!this.canRecord() || !this.optionsCurrent() || this.busy()) {
      return;
    }
    const token = this.heldToken(draft);
    const requestId = this.requestId;
    const request: CashMovementRequest = {
      requestId,
      reason: RECORD_REASON[draft.reason],
      amount: draft.amount,
      currencyCode: draft.currencyCode,
      ...(draft.categoryCode ? { categoryCode: draft.categoryCode } : {}),
      ...(draft.note ? { note: draft.note } : {}),
      ...(draft.receiptReference ? { receiptReference: draft.receiptReference } : {}),
      ...(draft.bagNumber ? { bagNumber: draft.bagNumber } : {}),
      ...(draft.statedTaxes?.length ? { statedTaxes: draft.statedTaxes.map(tax => ({ regime: tax.regime, amount: tax.amount })) } : {}),
      ...(draft.supplierName ? { supplierName: draft.supplierName } : {}),
      ...(draft.supplierRegistrationNumber ? { supplierRegistrationNumber: draft.supplierRegistrationNumber } : {}),
      ...(token ? { approvalToken: token } : {}),
    };
    const sending: PendingAttempt = {
      requestId,
      draft,
      kind: this.kind(),
      sessionId: this.sessionId(),
      identity: this.attempts.identity(),
    };
    const ticket = ++this.ticket;
    this.sending = sending;
    this.phase.set('submitting');
    this.failure.set(null);
    this.taxFailure.set(null);
    this.invalidFields.set(new Set());
    this.inFlight = this.service
      .recordMovement(this.sessionId(), request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (ticket !== this.ticket) {
            return;
          }
          this.sending = null;
          this.phase.set('idle');
          this.attempts.settle(requestId);
          this.setApproval(null);
          this.unfreeze();
          this.requestId = uuidv7();
          this.recorded.emit({ reason: draft.reason, amount: draft.amount, currencyCode: draft.currencyCode, requestId });
        },
        error: (error: unknown) => {
          if (ticket !== this.ticket) {
            return;
          }
          this.sending = null;
          this.phase.set('idle');
          const failure = classifyDrawerError(error, 'RECORD');
          const wasUnknown = this.outcomeUnknown();
          if (failure.kind === 'UNKNOWN_OUTCOME') {
            // Kept outside the dialog: Cancel, reopening and leaving the page keep this id (item 6).
            this.frozen.set(draft);
            this.outcomeUnknown.set(true);
            this.attempts.hold(sending);
            this.applyFailure(failure, draft);
            return;
          }
          if (wasUnknown && !settlesUnknownAttempt(failure)) {
            // Refused before pos-order's replay check: the earlier attempt is still unknown.
            this.applyFailure(failure, draft, true);
            return;
          }
          // A definite answer: the attempt is settled, nothing was recorded under this id.
          this.attempts.release(requestId);
          this.outcomeUnknown.set(false);
          if (failure.kind === 'APPROVAL_REQUIRED' || failure.kind === 'APPROVAL_INVALID') {
            // The approval round trip resends this id: it stays bound to exactly this movement, so
            // its fields lock until it is recorded or the dialog closes (one id, one payload).
            this.frozen.set(draft);
          } else {
            this.unfreeze();
            this.requestId = uuidv7();
          }
          this.applyFailure(failure, draft);
        },
      });
  }

  /**
   * @param kept the earlier attempt is still unknown (a refusal made before the replay check):
   *   the copy makes no claim about it and the frozen movement stays for Retry.
   */
  private applyFailure(failure: DrawerFailure, draft?: Draft, kept = false): void {
    if (kept) {
      const key = KEPT_ATTEMPT_KEYS[failure.kind];
      if (failure.kind === 'CONFLICT') {
        this.sessionChanged.emit('CONFLICT');
        return;
      }
      this.showFailure({ key: key ?? FAILURE_KEYS['UNKNOWN_OUTCOME'] });
      if (failure.kind === 'FORBIDDEN' || failure.kind === 'SCOPE_DENIED') {
        this.optionsStale.emit();
      }
      return;
    }
    switch (failure.kind) {
      case 'APPROVAL_REQUIRED':
        this.setApproval(null);
        this.enterApproval();
        return;
      case 'APPROVAL_INVALID':
        this.setApproval(null);
        this.enterApproval({ key: FAILURE_KEYS['APPROVAL_INVALID'] });
        return;
      case 'APPROVAL_DENIED':
      case 'SELF_APPROVAL':
      case 'CALLER_UNIDENTIFIED':
        this.setApproval(null);
        this.enterApproval({ key: FAILURE_KEYS[failure.kind] });
        return;
      case 'TYPE_NOT_ALLOWED':
        this.setApproval(null);
        this.showFailure({ key: FAILURE_KEYS['TYPE_NOT_ALLOWED'], reasonKey: reasonKey(draft?.reason) });
        this.clearReason();
        this.optionsStale.emit();
        return;
      case 'CATEGORY_UNKNOWN':
        this.setApproval(null);
        this.categoryCode.set('');
        this.showFailure({ key: FAILURE_KEYS['CATEGORY_UNKNOWN'] });
        this.optionsStale.emit();
        return;
      case 'FLOAT_NOT_RECORDED':
      case 'CURRENCY_NOT_SUPPORTED':
      case 'REFUSED':
        this.setApproval(null);
        this.showFailure({ key: FAILURE_KEYS[failure.kind] });
        return;
      case 'SESSION_GONE':
        this.sessionChanged.emit('GONE');
        return;
      case 'SESSION_NOT_OPEN':
        this.sessionChanged.emit('NOT_OPEN');
        return;
      case 'IDEMPOTENCY_CONFLICT':
        this.sessionChanged.emit('ALREADY_RECORDED');
        return;
      case 'CONFLICT':
        this.sessionChanged.emit('CONFLICT');
        return;
      case 'INVALID': {
        this.setApproval(null); // a definitive refusal: the token goes with it
        const fields = failure.fields.map(field => fieldKeyOf(field, draft));
        this.invalidFields.set(new Set(fields));
        this.showFailure({ key: FAILURE_KEYS['INVALID'], fieldKeys: this.fieldLabelKeys(fields) });
        return;
      }
      case 'TAX_IMPLAUSIBLE':
      case 'TAX_REGIME_NOT_OFFERED':
      case 'SUPPLIER_NUMBER_NOT_ACCEPTED':
      case 'PRECISION':
      case 'TAX_CHECK_UNAVAILABLE':
        // Nothing was recorded and the approval token stays unspent (S32d): the cashier corrects the
        // named field, the input kept, and records again; the dialog never checked the figure itself (P7).
        this.showTaxFailure(failure, draft);
        if (failure.kind === 'TAX_REGIME_NOT_OFFERED') {
          this.optionsStale.emit();
        }
        return;
      case 'FORBIDDEN':
      case 'SCOPE_DENIED':
        // The options read enforces the same code and scope: its 403 hides the actions.
        this.setApproval(null);
        this.showFailure({ key: FAILURE_KEYS[failure.kind] });
        this.optionsStale.emit();
        return;
      case 'UNKNOWN_OUTCOME':
        // The same requestId (and the token while it is valid) goes again on Retry (§8.2).
        this.showFailure({ key: FAILURE_KEYS['UNKNOWN_OUTCOME'] });
        return;
      case 'APPROVAL_UNAVAILABLE':
        this.enterApproval({ key: FAILURE_KEYS['APPROVAL_UNAVAILABLE'] });
        return;
    }
  }

  /** A tax refusal at the field it names (AC 11): message there, `aria-describedby`, focus on the field. */
  private showTaxFailure(failure: DrawerFailure, draft?: Draft): void {
    const named = [...new Set(failure.fields.map(field => fieldKeyOf(field, draft)))];
    const fallback = TAX_FAILURE_FALLBACK[failure.kind] ?? 'statedTaxes';
    const fields = named.length ? named : [fallback];
    this.clearCredentials();
    this.step.set('details');
    this.failure.set(null);
    this.invalidFields.set(new Set(fields));
    this.taxFailure.set({
      key: TAX_FAILURE_KEYS[failure.kind] ?? FAILURE_KEYS['REFUSED'],
      fields,
      withoutNumber: failure.kind === 'TAX_CHECK_UNAVAILABLE',
    });
    setTimeout(() => this.focusField(fields[0]));
  }

  private focusField(field: string): void {
    const id = field.startsWith(TAX_FIELD)
      ? `drawer-tax-${field.slice(TAX_FIELD.length)}`
      : field === 'statedTaxes'
        ? 'drawer-tax-legend'
        : field === 'amount'
          ? 'drawer-amount'
          : field === 'supplierName'
            ? 'drawer-supplier-name'
            : 'drawer-supplier-number';
    const element = typeof document !== 'undefined' ? document.getElementById(id) : null;
    (element ?? this.alert()?.nativeElement)?.focus();
  }

  /** Opens on a record whose outcome is still unknown: its fields, frozen, and its `requestId`. */
  private restore(attempt: PendingAttempt): void {
    const draft = attempt.draft;
    this.requestId = attempt.requestId;
    this.reason.set(draft.reason);
    this.amountText.set(String(draft.amount));
    this.categoryCode.set(draft.categoryCode ?? '');
    this.note.set(draft.note ?? '');
    this.receiptReference.set(draft.receiptReference ?? '');
    this.bagNumber.set(draft.bagNumber ?? '');
    this.taxTexts.set(Object.fromEntries((draft.statedTaxes ?? []).map(tax => [tax.regime, String(tax.amount)])));
    this.supplierName.set(draft.supplierName ?? '');
    this.supplierNumber.set(draft.supplierRegistrationNumber ?? '');
    this.frozen.set(draft);
    this.outcomeUnknown.set(true);
    this.failure.set({ key: FAILURE_KEYS['UNKNOWN_OUTCOME'] });
  }

  /** Stops whatever is in flight; a record in flight becomes a pending attempt (its outcome is unknown). */
  private abandon(): void {
    const sending = this.phase() === 'submitting' ? this.sending : null;
    this.ticket++;
    this.inFlight?.unsubscribe();
    this.inFlight = null;
    this.sending = null;
    this.phase.set('idle');
    this.setApproval(null); // a replay is checked before an approval, so a retry needs no token
    this.clearCredentials();
    if (sending) {
      this.attempts.hold(sending);
    }
  }

  private unfreeze(): void {
    this.frozen.set(null);
    this.outcomeUnknown.set(false);
  }

  private setApproval(approval: HeldApproval | null): void {
    this.approval = approval;
    this.approvalHeld.set(approval !== null);
  }

  private fieldLabelKeys(fields: readonly string[]): string[] {
    const keys = fields
      .map(field => (field.startsWith(TAX_FIELD) ? FIELD_LABEL_KEYS['statedTaxes'] : FIELD_LABEL_KEYS[field]))
      .filter((key): key is string => !!key);
    return [...new Set(keys)];
  }

  /** The manager step, with the refusal that sent the dialog back to it, if any. */
  private enterApproval(failure: DialogFailure | null = null): void {
    this.clearCredentials();
    this.credentialKey.set(newCredentialKey());
    this.step.set('approval');
    this.failure.set(failure);
    setTimeout(() => {
      if (failure) {
        this.alert()?.nativeElement.focus();
      } else {
        this.usernameInput()?.nativeElement.focus();
      }
    });
  }

  /** A refusal on the movement's fields: back to the details step with the alert focused. */
  private showFailure(failure: DialogFailure): void {
    this.clearCredentials();
    this.step.set('details');
    this.failure.set(failure);
    setTimeout(() => this.alert()?.nativeElement.focus());
  }

  /** Leaves the reason step; never while a movement is frozen (its retry is still owed). */
  private clearReason(): void {
    if (this.frozen()) {
      return;
    }
    this.reason.set(null);
    this.setApproval(null);
    if (this.step() === 'approval') {
      this.step.set('details');
    }
  }

  private clearCredentials(): void {
    this.managerUsername.set('');
    this.managerPassword.set('');
  }

  /** The token, while it is valid for exactly this movement and has not expired. */
  private heldToken(draft: Draft | null): string | null {
    const approval = this.approval;
    if (!approval || !draft || approval.boundTo !== this.bindingOf(draft)) {
      return null;
    }
    if (approval.expiresAt && Date.parse(approval.expiresAt) <= this.clock().getTime()) {
      this.setApproval(null); // expired: dropped, never held for later
      this.clearCredentials();
      return null;
    }
    return approval.approvalToken;
  }

  /** What S16 binds a token to: session, reason, amount, currency and category (AW31). */
  private bindingOf(draft: Draft): string {
    return JSON.stringify([this.sessionId(), draft.reason, draft.amount, draft.currencyCode, draft.categoryCode ?? null]);
  }

  /** The movement as entered, or null while a required field is missing. */
  private draft(): Draft | null {
    const reason = this.reason();
    const amount = this.amount();
    if (!reason || !this.chosen() || amount === null) {
      return null;
    }
    const rendered = this.rendered();
    const required = this.required();
    const value = (field: DrawerField, text: string): string | undefined => {
      const trimmed = text.trim();
      return rendered.has(field) && trimmed ? trimmed : undefined;
    };
    const draft: Draft = {
      reason,
      amount,
      currencyCode: this.currencyCode(),
      categoryCode: value('categoryCode', this.categoryCode()),
      note: value('note', this.note()),
      receiptReference: value('receiptReference', this.receiptReference()),
      bagNumber: value('bagNumber', this.bagNumber()),
    };
    if (draft.categoryCode && !this.categories().some(category => category.code === draft.categoryCode)) {
      return null;
    }
    for (const field of required) {
      if (field !== 'amount' && !draft[field]) {
        return null;
      }
    }
    if (!this.taxFieldsShown()) {
      return draft;
    }
    // Tax as printed (S32d): a blank figure is omitted, a figure that is not an amount blocks Record;
    // the figure is never compared with the total or a rate here — the server decides (P7, AC 11).
    const typed = this.typedTaxes();
    if (typed.some(entry => entry.amount === null)) {
      return null;
    }
    const statedTaxes: DrawerStatedTax[] = typed.map(entry => ({ regime: entry.regime, amount: entry.amount as number }));
    const supplierName = this.supplierName().trim();
    if (statedTaxes.length && !supplierName) {
      return null;
    }
    const supplierRegistrationNumber = this.supplierNumber().trim();
    return {
      ...draft,
      ...(statedTaxes.length ? { statedTaxes } : {}),
      ...(supplierName ? { supplierName } : {}),
      ...(supplierRegistrationNumber ? { supplierRegistrationNumber } : {}),
    };
  }
}
