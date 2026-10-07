import {
  ChangeDetectionStrategy,
  Component,
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
import { v7 as uuidv7 } from 'uuid';
import { canAccess } from '../../../../core/security/route-access';
import { ORDER_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { MoneyPipe } from '../../../../shared/money.pipe';
import {
  DrawerApproval,
  DrawerDialogKind,
  DrawerOptions,
  DrawerReason,
  DrawerReasonOption,
  PettyCategory,
  RecordedMovement,
  offeredReasons,
  reasonKey,
} from '../../models/register-drawer.models';
import {
  APPROVAL_REASON,
  DrawerFailure,
  RECORD_REASON,
  RegisterSessionService,
  classifyDrawerError,
} from '../../services/register-session.service';
import { parseAmount } from '../../utils/drawer-amount.util';

/** The dialog's clock, for the approval token's expiry. Tests inject a fixed instant. */
export const DRAWER_CLOCK = new InjectionToken<() => Date>('DRAWER_CLOCK', {
  providedIn: 'root',
  factory: () => () => new Date(),
});

/** Why the dialog handed the drawer back to the page: the session changed under it. */
export type DrawerSessionChange = 'GONE' | 'NOT_OPEN' | 'CONFLICT';

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
};

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

/** The movement as entered: what a record and its approval are both bound to. */
interface Draft {
  readonly reason: DrawerReason;
  readonly amount: number;
  readonly currencyCode: string;
  readonly categoryCode?: string;
  readonly note?: string;
  readonly receiptReference?: string;
  readonly bagNumber?: string;
}

/** The step-up's token, with the movement it was issued for. */
interface HeldApproval extends DrawerApproval {
  readonly boundTo: string;
}

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
}

