import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MoneyPipe } from '../../../../../shared/money.pipe';
import { ModalDialogDirective } from '../../../../../shared/modal-dialog.directive';
import {
  BILL_REASON_MAX,
  BILL_REASON_MIN,
  BillAction,
  BillDecisionDone,
  BillDecisionKind,
  BillDecisionRequest,
  BillDetail,
  BillPermissions,
  BillRevealed,
  BillVoidKind,
  NOTHING_REVEALED,
} from '../../../models/payables.models';
import { Copy, blockedCopy, findAction, offersResolveAndSend, reasonValid, taxOnResaleHeld, withParam } from '../../../utils/bill-display';
import { BillDecisionFailure, POSTING_FIELDS } from '../../../utils/bill-errors';

/** The decisions that open a reason dialog: Reject, and the two voids (AW42, AW45). */
export type ReasonDialogMode = 'REJECT' | BillVoidKind;

const DIALOG_KEYS: Readonly<Record<ReasonDialogMode, { readonly title: string; readonly label: string; readonly consequence: string; readonly confirm: string }>> = {
  REJECT: {
    title: 'ACCOUNTING.BILLS.DECISION.REJECT_TITLE',
    label: 'ACCOUNTING.BILLS.DECISION.REJECT_REASON_LABEL',
    consequence: 'ACCOUNTING.BILLS.DECISION.REJECT_CONSEQUENCE',
    confirm: 'ACCOUNTING.BILLS.DECISION.REJECT',
  },
  VOID_APPROVED: {
    title: 'ACCOUNTING.BILLS.DECISION.VOID_TITLE',
    label: 'ACCOUNTING.BILLS.DECISION.VOID_REASON_LABEL',
    consequence: 'ACCOUNTING.BILLS.DECISION.VOID_APPROVED_CONSEQUENCE',
    confirm: 'ACCOUNTING.BILLS.DECISION.VOID',
  },
  VOID_UNMATCHED: {
    title: 'ACCOUNTING.BILLS.DECISION.VOID_TITLE',
    label: 'ACCOUNTING.BILLS.DECISION.VOID_REASON_LABEL',
    consequence: 'ACCOUNTING.BILLS.DECISION.VOID_UNMATCHED_CONSEQUENCE',
    confirm: 'ACCOUNTING.BILLS.DECISION.VOID',
  },
};

let nextId = 0;

/**
 * Send for approval, Approve bill, Reject bill and the two voids (§5.2 item 4;
 * story item 6; Accounting ruling rows 4–6 on #464).
 *
 * Each control renders only when the session holds its write code
 * (`permissions`) and the bill serves the action (`availableActions`); a
 * listed action with `allowed = false` stays visible, `aria-disabled`, with
 * its translated reason (P5). Each committing button follows its consequence
 * sentence (P4). The handlers re-check both before asking the panel, which
 * re-checks again before it calls the server (ADR-0040 §6a).
 *
 * Reject and void open a native `dialog[appModalDialog]`; their errors show
 * inside it without losing the reason, and focus returns to the trigger on
 * close. A void refused 422 `PERIOD_CLOSED` asks a holder of
 * `accounting:period:override` for an override reason and resends.
 */
