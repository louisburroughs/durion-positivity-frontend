/**
 * Your books (CAP:550 story S5, SPEC-accounting-workspace §5.4).
 *
 * Every amount, total, bucket and balance below is served by `pos-accounting`
 * and rendered verbatim through `MoneyPipe`; the page adds nothing (P7).
 * Sorting is not arithmetic. Ids are keys only and never rendered (P8,
 * ADR-0064 §5): entries show their `JE-YYYYMM-n` number, accounts their name.
 */

/** The three tabs of Your books, carried in `?tab=` so a link can land on one (§5.4 item 2). */
export type BooksTab = 'summary' | 'owed' | 'entries';

export const BOOKS_TABS: readonly BooksTab[] = ['summary', 'owed', 'entries'];

export function isBooksTab(value: string | null | undefined): value is BooksTab {
  return value === 'summary' || value === 'owed' || value === 'entries';
}

/** One statement line as served: its code and amount, in the served order. */
export interface StatementLine {
  readonly code: string;
  readonly amount: number;
}

/** `generateBalanceSheet` as served (S35 named lines and computed "Other" lines). */
export interface BalanceSheetSummary {
  readonly asOfDate: string;
  readonly balanced: boolean;
  readonly lines: readonly StatementLine[];
  /** Null when the response omits it: rendered as an em dash, never as a served zero (ADR-0064 §4). */
  readonly totalAssets: number | null;
  readonly totalLiabilities: number | null;
  readonly totalEquity: number | null;
}

/** `generateIncomeStatement` as served. */
export interface IncomeSummary {
  readonly startDate: string;
  readonly endDate: string;
  readonly lines: readonly StatementLine[];
  /** Null when the response omits it (em dash, never $0.00). */
  readonly totalRevenue: number | null;
  readonly totalExpenses: number | null;
  readonly netIncome: number | null;
}

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type NormalSide = 'DEBIT' | 'CREDIT';
export type LineDirection = 'INCREASE' | 'DECREASE';

/** One account contributing to a statement line (`drilldownToAccounts`). */
export interface DrilldownAccount {
  readonly accountId: string;
  readonly accountCode: string | null;
  readonly accountName: string | null;
  readonly accountType: AccountType | null;
  /** The account's served contribution to the line; null when omitted. */
  readonly balance: number | null;
}

/** One posted line of an account's general ledger. */
export interface LedgerLine {
  readonly journalEntryId: string;
  readonly entryNumber: string | null;
  readonly transactionDate: string | null;
  readonly description: string | null;
  readonly debitAmount: number | null;
  readonly creditAmount: number | null;
  /** Served by S35; null on a response without it, which then reads Debit and Credit. */
  readonly direction: LineDirection | null;
  /** The served balance after this line on the account's normal side (S35). */
  readonly normalRunningBalance: number | null;
  /** The served signed balance (debit positive), shown only when no normal side is served. */
  readonly runningBalance: number | null;
}

/** One account's section of `generateGeneralLedger`. */
export interface LedgerSection {
  readonly accountId: string;
  readonly accountNumber: string | null;
  readonly accountName: string | null;
  readonly accountType: AccountType | null;
  /** Null on a response without it: the section then reads Debit and Credit. */
  readonly normalSide: NormalSide | null;
  readonly openingBalance: number | null;
  readonly closingBalance: number | null;
  readonly normalOpeningBalance: number | null;
  readonly normalClosingBalance: number | null;
  /** Chronological as served; the page lists them newest first. */
  readonly lines: readonly LedgerLine[];
}

/** The general ledger for one account: its section, or null when it had no posted activity. */
export interface AccountLedger {
  readonly accountId: string;
  readonly section: LedgerSection | null;
}

/** The S35 aging buckets, served per row and as totals. */
export interface AgingBuckets {
  /** Each null when the response omits it: an em dash, never a served zero (ADR-0064 §4). */
  readonly notYetDue: number | null;
  readonly days1To30: number | null;
  readonly days31To60: number | null;
  readonly days61To90: number | null;
  readonly days90Plus: number | null;
  readonly totalOutstanding: number | null;
}

export interface AgedCustomerRow extends AgingBuckets {
  /** Key only; never rendered. */
  readonly customerId: string;
  readonly customerName: string | null;
  readonly customerReference: string | null;
}

export interface AgedVendorRow extends AgingBuckets {
  /** Key only; never rendered. */
  readonly vendorId: string;
  readonly vendorName: string | null;
}

export interface AgedReport<Row> {
  readonly asOfDate: string;
  readonly rows: readonly Row[];
  readonly totals: AgingBuckets;
}

/** The statuses `pos-accounting` serves; anything else maps to `UNKNOWN` (ADR-0064 §4). */
export type JournalEntryStatus = 'DRAFT' | 'PENDING' | 'POSTED' | 'REVERSED' | 'UNKNOWN';

export interface JournalEntryLine {
  readonly lineNumber: number | null;
  readonly accountCode: string | null;
  readonly accountName: string | null;
  readonly description: string | null;
  readonly debitAmount: number | null;
  readonly creditAmount: number | null;
}

export interface JournalEntry {
  /** Route key only; never rendered. */
  readonly journalEntryId: string;
  /** `JE-YYYYMM-n`; null for an entry not recorded yet (DRAFT, PENDING). */
  readonly entryNumber: string | null;
  readonly transactionDate: string | null;
  readonly description: string | null;
  readonly status: JournalEntryStatus;
  readonly sourceEventType: string | null;
  readonly totalDebits: number | null;
  /** Set on a correcting entry: the entry it reverses. Key only. */
  readonly reversalJournalEntryId: string | null;
  /** Set on a reversed entry: the correcting entry. Key only. */
  readonly reversedByJournalEntryId: string | null;
  readonly lines: readonly JournalEntryLine[];
}

export interface JournalEntryPage {
  readonly items: readonly JournalEntry[];
  readonly page: number;
  readonly totalPages: number;
  readonly totalElements: number;
}

export interface JournalEntryTraceability {
  readonly original: JournalEntry | null;
  readonly reversal: JournalEntry | null;
  readonly related: readonly JournalEntry[];
}

/** A chart-of-accounts entry for the All entries account filter. */
export interface GlAccountOption {
  readonly glAccountId: string;
  readonly accountCode: string | null;
  readonly accountName: string | null;
}

/** What Export for your accountant can produce (§5.4 item 1, story PROPOSED 9). */
export type ExportReportType =
  | 'BALANCE_SHEET'
  | 'INCOME_STATEMENT'
  | 'AGED_RECEIVABLES'
  | 'AGED_PAYABLES'
  | 'GENERAL_LEDGER'
  | 'TRIAL_BALANCE';

export const EXPORT_REPORT_TYPES: readonly ExportReportType[] = [
  'BALANCE_SHEET',
  'INCOME_STATEMENT',
  'AGED_RECEIVABLES',
  'AGED_PAYABLES',
  'GENERAL_LEDGER',
  'TRIAL_BALANCE',
];

/** PDF and CSV only: the request also accepts XLSX and JSON, which fail in rendering (Spec discrepancy 4). */
export type ExportFormat = 'PDF' | 'CSV';

export const EXPORT_FORMATS: readonly ExportFormat[] = ['PDF', 'CSV'];

/** The served export state; anything else is `UNKNOWN` and keeps polling until it settles or the dialog closes. */
export type ExportStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'UNKNOWN';

export interface ExportJob {
  readonly exportId: string;
  readonly status: ExportStatus;
}

/** Why a request failed: the HTTP status and the served error code, never the served message. */
export interface BooksFailure {
  readonly status: number;
  readonly code: string | null;
}
