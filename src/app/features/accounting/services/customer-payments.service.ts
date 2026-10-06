import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import {
  AutomaticPaymentApplicationRow,
  CustomerCreditTransactionResponse,
  CustomerCreditsService as CustomerCreditsSdk,
  FinancialReportingService as FinancialReportingSdk,
  OpenInvoiceRow,
  PaymentApplicationResponse,
  PaymentApplicationsService as PaymentApplicationsSdk,
} from '@durion-sdk/accounting';
import {
  ApplyResult,
  AutomaticApplication,
  AutomaticApplicationsList,
  MatchLine,
  OpenInvoice,
  OpenInvoicesList,
  ReceivablesTotals,
  RemainderCredit,
  WaitingPaymentsList,
} from '../models/customer-payments.models';
import { toWaitingPayment } from '../utils/payment-match';

/** The only status `listUnappliedPayments` accepts. */
const UNAPPLIED_STATUS = 'AVAILABLE';

/** Page sizes at each read's documented maximum. */
export const PAYMENTS_PAGE_SIZE = 100;
export const OPEN_INVOICES_PAGE_SIZE = 200;
export const AUTOMATIC_PAGE_SIZE = 100;

/** Upper bound on pages read for one list, so a runaway `totalPages` cannot fan out without limit; past it the list says it is incomplete. */
export const MAX_LIST_PAGES = 10;

/** The served action that offers Undo on an automatic application (S2). */
const UNDO_ACTION = 'UNDO';

interface PageOf {
  readonly rows: readonly unknown[];
  readonly totalPages: number;
}

/**
 * Every page of a list: page 0, then each further page its `totalPages` names,
 * in parallel, capped at {@link MAX_LIST_PAGES}. `truncated` says the cap cut it.
 */
function readAllPages<P extends PageOf>(
  readPage: (page: number) => Observable<P>,
): Observable<{ first: P; rows: P['rows'][number][]; truncated: boolean }> {
  return readPage(0).pipe(
    switchMap(first => {
      const total = Math.max(1, first.totalPages);
      const pages = Math.min(MAX_LIST_PAGES, total);
      const truncated = total > MAX_LIST_PAGES;
      if (pages === 1) return of({ first, rows: [...first.rows], truncated });
      const rest = Array.from({ length: pages - 1 }, (_, i) => readPage(i + 1).pipe(map(page => page.rows)));
      return forkJoin(rest).pipe(map(later => ({ first, rows: [...first.rows, ...later.flat()], truncated })));
    }),
  );
}

const text = (value: string | null | undefined): string | null => value?.trim() || null;
const amount = (value: number | null | undefined): number | null => (typeof value === 'number' ? value : null);

/**
 * Customer payments (CAP:550 S6, SPEC-accounting-workspace §5.3): S1's two
 * reads, S2's automatic applications, the apply, S35's remainder credit, the
 * credit refund, the single-application reversal and the aged-receivables
 * totals behind the stat cards.
 *
 * Backed by the generated `@durion-sdk/accounting` services (ADR-0041). The
 * backend enforces `accounting:payment:apply` on the reads, the apply and the
 * remainder credit, `accounting:payment:reverse` on the reversal,
 * `accounting:customer-credit:refund` on the refund and
 * `reporting:view:financial-statements` on the aging; the page gates each on
 * the same code (`ACCOUNTING_PAGE.customerPayments`, `ACCOUNTING_SECTION`).
 * Amounts pass through as served; nothing here adds money (P7).
 */
@Injectable({ providedIn: 'root' })
export class CustomerPaymentsService {
  private readonly paymentsSdk = inject(PaymentApplicationsSdk);
  private readonly creditsSdk = inject(CustomerCreditsSdk);
  private readonly reportingSdk = inject(FinancialReportingSdk);

  /** Every payment waiting to be matched (`status=AVAILABLE`), every page, with the served summary. */
  waitingPayments(): Observable<WaitingPaymentsList> {
    return readAllPages(page =>
      this.paymentsSdk.listUnappliedPayments(UNAPPLIED_STATUS, undefined, page, PAYMENTS_PAGE_SIZE).pipe(
        map(response => ({
          rows: response?.items ?? [],
          totalPages: response?.totalPages ?? 1,
          summary: response?.summary ?? null,
          totalElements: response?.totalElements ?? 0,
        })),
      ),
    ).pipe(
      map(({ first, rows, truncated }) => ({
        items: rows.filter(row => !!row.paymentId && !!row.customerId).map(toWaitingPayment),
        waitingCount: first.summary?.count ?? first.totalElements,
        totalUnapplied: amount(first.summary?.totalUnappliedAmount),
        currency: text(first.summary?.currency),
        asOf: text(first.summary?.asOf),
        truncated,
      })),
    );
  }

