import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { MoneyPipe } from '../../../../shared/money.pipe';
import { LedgerLine, LedgerSection } from '../../models/books.models';
import { WhatHappened, describeText, isKey } from '../../utils/books-display';
import { toDatePipeInput } from '../../utils/date-only.util';
import { HelpDisclosureComponent } from '../help-disclosure/help-disclosure.component';

/**
 * One account's entries for a range (CAP:550 S5, §5.4 item 4): Entry · Date ·
 * What happened · Went up · Went down · Balance after, newest first, with the
 * served opening and closing balances.
 *
 * Went up / Went down and Balance after come from the served `normalSide`,
 * `direction` and normal-side balances (S35, story Spec discrepancy 7); the
 * component derives no sign and adds nothing (P7). A section served without
 * them reads Debit and Credit with the served signed balance. With Show
 * accounting terms on, the headings add "(debit)" / "(credit)".
 *
 * Shared by the Summary drill-down and the All entries account filter.
 */
@Component({
  selector: 'app-ledger-table',
  standalone: true,
  imports: [DatePipe, MoneyPipe, RouterLink, TranslatePipe, HelpDisclosureComponent],
  templateUrl: './ledger-table.component.html',
  styleUrls: ['../../bank-reconciliation-shared.css', './ledger-table.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LedgerTableComponent {
  readonly section = input.required<LedgerSection>();
  readonly showTerms = input(false);
  /** Entry numbers link to the journal-entry page only with `accounting:je:view`. */
  readonly canOpenEntry = input(false);

  /** True when every line, and the section, carry the served normal-side fields. */
  readonly directional = computed(() => {
    const section = this.section();
    return section.normalSide !== null && section.lines.every(line => line.direction !== null);
  });

  /** Newest first: the served order reversed. Ordering is not arithmetic. */
  readonly lines = computed(() => [...this.section().lines].reverse());

  readonly opening = computed(() =>
    this.directional() ? this.section().normalOpeningBalance : this.section().openingBalance,
  );
  readonly closing = computed(() =>
    this.directional() ? this.section().normalClosingBalance : this.section().closingBalance,
  );

  /** The accountant's side behind Went up: an account's normal side. */
  readonly upTermKey = computed(() =>
    this.section().normalSide === 'CREDIT' ? 'ACCOUNTING.BOOKS.LEDGER.TERM_CREDIT' : 'ACCOUNTING.BOOKS.LEDGER.TERM_DEBIT',
  );
  readonly downTermKey = computed(() =>
    this.section().normalSide === 'CREDIT' ? 'ACCOUNTING.BOOKS.LEDGER.TERM_DEBIT' : 'ACCOUNTING.BOOKS.LEDGER.TERM_CREDIT',
  );

  readonly toDate = toDatePipeInput;
  readonly isKey = isKey;

  /** The line's one served amount (a journal line is a debit or a credit). */
  amountOf(line: LedgerLine): number | null {
    return line.debitAmount ?? line.creditAmount;
  }

  balanceAfter(line: LedgerLine): number | null {
    return this.directional() ? line.normalRunningBalance : line.runningBalance;
  }

  whatHappened(line: LedgerLine): WhatHappened {
    return describeText(line.description);
  }
}
