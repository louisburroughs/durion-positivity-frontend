import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import {
  AccountDrilldownResponse,
  AgedPayablesReport,
  AgedPayablesRow,
  AgedReceivablesReport,
  AgedReceivablesRow,
  AgingSummary,
  ApiError,
  BalanceSheetReport,
  FinancialReportingService as FinancialReportingSdk,
  GLAccountResponse,
  GLAccountsService as GLAccountsSdk,
  GeneralLedgerAccountSection,
  GeneralLedgerLine,
  GeneralLedgerReport,
  IncomeStatementReport,
  JournalEntriesService as JournalEntriesSdk,
  JournalEntryLineResponse,
  JournalEntryResponse,
  JournalEntryReversalRequest,
  JournalEntryTraceabilityResponse,
  ReportExportRequest,
  ReportExportRequestFormatEnum,
  ReportExportResponse,
} from '@durion-sdk/accounting';
import {
  AccountLedger,
  AccountType,
  AgedCustomerRow,
  AgedReport,
  AgedVendorRow,
  AgingBuckets,
  BalanceSheetSummary,
  BooksFailure,
  DrilldownAccount,
  ExportFormat,
  ExportJob,
  ExportReportType,
  ExportStatus,
  GlAccountOption,
  IncomeSummary,
  JournalEntry,
  JournalEntryLine,
  JournalEntryPage,
  JournalEntryStatus,
  JournalEntryTraceability,
  LedgerLine,
  LedgerSection,
  StatementLine,
} from '../models/books.models';
import { AccountingService } from './accounting.service';

/** The sort All entries asks for: newest first (story PROPOSED 6). */
export const JOURNAL_ENTRY_SORT = 'transactionDate,desc';

/** Rows per All entries page (story PROPOSED 6). */
export const JOURNAL_ENTRY_PAGE_SIZE = 50;

/** Chart-of-accounts page size and the bound on pages read, so a runaway `totalPages` cannot fan out without limit. */
const GL_ACCOUNT_PAGE_SIZE = 200;
const MAX_GL_ACCOUNT_PAGES = 10;

