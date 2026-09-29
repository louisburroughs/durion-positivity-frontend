import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BankReconciliationService as BankReconciliationSdk,
  BankTransactionsService as BankTransactionsSdk,
  ReconciliationReviewResponse,
} from '@durion-sdk/accounting';
import { ReconciliationReview } from '../models/bank-reconciliation.models';
import { ReconciliationWorkspaceService } from './reconciliation-workspace.service';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const sdkReview = (): ReconciliationReviewResponse =>
  ({
    header: {
      reconciliationId: 'rec-1',
      glAccountId: 'gl-1010',
      accountCode: '1010',
      accountName: 'Operating Checking',
      status: 'IN_PROGRESS',
      statementId: 'st-9',
      statementStartDate: '2026-09-01',
      statementEndDate: '2026-09-30',
      baselineDate: '2026-09-01',
      baselineSetByThisStatement: true,
      gapAcknowledgement: 'First statement for this account',
      currency: 'USD',
      version: 7,
    },
    equation: {
      statementClosingBalance: 1200,
      sumOutstandingLedgerItems: -50,
      sumOutstandingBankItems: 0,
      adjustedBankBalance: 1150,
      glEndingBalance: 1195.33,
      sumLateAdjustments: 0,
      adjustedBookBalance: 1195.33,
      difference: -45.33,
      lateAdjustments: [{ adjustmentId: 'adj-late', reconciliationId: 'rec-0', amount: 10, date: '2026-10-02' }],
    },
    diagnostics: { openingDifference: -45.33, flags: ['OPENING_DIFFERENCE'], likelyCause: 'GAP_NOT_BRIDGED' },
    readiness: { canSubmit: false, canApprove: false, reasons: ['NOT_BALANCED'], countUnexplainedBank: 1, countUnexplainedLedger: 2 },
    unresolved: {
      unexplainedBank: [
        {
          bankTransactionId: 'bt-1',
          transactionDate: '2026-09-03',
          description: 'ACME',
          signedAmount: -12.5,
          nearDuplicates: [{ bankTransactionId: 'bt-0', signedAmount: -12.5 }],
        },
      ],
      unexplainedLedger: [{ glLineId: 'gl-line-1', entryNumber: 'JE-10', signedAmount: -12.5 }],
      proposedMatches: [{ matchId: 'm-p', state: 'PROPOSED' }],
    },
    evidence: {
      matches: [{ matchId: 'm-1', state: 'ACCEPTED', toleranceUsed: 0.02, residual: -0.02, bankTotal: 100, ledgerTotal: 100.02 }],
      outstandingItems: [{ outstandingItemId: 'oi-1', itemKind: 'OUTSTANDING_CHECK', status: 'OPEN', signedAmount: -50 }],
    },
    adjustments: [{ adjustmentId: 'adj-1', type: 'BANK_FEE', status: 'POSTED', amount: -5 }],
  }) as ReconciliationReviewResponse;

