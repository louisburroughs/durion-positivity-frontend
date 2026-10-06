import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Observable, Subject, of } from 'rxjs';
import { vi } from 'vitest';
import { JwtClaims } from '../../../../core/models/auth.models';
import { AuthService } from '../../../../core/services/auth.service';
import {
  BankCheckupRow,
  CheckupAwaitingApproval,
  PayablesLane,
  PaymentToMatch,
  PaymentsToMatchPage,
  ReceivablesLane,
  TodoSourcePage,
  UnexplainedBankLine,
} from '../../models/accounting-home.models';
import { ReconciliationReview } from '../../models/bank-reconciliation.models';
import { AccountingPeriod } from '../../models/period-close.models';
import { AccountingHomeService } from '../../services/accounting-home.service';
import { PeriodCloseService } from '../../services/period-close.service';
import { ReconciliationWorkspaceService } from '../../services/reconciliation-workspace.service';
import { toIsoDate } from '../../utils/date-window.util';
import { ACCOUNTING_HOME_CLOCK } from './accounting-home-page.component';

/**
 * Shared fixtures for the accounting home specs. "Today" is the injected
 * clock; every date fixture is derived from it, never a literal that expires
 * (ADR-0038 §7).
 */
export const NOW = new Date(2026, 9, 6, 10, 30);
export const TODAY_ISO = toIsoDate(NOW);
const monthStart = new Date(NOW.getFullYear(), NOW.getMonth(), 1);
const monthEnd = new Date(NOW.getFullYear(), NOW.getMonth() + 1, 0);
const previousMonthEnd = new Date(NOW.getFullYear(), NOW.getMonth(), 0);
const previousMonthStart = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 1);

export const ALL_HOME_PERMISSIONS = [
  'accounting:period:view',
  'reporting:view:financial-statements',
  'accounting:reconciliation:view',
  'accounting:reconciliation:adjust',
  'accounting:reconciliation:approve',
  'accounting:payment:apply',
];

export const currentPeriod: AccountingPeriod = {
  periodCode: `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`,
  startDate: toIsoDate(monthStart),
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
  periodCode: `${previousMonthStart.getFullYear()}-${String(previousMonthStart.getMonth() + 1).padStart(2, '0')}`,
  startDate: toIsoDate(previousMonthStart),
  endDate: toIsoDate(previousMonthEnd),
  status: 'CLOSED',
};

export const receivablesLane: ReceivablesLane = {
  asOfDate: TODAY_ISO,
  generatedAt: NOW.toISOString(),
  totalOutstanding: 18240.5,
  overdue: 7240.25,
  notYetDue: 11000.25,
  days1To30: 4100,
};

export const payablesLane: PayablesLane = {
  asOfDate: TODAY_ISO,
  generatedAt: NOW.toISOString(),
  approvedTotal: 9300,
  overdue: 3000,
  notYetDue: 6300,
  unapproved: 1250,
  unapprovedBillCount: 2,
};

export const submittedRow: BankCheckupRow = {
  glAccountId: 'gl-1010',
  accountCode: '1010',
  accountName: 'Operating Checking',
  bankName: 'First Bank',
  accountMask: '4821',
  currency: 'USD',
  statementEndDate: toIsoDate(previousMonthEnd),
  statementClosingBalance: 25400,
  reconciledThrough: toIsoDate(previousMonthStart),
  unexplainedCount: 3,
  status: 'SUBMITTED',
  reconciliationId: 'rec-9',
};

export const payment = (overrides: Partial<PaymentToMatch> = {}): PaymentToMatch => ({
  paymentId: 'pay-1',
  customerName: 'Harbor Fleet Services',
  customerReference: 'C-1042',
  sourceInvoiceNumber: 'INV-2026-01702',
  method: 'CARD',
  receivedAt: NOW.toISOString(),
  totalAmount: 4615,
  unappliedAmount: 4615,
  currency: 'USD',
  reasons: ['REMITTANCE_REFERENCE', 'EXACT_TOTAL'],
  suggestedInvoices: [{ invoiceNumber: 'INV-2026-01702', balanceDue: 4615, suggestedAmount: 4615 }],
  suggestedTotal: 4615,
  leftOver: 0,
  ...overrides,
});

export const bankLine = (overrides: Partial<UnexplainedBankLine> = {}): UnexplainedBankLine => ({
  bankTransactionId: 'bt-1',
  glAccountId: 'gl-1010',
  accountCode: '1010',
  accountName: 'Operating Checking',
  transactionDate: TODAY_ISO,
  signedAmount: -18.5,
  currency: 'USD',
  description: '<img src=x onerror=alert(1)> MONTHLY FEE',
  reference: 'FEE-0925',
  ...overrides,
});

export const awaitingApproval = (overrides: Partial<CheckupAwaitingApproval> = {}): CheckupAwaitingApproval => ({
  reconciliationId: 'rec-9',
  glAccountId: 'gl-1010',
  accountCode: '1010',
  accountName: 'Operating Checking',
  periodCode: previousPeriod.periodCode,
  statementStartDate: toIsoDate(previousMonthStart),
  statementEndDate: toIsoDate(previousMonthEnd),
  statementClosingBalance: 25400,
  currency: 'USD',
  submittedBy: 'clerk.jones',
  submittedAt: NOW.toISOString(),
  ...overrides,
});

export const paymentsPage = (items: PaymentToMatch[], totalElements = items.length): PaymentsToMatchPage => ({
  items,
  totalElements,
  waitingCount: totalElements,
});

export const page = <T>(items: T[], totalElements = items.length): TodoSourcePage<T> => ({ items, totalElements });

