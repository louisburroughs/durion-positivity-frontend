import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import {
  AgedPayablesReport,
  AgedReceivablesReport,
  BankReconciliationResponse,
  BankReconciliationService as BankReconciliationSdk,
  BankTransactionResponse,
  BankTransactionsService as BankTransactionsSdk,
  FinancialReportingService as FinancialReportingSdk,
  PaymentApplicationsService as PaymentApplicationsSdk,
} from '@durion-sdk/accounting';
import {
  BankCheckupRow,
  CheckupAwaitingApproval,
  CheckupStatus,
  PayablesLane,
  PaymentsToMatchPage,
  ReceivablesLane,
  TodoSourcePage,
  UnexplainedBankLine,
} from '../models/accounting-home.models';
import { BankAccount, BankStatement } from '../models/bank-reconciliation.models';
import { displayActor } from '../models/period-close.models';
import { toWaitingPayment } from '../utils/payment-match';
import { BankReconciliationService } from './bank-reconciliation.service';

/** Enough for every reconciliation of one month across a tenant's bank accounts. */
const PERIOD_RECONCILIATIONS_PAGE_SIZE = 200;

/** Upper bound on pages read for one month, so a runaway `totalPages` cannot fan out without limit. */
const MAX_RECONCILIATION_PAGES = 20;

/** The only status `listUnappliedPayments` accepts. */
const UNAPPLIED_STATUS = 'AVAILABLE';

const CHECKUP_STATUSES: ReadonlySet<string> = new Set(['IN_PROGRESS', 'SUBMITTED', 'FINALIZED']);

/**
 * The reads behind the accounting home (CAP:550 S4, SPEC-accounting-workspace
 * §5.1): the three money lanes and the to-do sources.
 *
 * Backed by the generated `@durion-sdk/accounting` services (ADR-0041), plus
 * the existing {@link BankReconciliationService} wrappers for bank accounts and
 * statements. Every figure is passed through as served; nothing here adds money
 * (P7). The backend gates the aging reads on `reporting:view:financial-statements`,
 * the bank reads on `accounting:reconciliation:view` and the unapplied-payments
 * read on `accounting:payment:apply`; the page asks only for what the session
 * holds (`ACCOUNTING_SECTION`).
 */
@Injectable({ providedIn: 'root' })
export class AccountingHomeService {
  private readonly reportingSdk = inject(FinancialReportingSdk);
  private readonly paymentsSdk = inject(PaymentApplicationsSdk);
  private readonly reconciliationSdk = inject(BankReconciliationSdk);
  private readonly transactionsSdk = inject(BankTransactionsSdk);
  private readonly bankReconciliation = inject(BankReconciliationService);

  /** *Money owed to you*: the aged receivables totals as of a local `YYYY-MM-DD`. */
  receivables(asOfDate: string): Observable<ReceivablesLane> {
    return this.reportingSdk.generateAgedReceivables(asOfDate).pipe(map(report => toReceivables(asOfDate, report)));
  }

  /** *Bills to pay*: approved-bill aging and the unapproved total beside it (S35). */
  payables(asOfDate: string): Observable<PayablesLane> {
    return this.reportingSdk.generateAgedPayables(asOfDate).pipe(map(report => toPayables(asOfDate, report)));
  }

  /** Customer payments waiting to be matched, first page, with the served count of all of them (S1). */
  paymentsToMatch(size: number): Observable<PaymentsToMatchPage> {
    return this.paymentsSdk.listUnappliedPayments(UNAPPLIED_STATUS, undefined, 0, size).pipe(
      map(response => ({
        items: (response?.items ?? []).filter(row => !!row.paymentId).map(toWaitingPayment),
        totalElements: response?.totalElements ?? 0,
        waitingCount: response?.summary?.count ?? response?.totalElements ?? 0,
      })),
    );
  }

  /** Bank lines not in the books: unmatched and unexplained, first page. */
  unexplainedBankLines(size: number): Observable<TodoSourcePage<UnexplainedBankLine>> {
    return this.transactionsSdk
      .listBankTransactions(undefined, 'UNMATCHED', undefined, undefined, undefined, true, 0, size)
      .pipe(
        map(response => ({
          items: (response?.transactions ?? []).filter(row => !!row.bankTransactionId).map(toBankLine),
          totalElements: response?.totalElements ?? 0,
        })),
      );
  }

  /** Bank check-ups submitted and waiting for a second person, first page. */
  checkupsAwaitingApproval(size: number): Observable<TodoSourcePage<CheckupAwaitingApproval>> {
    return this.reconciliationSdk
      .listReconciliations(undefined, 'SUBMITTED', undefined, undefined, undefined, 0, size)
      .pipe(
        map(response => ({
          items: (response?.reconciliations ?? []).filter(row => !!row.reconciliationId).map(toAwaitingApproval),
          totalElements: response?.totalElements ?? 0,
        })),
      );
  }

