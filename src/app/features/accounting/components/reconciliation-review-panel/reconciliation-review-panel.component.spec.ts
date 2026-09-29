import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, describe, expect, it } from 'vitest';
import { ReconciliationMatch, ReconciliationReview } from '../../models/bank-reconciliation.models';
import { ReconciliationReviewPanelComponent } from './reconciliation-review-panel.component';

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

describe('ReconciliationReviewPanelComponent', () => {
  let fixture: ComponentFixture<ReconciliationReviewPanelComponent>;
  let el: HTMLElement;

  const setup = (value: ReconciliationReview = review(), inputs: Record<string, unknown> = {}): void => {
    TestBed.configureTestingModule({ imports: [ReconciliationReviewPanelComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(ReconciliationReviewPanelComponent);
    fixture.componentRef.setInput('review', value);
    for (const [name, input] of Object.entries(inputs)) fixture.componentRef.setInput(name, input);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };
  const term = (name: string): string =>
    (el.querySelector(`[data-term="${name}"] dd`)?.textContent ?? '').trim();

  afterEach(() => TestBed.resetTestingModule());

  it('renders every E3 term exactly as served (AC6)', () => {
    setup();

    expect(term('statementClosingBalance')).toBe('$1,200.00');
    expect(term('sumOutstandingLedgerItems')).toBe('-$50.00');
    expect(term('sumOutstandingBankItems')).toBe('$7.00');
    expect(term('adjustedBankBalance')).toBe('$1,111.00');
    expect(term('glEndingBalance')).toBe('$1,222.00');
    expect(term('sumLateAdjustments')).toBe('$3.00');
    expect(term('adjustedBookBalance')).toBe('$1,333.00');
    expect(term('difference')).toBe('$4,444.00');
    expect(el.querySelector('[data-testid="late-adjustment"]')?.textContent).toContain('OWNED_BY_OTHER');
  });

  it('renders the opening difference only in Diagnostics, as information, with the gap cause', () => {
    setup();

    const diagnostics = el.querySelector('[data-testid="diagnostics"]') as HTMLElement;
    expect(diagnostics.querySelector('[data-testid="opening-difference"]')?.textContent?.trim()).toBe('-$45.67');
    expect(el.querySelector('[data-testid="equation"]')?.textContent).not.toContain('-$45.67');
    expect(diagnostics.querySelector('[data-testid="opening-flag"]')?.textContent).toContain('CAUSE_GAP');
    expect(el.querySelector('[data-testid="readiness-reasons"]')?.textContent).not.toContain('OPENING');
  });

  it('names an invalidated predecessor as the likely cause when no gap was acknowledged', () => {
    setup(review({ header: { ...review().header, gapAcknowledgement: null } }));

    expect(el.querySelector('[data-testid="opening-flag"]')?.textContent).toContain('CAUSE_INVALIDATED');
  });

  it('lists the served readiness reasons and shows pending proposals separately', () => {
    setup();

    const reasons = Array.from(el.querySelectorAll('[data-reason]')).map(node => node.getAttribute('data-reason'));
    expect(reasons).toEqual(['SELF_APPROVAL']);
    expect(el.querySelector('[data-testid="proposals-pending"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="can-submit"]')?.textContent).toContain('CAN_SUBMIT');
    expect(el.querySelector('[data-testid="can-approve"]')?.textContent).toContain('CANNOT_APPROVE');
  });

  it('offers settle residual only on an ACCEPTED match whose served tolerance is not zero', () => {
    setup(review(), { canSettleResidual: true, canUnmatch: true });
    const emitted: ReconciliationMatch[] = [];
    fixture.componentInstance.settleResidual.subscribe(value => emitted.push(value));

    const rows = Array.from(el.querySelectorAll('[data-testid="evidence-match"]'));
    expect(rows.map(row => !!row.querySelector('[data-testid="settle-residual"]'))).toEqual([true, false, false]);
    expect(rows[0].querySelector('[data-testid="match-residual"]')?.textContent?.trim()).toBe('-$0.02');

    (rows[0].querySelector('[data-testid="settle-residual"]') as HTMLButtonElement).click();
    expect(emitted.map(m => m.matchId)).toEqual(['m-1']);
  });

  it('disables the actions it was not given permission for', () => {
    setup(review({ adjustments: [{ adjustmentId: 'adj-1', type: 'BANK_FEE', status: 'POSTED', amount: -5, transactionDate: '2026-09-30', description: null, justification: null, entryNumber: null, bankTransactionId: null, settlesMatchId: null, bridgesStatementId: null, counterGlAccountId: null, createdBy: null }] }));

    expect((el.querySelector('[data-testid="unmatch"]') as HTMLButtonElement).disabled).toBe(true);
    expect((el.querySelector('[data-testid="settle-residual"]') as HTMLButtonElement).disabled).toBe(true);
    expect((el.querySelector('[data-testid="reverse"]') as HTMLButtonElement).disabled).toBe(true);
  });
});
