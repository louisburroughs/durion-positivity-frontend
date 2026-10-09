import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MoneyPipe } from '../../../../../shared/money.pipe';
import { ModalDialogDirective } from '../../../../../shared/modal-dialog.directive';
import {
  BILL_REASON_MAX,
  BILL_REASON_MIN,
  BillAction,
  BillDecisionDone,
  BillDecisionRequest,
  BillDetail,
  BillPermissions,
} from '../../../models/payables.models';
import { Copy, blockedCopy, findAction, offersResolveAndSend, reasonValid, taxOnResaleHeld, withParam } from '../../../utils/bill-display';
import { BillDecisionFailure } from '../../../utils/bill-errors';

let nextId = 0;

/**
 * Send for approval, Approve bill and Reject bill (§5.2 item 4; story item 6).
 *
 * Each control renders only when the session holds its write code
 * (`permissions`) and the bill serves the action (`availableActions`); a
 * listed action with `allowed = false` stays visible, `aria-disabled`, with
 * its translated reason (P5). Each committing button follows its consequence
 * sentence (P4). The handlers re-check both before asking the panel, which
 * re-checks again before it calls the server (ADR-0040 §6a).
 *
 * Reject opens a native `dialog[appModalDialog]`; its errors show inside it
 * without losing the reason, and focus returns to Reject bill on close.
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

  readonly decide = output<BillDecisionRequest>();

  readonly id = `bill-decision-${++nextId}`;
  readonly min = BILL_REASON_MIN;
  readonly max = BILL_REASON_MAX;
  readonly withParam = withParam;

  readonly sendNote = signal('');
  readonly approveReason = signal('');
  readonly taxOnResale = signal('');
  readonly rejectOpen = signal(false);
  readonly rejectReason = signal('');

  readonly submitAction = computed(() =>
    this.permissions().approve && !offersResolveAndSend(this.bill()) ? findAction(this.bill(), 'SUBMIT_FOR_APPROVAL') : null,
  );
  readonly approveAction = computed(() => (this.permissions().approve ? findAction(this.bill(), 'APPROVE') : null));
  readonly rejectAction = computed(() => (this.permissions().reject ? findAction(this.bill(), 'REJECT') : null));

  /** From `PENDING_RECEIPT_MATCH` the bill goes without a delivery match: "What was this for?" (AW8). */
  readonly withoutMatch = computed(() => this.bill().status === 'PENDING_RECEIPT_MATCH');
  /** S43: the hold for tax on goods for resale applies, so Approve asks why it is accepted. */
  readonly resaleHeld = computed(() => taxOnResaleHeld(this.bill()));

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
  readonly rejectValid = computed(() => reasonValid(this.rejectReason(), BILL_REASON_MIN, BILL_REASON_MAX));

  /** The failure of one of this block's decisions, if that is what was refused last. */
  readonly sendFailure = computed(() => this.failureOf('SUBMIT'));
  readonly approveFailure = computed(() => this.failureOf('APPROVE'));
  readonly rejectFailure = computed(() => this.failureOf('REJECT'));

  constructor() {
    // A confirmed decision clears its own input; Reject also closes its dialog.
    effect(() => {
      const done = this.done();
      if (!done) return;
      untracked(() => {
        if (done.kind === 'SUBMIT') this.sendNote.set('');
        if (done.kind === 'APPROVE') {
          this.approveReason.set('');
          this.taxOnResale.set('');
        }
        if (done.kind === 'REJECT') {
          this.rejectOpen.set(false);
          this.rejectReason.set('');
        }
      });
    });
  }

  blocked(action: BillAction): Copy {
    return blockedCopy(action, this.bill());
  }

  send(): void {
    const action = this.submitAction();
    if (!action?.allowed || this.busy() || !this.sendValid()) return;
    this.decide.emit({ kind: 'SUBMIT', justification: this.sendNote().trim() });
  }

  approve(): void {
    const action = this.approveAction();
    if (!action?.allowed || this.busy() || !this.approveReasonValid() || !this.taxOnResaleValid()) return;
    this.decide.emit({
      kind: 'APPROVE',
      justification: this.approveReason().trim() || null,
      taxOnResale: this.resaleHeld() ? this.taxOnResale().trim() : null,
    });
  }

  openReject(): void {
    const action = this.rejectAction();
    if (!action?.allowed || this.busy()) return;
    this.rejectReason.set('');
    this.rejectOpen.set(true);
  }

  /** Esc or Cancel; `ModalDialogDirective` returns focus to Reject bill. */
  closeReject(): void {
    if (this.busy()) return;
    this.rejectOpen.set(false);
    this.rejectReason.set('');
  }

  confirmReject(): void {
    const action = this.rejectAction();
    if (!action?.allowed || this.busy() || !this.rejectValid()) return;
    this.decide.emit({ kind: 'REJECT', reason: this.rejectReason().trim() });
  }

  text(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  private failureOf(kind: BillDecisionFailure['kind']): BillDecisionFailure | null {
    const failure = this.failure();
    return failure?.kind === kind ? failure : null;
  }
}
