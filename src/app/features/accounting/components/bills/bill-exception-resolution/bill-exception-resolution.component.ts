import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MoneyPipe } from '../../../../../shared/money.pipe';
import {
  BILL_REASON_MAX,
  BILL_REASON_MIN,
  BillAction,
  BillActionCode,
  BillDecisionDone,
  BillDecisionRequest,
  BillDetail,
  BillPermissions,
  BillRevealed,
  ExceptionResolutionAction,
  NOTHING_REVEALED,
} from '../../../models/payables.models';
import { Copy, blockedCopy, findAction, offersResolveAndSend, reasonValid, taxOnResaleHeld, withParam } from '../../../utils/bill-display';
import { BillDecisionFailure, POSTING_FIELDS } from '../../../utils/bill-errors';

interface ResolutionChoice {
  readonly value: ExceptionResolutionAction;
  readonly action: BillAction;
  readonly labelKey: string;
  readonly hintKey: string;
  readonly consequenceKey: string;
}

const CHOICES: readonly {
  readonly value: ExceptionResolutionAction;
  readonly code: BillActionCode;
  readonly permission: keyof BillPermissions;
  readonly labelKey: string;
  readonly hintKey: string;
  readonly consequenceKey: string;
}[] = [
  {
    value: 'ACCEPT',
    code: 'ACCEPT_EXCEPTION',
    permission: 'approve',
    labelKey: 'ACCOUNTING.BILLS.EXCEPTION.ACCEPT',
    hintKey: 'ACCOUNTING.BILLS.EXCEPTION.ACCEPT_HINT',
    consequenceKey: 'ACCOUNTING.BILLS.DECISION.APPROVE_CONSEQUENCE',
  },
  {
    value: 'CORRECT',
    code: 'CORRECT_EXCEPTION',
    permission: 'approve',
    labelKey: 'ACCOUNTING.BILLS.EXCEPTION.CORRECT',
    hintKey: 'ACCOUNTING.BILLS.EXCEPTION.CORRECT_HINT',
    consequenceKey: 'ACCOUNTING.BILLS.EXCEPTION.CORRECT_CONSEQUENCE',
  },
  {
    value: 'VOID',
    code: 'VOID_EXCEPTION',
    permission: 'reject',
    labelKey: 'ACCOUNTING.BILLS.EXCEPTION.VOID',
    hintKey: 'ACCOUNTING.BILLS.EXCEPTION.VOID_HINT',
    consequenceKey: 'ACCOUNTING.BILLS.EXCEPTION.VOID_CONSEQUENCE',
  },
];

let nextId = 0;

/**
 * Doesn't match delivery (§5.2 item 4; story item 6): Accept as billed ·
 * Correct the bill · Void the bill, each offered only when the bill serves it
 * and the session holds its code (accept and correct
 * `accounting:ap:approve`/`…:approve_over_limit`, void `accounting:ap:reject`),
 * with a required "Why?". `ACCEPT` is an approval (AW6), so S43's
 * tax-on-goods-for-resale reason is asked with it when the hold applies.
 *
 * When Accept as billed is served blocked by the clerk limit while Send for
 * approval is allowed, **Resolve and send for approval** submits the bill with
 * the "Why?" for an over-limit approver (§5.1).
 */