describe('ReconciliationWorkspaceService', () => {
  let service: ReconciliationWorkspaceService;

  const recSdk = {
    getReconciliationReview: vi.fn(),
    getReconciliationAudit: vi.fn(),
    listReconciliationCandidates: vi.fn(),
    autoMatchReconciliation: vi.fn(),
    createReconciliationMatch: vi.fn(),
    acceptReconciliationMatch: vi.fn(),
    rejectReconciliationMatch: vi.fn(),
    unmatchReconciliationMatch: vi.fn(),
    registerReconciliationOutstandingItem: vi.fn(),
    releaseReconciliationOutstandingItem: vi.fn(),
    reaffirmReconciliationOutstandingItem: vi.fn(),
    clearReconciliationOutstandingItemInGap: vi.fn(),
    listReconciliationAdjustmentTypes: vi.fn(),
    addReconciliationAdjustment: vi.fn(),
    reverseReconciliationAdjustment: vi.fn(),
    submitReconciliation: vi.fn(),
    finalizeReconciliation: vi.fn(),
    returnReconciliation: vi.fn(),
    cancelReconciliation: vi.fn(),
    supersedeReconciliation: vi.fn(),
  };
  const txSdk = { reviewBankTransactionDuplicate: vi.fn(), excludeBankTransaction: vi.fn(), restoreBankTransaction: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ReconciliationWorkspaceService,
        { provide: BankReconciliationSdk, useValue: recSdk },
        { provide: BankTransactionsSdk, useValue: txSdk },
      ],
    });
    service = TestBed.inject(ReconciliationWorkspaceService);
  });

  afterEach(() => vi.clearAllMocks());

  it('maps the review model as served, every E3 term and the diagnostics included', () => {
    recSdk.getReconciliationReview.mockReturnValueOnce(of(sdkReview()));

    let review: ReconciliationReview | undefined;
    service.getReview('rec-1').subscribe(value => (review = value));

    expect(review?.header).toMatchObject({ reconciliationId: 'rec-1', status: 'IN_PROGRESS', version: 7, baselineSetByThisStatement: true });
    expect(review?.equation).toMatchObject({
      statementClosingBalance: 1200,
      sumOutstandingLedgerItems: -50,
      adjustedBankBalance: 1150,
      glEndingBalance: 1195.33,
      adjustedBookBalance: 1195.33,
      difference: -45.33,
    });
    expect(review?.equation.lateAdjustments).toEqual([
      { adjustmentId: 'adj-late', reconciliationId: 'rec-0', amount: 10, date: '2026-10-02', reversal: false },
    ]);
    expect(review?.diagnostics).toMatchObject({ openingDifference: -45.33, flags: ['OPENING_DIFFERENCE'] });
    expect(review?.readiness.reasons).toEqual(['NOT_BALANCED']);
    expect(review?.unexplainedBank[0].nearDuplicates[0].bankTransactionId).toBe('bt-0');
    expect(review?.matches[0]).toMatchObject({ matchId: 'm-1', state: 'ACCEPTED', toleranceUsed: 0.02, residual: -0.02 });
    expect(review?.proposedMatches.map(m => m.matchId)).toEqual(['m-p']);
    expect(review?.outstandingItems[0]).toMatchObject({ itemKind: 'OUTSTANDING_CHECK', status: 'OPEN' });
    expect(review?.adjustments[0]).toMatchObject({ type: 'BANK_FEE', status: 'POSTED', amount: -5 });
  });

  it('keys a review without a header by the id it asked for', () => {
    recSdk.getReconciliationReview.mockReturnValueOnce(of({}));

    let review: ReconciliationReview | undefined;
    service.getReview('rec-2').subscribe(value => (review = value));

    expect(review?.header.reconciliationId).toBe('rec-2');
    expect(review?.readiness.canSubmit).toBe(false);
    expect(review?.unexplainedBank).toEqual([]);
  });

  it('creates a match with a UUIDv7 requestId and an optional justification', () => {
    recSdk.createReconciliationMatch.mockReturnValue(of({ matchId: 'm-2' }));

    service.createMatch('rec-1', ['bt-1'], ['gl-a', 'gl-b'], null).subscribe();
    service.createMatch('rec-1', ['bt-1'], ['gl-a', 'gl-b'], 'Split deposit').subscribe();

    const [first, second] = recSdk.createReconciliationMatch.mock.calls.map(call => call[1]);
    expect(first).toMatchObject({ bankTransactionIds: ['bt-1'], glLineIds: ['gl-a', 'gl-b'], justification: undefined });
    expect(first.requestId).toMatch(UUID_V7);
    expect(second.justification).toBe('Split deposit');
  });

  it('omits amount for a residual settlement and a gap bridge, and sends every set link', () => {
    recSdk.addReconciliationAdjustment.mockReturnValue(of({ adjustmentId: 'adj-2' }));
    const base = {
      description: null,
      transactionDate: null,
      overrideJustification: null,
      bankTransactionId: null,
      counterGlAccountId: null,
    };

    service
      .addAdjustment('rec-1', { ...base, type: 'OTHER', amount: null, justification: 'Bridge the gap', settlesMatchId: null, bridgesStatementId: 'st-9' })
      .subscribe();
    service
      .addAdjustment('rec-1', { ...base, type: 'TRANSFER', amount: 250, justification: null, settlesMatchId: null, bridgesStatementId: null, counterGlAccountId: 'gl-1020' })
      .subscribe();

    const [bridge, transfer] = recSdk.addReconciliationAdjustment.mock.calls.map(call => call[1]);
    expect('amount' in bridge).toBe(false);
    expect(bridge).toMatchObject({ type: 'OTHER', justification: 'Bridge the gap', bridgesStatementId: 'st-9' });
    expect(bridge.requestId).toMatch(UUID_V7);
    expect(transfer).toMatchObject({ type: 'TRANSFER', amount: 250, counterGlAccountId: 'gl-1020' });
  });

  it('sends the version with every lifecycle transition', () => {
    recSdk.submitReconciliation.mockReturnValue(of({ status: 'SUBMITTED' }));
    recSdk.finalizeReconciliation.mockReturnValue(of({ status: 'FINALIZED' }));
    recSdk.returnReconciliation.mockReturnValue(of({ status: 'IN_PROGRESS' }));
    recSdk.cancelReconciliation.mockReturnValue(of({ status: 'CANCELLED' }));
    recSdk.supersedeReconciliation.mockReturnValue(of({ reconciliationId: 'rec-3' }));

    service.submit('rec-1', 7).subscribe();
    service.approve('rec-1', 8).subscribe();
    service.returnToPreparer('rec-1', 'Recheck the fee', 9).subscribe();
    service.cancel('rec-1', 'Wrong statement chosen', 10).subscribe();
    let newId = '';
    service.supersede('rec-1', 'Ledger corrected after approval', 11).subscribe(id => (newId = id));

    expect(recSdk.submitReconciliation).toHaveBeenCalledWith('rec-1', { version: 7 });
    expect(recSdk.finalizeReconciliation).toHaveBeenCalledWith('rec-1', { version: 8 });
    expect(recSdk.returnReconciliation).toHaveBeenCalledWith('rec-1', { reason: 'Recheck the fee', version: 9 });
    expect(recSdk.cancelReconciliation.mock.calls[0][1]).toMatchObject({ justification: 'Wrong statement chosen', version: 10 });
    expect(recSdk.supersedeReconciliation.mock.calls[0][1]).toMatchObject({ justification: 'Ledger corrected after approval', version: 11 });
    expect(newId).toBe('rec-3');
  });

  it('sends outstanding-item writes to their endpoints', () => {
    recSdk.registerReconciliationOutstandingItem.mockReturnValue(of({ outstandingItemId: 'oi-2' }));
    recSdk.reaffirmReconciliationOutstandingItem.mockReturnValue(of({ outstandingItemId: 'oi-1' }));
    recSdk.clearReconciliationOutstandingItemInGap.mockReturnValue(of({ outstandingItemId: 'oi-1' }));
    recSdk.releaseReconciliationOutstandingItem.mockReturnValue(of({ outstandingItemId: 'oi-1' }));

    service.registerOutstanding('rec-1', { glLineId: 'gl-a' }, 'OUTSTANDING_CHECK', null).subscribe();
    service.reaffirmOutstanding('rec-1', 'oi-1', 'Still in transit').subscribe();
    service.clearInGap('rec-1', 'oi-1', 'Cleared during the gap').subscribe();
    service.releaseOutstanding('rec-1', 'oi-1', 'Registered by mistake').subscribe();

    expect(recSdk.registerReconciliationOutstandingItem).toHaveBeenCalledWith('rec-1', {
      glLineId: 'gl-a',
      itemKind: 'OUTSTANDING_CHECK',
      justification: undefined,
    });
    expect(recSdk.reaffirmReconciliationOutstandingItem).toHaveBeenCalledWith('rec-1', 'oi-1', { justification: 'Still in transit' });
    expect(recSdk.clearReconciliationOutstandingItemInGap).toHaveBeenCalledWith('rec-1', 'oi-1', { justification: 'Cleared during the gap' });
    expect(recSdk.releaseReconciliationOutstandingItem).toHaveBeenCalledWith('rec-1', 'oi-1', { reason: 'Registered by mistake' });
  });

  it('records a duplicate review with the original only for a duplicate', () => {
    txSdk.reviewBankTransactionDuplicate.mockReturnValue(of({}));

    service.reviewDuplicate('bt-1', 'DUPLICATE', 'Same fee twice', 'bt-0').subscribe();
    service.reviewDuplicate('bt-2', 'DISTINCT', 'Two separate fees', null).subscribe();

    expect(txSdk.reviewBankTransactionDuplicate.mock.calls).toEqual([
      ['bt-1', { decision: 'DUPLICATE', justification: 'Same fee twice', duplicateOfBankTransactionId: 'bt-0' }],
      ['bt-2', { decision: 'DISTINCT', justification: 'Two separate fees' }],
    ]);
  });

  it('drops adjustment types it does not know', () => {
    recSdk.listReconciliationAdjustmentTypes.mockReturnValueOnce(of([{ code: 'BANK_FEE' }, { code: 'MYSTERY' }, { code: 'TRANSFER' }]));

    let types: string[] = [];
    service.listAdjustmentTypes().subscribe(value => (types = value));

    expect(types).toEqual(['BANK_FEE', 'TRANSFER']);
  });

  it('reads candidates for one bank transaction with score and reasons as served', () => {
    recSdk.listReconciliationCandidates.mockReturnValueOnce(
      of({ candidates: [{ glLineId: 'gl-a', score: 110, reasons: ['EXACT_AMOUNT', 'REFERENCE_MATCH'] }] }),
    );

    let score: number | null = null;
    service.getCandidates('rec-1', 'bt-1').subscribe(value => (score = value[0].score));

    expect(recSdk.listReconciliationCandidates).toHaveBeenCalledWith('rec-1', 'bt-1');
    expect(score).toBe(110);
  });
});