/**
 * Pay out / Change the float (CAP:550 S22, items 4–9): a native modal dialog that picks one of the
 * reasons the server allows now, takes its fields, and records the movement with a `requestId`
 * created when the dialog opens and reused for every retry and the approval round trip (§8.2).
 * When the server asks for a manager (or the reason always needs one, as a float change does), the
 * manager types their own username and password once; they go to S16's step-up under the
 * cashier's session and are emptied as soon as it answers. The single-use token it returns lives
 * only in this component until the movement is recorded or the dialog closes (AW31, ADR-0065).
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
export class DrawerMovementDialogComponent {
  private readonly service = inject(RegisterSessionService);
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

  // ── Form ─────────────────────────────────────────────────────────────────
  readonly reason = signal<DrawerReason | null>(null);
  readonly amountText = signal('');
  readonly categoryCode = signal('');
  readonly note = signal('');
  readonly receiptReference = signal('');
  readonly bagNumber = signal('');
  readonly managerUsername = signal('');
  readonly managerPassword = signal('');

  /** `details` holds the reason step (no reason chosen yet) and its fields; `approval` the manager step. */
  readonly step = signal<'details' | 'approval'>('details');
  /** The write lock: one request in flight at a time (§8.2, AC 11). */
  readonly phase = signal<'idle' | 'approving' | 'submitting'>('idle');
  readonly failure = signal<DialogFailure | null>(null);
  readonly invalidFields = signal<ReadonlySet<string>>(new Set());
  /** The last record's outcome is unknown: the primary action becomes Retry, same `requestId`. */
  readonly outcomeUnknown = signal(false);

  /** The permission a refused write names (ADR-0040 §6a). */
  readonly cashMovementCode = ORDER_SECTION.cashMovement[0];

  readonly busy = computed(() => this.phase() !== 'idle');
  /** The movement's fields are frozen while a request is in flight or its outcome is unknown. */
  readonly fieldsLocked = computed(() => this.busy() || this.outcomeUnknown());
  readonly reasonsLocked = computed(() => this.fieldsLocked() || !this.optionsCurrent());
  readonly canRecord = computed(() => canAccess(this.auth, { permissions: ORDER_SECTION.cashMovement }));

  readonly offered = computed(() => offeredReasons(this.options(), this.kind()));
  readonly categories = computed<readonly PettyCategory[]>(() => this.options().categories);
  readonly chosen = computed<DrawerReasonOption | null>(() => {
    const reason = this.reason();
    return this.offered().find(option => option.reason === reason) ?? null;
  });
  readonly selectedCategory = computed(
    () => this.categories().find(category => category.code === this.categoryCode()) ?? null,
  );
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
  /** The reason always needs a manager (a float change, AW16): the manager step comes before the first submit. */
  readonly needsManagerFirst = computed(() => this.chosen()?.alwaysNeedsManager === true);

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
    return this.needsManagerFirst() ? 'ORDER.DRAWER.DIALOG.CONTINUE_TO_MANAGER' : 'ORDER.DRAWER.DIALOG.RECORD';
  });
  readonly consequenceKey = computed(() =>
    this.chosen()?.direction === 'PAID_IN' ? 'ORDER.DRAWER.DIALOG.CONSEQUENCE_IN' : 'ORDER.DRAWER.DIALOG.CONSEQUENCE_OUT',
  );
  readonly canSubmitDetails = computed(
    () => this.canRecord() && this.optionsCurrent() && !this.busy() && this.detailsComplete(),
  );
  readonly canApprove = computed(
    () =>
      this.canRecord() &&
      this.optionsCurrent() &&
      !this.busy() &&
      this.detailsComplete() &&
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

  /** Created when the dialog opens; rotates only after a confirmed success (§8.2). */
  private requestId = uuidv7();
  /** The approval token: never in a signal, storage or log, and dropped on success or close. */
  private approval: HeldApproval | null = null;
  private inFlight: Subscription | null = null;
  /**
   * The movement whose record's outcome is unknown: Retry resends exactly it (same `requestId`), so
   * a replayed first result is never announced as an edited movement (§8.2).
   */
  private unconfirmed: Draft | null = null;
  /** Each request takes a ticket; only the current ticket may apply its answer (ADR-0063 §1). */
  private ticket = 0;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.ticket++;
      this.inFlight?.unsubscribe();
      this.inFlight = null;
      this.approval = null;
      this.managerUsername.set('');
      this.managerPassword.set('');
    });
    // A reason the server no longer offers (switched off mid-session, §9.4) leaves the form.
    effect(() => {
      const reason = this.reason();
      const offered = this.offered();
      if (reason && !offered.some(option => option.reason === reason)) {
        untracked(() => this.clearReason());
      }
    });
  }

  // ── Form handlers ────────────────────────────────────────────────────────
  chooseReason(reason: DrawerReason): void {
    if (this.reasonsLocked() || !this.offered().some(option => option.reason === reason)) {
      return;
    }
    this.reason.set(reason);
    this.invalidFields.set(new Set());
  }

  onAmount(event: Event): void {
    this.amountText.set(inputValue(event));
  }

  onCategory(event: Event): void {
    this.categoryCode.set(inputValue(event));
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
    const draft = this.unconfirmed ?? this.draft();
    if (!draft) {
      return;
    }
    if (this.needsManagerFirst() && !this.heldToken(draft)) {
      this.enterApproval();
      return;
    }
    this.record(draft);
  }

  /** Sends the manager's credentials to S16's step-up, then records with the token it returns. */
  approve(event?: Event): void {
    event?.preventDefault();
    if (!this.canApprove()) {
      return;
    }
    const draft = this.unconfirmed ?? this.draft();
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
    const ticket = ++this.ticket;
    this.phase.set('approving');
    this.failure.set(null);
    this.invalidFields.set(new Set());
    this.inFlight = this.service
      .requestApproval(this.sessionId(), request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: approval => {
          if (ticket !== this.ticket) {
            return;
          }
          this.clearCredentials();
          this.phase.set('idle');
          this.approval = { ...approval, boundTo: this.bindingOf(draft) };
          this.record(draft);
        },
        error: (error: unknown) => {
          if (ticket !== this.ticket) {
            return;
          }
          this.clearCredentials();
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

  /** Asks the page to read the options again after a failed read. */
  retryOptions(): void {
    this.optionsStale.emit();
  }

  cancel(): void {
    this.ticket++;
    this.inFlight?.unsubscribe();
    this.inFlight = null;
    this.phase.set('idle');
    this.approval = null;
    this.unconfirmed = null;
    this.clearCredentials();
    this.cancelled.emit();
  }

  private record(draft: Draft): void {
    if (!this.canRecord() || !this.optionsCurrent() || this.busy()) {
      return;
    }
    const token = this.heldToken(draft);
    const request: CashMovementRequest = {
      requestId: this.requestId,
      reason: RECORD_REASON[draft.reason],
      amount: draft.amount,
      currencyCode: draft.currencyCode,
      ...(draft.categoryCode ? { categoryCode: draft.categoryCode } : {}),
      ...(draft.note ? { note: draft.note } : {}),
      ...(draft.receiptReference ? { receiptReference: draft.receiptReference } : {}),
      ...(draft.bagNumber ? { bagNumber: draft.bagNumber } : {}),
      ...(token ? { approvalToken: token } : {}),
    };
    const ticket = ++this.ticket;
    this.phase.set('submitting');
    this.failure.set(null);
    this.invalidFields.set(new Set());
    this.outcomeUnknown.set(false);
    this.inFlight = this.service
      .recordMovement(this.sessionId(), request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (ticket !== this.ticket) {
            return;
          }
          this.phase.set('idle');
          this.approval = null;
          this.unconfirmed = null;
          this.requestId = uuidv7();
          this.recorded.emit({ reason: draft.reason, amount: draft.amount, currencyCode: draft.currencyCode });
        },
        error: (error: unknown) => {
          if (ticket !== this.ticket) {
            return;
          }
          this.phase.set('idle');
          const failure = classifyDrawerError(error, 'RECORD');
          // Only an unanswered record keeps its movement for Retry; any answer settles it.
          this.unconfirmed = failure.kind === 'UNKNOWN_OUTCOME' ? draft : null;
          this.applyFailure(failure, draft);
        },
      });
  }

  private applyFailure(failure: DrawerFailure, draft?: Draft): void {
    switch (failure.kind) {
      case 'APPROVAL_REQUIRED':
        this.approval = null;
        this.enterApproval();
        return;
      case 'APPROVAL_INVALID':
        this.approval = null;
        this.enterApproval({ key: FAILURE_KEYS['APPROVAL_INVALID'] });
        return;
      case 'APPROVAL_DENIED':
      case 'SELF_APPROVAL':
        this.approval = null;
        this.enterApproval({ key: FAILURE_KEYS[failure.kind] });
        return;
      case 'TYPE_NOT_ALLOWED':
        this.approval = null;
        this.showFailure({ key: FAILURE_KEYS['TYPE_NOT_ALLOWED'], reasonKey: reasonKey(draft?.reason) });
        this.clearReason();
        this.optionsStale.emit();
        return;
      case 'CATEGORY_UNKNOWN':
        this.approval = null;
        this.categoryCode.set('');
        this.showFailure({ key: FAILURE_KEYS['CATEGORY_UNKNOWN'] });
        this.optionsStale.emit();
        return;
      case 'FLOAT_NOT_RECORDED':
        this.approval = null;
        this.showFailure({ key: FAILURE_KEYS['FLOAT_NOT_RECORDED'] });
        return;
      case 'SESSION_GONE':
        this.sessionChanged.emit('GONE');
        return;
      case 'SESSION_NOT_OPEN':
        this.sessionChanged.emit('NOT_OPEN');
        return;
      case 'CONFLICT':
        this.sessionChanged.emit('CONFLICT');
        return;
      case 'INVALID':
        this.approval = null; // a definitive refusal: the token goes with it
        this.invalidFields.set(new Set(failure.fields));
        this.showFailure({ key: FAILURE_KEYS['INVALID'], fieldKeys: this.fieldLabelKeys(failure.fields) });
        return;
      case 'FORBIDDEN':
      case 'SCOPE_DENIED':
        // The options read enforces the same code and scope: its 403 hides the actions.
        this.approval = null;
        this.showFailure({ key: FAILURE_KEYS[failure.kind] });
        this.optionsStale.emit();
        return;
      case 'UNKNOWN_OUTCOME':
        // The same requestId (and the token while it is valid) goes again on Retry (§8.2).
        this.outcomeUnknown.set(true);
        this.showFailure({ key: FAILURE_KEYS['UNKNOWN_OUTCOME'] });
        return;
      case 'APPROVAL_UNAVAILABLE':
        this.enterApproval({ key: FAILURE_KEYS['APPROVAL_UNAVAILABLE'] });
        return;
      case 'REFUSED':
        this.approval = null;
        this.showFailure({ key: FAILURE_KEYS['REFUSED'] });
        return;
    }
  }

  private fieldLabelKeys(fields: readonly string[]): string[] {
    return fields.map(field => FIELD_LABEL_KEYS[field]).filter((key): key is string => !!key);
  }

  /** The manager step, with the refusal that sent the dialog back to it, if any. */
  private enterApproval(failure: DialogFailure | null = null): void {
    this.clearCredentials();
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

  private clearReason(): void {
    this.reason.set(null);
    this.approval = null;
    this.unconfirmed = null;
    this.outcomeUnknown.set(false);
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
      this.approval = null; // expired: dropped, never held for later
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
    return draft;
  }
}
