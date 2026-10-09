import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MoneyPipe } from '../../../../../shared/money.pipe';
import {
  BILL_REASON_MAX,
  BILL_REASON_MIN,
  BillDecisionDone,
  BillDecisionRequest,
  BillAction,
  BillDetail,
  BillPermissions,
} from '../../../models/payables.models';
import { toDatePipeInput } from '../../../utils/date-only.util';
import { Copy, blockedCopy, findAction, reasonValid, withParam } from '../../../utils/bill-display';
import { BillDecisionFailure } from '../../../utils/bill-errors';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

let nextId = 0;

/**
 * The bill's due date, or "No due date yet" (§5.2 item 4; AW11): with the
 * served `SET_DUE_DATE` and `accounting:ap:approve`, **Add the vendor's due
 * date** opens a small form for the date the vendor's document states and an
 * optional reason (at least 10 characters when given). Dates stay
 * `YYYY-MM-DD` strings and render through `toDatePipeInput` (ADR-0038).
 */
@Component({
  selector: 'app-bill-due-date',
  standalone: true,
  imports: [DatePipe, MoneyPipe, TranslatePipe],
  templateUrl: './bill-due-date.component.html',
  styleUrls: ['../../../bank-reconciliation-shared.css', '../bills-shared.css', './bill-due-date.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillDueDateComponent {
  readonly bill = input.required<BillDetail>();
  readonly permissions = input.required<BillPermissions>();
  readonly busy = input(false);
  readonly failure = input<BillDecisionFailure | null>(null);
  readonly done = input<BillDecisionDone | null>(null);

  readonly decide = output<BillDecisionRequest>();

  readonly id = `bill-due-date-${++nextId}`;
  readonly min = BILL_REASON_MIN;
  readonly max = BILL_REASON_MAX;
  readonly toDate = toDatePipeInput;
  readonly withParam = withParam;

  readonly editing = signal(false);
  readonly dueDate = signal('');
  readonly reason = signal('');

  readonly action = computed(() => (this.permissions().setDueDate ? findAction(this.bill(), 'SET_DUE_DATE') : null));
  readonly dateOk = computed(() => DATE_ONLY.test(this.dueDate()));
  readonly reasonOk = computed(() => !this.reason().trim() || reasonValid(this.reason(), BILL_REASON_MIN, BILL_REASON_MAX));
  readonly ownFailure = computed(() => (this.failure()?.kind === 'DUE_DATE' ? this.failure() : null));

  constructor() {
    effect(() => {
      const done = this.done();
      if (done?.kind !== 'DUE_DATE') return;
      untracked(() => this.close());
    });
  }

  /** A served-but-blocked due date stays focusable with its translated reason (P5, review B1). */
  blocked(action: BillAction): Copy {
    return blockedCopy(action, this.bill());
  }

  open(): void {
    if (!this.action()?.allowed || this.busy()) return;
    this.dueDate.set(this.bill().dueDate?.slice(0, 10) ?? '');
    this.reason.set('');
    this.editing.set(true);
  }

  close(): void {
    this.editing.set(false);
    this.dueDate.set('');
    this.reason.set('');
  }

  save(): void {
    if (!this.action()?.allowed || this.busy() || !this.dateOk() || !this.reasonOk()) return;
    this.decide.emit({ kind: 'DUE_DATE', dueDate: this.dueDate(), justification: this.reason().trim() || null });
  }

  text(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }
}
