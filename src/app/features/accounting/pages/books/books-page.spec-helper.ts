import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import { vi } from 'vitest';
import { JwtClaims } from '../../../../core/models/auth.models';
import { AuthService } from '../../../../core/services/auth.service';
import {
  AccountLedger,
  AgedCustomerRow,
  AgedReport,
  AgedVendorRow,
  BalanceSheetSummary,
  DrilldownAccount,
  ExportFormat,
  ExportJob,
  ExportReportType,
  GlAccountOption,
  IncomeSummary,
  JournalEntry,
  JournalEntryPage,
  JournalEntryTraceability,
  LedgerSection,
} from '../../models/books.models';
import { AccountingPeriod } from '../../models/period-close.models';
import { BooksService } from '../../services/books.service';
import { PeriodCloseService } from '../../services/period-close.service';
import { toIsoDate } from '../../utils/date-window.util';
import { BOOKS_CLOCK } from './books-page.component';

/**
 * Shared fixtures for the Your books and journal-entry specs. "Today" is the
 * injected clock; every date is derived from it, never a literal that expires
 * (ADR-0038 §7). Excluded from the app build (`*.spec-helper.ts`).
 */
export const NOW = new Date(2026, 9, 6, 10, 30);
export const TODAY_ISO = toIsoDate(NOW);
const monthStart = new Date(NOW.getFullYear(), NOW.getMonth(), 1);
const monthEnd = new Date(NOW.getFullYear(), NOW.getMonth() + 1, 0);
const previousMonthStart = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 1);
const previousMonthEnd = new Date(NOW.getFullYear(), NOW.getMonth(), 0);
export const MONTH_START_ISO = toIsoDate(monthStart);
export const PREVIOUS_START_ISO = toIsoDate(previousMonthStart);
export const PREVIOUS_END_ISO = toIsoDate(previousMonthEnd);

const code = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export const ALL_BOOKS_PERMISSIONS = [
  'reporting:view:financial-statements',
  'accounting:coa:view',
  'accounting:je:view',
  'accounting:je:reverse',
  'accounting:report:export',
  'accounting:period:view',
];

export const currentPeriod: AccountingPeriod = {
  periodCode: code(NOW),
  startDate: MONTH_START_ISO,
  endDate: toIsoDate(monthEnd),
  status: 'OPEN',
  closedAt: null,
  closedBy: null,
  reopenedAt: null,
  reopenedBy: null,
  reopenJustification: null,
};

export const previousPeriod: AccountingPeriod = {
  ...currentPeriod,
  periodCode: code(previousMonthStart),
  startDate: PREVIOUS_START_ISO,
  endDate: PREVIOUS_END_ISO,
  status: 'CLOSED',
};

export const balanceSheet = (overrides: Partial<BalanceSheetSummary> = {}): BalanceSheetSummary => ({
  asOfDate: TODAY_ISO,
  balanced: true,
  lines: [
    { code: 'BS_IN_THE_BANK', amount: 25400.5 },
    { code: 'BS_WAITING_TO_BE_DEPOSITED', amount: 1200 },
    { code: 'BS_CUSTOMERS_OWE_YOU', amount: 18240.5 },
    { code: 'BS_BILLS_FROM_VENDORS', amount: 9300 },
    { code: 'BS_PROFIT_NOT_YET_CLOSED', amount: 5000 },
  ],
  totalAssets: 44841,
  totalLiabilities: 9300,
  totalEquity: 35541,
  ...overrides,
});

export const incomeSummary = (overrides: Partial<IncomeSummary> = {}): IncomeSummary => ({
  startDate: MONTH_START_ISO,
  endDate: TODAY_ISO,
  lines: [
    { code: 'IS_SALES', amount: 12000 },
    { code: 'IS_COST_OF_PARTS_SOLD', amount: 7000 },
  ],
  totalRevenue: 12000,
  totalExpenses: 7000,
  netIncome: 5000,
  ...overrides,
});

export const drillAccount = (overrides: Partial<DrilldownAccount> = {}): DrilldownAccount => ({
  accountId: 'acc-2000',
  accountCode: '2000',
  accountName: 'Accounts payable',
  accountType: 'LIABILITY',
  balance: 9300,
  ...overrides,
});