  /** The customer's open invoices, oldest first, every page. */
  openInvoices(customerId: string): Observable<OpenInvoicesList> {
    return readAllPages(page =>
      this.paymentsSdk.listCustomerOpenInvoices(customerId, page, OPEN_INVOICES_PAGE_SIZE).pipe(
        map(response => ({ rows: response?.items ?? [], totalPages: response?.totalPages ?? 1 })),
      ),
    ).pipe(
      map(({ rows, truncated }) => ({
        items: rows.filter(row => !!row.invoiceId).map(toOpenInvoice),
        truncated,
      })),
    );
  }

  /** Applications made automatically since an instant (at most 31 days back, S2), newest first, every page. */
  automaticApplications(since: string): Observable<AutomaticApplicationsList> {
    return readAllPages(page =>
      this.paymentsSdk.listAutomaticPaymentApplications(since, page, AUTOMATIC_PAGE_SIZE).pipe(
        map(response => ({ rows: response?.items ?? [], totalPages: response?.totalPages ?? 1 })),
      ),
    ).pipe(
      map(({ rows, truncated }) => ({
        items: rows.filter(row => !!row.paymentApplicationId).map(toAutomaticApplication),
        truncated,
      })),
    );
  }

  /**
   * Applies a payment to invoices in one atomic request, idempotent on
   * `applicationRequestId`: a replay returns the first result (§8.2).
   */
  applyPayment(paymentId: string, applicationRequestId: string, lines: readonly MatchLine[]): Observable<ApplyResult> {
    return this.paymentsSdk
      .applyPayment(paymentId, {
        applicationRequestId,
        applications: lines.map(line => ({ invoiceId: line.invoiceId, amountToApply: line.amount })),
      })
      .pipe(map(toApplyResult));
  }

  /** S35: keeps the payment's whole remainder as a customer credit, if it is still `expectedAmount`. Idempotent on `requestId`. */
  creditRemainder(paymentId: string, expectedAmount: number, requestId: string): Observable<RemainderCredit> {
    return this.paymentsSdk.creditPaymentRemainder(paymentId, { expectedAmount, requestId }).pipe(
      map(response => ({
        creditId: response.creditId,
        amount: response.amount,
        currency: text(response.currency),
      })),
    );
  }

  /** Refunds a customer credit. Idempotent on `requestId`. */
  refundCredit(creditId: string, refundAmount: number, requestId: string): Observable<number | null> {
    return this.creditsSdk
      .refundCustomerCredit(creditId, { amount: refundAmount, requestId })
      .pipe(map((response: CustomerCreditTransactionResponse) => amount(response?.amount)));
  }

  /** Reverses one application, recorded as a new compensating entry. */
  reverseApplication(applicationId: string, reason: string): Observable<void> {
    return this.paymentsSdk.reversePaymentApplication(applicationId, { reason }).pipe(map(() => undefined));
  }

  /** The aged-receivables totals as of a local `YYYY-MM-DD`. */
  receivablesTotals(asOfDate: string): Observable<ReceivablesTotals> {
    return this.reportingSdk.generateAgedReceivables(asOfDate).pipe(
      map(report => ({
        asOfDate: text(report?.asOfDate) ?? asOfDate,
        generatedAt: text(report?.generatedAt),
        totalOutstanding: amount(report?.totals?.totalOutstanding),
        overdue: amount(report?.totals?.overdue),
      })),
    );
  }
}

function toOpenInvoice(row: OpenInvoiceRow): OpenInvoice {
  return {
    invoiceId: row.invoiceId,
    invoiceNumber: text(row.invoiceNumber),
    documentDate: text(row.documentDate),
    dueDate: text(row.dueDate),
    overdue: row.overdue === true,
    balanceDue: row.balanceDue,
    currency: text(row.currency),
  };
}

function toAutomaticApplication(row: AutomaticPaymentApplicationRow): AutomaticApplication {
  return {
    applicationId: row.paymentApplicationId,
    paymentId: row.paymentId,
    invoiceNumber: text(row.invoiceNumber),
    customerName: text(row.customerDisplayName),
    customerReference: text(row.customerReference),
    appliedAmount: row.appliedAmount,
    currency: text(row.currency),
    appliedAt: text(row.appliedAt),
    reversed: row.reversed === true,
    reversedAt: text(row.reversedAt),
    undoOffered: row.reversed !== true && (row.actions ?? []).includes(UNDO_ACTION),
  };
}

function toApplyResult(response: PaymentApplicationResponse): ApplyResult {
  return {
    appliedAmount: amount(response?.appliedAmount),
    remainingAmount: amount(response?.remainingAmount),
    currency: text(response?.currency),
    lines: (response?.applications ?? []).map(line => ({
      invoiceId: text(line.invoiceId),
      appliedAmount: amount(line.appliedAmount),
      balanceAfter: amount(line.invoiceBalanceAfter),
    })),
    creditAmount: amount(response?.customerCredit?.amount),
  };
}
