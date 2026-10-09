import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MoneyPipe } from '../../../../../shared/money.pipe';
import { BILL_REASON_MAX, BILL_REASON_MIN, BillCheck } from '../../../models/payables.models';
import { ClassificationPrefill } from '../../../utils/bill-display';
import { BillDecisionFailure } from '../../../utils/bill-errors';

export type DifferenceChoice = 'FREIGHT' | 'GOODS' | 'PRICE_DIFFERENCE';

/** The difference classes this page offers; "An expense" arrives with S14b. */
export const DIFFERENCE_CHOICES: readonly { readonly value: DifferenceChoice; readonly labelKey: string }[] = [
  { value: 'FREIGHT', labelKey: 'ACCOUNTING.BILLS.POSTING.DIFFERENCE.FREIGHT' },
  { value: 'GOODS', labelKey: 'ACCOUNTING.BILLS.POSTING.DIFFERENCE.GOODS' },
  { value: 'PRICE_DIFFERENCE', labelKey: 'ACCOUNTING.BILLS.POSTING.DIFFERENCE.PRICE_DIFFERENCE' },
];

let nextId = 0;

/**
 * The posting choices Send, Approve and Accept as billed carry (CAP:550 S14,
 * Accounting ruling Q1 on #464):
 *
 * - **What is this bill for?** "Stock for the shelves" (`GOODS`). Pre-filled
 *   from the clerk's proposal, else the vendor's default, each labelled. An
 *   `EXPENSE` proposal or default is shown as set and nothing is sent, so the
 *   server applies it; choosing an expense category arrives with S14b.
 * - **Where does the difference go?** when the served `TOTALS_ADD_UP` fails:
 *   the served figures quoted (never computed), Freight / Stock / Price
 *   difference and a required "Why does it go there?".
 * - **Override reason** after a 422 `PERIOD_CLOSED`, for holders of
 *   `accounting:period:override`.
 *
 * Values are two-way bound to the review panel, which validates them and adds
 * them to the request. A refusal naming one of these fields is shown here, in
 * a `role="alert"` linked by `aria-describedby` (ADR-0029 §8.3).
 */
@Component({
  selector: 'app-bill-posting-fields',
  standalone: true,
  imports: [TranslatePipe, MoneyPipe],
  templateUrl: './bill-posting-fields.component.html',
  styleUrls: ['../../../bank-reconciliation-shared.css', '../bills-shared.css', './bill-posting-fields.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillPostingFieldsComponent {
  private readonly injector = inject(Injector);

  readonly showClassification = input(false);
  readonly prefill = input<ClassificationPrefill | null>(null);
  /** The served `TOTALS_ADD_UP` FAIL, or null; shows the difference group. */
  readonly totals = input<BillCheck | null>(null);
  /** The difference is required even before the read shows the failing check (a 422 said so). */
  readonly differenceRequired = input(false);
  readonly showOverride = input(false);
  readonly currency = input<string | null>(null);
  readonly showTerms = input(false);
  readonly failure = input<BillDecisionFailure | null>(null);
  /** A proposed difference the panel cannot send back (an `EXPENSE` class): shown as set. */
  readonly proposedExpenseDifference = input(false);

  readonly classification = model<'GOODS' | null>(null);
  readonly differenceClass = model<DifferenceChoice | null>(null);
  readonly differenceReason = model('');
  readonly overrideReason = model('');

  private readonly classificationGroup = viewChild<ElementRef<HTMLElement>>('classificationGroup');

  readonly id = `bill-posting-${++nextId}`;
  readonly min = BILL_REASON_MIN;
  readonly max = BILL_REASON_MAX;
  readonly choices = DIFFERENCE_CHOICES;
  /** The class code shown in grey with Show accounting terms on (P1). */
  readonly goodsCode = 'GOODS';

  readonly showDifference = computed(() => !!this.totals() || this.differenceRequired());
  readonly expenseSet = computed(() => this.prefill()?.debitClass === 'EXPENSE');
  readonly field = computed(() => this.failure()?.view.field ?? null);
  readonly unclassified = computed(() => this.failure()?.view.code === 'AP_BILL_UNCLASSIFIED');

  constructor() {
    // 422 AP_BILL_UNCLASSIFIED reveals the field and moves focus to it (Q1 A).
    effect(() => {
      const failure = this.failure();
      if (failure?.view.field !== 'classification') return;
      untracked(() =>
        afterNextRender(() => this.classificationGroup()?.nativeElement.querySelector<HTMLInputElement>('input')?.focus(), {
          injector: this.injector,
        }),
      );
    });
  }

  arg(name: string): string | null {
    return this.totals()?.args[name] ?? null;
  }

  text(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }
}