export const ledgerSection = (overrides: Partial<LedgerSection> = {}): LedgerSection => ({
  accountId: 'acc-2000',
  accountNumber: '2000',
  accountName: 'Accounts payable',
  accountType: 'LIABILITY',
  normalSide: 'CREDIT',
  openingBalance: -8800,
  closingBalance: -9300,
  normalOpeningBalance: 8800,
  normalClosingBalance: 9300,
  lines: [
    {
      journalEntryId: 'je-7',
      entryNumber: 'JE-202610-7',
      transactionDate: MONTH_START_ISO,
      description: 'Bill from Tire Wholesale',
      debitAmount: null,
      creditAmount: 500,
      direction: 'INCREASE',
      normalRunningBalance: 9300,
      runningBalance: -9300,
    },
  ],
  ...overrides,
});

export const customerRow = (overrides: Partial<AgedCustomerRow> = {}): AgedCustomerRow => ({
  customerId: 'cust-1',
  customerName: 'Harbor Fleet Services',
  customerReference: 'C-1042',
  notYetDue: 1000,
  days1To30: 200,
  days31To60: 0,
  days61To90: 0,
  days90Plus: 50,
  totalOutstanding: 1250,
  ...overrides,
});

export const receivablesReport = (rows: AgedCustomerRow[] = [customerRow()]): AgedReport<AgedCustomerRow> => ({
  asOfDate: TODAY_ISO,
  rows,
  totals: { notYetDue: 1000, days1To30: 200, days31To60: 0, days61To90: 0, days90Plus: 50, totalOutstanding: 1250 },
});

export const payablesReport = (): AgedReport<AgedVendorRow> => ({
  asOfDate: TODAY_ISO,
  rows: [
    {
      vendorId: 'ven-1',
      vendorName: 'Tire Wholesale',
      notYetDue: 600,
      days1To30: 0,
      days31To60: 0,
      days61To90: 0,
      days90Plus: 0,
      totalOutstanding: 600,
    },
  ],
  totals: { notYetDue: 600, days1To30: 0, days31To60: 0, days61To90: 0, days90Plus: 0, totalOutstanding: 600 },
});

export const journalEntry = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  journalEntryId: 'je-131',
  entryNumber: 'JE-202610-131',
  transactionDate: MONTH_START_ISO,
  description: 'Invoice INV-2026-01702',
  status: 'POSTED',
  sourceEventType: 'INVOICE_REVENUE',
  totalDebits: 4615,
  reversalJournalEntryId: null,
  reversedByJournalEntryId: null,
  lines: [
    { lineNumber: 1, accountCode: '1200', accountName: 'Accounts receivable', description: null, debitAmount: 4615, creditAmount: null },
    { lineNumber: 2, accountCode: '4000', accountName: 'Sales', description: null, debitAmount: null, creditAmount: 4615 },
  ],
  ...overrides,
});

export const entriesPage = (items: JournalEntry[] = [journalEntry()], totalPages = 1): JournalEntryPage => ({
  items,
  page: 0,
  totalPages,
  totalElements: items.length,
});

export const traceability = (overrides: Partial<JournalEntryTraceability> = {}): JournalEntryTraceability => ({
  original: null,
  reversal: null,
  related: [],
  ...overrides,
});

export const glAccounts: GlAccountOption[] = [
  { glAccountId: 'acc-1000', accountCode: '1000', accountName: 'Operating checking' },
  { glAccountId: 'acc-2000', accountCode: '2000', accountName: 'Accounts payable' },
];

/** BooksService as a set of spies; every read answers at once with a full page. */
export interface BooksMocks {
  readonly held: WritableSignal<readonly string[] | null>;
  readonly claims: WritableSignal<JwtClaims | null>;
  readonly queryParams: BehaviorSubject<Record<string, string>>;
  readonly params: BehaviorSubject<Record<string, string>>;
  readonly books: {
    balanceSheet: ReturnType<typeof vi.fn<(asOf: string) => Observable<BalanceSheetSummary>>>;
    incomeStatement: ReturnType<typeof vi.fn<(start: string, end: string) => Observable<IncomeSummary>>>;
    drilldown: ReturnType<typeof vi.fn<(code: string, start: string, end: string) => Observable<DrilldownAccount[]>>>;
    accountLedger: ReturnType<typeof vi.fn<(start: string, end: string, accountId: string) => Observable<AccountLedger>>>;
    agedReceivables: ReturnType<typeof vi.fn<(asOf: string) => Observable<AgedReport<AgedCustomerRow>>>>;
    agedPayables: ReturnType<typeof vi.fn<(asOf: string) => Observable<AgedReport<AgedVendorRow>>>>;
    listJournalEntries: ReturnType<typeof vi.fn<(page: number, entryNumber?: string) => Observable<JournalEntryPage>>>;
    getJournalEntry: ReturnType<typeof vi.fn<(id: string) => Observable<JournalEntry>>>;
    getTraceability: ReturnType<typeof vi.fn<(id: string) => Observable<JournalEntryTraceability>>>;
    reverseJournalEntry: ReturnType<
      typeof vi.fn<(id: string, reason: string, override?: string) => Observable<JournalEntry>>
    >;
    listGlAccounts: ReturnType<typeof vi.fn<() => Observable<GlAccountOption[]>>>;
    requestExport: ReturnType<
      typeof vi.fn<(type: ExportReportType, format: ExportFormat, start: string, end: string) => Observable<ExportJob>>
    >;
    exportStatus: ReturnType<typeof vi.fn<(id: string) => Observable<ExportJob>>>;
    downloadExport: ReturnType<typeof vi.fn<(id: string, filename: string) => Observable<void>>>;
  };
  readonly periods: { listPeriods: ReturnType<typeof vi.fn<() => Observable<AccountingPeriod[]>>> };
}