@Component({
  selector: 'app-bill-decision',
  standalone: true,
  imports: [TranslatePipe, MoneyPipe, ModalDialogDirective],
  templateUrl: './bill-decision.component.html',
  styleUrls: ['../../../bank-reconciliation-shared.css', '../bills-shared.css', './bill-decision.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillDecisionComponent {
  readonly bill = input.required<BillDetail>();
  readonly permissions = input.required<BillPermissions>();
  /** A decision is in flight or the bill is being read again: writes are disabled. */
  readonly busy = input(false);
  readonly failure = input<BillDecisionFailure | null>(null);
  readonly done = input<BillDecisionDone | null>(null);
  /** The panel's posting choices (classification, difference, override) are complete for Approve. */
  readonly postingReady = input(true);
  /** …and for Send, where the classification is only a proposal. */
  readonly sendReady = input(true);
  /** Fields a refusal revealed on this bill; they stay until a decision succeeds (R2 item 2). */
  readonly revealed = input<BillRevealed>(NOTHING_REVEALED);

  readonly decide = output<BillDecisionRequest>();

  readonly id = `bill-decision-${++nextId}`;
  readonly min = BILL_REASON_MIN;
  readonly max = BILL_REASON_MAX;
  readonly withParam = withParam;
  readonly dialogKeys = DIALOG_KEYS;

  readonly sendNote = signal('');
  readonly approveReason = signal('');
  readonly taxOnResale = signal('');
  readonly dialog = signal<ReasonDialogMode | null>(null);
  readonly dialogReason = signal('');
  readonly dialogOverride = signal('');

  readonly submitAction = computed(() =>
    this.permissions().approve && !offersResolveAndSend(this.bill()) ? findAction(this.bill(), 'SUBMIT_FOR_APPROVAL') : null,
  );
  readonly approveAction = computed(() => (this.permissions().approve ? findAction(this.bill(), 'APPROVE') : null));
  readonly rejectAction = computed(() => (this.permissions().reject ? findAction(this.bill(), 'REJECT') : null));
  readonly voidApprovedAction = computed(() => (this.permissions().reject ? findAction(this.bill(), 'VOID_APPROVED') : null));
  readonly voidUnmatchedAction = computed(() => (this.permissions().reject ? findAction(this.bill(), 'VOID_UNMATCHED') : null));

  /** Reject and the two voids, each with its served action (or null when not offered). */
  readonly reasonActions = computed(() =>
    (
      [
        { mode: 'REJECT', action: this.rejectAction(), testid: 'reject', labelKey: 'ACCOUNTING.BILLS.DECISION.REJECT' },
        { mode: 'VOID_APPROVED', action: this.voidApprovedAction(), testid: 'void-approved', labelKey: 'ACCOUNTING.BILLS.DECISION.VOID' },
        { mode: 'VOID_UNMATCHED', action: this.voidUnmatchedAction(), testid: 'void-unmatched', labelKey: 'ACCOUNTING.BILLS.DECISION.VOID' },
      ] as const
    ).map(entry => ({ ...entry, consequenceKey: DIALOG_KEYS[entry.mode].consequence })),
  );

  /** From `PENDING_RECEIPT_MATCH` the bill goes without a delivery match: "What was this for?" (AW8). */
  readonly withoutMatch = computed(() => this.bill().status === 'PENDING_RECEIPT_MATCH');

  /** The failure of one of this block's decisions, unless it names a posting field (that block shows it). */
  readonly sendFailure = computed(() => this.failureOf('SUBMIT'));
  readonly approveFailure = computed(() => this.failureOf('APPROVE'));
  readonly dialogFailure = computed(() => {
    const mode = this.dialog();
    return mode === 'REJECT' ? this.failureOf('REJECT') : mode ? this.failureOf('VOID') : null;
  });

  /**
   * S43: the hold for tax on goods for resale applies, so Approve asks why it
   * is accepted — also when the last Approve was refused for it and the read
   * (whose rules are cached) does not show the failing check yet (review A6).
   */
  readonly resaleHeld = computed(() => taxOnResaleHeld(this.bill()) || this.revealed().taxOnResale.includes('APPROVE'));

  /** A void refused 422 `PERIOD_CLOSED`, for a holder of `accounting:period:override`. */
  readonly voidOverrideShown = computed(
    () => this.dialog() === 'VOID_APPROVED' && this.permissions().periodOverride && this.revealed().override.includes('VOID'),
  );

  readonly sendValid = computed(() => reasonValid(this.sendNote(), BILL_REASON_MIN, BILL_REASON_MAX));
  readonly approveReasonValid = computed(() => {
    const value = this.approveReason().trim();
    const required = this.approveAction()?.justificationRequired === true;
    if (!value) return !required;
    return reasonValid(value, BILL_REASON_MIN, BILL_REASON_MAX);
  });
  readonly taxOnResaleValid = computed(
    () => !this.resaleHeld() || reasonValid(this.taxOnResale(), BILL_REASON_MIN, BILL_REASON_MAX),
  );
  readonly dialogValid = computed(
    () =>
      reasonValid(this.dialogReason(), BILL_REASON_MIN, BILL_REASON_MAX) &&
      (!this.voidOverrideShown() || reasonValid(this.dialogOverride(), BILL_REASON_MIN, BILL_REASON_MAX)),
  );

  /** "Approving puts {amount} owed to {vendor} on the books." (ruling row 4) */
  readonly approveConsequence = computed(() => ({ amount: this.bill().totalAmount, currency: this.bill().currency, vendor: this.bill().vendorName }));

  constructor() {
    // A confirmed decision clears its own input; Reject and the voids also close their dialog.
    effect(() => {
      const done = this.done();
      if (!done) return;
      untracked(() => {
        if (done.kind === 'SUBMIT') this.sendNote.set('');
        if (done.kind === 'APPROVE') {
          this.approveReason.set('');
          this.taxOnResale.set('');
        }
        if (done.kind === 'REJECT' || done.kind === 'VOID') {
          this.dialog.set(null);
          this.dialogReason.set('');
          this.dialogOverride.set('');
        }
      });
    });
  }

  blocked(action: BillAction): Copy {
    return blockedCopy(action, this.bill());
  }

  send(): void {
    const action = this.submitAction();
    if (!action?.allowed || this.busy() || !this.sendValid() || !this.sendReady()) return;
    this.decide.emit({ kind: 'SUBMIT', justification: this.sendNote().trim() });
  }

  approve(): void {
    const action = this.approveAction();
    if (!action?.allowed || this.busy() || !this.approveReasonValid() || !this.taxOnResaleValid() || !this.postingReady()) return;
    this.decide.emit({
      kind: 'APPROVE',
      justification: this.approveReason().trim() || null,
      taxOnResale: this.resaleHeld() ? this.taxOnResale().trim() : null,
    });
  }

  openDialog(mode: ReasonDialogMode): void {
    if (!this.dialogAction(mode)?.allowed || this.busy()) return;
    this.dialogReason.set('');
    this.dialogOverride.set('');
    this.dialog.set(mode);
  }

  /** Back-compat entry for Reject (tests and the template). */
  openReject(): void {
    this.openDialog('REJECT');
  }

  /** Esc or Cancel; `ModalDialogDirective` returns focus to the control that opened it. */
  closeDialog(): void {
    if (this.busy()) return;
    this.dialog.set(null);
    this.dialogReason.set('');
    this.dialogOverride.set('');
  }

  confirmDialog(): void {
    const mode = this.dialog();
    if (!mode || !this.dialogAction(mode)?.allowed || this.busy() || !this.dialogValid()) return;
    const reason = this.dialogReason().trim();
    if (mode === 'REJECT') {
      this.decide.emit({ kind: 'REJECT', reason });
      return;
    }
    this.decide.emit({
      kind: 'VOID',
      voidKind: mode,
      reason,
      overrideJustification: this.voidOverrideShown() ? this.dialogOverride().trim() : null,
    });
  }

  text(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  private dialogAction(mode: ReasonDialogMode): BillAction | null {
    if (mode === 'REJECT') return this.rejectAction();
    return mode === 'VOID_APPROVED' ? this.voidApprovedAction() : this.voidUnmatchedAction();
  }

  private failureOf(kind: BillDecisionKind): BillDecisionFailure | null {
    const failure = this.failure();
    if (failure?.kind !== kind) return null;
    // The void dialog shows its own override field; the other decisions leave posting fields to that block.
    return kind !== 'VOID' && POSTING_FIELDS.includes(failure.view.field) ? null : failure;
  }
}
