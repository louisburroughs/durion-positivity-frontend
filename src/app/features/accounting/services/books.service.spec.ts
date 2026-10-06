import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountDrilldownResponse,
  AccountDrilldownResponseAccountTypeEnum,
  AgedPayablesReport,
  AgedReceivablesReport,
  BalanceSheetReport,
  FinancialReportingService as FinancialReportingSdk,
  GLAccountListResponse,
  GLAccountsService as GLAccountsSdk,
  GeneralLedgerAccountSectionAccountTypeEnum,
  GeneralLedgerAccountSectionNormalSideEnum,
  GeneralLedgerLineDirectionEnum,
  GeneralLedgerReport,
  IncomeStatementReport,
  JournalEntriesService as JournalEntriesSdk,
  JournalEntryResponse,
  JournalEntryResponseStatusEnum,
  JournalEntryTraceabilityResponse,
  PagedResponseJournalEntryResponse,
  ReportExportResponse,
  ReportExportResponseFormatEnum,
  ReportExportResponseStatusEnum,
} from '@durion-sdk/accounting';
import {
  AccountLedger,
  AgedCustomerRow,
  AgedReport,
  AgedVendorRow,
  BalanceSheetSummary,
  DrilldownAccount,
  ExportJob,
  GlAccountOption,
  IncomeSummary,
  JournalEntry,
  JournalEntryPage,
  JournalEntryTraceability,
} from '../models/books.models';
import { AccountingService } from './accounting.service';
import { BooksService, JOURNAL_ENTRY_PAGE_SIZE, JOURNAL_ENTRY_SORT, toBooksFailure } from './books.service';

const balanceSheet: BalanceSheetReport = {
  asOfDate: '2026-10-06',
  balanced: true,
  generatedAt: '2026-10-06T14:00:00Z',
  lineItems: { BS_IN_THE_BANK: 25400.5, BS_CUSTOMERS_OWE_YOU: 18240.5, BS_BILLS_FROM_VENDORS: 9300 },
  totalAssets: 43641,
  totalLiabilities: 9300,
  totalEquity: 34341,
};

const incomeStatement: IncomeStatementReport = {
  startDate: '2026-10-01',
  endDate: '2026-10-06',
  generatedAt: '2026-10-06T14:00:00Z',
  lineItems: { IS_SALES: 12000, IS_COST_OF_PARTS_SOLD: 7000 },
  totalRevenue: 12000,
  totalExpenses: 7000,
  netIncome: 5000,
};

const drilldownRow: AccountDrilldownResponse = {
  accountId: 'acc-1000',
  accountCode: '1000',
  accountName: 'Operating checking',
  accountType: AccountDrilldownResponseAccountTypeEnum.Asset,
  balance: 25400.5,
  statementLineCode: 'BS_IN_THE_BANK',
};

const ledgerReport: GeneralLedgerReport = {
  accountId: 'acc-2000',
  startDate: '2026-10-01',
  endDate: '2026-10-06',
  generatedAt: '2026-10-06T14:00:00Z',
  totalCredit: 500,
  totalDebit: 0,
  accounts: [
    {
      accountId: 'acc-2000',
      accountName: 'Accounts payable',
      accountNumber: '2000',
      accountType: GeneralLedgerAccountSectionAccountTypeEnum.Liability,
      normalSide: GeneralLedgerAccountSectionNormalSideEnum.Credit,
      openingBalance: -8800,
      closingBalance: -9300,
      normalOpeningBalance: 8800,
      normalClosingBalance: 9300,
      totalCredit: 500,
      totalDebit: 0,
      lines: [
        {
          journalEntryId: 'je-1',
          entryNumber: 'JE-202610-7',
          transactionDate: '2026-10-03',
          description: 'Bill from Tire Wholesale',
          creditAmount: 500,
          direction: GeneralLedgerLineDirectionEnum.Increase,
          normalRunningBalance: 9300,
          runningBalance: -9300,
        },
      ],
    },
  ],
};

