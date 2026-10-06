import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { MoneyPipe } from '../../../../shared/money.pipe';
import { BankCheckupRow, RegionStatus, TodoItem } from '../../models/accounting-home.models';
import { ReconciliationReview } from '../../models/bank-reconciliation.models';
import { toDatePipeInput } from '../../utils/date-only.util';
import { HelpDisclosureComponent } from '../help-disclosure/help-disclosure.component';
import { READINESS_REASON_KEYS } from '../reconciliation-review-panel/reconciliation-review-panel.component';

/** Served suggestion reasons with copy (S1); literal so the i18n check sees every key. */
const PAYMENT_REASON_KEYS: Readonly<Record<string, string>> = {
  REMITTANCE_REFERENCE: 'ACCOUNTING.HOME.TODO.PAYMENT.REASON.REMITTANCE_REFERENCE',
  SAME_CUSTOMER: 'ACCOUNTING.HOME.TODO.PAYMENT.REASON.SAME_CUSTOMER',
  EXACT_TOTAL: 'ACCOUNTING.HOME.TODO.PAYMENT.REASON.EXACT_TOTAL',
};

/** Served settlement methods (S1); anything else reads "Unknown". */
const METHOD_KEYS: Readonly<Record<string, string>> = {
  CASH: 'ACCOUNTING.HOME.METHOD.CASH',
  CARD: 'ACCOUNTING.HOME.METHOD.CARD',
  ON_ACCOUNT: 'ACCOUNTING.HOME.METHOD.ON_ACCOUNT',
  OTHER: 'ACCOUNTING.HOME.METHOD.OTHER',
};

export function paymentReasonKey(reason: string): string {
  return PAYMENT_REASON_KEYS[reason] ?? 'ACCOUNTING.HOME.TODO.PAYMENT.REASON.UNKNOWN';
}

export function paymentMethodKey(method: string | null): string | null {
  if (!method) return null;
  return METHOD_KEYS[method] ?? 'ACCOUNTING.HOME.METHOD.UNKNOWN';
}

/**
 * The to-do detail panel, v1 templates (SPEC-accounting-workspace §5.1
 * "Detail panel templates"): *Payment ready to match* (read-only here; S6 adds
 * matching), *Bank line not in the books* and *Bank check-up needs approval*.
 * Every panel has **What to do**.
 *
 * Presentational: the page owns the reads and the Approve month write, and
 * passes the review, its read status and the approve permission in. Approve
 * month is shown only with `accounting:reconciliation:approve` (`canApprove`);
 * when the served review says the person cannot approve (P5, e.g. they
 * prepared it) the button stays visible with `aria-disabled="true"` and each
 * served reason, and the page's handler refuses the click as well.
 *
 * Every figure is rendered as served; the bank's description is untrusted and
 * renders as text only (ADR-0065 §1).
 */
@Component({
  selector: 'app-todo-detail-panel',
  standalone: true,
  imports: [DatePipe, MoneyPipe, RouterLink, TranslatePipe, HelpDisclosureComponent],
  templateUrl: './todo-detail-panel.component.html',
  styleUrls: ['../../bank-reconciliation-shared.css', './todo-detail-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TodoDetailPanelComponent {
  readonly item = input.required<TodoItem>();
  readonly showTerms = input(false);
  /** The Bank check-up lane's rows, to send a bank line to its account's open check-up. */
  readonly bankRows = input<readonly BankCheckupRow[]>([]);
  /** The selected approval item's review (`getReview`) and its read status. */
  readonly review = input<ReconciliationReview | null>(null);
  readonly reviewStatus = input<RegionStatus | null>(null);
  /** Holds `accounting:reconciliation:approve` (or the unknown-`perm_bits` fallback). */
  readonly canApprove = input(false);
  readonly approving = input(false);
  /** The last Approve month outcome to announce, with its params. */
  readonly approveMessageKey = input<string | null>(null);
  readonly approveMessageParams = input<Readonly<Record<string, unknown>>>({});

  readonly approve = output<void>();

  private readonly heading = viewChild<ElementRef<HTMLElement>>('panelHeading');

  readonly payment = computed(() => {
    const item = this.item();
    return item.kind === 'PAYMENT' ? item.payment : null;
  });
  readonly line = computed(() => {
    const item = this.item();
    return item.kind === 'BANK_LINE' ? item.line : null;
  });
  readonly checkup = computed(() => {
    const item = this.item();
    return item.kind === 'APPROVAL' ? item.checkup : null;
  });

  readonly toDate = toDatePipeInput;
  readonly methodKey = paymentMethodKey;
  readonly reasonKey = paymentReasonKey;

  /** Served blocking reasons; PROPOSALS_PENDING does not hold approval (review panel rule). */
  readonly blockingReasons = computed(() =>
    (this.review()?.readiness.reasons ?? []).filter(reason => reason !== 'PROPOSALS_PENDING'),
  );

  /** Approve month can be pressed: the review read is OK, it says yes, and nothing is in flight. */
  readonly approveEnabled = computed(
    () => this.reviewStatus() === 'OK' && (this.review()?.readiness.canApprove ?? false) && !this.approving(),
  );

  readinessReasonKey(reason: string): string {
    return READINESS_REASON_KEYS[reason] ?? 'ACCOUNTING.RECONCILIATION_WORKSPACE.READINESS.REASON.OTHER';
  }

  /** The account's IN_PROGRESS check-up if there is one, else the bank accounts page. */
  bankCheckupLink(glAccountId: string | null): string {
    const open = this.bankRows().find(row => row.glAccountId === glAccountId && row.status === 'IN_PROGRESS');
    return open?.reconciliationId ? `/app/accounting/reconciliations/${open.reconciliationId}` : '/app/accounting/bank-accounts';
  }

  onApprove(): void {
    if (!this.approveEnabled()) return;
    this.approve.emit();
  }

  /** Moves focus to the panel heading (small screens on selection, and after an approve re-read). */
  focusHeading(): void {
    this.heading()?.nativeElement.focus();
  }
}