const ACCOUNT_TYPES: ReadonlySet<string> = new Set(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']);
const ENTRY_STATUSES: ReadonlySet<string> = new Set(['DRAFT', 'PENDING', 'POSTED', 'REVERSED']);
const EXPORT_STATUSES: ReadonlySet<string> = new Set(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED']);

/**
 * The reads and writes behind Your books (CAP:550 S5, SPEC-accounting-workspace
 * §5.4): the balance sheet and income statement, their account drill-downs,
 * the general ledger, the aged receivables and payables, journal entries with
 * their traceability and reversal, the chart of accounts for the account
 * filter, and the report export.
 *
 * Backed by the generated `@durion-sdk/accounting` services (ADR-0041). Every
 * amount passes through as served; nothing here adds money (P7). No tenant or
 * organization identifier is ever sent (ADR-0062): the export request carries
 * the report, the format and the dates only (S35 dropped `organizationId`).
 *
 * Gates (`pos-accounting` controllers): every financial report, drill-down and
 * the export download need `reporting:view:financial-statements`; the chart of
 * accounts `accounting:coa:view`; journal entries `accounting:je:view`, their
 * reversal `accounting:je:reverse`; the export request and status
 * `accounting:report:export`. The page asks only for what the session holds.
 */
@Injectable({ providedIn: 'root' })
export class BooksService {
  private readonly reportingSdk = inject(FinancialReportingSdk);
  private readonly journalSdk = inject(JournalEntriesSdk);
  private readonly accountsSdk = inject(GLAccountsSdk);
  private readonly accounting = inject(AccountingService);

  /** *What you own / owe / what's yours* as of a local `YYYY-MM-DD`. */
  balanceSheet(asOfDate: string): Observable<BalanceSheetSummary> {
    return this.reportingSdk.generateBalanceSheet(asOfDate).pipe(map(report => toBalanceSheet(asOfDate, report)));
  }

  /** *{Month} so far*: the income statement from the period's start to the as-at date. */
  incomeStatement(startDate: string, endDate: string): Observable<IncomeSummary> {
    return this.reportingSdk
      .generateIncomeStatement(startDate, endDate)
      .pipe(map(report => toIncome(startDate, endDate, report)));
  }

  /** The accounts behind one statement line, with their served contributions. */
  drilldown(statementLineCode: string, startDate: string, endDate: string): Observable<DrilldownAccount[]> {
    return this.reportingSdk
      .drilldownToAccounts(statementLineCode, startDate, endDate)
      .pipe(map(rows => (rows ?? []).filter(row => !!row?.accountId).map(toDrilldownAccount)));
  }

  /** One account's posted entries for the range, with served opening, running and closing balances. */
  accountLedger(startDate: string, endDate: string, accountId: string): Observable<AccountLedger> {
    return this.reportingSdk.generateGeneralLedger(startDate, endDate, accountId).pipe(
      map((report: GeneralLedgerReport) => {
        const section = (report?.accounts ?? []).find(account => account?.accountId === accountId) ?? null;
        return { accountId, section: section ? toLedgerSection(section) : null };
      }),
    );
  }

  /** *Who owes what* — customers (S35 buckets, served names). No `@durion-sdk/customer` call. */
  agedReceivables(asOfDate: string): Observable<AgedReport<AgedCustomerRow>> {
    return this.reportingSdk
      .generateAgedReceivables(asOfDate)
      .pipe(map((report: AgedReceivablesReport) => toAgedReport(asOfDate, report, report?.rows, toCustomerRow)));
  }

  /** *Who owes what* — vendors. */
  agedPayables(asOfDate: string): Observable<AgedReport<AgedVendorRow>> {
    return this.reportingSdk
      .generateAgedPayables(asOfDate)
      .pipe(map((report: AgedPayablesReport) => toAgedReport(asOfDate, report, report?.rows, toVendorRow)));
  }

  /** One page of journal entries, newest first, optionally narrowed to one exact entry number. */
  listJournalEntries(page: number, entryNumber?: string): Observable<JournalEntryPage> {
    return this.journalSdk.listJournalEntries(JOURNAL_ENTRY_SORT, page, JOURNAL_ENTRY_PAGE_SIZE, entryNumber).pipe(
      map(response => {
        const rows = response?.items ?? response?.content ?? [];
        return {
          items: rows.filter(row => !!row?.journalEntryId).map(toJournalEntry),
          page: response?.pageNumber ?? page,
          totalPages: Math.max(1, response?.totalPages ?? 1),
          totalElements: response?.totalCount ?? response?.totalElements ?? rows.length,
        };
      }),
    );
  }

  getJournalEntry(journalEntryId: string): Observable<JournalEntry> {
    return this.journalSdk.getJournalEntry(journalEntryId).pipe(map(toJournalEntry));
  }

  getTraceability(journalEntryId: string): Observable<JournalEntryTraceability> {
    return this.journalSdk.getJournalEntryTraceability(journalEntryId).pipe(map(toTraceability));
  }

  /**
   * Reverses a posted entry. `reversalDate` is omitted (server default); the
   * justification is sent only for an override into a closed month, which the
   * server accepts only with `accounting:period:override`.
   */
  reverseJournalEntry(journalEntryId: string, reason: string, overrideJustification?: string): Observable<JournalEntry> {
    const body: JournalEntryReversalRequest = overrideJustification ? { reason, overrideJustification } : { reason };
    return this.journalSdk.reverseJournalEntry(journalEntryId, body).pipe(map(toJournalEntry));
  }

  /** Every active-or-not chart-of-accounts entry, ordered by code: page 0, then each further page (bounded). */
  listGlAccounts(): Observable<GlAccountOption[]> {
    const readPage = (page: number) =>
      this.accountsSdk.listGLAccounts('accountCode,asc', page, GL_ACCOUNT_PAGE_SIZE).pipe(
        map(response => ({
          rows: (response?.glAccounts ?? []).filter(row => !!row?.glAccountId).map(toGlAccountOption),
          totalPages: response?.totalPages ?? 1,
        })),
      );
    return readPage(0).pipe(
      switchMap(first => {
        const pages = Math.min(MAX_GL_ACCOUNT_PAGES, Math.max(1, first.totalPages));
        if (pages === 1) return of(first.rows);
        const rest = Array.from({ length: pages - 1 }, (_, i) => readPage(i + 1).pipe(map(result => result.rows)));
        return forkJoin(rest).pipe(map(later => [...first.rows, ...later.flat()]));
      }),
    );
  }

  /** Starts an export for the chosen report, format and dates. No tenant or organization identifier (ADR-0062). */
  requestExport(
    reportType: ExportReportType,
    format: ExportFormat,
    startDate: string,
    endDate: string,
  ): Observable<ExportJob> {
    const request: ReportExportRequest = {
      reportType,
      format: format === 'PDF' ? ReportExportRequestFormatEnum.Pdf : ReportExportRequestFormatEnum.Csv,
      startDate,
      endDate,
    };
    return this.reportingSdk.requestReportExport(request).pipe(map(toExportJob));
  }

  exportStatus(exportId: string): Observable<ExportJob> {
    return this.reportingSdk.getReportExportStatus(exportId).pipe(map(toExportJob));
  }

  /** Downloads a completed export under `filename` (the shared object-URL download, deferred revoke). */
  downloadExport(exportId: string, filename: string): Observable<void> {
    return this.accounting.downloadExport(exportId, filename);
  }
}

/** The HTTP status and served error code of a failure; the served message never reaches the UI (ADR-0064). */
export function toBooksFailure(error: unknown): BooksFailure {
  if (!(error instanceof HttpErrorResponse)) return { status: 0, code: null };
  const body = (typeof error.error === 'object' && error.error !== null ? error.error : {}) as Partial<ApiError>;
  return { status: error.status, code: typeof body.code === 'string' ? body.code : null };
}

const text = (value: string | null | undefined): string | null => value?.trim() || null;
const amount = (value: number | null | undefined): number | null => (typeof value === 'number' ? value : null);
const served = (value: number | null | undefined): number => (typeof value === 'number' ? value : 0);

function accountType(value: string | null | undefined): AccountType | null {
  return value && ACCOUNT_TYPES.has(value) ? (value as AccountType) : null;
}

/** Served order kept: a JSON object keeps its keys' insertion order, which is the server's line order. */
function toLines(lineItems: Readonly<Record<string, number>> | null | undefined): StatementLine[] {
  return Object.entries(lineItems ?? {})
    .filter(([code, value]) => !!code && typeof value === 'number')
    .map(([code, value]) => ({ code, amount: value }));
}

function toBalanceSheet(asOfDate: string, report: BalanceSheetReport): BalanceSheetSummary {
  return {
    asOfDate: report?.asOfDate ?? asOfDate,
    // Only an explicit `false` says the books don't balance; a missing flag claims nothing.
    balanced: report?.balanced !== false,
    lines: toLines(report?.lineItems),
    totalAssets: served(report?.totalAssets),
    totalLiabilities: served(report?.totalLiabilities),
    totalEquity: served(report?.totalEquity),
  };
}

function toIncome(startDate: string, endDate: string, report: IncomeStatementReport): IncomeSummary {
  return {
    startDate: report?.startDate ?? startDate,
    endDate: report?.endDate ?? endDate,
    lines: toLines(report?.lineItems),
    totalRevenue: served(report?.totalRevenue),
    totalExpenses: served(report?.totalExpenses),
    netIncome: served(report?.netIncome),
  };
}

function toDrilldownAccount(row: AccountDrilldownResponse): DrilldownAccount {
  return {
    accountId: row.accountId,
    accountCode: text(row.accountCode),
    accountName: text(row.accountName),
    accountType: accountType(row.accountType),
    balance: served(row.balance),
  };
}

function toLedgerLine(line: GeneralLedgerLine): LedgerLine {
  const direction = line?.direction as string | undefined;
  return {
    journalEntryId: line.journalEntryId,
    entryNumber: text(line.entryNumber),
    transactionDate: text(line.transactionDate),
    description: text(line.description),
    debitAmount: amount(line.debitAmount),
    creditAmount: amount(line.creditAmount),
    direction: direction === 'INCREASE' || direction === 'DECREASE' ? direction : null,
    normalRunningBalance: amount(line.normalRunningBalance),
    runningBalance: amount(line.runningBalance),
  };
}

function toLedgerSection(section: GeneralLedgerAccountSection): LedgerSection {
  const normalSide = section?.normalSide as string | undefined;
  return {
    accountId: section.accountId,
    accountNumber: text(section.accountNumber),
    accountName: text(section.accountName),
    accountType: accountType(section.accountType),
    normalSide: normalSide === 'DEBIT' || normalSide === 'CREDIT' ? normalSide : null,
    openingBalance: amount(section.openingBalance),
    closingBalance: amount(section.closingBalance),
    normalOpeningBalance: amount(section.normalOpeningBalance),
    normalClosingBalance: amount(section.normalClosingBalance),
    lines: (section.lines ?? []).filter(line => !!line?.journalEntryId).map(toLedgerLine),
  };
}

function toBuckets(row: Partial<AgingSummary> | null | undefined): AgingBuckets {
  return {
    notYetDue: served(row?.notYetDue),
    days1To30: served(row?.days1To30),
    days31To60: served(row?.days31To60),
    days61To90: served(row?.days61To90),
    days90Plus: served(row?.days90Plus),
    totalOutstanding: served(row?.totalOutstanding),
  };
}

function toCustomerRow(row: AgedReceivablesRow): AgedCustomerRow {
  return {
    ...toBuckets(row),
    customerId: row.customerId,
    customerName: text(row.customerName),
    customerReference: text(row.customerReference),
  };
}

function toVendorRow(row: AgedPayablesRow): AgedVendorRow {
  return { ...toBuckets(row), vendorId: row.vendorId, vendorName: text(row.vendorName) };
}

function toAgedReport<Source, Row>(
  asOfDate: string,
  report: { asOfDate?: string; totals?: AgingSummary } | null | undefined,
  rows: readonly Source[] | null | undefined,
  toRow: (row: Source) => Row,
): AgedReport<Row> {
  return {
    asOfDate: report?.asOfDate ?? asOfDate,
    rows: (rows ?? []).filter(row => !!row).map(toRow),
    totals: toBuckets(report?.totals),
  };
}

function entryStatus(value: string | null | undefined): JournalEntryStatus {
  return value && ENTRY_STATUSES.has(value) ? (value as JournalEntryStatus) : 'UNKNOWN';
}

function toEntryLine(line: JournalEntryLineResponse): JournalEntryLine {
  return {
    lineNumber: amount(line.lineNumber),
    accountCode: text(line.accountCode),
    accountName: text(line.accountName),
    description: text(line.description),
    debitAmount: amount(line.debitAmount),
    creditAmount: amount(line.creditAmount),
  };
}

function toJournalEntry(entry: JournalEntryResponse): JournalEntry {
  return {
    journalEntryId: entry?.journalEntryId ?? '',
    entryNumber: text(entry?.entryNumber),
    transactionDate: text(entry?.transactionDate),
    description: text(entry?.description),
    status: entryStatus(entry?.status),
    sourceEventType: text(entry?.sourceEventType),
    totalDebits: amount(entry?.totalDebits),
    reversalJournalEntryId: text(entry?.reversalJournalEntryId),
    reversedByJournalEntryId: text(entry?.reversedByJournalEntryId),
    lines: (entry?.lines ?? []).filter(line => !!line).map(toEntryLine),
  };
}

function optionalEntry(entry: JournalEntryResponse | null | undefined): JournalEntry | null {
  return entry?.journalEntryId ? toJournalEntry(entry) : null;
}

function toTraceability(response: JournalEntryTraceabilityResponse): JournalEntryTraceability {
  return {
    original: optionalEntry(response?.originalJournalEntry),
    reversal: optionalEntry(response?.reversalJournalEntry),
    related: (response?.relatedJournalEntries ?? [])
      .filter(entry => !!entry?.journalEntryId && entry.journalEntryId !== response?.journalEntryId)
      .map(toJournalEntry),
  };
}

function toGlAccountOption(row: GLAccountResponse): GlAccountOption {
  return { glAccountId: row.glAccountId, accountCode: text(row.accountCode), accountName: text(row.accountName) };
}

function toExportJob(response: ReportExportResponse): ExportJob {
  const status = response?.status as string | undefined;
  return {
    exportId: response?.exportId ?? '',
    status: status && EXPORT_STATUSES.has(status) ? (status as ExportStatus) : 'UNKNOWN',
  };
}