const receivables: AgedReceivablesReport = {
  asOfDate: '2026-10-06',
  generatedAt: '2026-10-06T14:00:00Z',
  rows: [
    {
      customerId: 'cust-1',
      customerName: 'Harbor Fleet Services',
      customerReference: 'C-1042',
      notYetDue: 1000,
      days1To30: 200,
      days31To60: 0,
      days61To90: 0,
      days90Plus: 50,
      overdue: 250,
      totalOutstanding: 1250,
    },
  ],
  totals: {
    notYetDue: 1000,
    days1To30: 200,
    days31To60: 0,
    days61To90: 0,
    days90Plus: 50,
    overdue: 250,
    totalOutstanding: 1250,
  },
};

const payables: AgedPayablesReport = {
  asOfDate: '2026-10-06',
  generatedAt: '2026-10-06T14:00:00Z',
  rows: [
    {
      vendorId: 'ven-1',
      vendorName: 'Tire Wholesale',
      notYetDue: 600,
      days1To30: 0,
      days31To60: 0,
      days61To90: 0,
      days90Plus: 0,
      overdue: 0,
      totalOutstanding: 600,
      unapproved: 0,
      unapprovedBillCount: 0,
      totalIncludingUnapproved: 600,
    },
  ],
  totals: {
    notYetDue: 600,
    days1To30: 0,
    days31To60: 0,
    days61To90: 0,
    days90Plus: 0,
    overdue: 0,
    totalOutstanding: 600,
  },
  unapproved: 0,
  unapprovedBillCount: 0,
  totalIncludingUnapproved: 600,
};

const postedEntry: JournalEntryResponse = {
  journalEntryId: 'je-131',
  entryNumber: 'JE-202610-131',
  transactionDate: '2026-10-04T10:00:00Z',
  description: 'Invoice INV-2026-01702',
  status: JournalEntryResponseStatusEnum.Posted,
  sourceEventType: 'INVOICE_REVENUE',
  totalDebits: 4615,
  totalCredits: 4615,
  lines: [
    { lineNumber: 1, accountCode: '1200', accountName: 'Accounts receivable', debitAmount: 4615, description: 'INV-2026-01702' },
    { lineNumber: 2, accountCode: '4000', accountName: 'Sales', creditAmount: 4615 },
  ],
};

const entriesPage: PagedResponseJournalEntryResponse = {
  items: [postedEntry],
  pageNumber: 0,
  pageSize: JOURNAL_ENTRY_PAGE_SIZE,
  totalCount: 1,
  totalPages: 1,
};

const traceability: JournalEntryTraceabilityResponse = {
  journalEntryId: 'je-131',
  journalEntry: postedEntry,
  reversalJournalEntry: {
    journalEntryId: 'je-140',
    entryNumber: 'JE-202610-140',
    status: JournalEntryResponseStatusEnum.Posted,
    reversalJournalEntryId: 'je-131',
  },
  relatedJournalEntries: [postedEntry, { journalEntryId: 'je-132', entryNumber: 'JE-202610-132' }],
};

const exportResponse = (status: ReportExportResponseStatusEnum): ReportExportResponse => ({
  exportId: 'exp-1',
  status,
  format: ReportExportResponseFormatEnum.Pdf,
  reportType: 'BALANCE_SHEET',
});

const accountsPage = (page: number, totalPages: number, code: string): GLAccountListResponse => ({
  glAccounts: [{ glAccountId: `gl-${code}`, accountCode: code, accountName: `Account ${code}`, reconcilable: false }],
  pageNumber: page,
  pageSize: 200,
  totalElements: totalPages,
  totalPages,
});

