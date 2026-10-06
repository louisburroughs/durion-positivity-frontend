import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AgedPayablesReport,
  AgedReceivablesReport,
  BankReconciliationListResponse,
  BankReconciliationResponse,
  BankReconciliationResponseStatusEnum,
  BankReconciliationService as BankReconciliationSdk,
  BankTransactionListResponse,
  BankTransactionsService as BankTransactionsSdk,
  FinancialReportingService as FinancialReportingSdk,
  PaymentApplicationsService as PaymentApplicationsSdk,
  UnappliedPaymentsPage,
} from '@durion-sdk/accounting';
import {
  BankCheckupRow,
  CheckupAwaitingApproval,
  PayablesLane,
  PaymentsToMatchPage,
  ReceivablesLane,
  TodoSourcePage,
  UnexplainedBankLine,
} from '../models/accounting-home.models';
import { BankAccount, BankStatement } from '../models/bank-reconciliation.models';
import { AccountingHomeService } from './accounting-home.service';
import { BankReconciliationService } from './bank-reconciliation.service';

const receivablesReport: AgedReceivablesReport = {
  asOfDate: '2026-10-06',
  generatedAt: '2026-10-06T14:05:00Z',
  rows: [],
  totals: {
    totalOutstanding: 18240.5,
    notYetDue: 11000.25,
    overdue: 7240.25,
    days1To30: 4100,
    days31To60: 2000,
    days61To90: 1140.25,
    days90Plus: 0,
  },
};

const payablesReport: AgedPayablesReport = {
  asOfDate: '2026-10-06',
  generatedAt: '2026-10-06T14:05:01Z',
  rows: [],
  totals: {
    totalOutstanding: 9300,
    notYetDue: 6300,
    overdue: 3000,
    days1To30: 3000,
    days31To60: 0,
    days61To90: 0,
    days90Plus: 0,
  },
  unapproved: 1250,
  unapprovedBillCount: 2,
  totalIncludingUnapproved: 10550,
};

const unappliedPage: UnappliedPaymentsPage = {
  items: [
    {
      paymentId: 'pay-1',
      customerId: 'cust-1',
      customerDisplayName: 'Harbor Fleet Services',
      customerReference: 'C-1042',
      paymentMethod: 'CARD',
      receivedAt: '2026-10-05T16:20:00Z',
      sourceInvoiceId: 'inv-9',
      sourceInvoiceNumber: 'INV-2026-01702',
      totalAmount: 4615,
      unappliedAmount: 4615,
      currency: 'USD',
      suggestion: {
        invoices: [{ invoiceId: 'inv-9', invoiceNumber: 'INV-2026-01702', balanceDue: 4615, suggestedAmount: 4615 }],
        reasons: ['REMITTANCE_REFERENCE', 'EXACT_TOTAL'],
        suggestedTotal: 4615,
        leftOver: 0,
      },
    },
    {
      paymentId: 'pay-2',
      customerId: 'cust-cash',
      customerDisplayName: null,
      paymentMethod: null,
      receivedAt: '2026-10-05T17:00:00Z',
      totalAmount: 80,
      unappliedAmount: 80,
      currency: 'USD',
      // Walk-in (CASH) payments are served without a left-over credit.
      suggestion: { invoices: [], reasons: [], suggestedTotal: 0, leftOver: null as unknown as number },
    },
  ],
  page: 0,
  size: 25,
  totalElements: 31,
  totalPages: 2,
  summary: { asOf: '2026-10-06T14:00:00Z', count: 31, currency: 'USD', totalUnappliedAmount: 52000 },
};

const transactions: BankTransactionListResponse = {
  pageNumber: 0,
  pageSize: 25,
  totalElements: 1,
  totalPages: 1,
  transactions: [
    {
      bankTransactionId: 'bt-1',
      glAccountId: 'gl-1010',
      accountCode: '1010',
      accountName: 'Operating Checking',
      transactionDate: '2026-10-02',
      signedAmount: -18.5,
      currency: 'USD',
      description: 'MONTHLY FEE',
      originalDescription: 'MONTHLY SERVICE FEE <b>',
      checkNumber: '1042',
    },
  ],
};

const submitted: BankReconciliationResponse = {
  reconciliationId: 'rec-9',
  glAccountId: 'gl-1010',
  accountCode: '1010',
  accountName: 'Operating Checking',
  accountingPeriodCode: '2026-09',
  statementStartDate: '2026-09-01',
  statementEndDate: '2026-09-30',
  statementClosingBalance: 25400,
  currency: 'USD',
  status: BankReconciliationResponseStatusEnum.Submitted,
  submittedBy: 'clerk.jones',
  submittedAt: '2026-10-01T09:00:00Z',
  createdAt: '2026-10-01T08:00:00Z',
  version: 4,
};

