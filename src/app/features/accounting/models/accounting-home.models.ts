/**
 * Accounting home (CAP:550 story S4, SPEC-accounting-workspace §5.1).
 *
 * Every amount, total, bucket and count of money below is served: the home
 * renders them verbatim through `MoneyPipe` and adds nothing (P7). Counting
 * list items is not money arithmetic. Ids are keys only and never rendered
 * (P8, ADR-0064 §5); a null reference renders as an em dash.
 */

/** One region's read outcome (ADR-0064 §1). A failed re-read keeps prior data and flips only this. */
export type RegionStatus = 'PENDING' | 'OK' | 'FAILED';

/** Page state (ADR-0031): `error` only when every permitted region failed. */
export type HomePageState = 'idle' | 'loading' | 'ready' | 'error';

/** *Money owed to you*: aged receivables as served (S35 due-state split). */
export interface ReceivablesLane {
  readonly asOfDate: string;
  readonly generatedAt: string | null;
  readonly totalOutstanding: number;
  readonly overdue: number;
  readonly notYetDue: number;
  /** The "1–30 days late" badge; part of `overdue`, never added to anything. */
  readonly days1To30: number;
}

/** *Bills to pay*: aged payables of APPROVED bills, with the unapproved total beside them (S35). */
export interface PayablesLane {
  readonly asOfDate: string;
  readonly generatedAt: string | null;
  /** `totals.totalOutstanding` — approved bills only. */
  readonly approvedTotal: number;
  readonly overdue: number;
  readonly notYetDue: number;
  /** Bills waiting for approval or still being checked; shown separately, never added (AW11). */
  readonly unapproved: number;
  readonly unapprovedBillCount: number;
}

/** This month's bank check-up, mapped from the reconciliation status (§5.1). Anything unexpected is `UNKNOWN`. */
export type CheckupStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'FINALIZED' | 'UNKNOWN';

/** *Bank check-up* lane: one row per reconcilable bank account. */
export interface BankCheckupRow {
  readonly glAccountId: string;
  readonly accountCode: string | null;
  readonly accountName: string | null;
  readonly bankName: string | null;
  readonly accountMask: string | null;
  readonly currency: string | null;
  /** End date of the latest committed statement, bare `YYYY-MM-DD`. */
  readonly statementEndDate: string | null;
  readonly statementClosingBalance: number | null;
  /** `reconciledFrontier`: the end of the finalized chain. */
  readonly reconciledThrough: string | null;
  /** Bank lines not in the books (`unexplainedBankTransactionCount`). */
  readonly unexplainedCount: number | null;
  readonly status: CheckupStatus;
  /** The current-period reconciliation the status came from; a key only. */
  readonly reconciliationId: string | null;
}

/** A served match suggestion's invoice (S1). */
export interface SuggestedInvoiceLine {
  readonly invoiceNumber: string | null;
  readonly balanceDue: number;
  readonly suggestedAmount: number;
}

/** A customer payment waiting to be matched (S1 `listUnappliedPayments`). */
export interface PaymentToMatch {
  /** Key only. */
  readonly paymentId: string;
  readonly customerName: string | null;
  readonly customerReference: string | null;
  /** The invoice the payment was taken against: the payment's business reference. */
  readonly sourceInvoiceNumber: string | null;
  /** CASH, CARD, ON_ACCOUNT, OTHER as served; anything else renders "Unknown". */
  readonly method: string | null;
  readonly receivedAt: string | null;
  readonly totalAmount: number;
  readonly unappliedAmount: number;
  readonly currency: string | null;
  readonly reasons: readonly string[];
  readonly suggestedInvoices: readonly SuggestedInvoiceLine[];
  readonly suggestedTotal: number;
  /** What would remain as credit; null when the server serves none (walk-in/CASH payments). */
  readonly leftOver: number | null;
}

/** A page of a to-do source, with the size the server reports. */
export interface TodoSourcePage<T> {
  readonly items: readonly T[];
  readonly totalElements: number;
}

/** The unapplied-payments read: its page plus the summary count the lane shows. */
export interface PaymentsToMatchPage extends TodoSourcePage<PaymentToMatch> {
  /** `summary.count`: every payment waiting, not only this page. */
  readonly waitingCount: number;
}

/** A bank line not in the books (`listBankTransactions(UNMATCHED, unexplainedOnly)`). */
export interface UnexplainedBankLine {
  /** Key only. */
  readonly bankTransactionId: string;
  readonly glAccountId: string | null;
  readonly accountCode: string | null;
  readonly accountName: string | null;
  readonly transactionDate: string | null;
  readonly signedAmount: number | null;
  readonly currency: string | null;
  /** The bank's own text: untrusted, rendered as text only (ADR-0065). */
  readonly description: string | null;
  readonly reference: string | null;
}

/** A submitted bank check-up waiting for a second person (`listReconciliations(SUBMITTED)`). */
export interface CheckupAwaitingApproval {
  /** Key only. */
  readonly reconciliationId: string;
  readonly glAccountId: string | null;
  readonly accountCode: string | null;
  readonly accountName: string | null;
  readonly periodCode: string | null;
  readonly statementStartDate: string | null;
  readonly statementEndDate: string | null;
  readonly statementClosingBalance: number | null;
  readonly currency: string | null;
  /** The submitter's username, or null when the server sent an opaque id. */
  readonly submittedBy: string | null;
  readonly submittedAt: string | null;
}

export type TodoKind = 'PAYMENT' | 'BANK_LINE' | 'APPROVAL';

/** The to-do filter buttons (§5.1 item 6). S20 adds Bills. */
export type TodoFilter = 'ALL' | 'PAYMENTS' | 'BANK';

/** One to-do item. `id` is `<kind>:<source key>`: a selection key, never rendered. */
export type TodoItem =
  | { readonly kind: 'PAYMENT'; readonly id: string; readonly payment: PaymentToMatch }
  | { readonly kind: 'BANK_LINE'; readonly id: string; readonly line: UnexplainedBankLine }
  | { readonly kind: 'APPROVAL'; readonly id: string; readonly checkup: CheckupAwaitingApproval };

/** The two per-person preferences (§8.2, Spec discrepancy 3). */
export interface AccountingPreferences {
  readonly showTerms: boolean;
  readonly startHereDismissed: boolean;
}

export const DEFAULT_ACCOUNTING_PREFERENCES: AccountingPreferences = {
  showTerms: false,
  startHereDismissed: false,
};

/** Page size of each to-do source; a larger server total says how many more there are. */
export const TODO_PAGE_SIZE = 25;