export const review = (canApprove: boolean, reasons: string[] = []): ReconciliationReview => ({
  header: {
    reconciliationId: 'rec-9',
    glAccountId: 'gl-1010',
    accountCode: '1010',
    accountName: 'Operating Checking',
    status: 'SUBMITTED',
    statementId: 'st-9',
    statementStartDate: toIsoDate(previousMonthStart),
    statementEndDate: toIsoDate(previousMonthEnd),
    accountingPeriodCode: previousPeriod.periodCode,
    periodState: 'OPEN',
    baselineDate: null,
    baselineSetByThisStatement: false,
    gapAcknowledgement: null,
    preparer: 'clerk.jones',
    approver: null,
    currency: 'USD',
    sourceKind: 'FILE_IMPORT',
    version: 7,
  },
  equation: {
    statementClosingBalance: 25400,
    sumOutstandingLedgerItems: 0,
    sumOutstandingBankItems: 0,
    adjustedBankBalance: 25400,
    glEndingBalance: 25400,
    sumLateAdjustments: 0,
    adjustedBookBalance: 25400,
    difference: 0,
    outstandingLedgerItems: [],
    outstandingBankItems: [],
    lateAdjustments: [],
  },
  diagnostics: {
    openingDifference: 0,
    statementOpeningBalance: 21000,
    glOpeningBalance: 21000,
    openingLedgerItems: 0,
    openingBankItems: 0,
    sumOpeningAdjustments: 0,
    flags: [],
    likelyCause: null,
    bridgeAdjustmentId: null,
  },
  readiness: {
    canSubmit: false,
    canApprove,
    proposalsPending: false,
    reasons,
    countUnexplainedBank: 0,
    countUnexplainedLedger: 0,
    sumUnexplainedBank: 0,
    sumUnexplainedLedger: 0,
  },
  unexplainedBank: [],
  unexplainedLedger: [],
  lateArrivals: [],
  possibleDuplicates: [],
  proposedMatches: [],
  brokenMatches: [],
  agedItemsAwaitingReaffirmation: [],
  matches: [],
  outstandingItems: [],
  exclusions: [],
  adjustmentsToClearing: [],
  adjustments: [],
});

/** The home's collaborators, each read returning whatever the test sets. */
export interface HomeMocks {
  readonly held: WritableSignal<readonly string[] | null>;
  readonly claims: WritableSignal<JwtClaims | null>;
  readonly home: {
    receivables: ReturnType<typeof vi.fn<(asOfDate: string) => Observable<ReceivablesLane>>>;
    payables: ReturnType<typeof vi.fn<(asOfDate: string) => Observable<PayablesLane>>>;
    bankCheckup: ReturnType<typeof vi.fn<(periodCode: string) => Observable<BankCheckupRow[]>>>;
    paymentsToMatch: ReturnType<typeof vi.fn<(size: number) => Observable<PaymentsToMatchPage>>>;
    unexplainedBankLines: ReturnType<typeof vi.fn<(size: number) => Observable<TodoSourcePage<UnexplainedBankLine>>>>;
    checkupsAwaitingApproval: ReturnType<
      typeof vi.fn<(size: number) => Observable<TodoSourcePage<CheckupAwaitingApproval>>>
    >;
  };
  readonly periods: { listPeriods: ReturnType<typeof vi.fn<() => Observable<AccountingPeriod[]>>> };
  readonly workspace: {
    getReview: ReturnType<typeof vi.fn<(id: string) => Observable<ReconciliationReview>>>;
    approve: ReturnType<typeof vi.fn<(id: string, version: number) => Observable<'FINALIZED' | null>>>;
  };
}

/** Every read answers at once with a full, non-empty home; tests override per case. */
export function createHomeMocks(held: readonly string[] | null = ALL_HOME_PERMISSIONS): HomeMocks {
  return {
    held: signal(held),
    // Specs that persist preferences set the claims themselves.
    claims: signal<JwtClaims | null>(null),
    home: {
      receivables: vi.fn(() => of(receivablesLane)),
      payables: vi.fn(() => of(payablesLane)),
      bankCheckup: vi.fn(() => of([submittedRow])),
      paymentsToMatch: vi.fn(() => of(paymentsPage([payment()]))),
      unexplainedBankLines: vi.fn(() => of(page([bankLine()]))),
      checkupsAwaitingApproval: vi.fn(() => of(page([awaitingApproval()]))),
    },
    periods: { listPeriods: vi.fn(() => of([currentPeriod, previousPeriod])) },
    workspace: {
      getReview: vi.fn(() => of(review(true))),
      approve: vi.fn(() => of<'FINALIZED' | null>('FINALIZED')),
    },
  };
}

/**
 * `authExtras` carries the AuthService members a spec adds on top, the tenant
 * signal among them: the tenant id stays in the spec files, out of app-tree
 * sources (arch rule TEN-02).
 */
export function configureHome(mocks: HomeMocks, authExtras: Partial<AuthService>): void {
  const auth: Partial<AuthService> = {
    ...authExtras,
    currentUserClaims: mocks.claims,
    permissionsKnown: (() => mocks.held() !== null) as AuthService['permissionsKnown'],
    hasAnyRole: () => false,
    hasPermission: (code: string) => !!mocks.held()?.includes(code),
    hasAnyPermission: (codes: readonly string[]) => {
      const held = mocks.held();
      return !!held && codes.some(code => held.includes(code));
    },
  };
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: AccountingHomeService, useValue: mocks.home },
      { provide: PeriodCloseService, useValue: mocks.periods },
      { provide: ReconciliationWorkspaceService, useValue: mocks.workspace },
      { provide: ACCOUNTING_HOME_CLOCK, useValue: () => new Date(NOW.getTime()) },
    ],
  });
}

/** A read the test resolves by hand (ADR-0063 §8: ordering tests drive a Subject, never `of`). */
export function pending<T>(): Subject<T> {
  return new Subject<T>();
}
