import { PaymentToMatch } from './accounting-home.models';

/**
 * Customer payments (CAP:550 story S6, SPEC-accounting-workspace §5.3).
 *
 * Every amount below is served (S1 `listUnappliedPayments` and
 * `listCustomerOpenInvoices`, S2 `listAutomaticPaymentApplications`,
 * `applyPayment`, S35 `creditPaymentRemainder`, `refundCustomerCredit`). The
 * page only sums what the person typed, in integer minor units, as a preview
 * the server's answer replaces (P7). Ids are request keys and never rendered
 * (P8, ADR-0064 §5). Everything here is read from the server, so every field is
 * read-only and none is ever sent back (ADR-0034).
 */

/** A customer payment waiting to be matched: the home's to-do payment, one shape for both (S4, S6). */
export type WaitingPayment = PaymentToMatch;

/** Every payment waiting, read page by page, with the served summary. */
export interface WaitingPaymentsList {
  readonly items: readonly WaitingPayment[];
  /** `summary.count`: every payment waiting, read or not. */
  readonly waitingCount: number;
  /** `summary.totalUnappliedAmount`; null when not served. */
  readonly totalUnapplied: number | null;
  readonly currency: string | null;
  readonly asOf: string | null;
  /** More pages than the bounded read fetched: the list says so instead of pretending to be whole. */
  readonly truncated: boolean;
}

/** One open invoice of the payment's customer (S1 `OpenInvoiceRow`). */
export interface OpenInvoice {
  /** Key only. */
  readonly invoiceId: string;
  readonly invoiceNumber: string | null;
  /** Bare `YYYY-MM-DD`. */
  readonly documentDate: string | null;
  /** Bare `YYYY-MM-DD`; null when the replica holds none. */
  readonly dueDate: string | null;
  /** Served: the aging date is before today. */
  readonly overdue: boolean;
  /** What is still owed, as served. */
  readonly balanceDue: number;
  readonly currency: string | null;
}

export interface OpenInvoicesList {
  readonly items: readonly OpenInvoice[];
  readonly truncated: boolean;
}

/** An application made automatically (S2 `AutomaticPaymentApplicationRow`). */
export interface AutomaticApplication {
  /** Key only: what `reversePaymentApplication` takes. */
  readonly applicationId: string;
  /** Key only. */
  readonly paymentId: string;
  readonly invoiceNumber: string | null;
  readonly customerName: string | null;
  readonly customerReference: string | null;
  readonly appliedAmount: number;
  readonly currency: string | null;
  readonly appliedAt: string | null;
  readonly reversed: boolean;
  readonly reversedAt: string | null;
  /** The server lists `UNDO` among the row's actions (not reversed, caller holds `accounting:payment:reverse`). */
  readonly undoOffered: boolean;
}

export interface AutomaticApplicationsList {
  readonly items: readonly AutomaticApplication[];
  readonly truncated: boolean;
}

/** One line of an apply request: an invoice and the amount for it. */
export interface MatchLine {
  readonly invoiceId: string;
  readonly amount: number;
}

/** One invoice of the server's apply answer. */
export interface AppliedLine {
  /** Key only; the page shows the invoice number it held for it. */
  readonly invoiceId: string | null;
  readonly appliedAmount: number | null;
  readonly balanceAfter: number | null;
}

/** The server's answer to an apply: it replaces the preview (P7). */
export interface ApplyResult {
  readonly appliedAmount: number | null;
  readonly remainingAmount: number | null;
  readonly currency: string | null;
  readonly lines: readonly AppliedLine[];
  /** A credit the apply itself created (the backend caps an over-balance amount); null when none. */
  readonly creditAmount: number | null;
}

/** S35: the payment's remainder kept as a customer credit. */
export interface RemainderCredit {
  /** Key only: what the refund takes. */
  readonly creditId: string;
  readonly amount: number;
  readonly currency: string | null;
}

/** The figures behind the stat cards (aged receivables, as served). */
export interface ReceivablesTotals {
  readonly asOfDate: string;
  readonly generatedAt: string | null;
  readonly totalOutstanding: number | null;
  readonly overdue: number | null;
}