const account = (overrides: Partial<BankAccount> = {}): BankAccount => ({
  glAccountId: 'gl-1010',
  accountCode: '1010',
  accountName: 'Operating Checking',
  bankName: 'First Bank',
  accountMask: '4821',
  currency: 'USD',
  reconciliationBaselineDate: '2026-05-01',
  coverageFrontier: '2026-09-30',
  reconciledFrontier: '2026-08-31',
  unexplainedBankTransactionCount: 3,
  openOutstandingItemCount: 1,
  profileExists: true,
  ...overrides,
});

const statement = (overrides: Partial<BankStatement> = {}): BankStatement => ({
  statementId: 'st-9',
  glAccountId: 'gl-1010',
  statementRef: 'SEP',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  openingBalance: 21000,
  closingBalance: 25400,
  currency: 'USD',
  status: 'COMMITTED',
  sourceKind: 'FILE_IMPORT',
  gapAcknowledgement: null,
  reconciliations: [],
  ...overrides,
});

describe('AccountingHomeService', () => {
  let service: AccountingHomeService;
  const reporting = { generateAgedReceivables: vi.fn(), generateAgedPayables: vi.fn() };
  const payments = { listUnappliedPayments: vi.fn() };
  const reconciliations = { listReconciliations: vi.fn() };
  const bankTransactions = { listBankTransactions: vi.fn() };
  const bankReconciliation = { listBankAccounts: vi.fn(), listStatements: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: FinancialReportingSdk, useValue: reporting },
        { provide: PaymentApplicationsSdk, useValue: payments },
        { provide: BankReconciliationSdk, useValue: reconciliations },
        { provide: BankTransactionsSdk, useValue: bankTransactions },
        { provide: BankReconciliationService, useValue: bankReconciliation },
      ],
    });
    service = TestBed.inject(AccountingHomeService);
  });

  it('reads aged receivables for the as-of date and passes the served totals through', () => {
    reporting.generateAgedReceivables.mockReturnValue(of(receivablesReport));
    let lane: ReceivablesLane | undefined;

    service.receivables('2026-10-06').subscribe(value => (lane = value));

    expect(reporting.generateAgedReceivables).toHaveBeenCalledTimes(1);
    expect(reporting.generateAgedReceivables).toHaveBeenCalledWith('2026-10-06');
    expect(lane).toEqual<ReceivablesLane>({
      asOfDate: '2026-10-06',
      generatedAt: '2026-10-06T14:05:00Z',
      totalOutstanding: 18240.5,
      overdue: 7240.25,
      notYetDue: 11000.25,
      days1To30: 4100,
    });
  });

  it('reads aged payables: approved totals plus the unapproved total, never summed', () => {
    reporting.generateAgedPayables.mockReturnValue(of(payablesReport));
    let lane: PayablesLane | undefined;

    service.payables('2026-10-06').subscribe(value => (lane = value));

    expect(reporting.generateAgedPayables).toHaveBeenCalledWith('2026-10-06');
    expect(lane).toEqual<PayablesLane>({
      asOfDate: '2026-10-06',
      generatedAt: '2026-10-06T14:05:01Z',
      approvedTotal: 9300,
      overdue: 3000,
      notYetDue: 6300,
      unapproved: 1250,
      unapprovedBillCount: 2,
    });
  });

  it('lists unapplied payments with status AVAILABLE, page 0 and the page size', () => {
    payments.listUnappliedPayments.mockReturnValue(of(unappliedPage));
    let page: PaymentsToMatchPage | undefined;

    service.paymentsToMatch(25).subscribe(value => (page = value));

    expect(payments.listUnappliedPayments).toHaveBeenCalledWith('AVAILABLE', undefined, 0, 25);
    expect(page?.totalElements).toBe(31);
    expect(page?.waitingCount).toBe(31);
    expect(page?.items[0]).toEqual({
      paymentId: 'pay-1',
      customerName: 'Harbor Fleet Services',
      customerReference: 'C-1042',
      sourceInvoiceNumber: 'INV-2026-01702',
      method: 'CARD',
      receivedAt: '2026-10-05T16:20:00Z',
      totalAmount: 4615,
      unappliedAmount: 4615,
      currency: 'USD',
      reasons: ['REMITTANCE_REFERENCE', 'EXACT_TOTAL'],
      suggestedInvoices: [{ invoiceNumber: 'INV-2026-01702', balanceDue: 4615, suggestedAmount: 4615 }],
      suggestedTotal: 4615,
      leftOver: 0,
    });
    expect(page?.items[1].customerName).toBeNull();
    expect(page?.items[1].leftOver).toBeNull();
  });

  it('lists unexplained bank lines: UNMATCHED, unexplainedOnly, page 0 and the page size', () => {
    bankTransactions.listBankTransactions.mockReturnValue(of(transactions));
    let page: TodoSourcePage<UnexplainedBankLine> | undefined;

    service.unexplainedBankLines(25).subscribe(value => (page = value));

    expect(bankTransactions.listBankTransactions).toHaveBeenCalledWith(
      undefined,
      'UNMATCHED',
      undefined,
      undefined,
      undefined,
      true,
      0,
      25,
    );
    expect(page).toEqual<TodoSourcePage<UnexplainedBankLine>>({
      totalElements: 1,
      items: [
        {
          bankTransactionId: 'bt-1',
          glAccountId: 'gl-1010',
          accountCode: '1010',
          accountName: 'Operating Checking',
          transactionDate: '2026-10-02',
          signedAmount: -18.5,
          currency: 'USD',
          description: 'MONTHLY SERVICE FEE <b>',
          reference: '1042',
        },
      ],
    });
  });

  it('lists submitted reconciliations and hides an opaque submitter id', () => {
    const response: BankReconciliationListResponse = {
      pageNumber: 0,
      pageSize: 25,
      totalElements: 2,
      totalPages: 1,
      reconciliations: [submitted, { ...submitted, reconciliationId: 'rec-10', submittedBy: '0192f1d6-6f7a-7c3e-9a51-2b7c1d9e4f00' }],
    };
    reconciliations.listReconciliations.mockReturnValue(of(response));
    let page: TodoSourcePage<CheckupAwaitingApproval> | undefined;

    service.checkupsAwaitingApproval(25).subscribe(value => (page = value));

    expect(reconciliations.listReconciliations).toHaveBeenCalledWith(
      undefined,
      'SUBMITTED',
      undefined,
      undefined,
      undefined,
      0,
      25,
    );
    expect(page?.items[0]).toEqual<CheckupAwaitingApproval>({
      reconciliationId: 'rec-9',
      glAccountId: 'gl-1010',
      accountCode: '1010',
      accountName: 'Operating Checking',
      periodCode: '2026-09',
      statementStartDate: '2026-09-01',
      statementEndDate: '2026-09-30',
      statementClosingBalance: 25400,
      currency: 'USD',
      submittedBy: 'clerk.jones',
      submittedAt: '2026-10-01T09:00:00Z',
    });
    expect(page?.items[1].submittedBy).toBeNull();
  });

  describe('bankCheckup', () => {
    const periodRows = (rows: BankReconciliationResponse[]): BankReconciliationListResponse => ({
      pageNumber: 0,
      pageSize: 200,
      totalElements: rows.length,
      totalPages: 1,
      reconciliations: rows,
    });

    it('reads accounts, the month’s reconciliations and each account’s statements', () => {
      bankReconciliation.listBankAccounts.mockReturnValue(of([account()]));
      bankReconciliation.listStatements.mockReturnValue(
        of([statement({ statementId: 'st-new', status: 'SUPERSEDED', endDate: '2026-10-31' }), statement()]),
      );
      reconciliations.listReconciliations.mockReturnValue(of(periodRows([submitted])));
      let rows: BankCheckupRow[] | undefined;

      service.bankCheckup('2026-10').subscribe(value => (rows = value));

      expect(reconciliations.listReconciliations).toHaveBeenCalledWith(
        undefined,
        undefined,
        '2026-10',
        undefined,
        undefined,
        0,
        200,
      );
      expect(bankReconciliation.listStatements).toHaveBeenCalledWith('gl-1010');
      expect(rows).toEqual<BankCheckupRow[]>([
        {
          glAccountId: 'gl-1010',
          accountCode: '1010',
          accountName: 'Operating Checking',
          bankName: 'First Bank',
          accountMask: '4821',
          currency: 'USD',
          statementEndDate: '2026-09-30',
          statementClosingBalance: 25400,
          reconciledThrough: '2026-08-31',
          unexplainedCount: 3,
          status: 'SUBMITTED',
          reconciliationId: 'rec-9',
        },
      ]);
    });

    it('reads "Not started" without a reconciliation and "Unknown" for any other status', () => {
      bankReconciliation.listBankAccounts.mockReturnValue(
        of([account(), account({ glAccountId: 'gl-1020', accountCode: '1020' })]),
      );
      bankReconciliation.listStatements.mockReturnValue(of([]));
      reconciliations.listReconciliations.mockReturnValue(
        of(
          periodRows([
            { ...submitted, glAccountId: 'gl-1020', status: BankReconciliationResponseStatusEnum.Cancelled },
          ]),
        ),
      );
      let rows: BankCheckupRow[] | undefined;

      service.bankCheckup('2026-10').subscribe(value => (rows = value));

      expect(rows?.map(row => row.status)).toEqual(['NOT_STARTED', 'UNKNOWN']);
      expect(rows?.[0].statementEndDate).toBeNull();
    });

    it('takes the most recently created reconciliation of the month', () => {
      bankReconciliation.listBankAccounts.mockReturnValue(of([account()]));
      bankReconciliation.listStatements.mockReturnValue(of([statement()]));
      reconciliations.listReconciliations.mockReturnValue(
        of(
          periodRows([
            { ...submitted, reconciliationId: 'old', status: BankReconciliationResponseStatusEnum.Cancelled, createdAt: '2026-10-01T00:00:00Z' },
            { ...submitted, reconciliationId: 'new', status: BankReconciliationResponseStatusEnum.InProgress, createdAt: '2026-10-03T00:00:00Z' },
          ]),
        ),
      );
      let rows: BankCheckupRow[] | undefined;

      service.bankCheckup('2026-10').subscribe(value => (rows = value));

      expect(rows?.[0].status).toBe('IN_PROGRESS');
      expect(rows?.[0].reconciliationId).toBe('new');
    });

    it('reads every page of the month’s reconciliations, so a later page’s status is not lost', () => {
      bankReconciliation.listBankAccounts.mockReturnValue(of([account()]));
      bankReconciliation.listStatements.mockReturnValue(of([statement()]));
      const first = { ...periodRows([{ ...submitted, glAccountId: 'gl-other' }]), totalPages: 2 };
      const second = { ...periodRows([submitted]), pageNumber: 1, totalPages: 2 };
      reconciliations.listReconciliations.mockImplementation(
        (_gl: unknown, _status: unknown, _period: unknown, _from: unknown, _to: unknown, page: number) =>
          of(page === 0 ? first : second),
      );
      let rows: BankCheckupRow[] | undefined;

      service.bankCheckup('2026-10').subscribe(value => (rows = value));

      expect(reconciliations.listReconciliations).toHaveBeenCalledTimes(2);
      expect(reconciliations.listReconciliations).toHaveBeenNthCalledWith(2, undefined, undefined, '2026-10', undefined, undefined, 1, 200);
      expect(rows?.[0].status).toBe('SUBMITTED');
    });

    it('stops at a bounded number of pages', () => {
      bankReconciliation.listBankAccounts.mockReturnValue(of([account()]));
      bankReconciliation.listStatements.mockReturnValue(of([statement()]));
      reconciliations.listReconciliations.mockReturnValue(of({ ...periodRows([]), totalPages: 10_000 }));

      service.bankCheckup('2026-10').subscribe();

      expect(reconciliations.listReconciliations.mock.calls.length).toBeLessThanOrEqual(20);
    });

    it('takes only a COMMITTED statement as the latest, never one with an unknown status', () => {
      bankReconciliation.listBankAccounts.mockReturnValue(of([account()]));
      bankReconciliation.listStatements.mockReturnValue(
        of([statement({ statementId: 'st-odd', status: null, endDate: '2026-10-31', closingBalance: 1 }), statement()]),
      );
      reconciliations.listReconciliations.mockReturnValue(of(periodRows([])));
      let rows: BankCheckupRow[] | undefined;

      service.bankCheckup('2026-10').subscribe(value => (rows = value));

      expect(rows?.[0].statementEndDate).toBe('2026-09-30');
      expect(rows?.[0].statementClosingBalance).toBe(25400);
    });

    it('answers no rows without reading statements when there is no bank account', () => {
      bankReconciliation.listBankAccounts.mockReturnValue(of([]));
      reconciliations.listReconciliations.mockReturnValue(of(periodRows([])));
      let rows: BankCheckupRow[] | undefined;

      service.bankCheckup('2026-10').subscribe(value => (rows = value));

      expect(rows).toEqual([]);
      expect(bankReconciliation.listStatements).not.toHaveBeenCalled();
    });
  });
});
