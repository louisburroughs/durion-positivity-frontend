import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AdjustmentInput,
  BankAccount,
  ReconciliationMatch,
  ReconciliationReview,
  ReviewBankRow,
} from '../../models/bank-reconciliation.models';
import { AdjustmentPreset, ReconciliationAdjustmentDialogComponent } from './reconciliation-adjustment-dialog.component';

const match = (overrides: Partial<ReconciliationMatch> = {}): ReconciliationMatch => ({
  matchId: 'm-1',
  state: 'ACCEPTED',
  matchKind: 'ONE_TO_ONE',
  origin: 'USER',
  bankTransactionIds: ['bt-1'],
  glLineIds: ['gl-a'],
  bankTotal: 100,
  ledgerTotal: 100.02,
  toleranceUsed: 0.02,
  residual: -0.02,
  replacesMatchId: null,
  reasons: [],
  justification: null,
  confidenceScore: 95,
  ...overrides,
});

/** Deliberately inconsistent terms: the panel must print them, never recompute them. */
const review = (overrides: Partial<ReconciliationReview> = {}): ReconciliationReview => ({
  header: {
    reconciliationId: 'rec-1',
    glAccountId: 'gl-1010',
    accountCode: '1010',
    accountName: 'Operating Checking',
    status: 'IN_PROGRESS',
    statementId: 'st-9',
    statementStartDate: '2026-09-01',
    statementEndDate: '2026-09-30',
    accountingPeriodCode: '2026-09',
    periodState: 'OPEN',
    baselineDate: '2026-09-01',
    baselineSetByThisStatement: true,
    gapAcknowledgement: 'First statement for this account',
    preparer: 'preparer',
    approver: null,
    currency: 'USD',
    sourceKind: 'FILE_IMPORT',
    version: 7,
  },
  equation: {
    statementClosingBalance: 1200,
    sumOutstandingLedgerItems: -50,
    sumOutstandingBankItems: 7,
    adjustedBankBalance: 1111,
    glEndingBalance: 1222,
    sumLateAdjustments: 3,
    adjustedBookBalance: 1333,
    difference: 4444,
    outstandingLedgerItems: [],
    outstandingBankItems: [],
    lateAdjustments: [{ adjustmentId: 'adj-late', reconciliationId: 'rec-0', amount: 3, date: '2026-10-02', reversal: false }],
  },
  diagnostics: {
    openingDifference: -45.67,
    statementOpeningBalance: 12300,
    glOpeningBalance: 12345.67,
    openingLedgerItems: 0,
    openingBankItems: 0,
    sumOpeningAdjustments: 0,
    flags: ['OPENING_DIFFERENCE'],
    likelyCause: null,
    bridgeAdjustmentId: null,
  },
  readiness: {
    canSubmit: true,
    canApprove: false,
    proposalsPending: true,
    reasons: ['SELF_APPROVAL', 'PROPOSALS_PENDING'],
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
  matches: [match(), match({ matchId: 'm-2', toleranceUsed: 0, residual: 0 }), match({ matchId: 'm-3', state: 'PROPOSED' })],
  outstandingItems: [],
  exclusions: [],
  adjustmentsToClearing: [],
  adjustments: [],
  ...overrides,
});

const bankRow: ReviewBankRow = {
  bankTransactionId: 'bt-1',
  transactionDate: '2026-09-03',
  description: 'Returned payment',
  reference: 'R-77',
  checkNumber: '1043',
  signedAmount: -250,
  status: 'UNMATCHED',
  arrivedAfterApproval: false,
  nearDuplicates: [],
};

const account = (glAccountId: string, accountCode: string): BankAccount => ({
  glAccountId,
  accountCode,
  accountName: `Account ${accountCode}`,
  bankName: null,
  accountMask: null,
  currency: 'USD',
  reconciliationBaselineDate: null,
  coverageFrontier: null,
  reconciledFrontier: null,
  unexplainedBankTransactionCount: null,
  openOutstandingItemCount: null,
  profileExists: true,
});

describe('ReconciliationAdjustmentDialogComponent', () => {
  let fixture: ComponentFixture<ReconciliationAdjustmentDialogComponent>;
  let el: HTMLElement;
  let emitted: AdjustmentInput[];

  const setup = (
    options: { review?: ReconciliationReview; preset?: AdjustmentPreset | null; canOverride?: boolean; proposedDate?: string | null } = {},
  ): void => {
    TestBed.configureTestingModule({ imports: [ReconciliationAdjustmentDialogComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(ReconciliationAdjustmentDialogComponent);
    fixture.componentRef.setInput('review', options.review ?? review({ unexplainedBank: [bankRow] }));
    fixture.componentRef.setInput('types', ['BANK_FEE', 'NSF_FEE', 'INTEREST_EARNED', 'OTHER', 'TRANSFER']);
    fixture.componentRef.setInput('bankAccounts', [account('gl-1010', '1010'), account('gl-1020', '1020'), account('gl-1030', '1030')]);
    fixture.componentRef.setInput('preset', options.preset ?? null);
    fixture.componentRef.setInput('canOverride', options.canOverride ?? false);
    fixture.componentRef.setInput('proposedDate', options.proposedDate ?? null);
    emitted = [];
    fixture.componentInstance.submitted.subscribe(value => emitted.push(value));
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };
  const query = (testId: string): HTMLElement | null => el.querySelector(`[data-testid="${testId}"]`);
  const set = (name: keyof ReconciliationAdjustmentDialogComponent['form']['controls'], value: string): void => {
    fixture.componentInstance.form.controls[name].setValue(value as never);
    fixture.detectChanges();
  };
  const confirm = (): HTMLButtonElement => query('confirm-adjustment') as HTMLButtonElement;

  afterEach(() => TestBed.resetTestingModule());

  it('opens as a native modal dialog', () => {
    setup();
    expect((query('adjustment-dialog') as HTMLDialogElement).matches(':modal')).toBe(true);
  });

  it('keeps an OTHER adjustment disabled until it has exactly one link and a justification (AC7)', () => {
    setup();
    set('type', 'OTHER');
    set('amount', '-250');
    expect(confirm().disabled).toBe(true);

    set('link', 'BANK');
    set('bankTransactionId', 'bt-1');
    expect(confirm().disabled).toBe(true);

    set('justification', 'too short');
    expect(confirm().disabled).toBe(true);
    set('justification', 'Returned customer payment, receipt PAY-991');
    expect(confirm().disabled).toBe(false);
  });

  it('takes a linked amount from the bank transaction it explains', () => {
    setup({ preset: { type: 'OTHER', link: 'BANK', bankTransactionId: 'bt-1' } });

    expect(fixture.componentInstance.form.controls.amount.value).toBe('-250');
    set('justification', 'Returned customer payment, receipt PAY-991');
    confirm().click();

    expect(emitted[0]).toMatchObject({ type: 'OTHER', amount: -250, bankTransactionId: 'bt-1', settlesMatchId: null, bridgesStatementId: null });
  });

  it('offers settle residual only on eligible matches, shows the served residual and sends no amount', () => {
    setup({ preset: { type: 'OTHER', link: 'RESIDUAL', settlesMatchId: 'm-1' } });

    const options = Array.from((query('adjustment-match') as HTMLSelectElement).options).map(o => o.value);
    expect(options).toEqual(['', 'm-1']);
    expect(query('served-residual')?.textContent).toContain('SERVED_RESIDUAL');
    expect(query('adjustment-amount')).toBeNull();
    set('justification', 'Bank rounding on the batch deposit');
    confirm().click();

    expect(emitted[0]).toMatchObject({ type: 'OTHER', amount: null, settlesMatchId: 'm-1', bankTransactionId: null });
  });

  it('does not offer settle residual when no accepted match carries a tolerance', () => {
    setup({ review: review({ matches: [match({ toleranceUsed: 0 })] }) });
    set('type', 'OTHER');

    expect(query('link-residual')).toBeNull();
  });

  it('offers the bridge on an acknowledged statement flagged OPENING_DIFFERENCE and sends no amount', () => {
    setup();
    set('type', 'OTHER');
    expect(query('link-bridge')).not.toBeNull();
    set('link', 'BRIDGE');
    expect(query('served-opening-difference')?.textContent).toContain('SERVED_BRIDGE');
    set('justification', 'Bridge the acknowledged gap');
    confirm().click();

    expect(emitted[0]).toMatchObject({ type: 'OTHER', amount: null, bridgesStatementId: 'st-9' });
  });

  it('offers no bridge without a gap acknowledgement, or once a bridge is posted', () => {
    setup({ review: review({ header: { ...review().header, gapAcknowledgement: null } }) });
    set('type', 'OTHER');
    expect(query('link-bridge')).toBeNull();
    TestBed.resetTestingModule();

    setup({ review: review({ diagnostics: { ...review().diagnostics, bridgeAdjustmentId: 'adj-b' } }) });
    set('type', 'OTHER');
    expect(query('link-bridge')).toBeNull();
  });

  it('lists the other bank accounts as TRANSFER counters, never the reconciled one', () => {
    setup();
    set('type', 'TRANSFER');

    const options = Array.from((query('adjustment-counter') as HTMLSelectElement).options).map(o => o.value);
    expect(options).toEqual(['', 'gl-1020', 'gl-1030']);
    set('amount', '500');
    expect(confirm().disabled).toBe(true);
    set('counterGlAccountId', 'gl-1020');
    confirm().click();

    expect(emitted[0]).toMatchObject({ type: 'TRANSFER', amount: 500, counterGlAccountId: 'gl-1020', bankTransactionId: null });
  });

  it('proposes the given date and offers the override only to its holders', () => {
    setup({ proposedDate: '2026-10-01', preset: { type: 'BANK_FEE' } });
    expect((query('adjustment-date') as HTMLInputElement).value).toBe('2026-10-01');
    expect(query('adjustment-override')).toBeNull();
    TestBed.resetTestingModule();

    setup({ canOverride: true, preset: { type: 'BANK_FEE' } });
    expect(query('adjustment-override')).not.toBeNull();
  });

  it('says the transfer accounts could not be read, and offers a retry', () => {
    setup();
    fixture.componentRef.setInput('bankAccounts', []);
    fixture.componentRef.setInput('accountsStatus', 'ERROR');
    let retried = 0;
    fixture.componentInstance.retryAccounts.subscribe(() => retried++);
    set('type', 'TRANSFER');

    expect(query('accounts-error')).not.toBeNull();
    (query('accounts-error')?.querySelector('button') as HTMLButtonElement).click();
    expect(retried).toBe(1);
  });

  it('shows the error the page classified', () => {
    setup();
    fixture.componentRef.setInput('errorKey', 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.GL_ACCOUNT_NOT_ACTIVE');
    fixture.detectChanges();

    expect(query('adjustment-error')?.textContent?.trim()).toBe('ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.GL_ACCOUNT_NOT_ACTIVE');
  });
});