export function createBooksMocks(held: readonly string[] | null = ALL_BOOKS_PERMISSIONS): BooksMocks {
  return {
    held: signal(held),
    claims: signal<JwtClaims | null>(null),
    queryParams: new BehaviorSubject<Record<string, string>>({}),
    params: new BehaviorSubject<Record<string, string>>({ journalEntryId: 'je-131' }),
    books: {
      balanceSheet: vi.fn(() => of(balanceSheet())),
      incomeStatement: vi.fn(() => of(incomeSummary())),
      drilldown: vi.fn(() => of([drillAccount()])),
      accountLedger: vi.fn((_start: string, _end: string, accountId: string) =>
        of({ accountId, section: ledgerSection({ accountId }) }),
      ),
      agedReceivables: vi.fn(() => of(receivablesReport())),
      agedPayables: vi.fn(() => of(payablesReport())),
      listJournalEntries: vi.fn(() => of(entriesPage())),
      getJournalEntry: vi.fn(() => of(journalEntry())),
      getTraceability: vi.fn(() => of(traceability())),
      reverseJournalEntry: vi.fn(() =>
        of(journalEntry({ journalEntryId: 'je-140', entryNumber: 'JE-202610-140', reversalJournalEntryId: 'je-131' })),
      ),
      listGlAccounts: vi.fn(() => of(glAccounts)),
      requestExport: vi.fn(() => of<ExportJob>({ exportId: 'exp-1', status: 'PENDING' })),
      exportStatus: vi.fn(() => of<ExportJob>({ exportId: 'exp-1', status: 'COMPLETED' })),
      downloadExport: vi.fn(() => of(undefined)),
    },
    periods: { listPeriods: vi.fn(() => of([currentPeriod, previousPeriod])) },
  };
}

/**
 * `authExtras` carries the AuthService members a spec adds on top, the tenant
 * signal among them: tenant ids stay in the spec files (arch rule TEN-02).
 */
export function configureBooks(mocks: BooksMocks, authExtras: Partial<AuthService>): void {
  const auth: Partial<AuthService> = {
    ...authExtras,
    currentUserClaims: mocks.claims,
    permissionsKnown: (() => mocks.held() !== null) as AuthService['permissionsKnown'],
    hasAnyRole: () => false,
    hasPermission: (permission: string) => !!mocks.held()?.includes(permission),
    hasAnyPermission: (codes: readonly string[]) => {
      const held = mocks.held();
      return !!held && codes.some(permission => held.includes(permission));
    },
  };
  const route: Partial<ActivatedRoute> = {
    queryParamMap: new Observable(subscriber =>
      mocks.queryParams.subscribe(params => subscriber.next(convertToParamMap(params))),
    ),
    paramMap: new Observable(subscriber => mocks.params.subscribe(params => subscriber.next(convertToParamMap(params)))),
  };
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: route },
      { provide: AuthService, useValue: auth },
      { provide: BooksService, useValue: mocks.books },
      { provide: PeriodCloseService, useValue: mocks.periods },
      { provide: BOOKS_CLOCK, useValue: () => new Date(NOW.getTime()) },
    ],
  });
}

/** A read the test resolves by hand (ADR-0063 §8: ordering tests drive a Subject, never `of`). */
export function pending<T>(): Subject<T> {
  return new Subject<T>();
}