@Component({
  selector: 'app-bill-exception-resolution',
  standalone: true,
  imports: [TranslatePipe, MoneyPipe],
  templateUrl: './bill-exception-resolution.component.html',
  styleUrls: ['../../../bank-reconciliation-shared.css', '../bills-shared.css', './bill-exception-resolution.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillExceptionResolutionComponent {
  readonly bill = input.required<BillDetail>();
  readonly permissions = input.required<BillPermissions>();
  readonly busy = input(false);
  readonly failure = input<BillDecisionFailure | null>(null);
  readonly done = input<BillDecisionDone | null>(null);
  /** The panel's posting choices are complete for Accept as billed (an approval). */
  readonly postingReady = input(true);
  /** …and for Resolve and send for approval, where the classification is only a proposal. */
  readonly sendReady = input(true);
  /** Fields a refusal revealed on this bill; they stay until a decision succeeds (R2 item 2). */
  readonly revealed = input<BillRevealed>(NOTHING_REVEALED);

  readonly decide = output<BillDecisionRequest>();

  readonly id = `bill-exception-${++nextId}`;
  readonly min = BILL_REASON_MIN;
  readonly max = BILL_REASON_MAX;
  readonly withParam = withParam;

  readonly choice = signal<ExceptionResolutionAction | null>(null);
  readonly reason = signal('');
  readonly taxOnResale = signal('');

  /** The served choices the session may take, in §5.2 order. */
  readonly choices = computed<readonly ResolutionChoice[]>(() => {
    const bill = this.bill();
    const permissions = this.permissions();
    if (bill.status !== 'MATCH_EXCEPTION') return [];
    return CHOICES.flatMap(choice => {
      const action = permissions[choice.permission] ? findAction(bill, choice.code) : null;
      return action ? [{ ...choice, action }] : [];
    });
  });

  readonly resolveAndSend = computed(
    () => this.bill().status === 'MATCH_EXCEPTION' && this.permissions().approve && offersResolveAndSend(this.bill()),
  );

  readonly selected = computed(() => this.choices().find(choice => choice.value === this.choice()) ?? null);
  /** S43, also after the last Accept was refused for it while the read does not show the check yet (review A6). */
  readonly asksTaxOnResale = computed(
    () =>
      this.choice() === 'ACCEPT' &&
      (taxOnResaleHeld(this.bill()) || this.revealed().taxOnResale.includes('RESOLVE')),
  );
  readonly reasonOk = computed(() => reasonValid(this.reason(), BILL_REASON_MIN, BILL_REASON_MAX));
  readonly taxOnResaleOk = computed(
    () => !this.asksTaxOnResale() || reasonValid(this.taxOnResale(), BILL_REASON_MIN, BILL_REASON_MAX),
  );
  readonly canResolve = computed(
    () =>
      !!this.selected()?.action.allowed &&
      this.reasonOk() &&
      this.taxOnResaleOk() &&
      !this.busy() &&
      (this.choice() !== 'ACCEPT' || this.postingReady()),
  );

  /** "Approving puts {amount} owed to {vendor} on the books." — Accept as billed is an approval. */
  readonly consequenceParams = computed(() => ({ amount: this.bill().totalAmount, currency: this.bill().currency, vendor: this.bill().vendorName }));

  /** This block's refusal, unless it names a posting field (the posting block shows it). */
  readonly ownFailure = computed(() => {
    const failure = this.failure();
    if (!failure || (failure.kind !== 'RESOLVE' && failure.kind !== 'RESOLVE_AND_SEND')) return null;
    return POSTING_FIELDS.includes(failure.view.field) ? null : failure;
  });

  constructor() {
    effect(() => {
      const done = this.done();
      if (!done || (done.kind !== 'RESOLVE' && done.kind !== 'RESOLVE_AND_SEND')) return;
      untracked(() => {
        this.choice.set(null);
        this.reason.set('');
        this.taxOnResale.set('');
      });
    });
  }

  blocked(action: BillAction): Copy {
    return blockedCopy(action, this.bill());
  }

  /** A blocked choice stays focusable (`aria-disabled`, its reason described) but is never taken (review B1). */
  pick(value: ExceptionResolutionAction, event?: Event): void {
    const choice = this.choices().find(entry => entry.value === value);
    if (!choice?.action.allowed) {
      if (event?.target instanceof HTMLInputElement) event.target.checked = this.choice() === value;
      return;
    }
    this.choice.set(value);
  }

  resolve(): void {
    const choice = this.selected();
    if (!choice?.action.allowed || this.busy() || !this.reasonOk() || !this.taxOnResaleOk()) return;
    if (choice.value === 'ACCEPT' && !this.postingReady()) return;
    this.decide.emit({
      kind: 'RESOLVE',
      action: choice.value,
      reason: this.reason().trim(),
      taxOnResale: this.asksTaxOnResale() ? this.taxOnResale().trim() : null,
    });
  }

  sendForApproval(): void {
    if (!this.resolveAndSend() || this.busy() || !this.reasonOk() || !this.sendReady()) return;
    this.decide.emit({ kind: 'RESOLVE_AND_SEND', reason: this.reason().trim() });
  }

  text(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }
}