describe('BooksService', () => {
  let service: BooksService;
  const reporting = {
    generateBalanceSheet: vi.fn(),
    generateIncomeStatement: vi.fn(),
    drilldownToAccounts: vi.fn(),
    generateGeneralLedger: vi.fn(),
    generateAgedReceivables: vi.fn(),
    generateAgedPayables: vi.fn(),
    requestReportExport: vi.fn(),
    getReportExportStatus: vi.fn(),
  };
  const journal = {
    listJournalEntries: vi.fn(),
    getJournalEntry: vi.fn(),
    getJournalEntryTraceability: vi.fn(),
    reverseJournalEntry: vi.fn(),
  };
  const accounts = { listGLAccounts: vi.fn() };
  const accounting = { downloadExport: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: FinancialReportingSdk, useValue: reporting },
        { provide: JournalEntriesSdk, useValue: journal },
        { provide: GLAccountsSdk, useValue: accounts },
        { provide: AccountingService, useValue: accounting },
      ],
    });
    service = TestBed.inject(BooksService);
  });

  it('balanceSheet(asOf) passes the date and keeps the served lines, order and totals verbatim', async () => {
    reporting.generateBalanceSheet.mockReturnValue(of(balanceSheet));

    const result = await firstValueFrom(service.balanceSheet('2026-10-06'));

    expect(reporting.generateBalanceSheet).toHaveBeenCalledWith('2026-10-06');
    const expected: BalanceSheetSummary = {
      asOfDate: '2026-10-06',
      balanced: true,
      lines: [
        { code: 'BS_IN_THE_BANK', amount: 25400.5 },
        { code: 'BS_CUSTOMERS_OWE_YOU', amount: 18240.5 },
        { code: 'BS_BILLS_FROM_VENDORS', amount: 9300 },
      ],
      totalAssets: 43641,
      totalLiabilities: 9300,
      totalEquity: 34341,
    };
    expect(result).toEqual(expected);
  });

  it('balanceSheet reads an explicit balanced: false as unbalanced, and an empty map as no lines', async () => {
    reporting.generateBalanceSheet.mockReturnValue(of({ ...balanceSheet, balanced: false, lineItems: {} }));

    const result = await firstValueFrom(service.balanceSheet('2026-10-06'));

    expect(result.balanced).toBe(false);
    expect(result.lines).toEqual([]);
  });

  it('maps a total or bucket the response omits to null, never to a served-looking 0 (ADR-0064 §4)', async () => {
    reporting.generateBalanceSheet.mockReturnValue(of({ ...balanceSheet, totalEquity: undefined } as unknown as BalanceSheetReport));
    const [row] = receivables.rows;
    reporting.generateAgedReceivables.mockReturnValue(
      of({ ...receivables, rows: [{ ...row, days90Plus: undefined }] } as unknown as AgedReceivablesReport),
    );

    const sheet = await firstValueFrom(service.balanceSheet('2026-10-06'));
    const aged = await firstValueFrom(service.agedReceivables('2026-10-06'));

    expect(sheet.totalEquity).toBeNull();
    expect(sheet.totalAssets).toBe(43641);
    expect(aged.rows[0].days90Plus).toBeNull();
    expect(aged.rows[0].days1To30).toBe(200);
  });

  it('incomeStatement(start, end) passes both dates and the served totals', async () => {
    reporting.generateIncomeStatement.mockReturnValue(of(incomeStatement));

    const result = await firstValueFrom(service.incomeStatement('2026-10-01', '2026-10-06'));

    expect(reporting.generateIncomeStatement).toHaveBeenCalledWith('2026-10-01', '2026-10-06');
    const expected: IncomeSummary = {
      startDate: '2026-10-01',
      endDate: '2026-10-06',
      lines: [
        { code: 'IS_SALES', amount: 12000 },
        { code: 'IS_COST_OF_PARTS_SOLD', amount: 7000 },
      ],
      totalRevenue: 12000,
      totalExpenses: 7000,
      netIncome: 5000,
    };
    expect(result).toEqual(expected);
  });

  it('drilldown(code, start, end) calls drilldownToAccounts with all three arguments', async () => {
    reporting.drilldownToAccounts.mockReturnValue(of([drilldownRow]));

    const result = await firstValueFrom(service.drilldown('BS_IN_THE_BANK', '2026-10-01', '2026-10-06'));

    expect(reporting.drilldownToAccounts).toHaveBeenCalledWith('BS_IN_THE_BANK', '2026-10-01', '2026-10-06');
    const expected: DrilldownAccount[] = [
      { accountId: 'acc-1000', accountCode: '1000', accountName: 'Operating checking', accountType: 'ASSET', balance: 25400.5 },
    ];
    expect(result).toEqual(expected);
  });

  it('accountLedger(start, end, accountId) calls generateGeneralLedger and keeps the served normal-side fields', async () => {
    reporting.generateGeneralLedger.mockReturnValue(of(ledgerReport));

    const result = await firstValueFrom(service.accountLedger('2026-10-01', '2026-10-06', 'acc-2000'));

    expect(reporting.generateGeneralLedger).toHaveBeenCalledWith('2026-10-01', '2026-10-06', 'acc-2000');
    const expected: AccountLedger = {
      accountId: 'acc-2000',
      section: {
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
            journalEntryId: 'je-1',
            entryNumber: 'JE-202610-7',
            transactionDate: '2026-10-03',
            description: 'Bill from Tire Wholesale',
            debitAmount: null,
            creditAmount: 500,
            direction: 'INCREASE',
            normalRunningBalance: 9300,
            runningBalance: -9300,
          },
        ],
      },
    };
    expect(result).toEqual(expected);
  });

  it('accountLedger answers a null section when the account had no posted activity', async () => {
    reporting.generateGeneralLedger.mockReturnValue(of({ ...ledgerReport, accounts: [] }));

    const result = await firstValueFrom(service.accountLedger('2026-10-01', '2026-10-06', 'acc-2000'));

    expect(result).toEqual({ accountId: 'acc-2000', section: null });
  });

  it('agedReceivables(asOf) keeps the S35 buckets, the served name and reference', async () => {
    reporting.generateAgedReceivables.mockReturnValue(of(receivables));

    const result = await firstValueFrom(service.agedReceivables('2026-10-06'));

    expect(reporting.generateAgedReceivables).toHaveBeenCalledWith('2026-10-06');
    const expected: AgedReport<AgedCustomerRow> = {
      asOfDate: '2026-10-06',
      rows: [
        {
          customerId: 'cust-1',
          customerName: 'Harbor Fleet Services',
          customerReference: 'C-1042',
          notYetDue: 1000,
          days1To30: 200,
          days31To60: 0,
          days61To90: 0,
          days90Plus: 50,
          totalOutstanding: 1250,
        },
      ],
      totals: { notYetDue: 1000, days1To30: 200, days31To60: 0, days61To90: 0, days90Plus: 50, totalOutstanding: 1250 },
    };
    expect(result).toEqual(expected);
  });

  it('agedReceivables maps a missing customer name to null, never the id', async () => {
    const [row] = receivables.rows;
    reporting.generateAgedReceivables.mockReturnValue(
      of({ ...receivables, rows: [{ ...row, customerName: undefined, customerReference: '  ' }] }),
    );

    const result = await firstValueFrom(service.agedReceivables('2026-10-06'));

    expect(result.rows[0].customerName).toBeNull();
    expect(result.rows[0].customerReference).toBeNull();
  });

  it('agedPayables(asOf) keeps the vendor name and buckets', async () => {
    reporting.generateAgedPayables.mockReturnValue(of(payables));

    const result = await firstValueFrom(service.agedPayables('2026-10-06'));

    expect(reporting.generateAgedPayables).toHaveBeenCalledWith('2026-10-06');
    const expected: AgedReport<AgedVendorRow> = {
      asOfDate: '2026-10-06',
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
    };
    expect(result).toEqual(expected);
  });

  it("listJournalEntries(page, entryNumber) calls listJournalEntries('transactionDate,desc', 0, 50, 'JE-202610-131')", async () => {
    journal.listJournalEntries.mockReturnValue(of(entriesPage));

    const result = await firstValueFrom(service.listJournalEntries(0, 'JE-202610-131'));

    expect(JOURNAL_ENTRY_SORT).toBe('transactionDate,desc');
    expect(journal.listJournalEntries).toHaveBeenCalledWith('transactionDate,desc', 0, 50, 'JE-202610-131');
    const expected: JournalEntryPage = {
      items: [
        {
          journalEntryId: 'je-131',
          entryNumber: 'JE-202610-131',
          transactionDate: '2026-10-04T10:00:00Z',
          description: 'Invoice INV-2026-01702',
          status: 'POSTED',
          sourceEventType: 'INVOICE_REVENUE',
          totalDebits: 4615,
          reversalJournalEntryId: null,
          reversedByJournalEntryId: null,
          lines: [
            {
              lineNumber: 1,
              accountCode: '1200',
              accountName: 'Accounts receivable',
              description: 'INV-2026-01702',
              debitAmount: 4615,
              creditAmount: null,
            },
            { lineNumber: 2, accountCode: '4000', accountName: 'Sales', description: null, debitAmount: null, creditAmount: 4615 },
          ],
        },
      ],
      page: 0,
      totalPages: 1,
      totalElements: 1,
    };
    expect(result).toEqual(expected);
  });

  it('listJournalEntries without a number passes undefined and maps an unknown status to UNKNOWN', async () => {
    journal.listJournalEntries.mockReturnValue(
      of({ ...entriesPage, items: [{ ...postedEntry, status: 'ARCHIVED' as JournalEntryResponseStatusEnum }] }),
    );

    const result = await firstValueFrom(service.listJournalEntries(2));

    expect(journal.listJournalEntries).toHaveBeenCalledWith('transactionDate,desc', 2, 50, undefined);
    expect(result.items[0].status).toBe('UNKNOWN');
  });

  it('getJournalEntry(id) and getTraceability(id) pass the id; traceability drops the entry itself from related', async () => {
    journal.getJournalEntry.mockReturnValue(of(postedEntry));
    journal.getJournalEntryTraceability.mockReturnValue(of(traceability));

    const entry = await firstValueFrom(service.getJournalEntry('je-131'));
    const trace = await firstValueFrom(service.getTraceability('je-131'));

    expect(journal.getJournalEntry).toHaveBeenCalledWith('je-131');
    expect(journal.getJournalEntryTraceability).toHaveBeenCalledWith('je-131');
    expect(entry.entryNumber).toBe('JE-202610-131');
    const expected: Pick<JournalEntryTraceability, 'original'> & { reversal: string | null; related: string[] } = {
      original: null,
      reversal: 'JE-202610-140',
      related: ['JE-202610-132'],
    };
    expect({
      original: trace.original,
      reversal: trace.reversal?.entryNumber ?? null,
      related: trace.related.map(related => related.entryNumber ?? ''),
    }).toEqual(expected);
  });

  it('reverseJournalEntry(id, reason) sends the reason only, omitting reversalDate and the override', async () => {
    const reversal: JournalEntryResponse = { journalEntryId: 'je-140', entryNumber: 'JE-202610-140', reversalJournalEntryId: 'je-131' };
    journal.reverseJournalEntry.mockReturnValue(of(reversal));

    const result: JournalEntry = await firstValueFrom(service.reverseJournalEntry('je-131', 'Recorded twice'));

    expect(journal.reverseJournalEntry).toHaveBeenCalledWith('je-131', { reason: 'Recorded twice' });
    expect(result.entryNumber).toBe('JE-202610-140');
  });

  it('reverseJournalEntry(id, reason, justification) adds overrideJustification for a closed month', async () => {
    journal.reverseJournalEntry.mockReturnValue(of({ journalEntryId: 'je-140' }));

    await firstValueFrom(service.reverseJournalEntry('je-131', 'Recorded twice', 'Belongs to September'));

    expect(journal.reverseJournalEntry).toHaveBeenCalledWith('je-131', {
      reason: 'Recorded twice',
      overrideJustification: 'Belongs to September',
    });
  });

  it('listGlAccounts() reads page 0, then every further page the served totalPages names', async () => {
    accounts.listGLAccounts.mockImplementation((_sort: string, page: number) => of(accountsPage(page, 2, String(1000 + page))));

    const result = await firstValueFrom(service.listGlAccounts());

    expect(accounts.listGLAccounts).toHaveBeenNthCalledWith(1, 'accountCode,asc', 0, 200);
    expect(accounts.listGLAccounts).toHaveBeenNthCalledWith(2, 'accountCode,asc', 1, 200);
    const expected: GlAccountOption[] = [
      { glAccountId: 'gl-1000', accountCode: '1000', accountName: 'Account 1000' },
      { glAccountId: 'gl-1001', accountCode: '1001', accountName: 'Account 1001' },
    ];
    expect(result).toEqual(expected);
  });

  it('listGlAccounts() bounds the pages it reads', async () => {
    accounts.listGLAccounts.mockImplementation((_sort: string, page: number) => of(accountsPage(page, 500, String(page))));

    await firstValueFrom(service.listGlAccounts());

    expect(accounts.listGLAccounts).toHaveBeenCalledTimes(10);
  });

  it('requestExport sends the report, format and dates only — no tenant or organization identifier', async () => {
    reporting.requestReportExport.mockReturnValue(of(exportResponse(ReportExportResponseStatusEnum.Pending)));

    const result = await firstValueFrom(service.requestExport('BALANCE_SHEET', 'PDF', '2026-10-01', '2026-10-06'));

    expect(reporting.requestReportExport).toHaveBeenCalledWith({
      reportType: 'BALANCE_SHEET',
      format: 'PDF',
      startDate: '2026-10-01',
      endDate: '2026-10-06',
    });
    const body = reporting.requestReportExport.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(body).some(key => /organization|tenant/i.test(key))).toBe(false);
    const expected: ExportJob = { exportId: 'exp-1', status: 'PENDING' };
    expect(result).toEqual(expected);
  });

  it('exportStatus(id) passes the id and maps the served status', async () => {
    reporting.getReportExportStatus.mockReturnValue(of(exportResponse(ReportExportResponseStatusEnum.Completed)));

    const result = await firstValueFrom(service.exportStatus('exp-1'));

    expect(reporting.getReportExportStatus).toHaveBeenCalledWith('exp-1');
    expect(result).toEqual({ exportId: 'exp-1', status: 'COMPLETED' });
  });

  it('downloadExport(id, filename) delegates to AccountingService.downloadExport with the filename', async () => {
    accounting.downloadExport.mockReturnValue(of(undefined));

    await firstValueFrom(service.downloadExport('exp-1', 'books-balance-sheet-2026-10-01-2026-10-06.pdf'));

    expect(accounting.downloadExport).toHaveBeenCalledWith('exp-1', 'books-balance-sheet-2026-10-01-2026-10-06.pdf');
  });

  it('toBooksFailure keeps the status and code, never the served message', () => {
    const failure = toBooksFailure(
      new HttpErrorResponse({ status: 422, error: { code: 'PERIOD_CLOSED', message: 'Period 2026-09 for tenant t-1 is closed' } }),
    );

    expect(failure).toEqual({ status: 422, code: 'PERIOD_CLOSED' });
    expect(toBooksFailure(new Error('boom'))).toEqual({ status: 0, code: null });
  });
});