  /**
   * Every reconciliation of the month: page 0, then each further page its
   * `totalPages` names (capped at {@link MAX_RECONCILIATION_PAGES}), in parallel,
   * like `BankReconciliationService`'s account and statement lists. A tenant with
   * more attempts than one page would otherwise show an older or "Not started"
   * status for an account whose latest attempt sits on a later page.
   */
  private periodReconciliations(periodCode: string): Observable<BankReconciliationResponse[]> {
    const readPage = (page: number) =>
      this.reconciliationSdk
        .listReconciliations(undefined, undefined, periodCode, undefined, undefined, page, PERIOD_RECONCILIATIONS_PAGE_SIZE)
        .pipe(map(response => ({ rows: response?.reconciliations ?? [], totalPages: response?.totalPages ?? 1 })));
    return readPage(0).pipe(
      switchMap(first => {
        const pages = Math.min(MAX_RECONCILIATION_PAGES, Math.max(1, first.totalPages));
        if (pages === 1) return of(first.rows);
        const rest = Array.from({ length: pages - 1 }, (_, i) => readPage(i + 1).pipe(map(result => result.rows)));
        return forkJoin(rest).pipe(map(later => [...first.rows, ...later.flat()]));
      }),
    );
  }

  /**
   * *Bank check-up* lane: every bank account with its latest committed
   * statement, reconciled-through date, unexplained-line count and the status
   * of this month's reconciliation (`periodCode`, local `YYYY-MM`).
   */
  bankCheckup(periodCode: string): Observable<BankCheckupRow[]> {
    return forkJoin({
      accounts: this.bankReconciliation.listBankAccounts(),
      reconciliations: this.periodReconciliations(periodCode),
    }).pipe(
      switchMap(({ accounts, reconciliations }) =>
        accounts.length === 0
          ? of([])
          : forkJoin(
              accounts.map(account =>
                this.bankReconciliation
                  .listStatements(account.glAccountId)
                  .pipe(map(statements => toCheckupRow(account, statements, reconciliations))),
              ),
            ),
      ),
    );
  }
}

const text = (value: string | null | undefined): string | null => value?.trim() || null;
const amount = (value: number | null | undefined): number | null => (typeof value === 'number' ? value : null);

function toReceivables(asOfDate: string, report: AgedReceivablesReport): ReceivablesLane {
  return {
    asOfDate: report?.asOfDate ?? asOfDate,
    generatedAt: text(report?.generatedAt),
    totalOutstanding: report?.totals?.totalOutstanding ?? 0,
    overdue: report?.totals?.overdue ?? 0,
    notYetDue: report?.totals?.notYetDue ?? 0,
    days1To30: report?.totals?.days1To30 ?? 0,
  };
}

function toPayables(asOfDate: string, report: AgedPayablesReport): PayablesLane {
  return {
    asOfDate: report?.asOfDate ?? asOfDate,
    generatedAt: text(report?.generatedAt),
    approvedTotal: report?.totals?.totalOutstanding ?? 0,
    overdue: report?.totals?.overdue ?? 0,
    notYetDue: report?.totals?.notYetDue ?? 0,
    unapproved: report?.unapproved ?? 0,
    unapprovedBillCount: report?.unapprovedBillCount ?? 0,
  };
}

function toBankLine(row: BankTransactionResponse): UnexplainedBankLine {
  return {
    bankTransactionId: row.bankTransactionId ?? '',
    glAccountId: text(row.glAccountId),
    accountCode: text(row.accountCode),
    accountName: text(row.accountName),
    transactionDate: text(row.transactionDate),
    signedAmount: amount(row.signedAmount),
    currency: text(row.currency),
    description: text(row.originalDescription) ?? text(row.description),
    reference: text(row.reference) ?? text(row.checkNumber),
  };
}

function toAwaitingApproval(row: BankReconciliationResponse): CheckupAwaitingApproval {
  return {
    reconciliationId: row.reconciliationId ?? '',
    glAccountId: text(row.glAccountId),
    accountCode: text(row.accountCode),
    accountName: text(row.accountName),
    periodCode: text(row.accountingPeriodCode),
    statementStartDate: text(row.statementStartDate),
    statementEndDate: text(row.statementEndDate),
    statementClosingBalance: amount(row.statementClosingBalance),
    currency: text(row.currency),
    submittedBy: displayActor(row.submittedBy),
    submittedAt: text(row.submittedAt),
  };
}

/**
 * The account's row. The status comes from the account's most recently created
 * reconciliation of the month; no reconciliation reads "Not started" and any
 * status other than in progress, submitted or done reads "Unknown" (§5.1).
 */
function toCheckupRow(
  account: BankAccount,
  statements: readonly BankStatement[],
  reconciliations: readonly BankReconciliationResponse[],
): BankCheckupRow {
  // Only a statement served as COMMITTED is "the latest statement"; an unset or new status is not.
  const latest = statements.find(statement => statement.status === 'COMMITTED') ?? null;
  const current = reconciliations
    .filter(row => row.glAccountId === account.glAccountId)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
  return {
    glAccountId: account.glAccountId,
    accountCode: account.accountCode,
    accountName: account.accountName,
    bankName: account.bankName,
    accountMask: account.accountMask,
    currency: latest?.currency ?? account.currency,
    statementEndDate: latest?.endDate ?? null,
    statementClosingBalance: latest?.closingBalance ?? null,
    reconciledThrough: account.reconciledFrontier,
    unexplainedCount: account.unexplainedBankTransactionCount,
    status: checkupStatus(current),
    reconciliationId: current?.reconciliationId ?? null,
  };
}

function checkupStatus(row: BankReconciliationResponse | undefined): CheckupStatus {
  if (!row) return 'NOT_STARTED';
  const status = row.status as string | undefined;
  return status && CHECKUP_STATUSES.has(status) ? (status as CheckupStatus) : 'UNKNOWN';
}
