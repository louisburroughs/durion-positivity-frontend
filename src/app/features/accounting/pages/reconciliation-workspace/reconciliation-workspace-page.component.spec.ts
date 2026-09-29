import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import esMX from '../../../../../assets/i18n/es-MX.json';
import esUS from '../../../../../assets/i18n/es-US.json';
import frCA from '../../../../../assets/i18n/fr-CA.json';
import frFR from '../../../../../assets/i18n/fr-FR.json';
import { AuthService } from '../../../../core/services/auth.service';
import {
  MatchCandidate,
  OutstandingItem,
  ReconciliationMatch,
  ReconciliationReview,
  ReviewBankRow,
  ReviewLedgerRow,
} from '../../models/bank-reconciliation.models';
import { AccountingPeriod } from '../../models/period-close.models';
import { BankReconciliationService } from '../../services/bank-reconciliation.service';
import { PeriodCloseService } from '../../services/period-close.service';
import { ReconciliationWorkspaceService } from '../../services/reconciliation-workspace.service';
import { ReconciliationWorkspacePageComponent, firstOpenDayAfter } from './reconciliation-workspace-page.component';

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

const bankRow = (id: string, overrides: Partial<ReviewBankRow> = {}): ReviewBankRow => ({
  bankTransactionId: id,
  transactionDate: '2026-09-03',
  description: `Bank ${id}`,
  reference: null,
  checkNumber: null,
  signedAmount: -100,
  status: 'UNMATCHED',
  arrivedAfterApproval: false,
  nearDuplicates: [],
  ...overrides,
});

const ledgerRow = (id: string): ReviewLedgerRow => ({
  glLineId: id,
  journalEntryId: `je-${id}`,
  entryNumber: `JE-${id}`,
  date: '2026-09-02',
  description: `Ledger ${id}`,
  signedAmount: -50,
});

const item = (overrides: Partial<OutstandingItem> = {}): OutstandingItem => ({
  outstandingItemId: 'oi-1',
  itemKind: 'OTHER_LEDGER_TIMING',
  side: 'LEDGER',
  status: 'OPEN',
  itemDate: '2026-05-10',
  signedAmount: -75,
  ageDays: 140,
  closedOn: null,
  justification: null,
  registeredInReconciliationId: 'rec-0',
  lastReaffirmedAt: null,
  ...overrides,
});

/** An IN_PROGRESS workspace with something behind every control. */
const workspaceReview = (overrides: Partial<ReconciliationReview> = {}): ReconciliationReview =>
  review({
    unexplainedBank: [bankRow('bt-1'), bankRow('bt-2')],
    lateArrivals: [bankRow('bt-late', { arrivedAfterApproval: true })],
    unexplainedLedger: [ledgerRow('gl-a'), ledgerRow('gl-b')],
    proposedMatches: [match({ matchId: 'm-p1', state: 'PROPOSED' }), match({ matchId: 'm-p2', state: 'PROPOSED' })],
    agedItemsAwaitingReaffirmation: [item()],
    outstandingItems: [item(), item({ outstandingItemId: 'oi-2', registeredInReconciliationId: 'rec-1' })],
    exclusions: [bankRow('bt-x', { status: 'EXCLUDED' })],
    adjustments: [
      { adjustmentId: 'adj-1', type: 'BANK_FEE', status: 'POSTED', amount: -5, transactionDate: '2026-09-30', description: null, justification: null, entryNumber: 'JE-9', bankTransactionId: null, settlesMatchId: null, bridgesStatementId: null, counterGlAccountId: null, createdBy: null },
    ],
    ...overrides,
  });

const withStatus = (status: ReconciliationReview['header']['status'], readiness: Partial<ReconciliationReview['readiness']> = {}): ReconciliationReview => {
  const base = workspaceReview();
  return { ...base, header: { ...base.header, status }, readiness: { ...base.readiness, ...readiness } };
};

const ADJUST = 'accounting:reconciliation:adjust';
const APPROVE = 'accounting:reconciliation:approve';

const authStub = {
  known: true,
  granted: [ADJUST, APPROVE] as readonly string[],
  permissionsKnown(): boolean {
    return this.known;
  },
  hasAnyPermission(required: readonly string[]): boolean {
    return required.some(code => this.granted.includes(code));
  },
};

const workspaceStub = {
  getReview: vi.fn(),
  getAudit: vi.fn(),
  getCandidates: vi.fn(),
  autoMatch: vi.fn(),
  createMatch: vi.fn(),
  acceptMatch: vi.fn(),
  rejectMatch: vi.fn(),
  unmatch: vi.fn(),
  registerOutstanding: vi.fn(),
  releaseOutstanding: vi.fn(),
  reaffirmOutstanding: vi.fn(),
  clearInGap: vi.fn(),
  listAdjustmentTypes: vi.fn(),
  addAdjustment: vi.fn(),
  reverseAdjustment: vi.fn(),
  submit: vi.fn(),
  approve: vi.fn(),
  returnToPreparer: vi.fn(),
  cancel: vi.fn(),
  supersede: vi.fn(),
  reviewDuplicate: vi.fn(),
  exclude: vi.fn(),
  restore: vi.fn(),
};
const bankRecStub = { listBankAccounts: vi.fn() };
const periodsStub = { listPeriods: vi.fn() };

const httpError = (status: number, body: unknown = null): HttpErrorResponse => new HttpErrorResponse({ status, error: body });

type Bundle = Record<string, unknown>;
const lookup = (bundle: Bundle, key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);

describe('ReconciliationWorkspacePageComponent', () => {
  let fixture: ComponentFixture<ReconciliationWorkspacePageComponent>;
  let component: ReconciliationWorkspacePageComponent;
  let el: HTMLElement;
  let navigate: ReturnType<typeof vi.spyOn>;

  const setup = (value: ReconciliationReview = workspaceReview()): void => {
    workspaceStub.getReview.mockReturnValue(of(value));
    TestBed.configureTestingModule({
      imports: [ReconciliationWorkspacePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ReconciliationWorkspaceService, useValue: workspaceStub },
        { provide: BankReconciliationService, useValue: bankRecStub },
        { provide: PeriodCloseService, useValue: periodsStub },
        { provide: AuthService, useValue: authStub },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ reconciliationId: 'rec-1' })) } },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(ReconciliationWorkspacePageComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };

  const query = (testId: string): HTMLElement | null => el.querySelector(`[data-testid="${testId}"]`);
  const all = (testId: string): HTMLElement[] => Array.from(el.querySelectorAll(`[data-testid="${testId}"]`));
  const button = (testId: string): HTMLButtonElement => query(testId) as HTMLButtonElement;
  const click = (target: HTMLElement | null): void => {
    target?.click();
    fixture.detectChanges();
  };
  const typePrompt = (text: string): void => {
    component.promptText.setValue(text);
    fixture.detectChanges();
  };

  beforeEach(() => {
    workspaceStub.getAudit.mockReturnValue(of([]));
    workspaceStub.listAdjustmentTypes.mockReturnValue(of(['BANK_FEE', 'NSF_FEE', 'INTEREST_EARNED', 'OTHER', 'TRANSFER']));
    bankRecStub.listBankAccounts.mockReturnValue(of([]));
    periodsStub.listPeriods.mockReturnValue(of([]));
  });

  afterEach(() => {
    vi.clearAllMocks();
    authStub.known = true;
    authStub.granted = [ADJUST, APPROVE];
    TestBed.resetTestingModule();
  });

  describe('loading', () => {
    it('lists unexplained bank transactions late arrivals first, and the ledger lines, from the review', () => {
      setup();

      expect(workspaceStub.getReview).toHaveBeenCalledWith('rec-1');
      expect(all('bank-row').map(row => row.getAttribute('data-bank'))).toEqual(['bt-late', 'bt-1', 'bt-2']);
      expect(all('ledger-row').map(row => row.getAttribute('data-line'))).toEqual(['gl-a', 'gl-b']);
      expect(query('late-arrival')).not.toBeNull();
      expect(query('workspace-account')?.textContent).toContain('ACCOUNTING.RECONCILIATION_WORKSPACE.SUBTITLE');
      expect(query('gap-acknowledgement')?.textContent).toContain('First statement for this account');
    });

    it('names a 403 as missing permission, state before key', () => {
      workspaceStub.getReview.mockReturnValue(throwError(() => httpError(403)));
      TestBed.configureTestingModule({
        imports: [ReconciliationWorkspacePageComponent, TranslateModule.forRoot()],
        providers: [
          provideRouter([]),
          { provide: ReconciliationWorkspaceService, useValue: workspaceStub },
          { provide: BankReconciliationService, useValue: bankRecStub },
          { provide: PeriodCloseService, useValue: periodsStub },
          { provide: AuthService, useValue: authStub },
          { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ reconciliationId: 'rec-1' })) } },
        ],
      });
      fixture = TestBed.createComponent(ReconciliationWorkspacePageComponent);
      component = fixture.componentInstance;
      const order: string[] = [];
      const setState = component.state.set.bind(component.state);
      const setKey = component.errorKey.set.bind(component.errorKey);
      component.state.set = value => {
        order.push(`state:${value}`);
        setState(value);
      };
      component.errorKey.set = value => {
        order.push(`key:${value}`);
        setKey(value);
      };
      component.load();

      expect(component.state()).toBe('error');
      expect(order.slice(-2)).toEqual(['state:error', 'key:ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.FORBIDDEN']);
    });

    it('drops a superseded review read (ADR-0063)', () => {
      setup();
      const first = new Subject<ReconciliationReview>();
      const second = new Subject<ReconciliationReview>();
      workspaceStub.getReview.mockReturnValueOnce(first).mockReturnValueOnce(second);

      component.load();
      component.load();
      second.next(withStatus('SUBMITTED'));
      first.next(withStatus('IN_PROGRESS'));

      expect(component.status()).toBe('SUBMITTED');
    });
  });

  describe('candidates and matching (§4.6, AC5)', () => {
    const candidates: MatchCandidate[] = [
      { bankTransactionId: null, glLineId: 'gl-a', date: '2026-09-02', description: 'Deposit', entryNumber: 'JE-a', signedAmount: -50, score: 110, reasons: ['EXACT_AMOUNT', 'REFERENCE_MATCH'] },
      { bankTransactionId: null, glLineId: 'gl-b', date: '2026-09-02', description: 'Deposit', entryNumber: 'JE-b', signedAmount: -50, score: 60, reasons: ['DATE_IN_WINDOW'] },
    ];

    it('renders ranked candidates with their score and reason codes, the score not as a percentage', () => {
      setup();
      workspaceStub.getCandidates.mockReturnValue(of(candidates));

      click(all('show-candidates')[1]);

      expect(workspaceStub.getCandidates).toHaveBeenCalledWith('rec-1', 'bt-1');
      expect(all('candidate')).toHaveLength(2);
      expect(all('candidate-score')[0].textContent).toContain('ACCOUNTING.RECONCILIATION_WORKSPACE.CANDIDATES.SCORE');
      expect(all('candidate-score')[0].textContent).not.toContain('%');
      expect(all('candidate-reason').map(n => n.textContent?.trim())).toEqual([
        'ACCOUNTING.RECONCILIATION_WORKSPACE.CANDIDATE_REASON.EXACT_AMOUNT',
        'ACCOUNTING.RECONCILIATION_WORKSPACE.CANDIDATE_REASON.REFERENCE_MATCH',
        'ACCOUNTING.RECONCILIATION_WORKSPACE.CANDIDATE_REASON.DATE_IN_WINDOW',
      ]);
    });

    it('prompts for a justification when 1 bank : 2 ledger needs review, then resends it and shows the accepted match', () => {
      setup();
      workspaceStub.getCandidates.mockReturnValue(of(candidates));
      workspaceStub.createMatch
        .mockReturnValueOnce(
          throwError(() =>
            httpError(422, {
              code: 'MATCH_REQUIRES_REVIEW',
              fieldErrors: [{ field: 'justification', message: 'ONE_TO_MANY' }],
            }),
          ),
        )
        .mockReturnValueOnce(of(match({ matchId: 'm-9' })));

      click(all('show-candidates')[1]);
      click(all('pick-candidate')[0]);
      click(all('pick-candidate')[1]);
      expect(query('match-selected')?.textContent).toContain('ACTION.MATCH_SELECTED');
      click(query('match-selected'));

      expect(workspaceStub.createMatch).toHaveBeenCalledWith('rec-1', ['bt-1'], ['gl-a', 'gl-b'], null);
      expect((query('prompt-dialog') as HTMLDialogElement).matches(':modal')).toBe(true);
      expect(query('prompt-reasons')?.textContent).toContain('ONE_TO_MANY');
      expect(button('confirm-prompt').disabled).toBe(true);

      workspaceStub.getReview.mockReturnValue(of(workspaceReview({ matches: [match({ matchId: 'm-9', glLineIds: ['gl-a', 'gl-b'] })] })));
      typePrompt('One deposit covers two invoices');
      click(query('confirm-prompt'));

      expect(workspaceStub.createMatch).toHaveBeenLastCalledWith('rec-1', ['bt-1'], ['gl-a', 'gl-b'], 'One deposit covers two invoices');
      expect(el.querySelector('[data-match="m-9"]')).not.toBeNull();
      expect(component.outcome()?.key).toBe('ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.MATCHED');
    });

    it('matches rows selected by keyboard-operable checkboxes', () => {
      setup();
      workspaceStub.createMatch.mockReturnValue(of(match()));

      click(all('select-bank')[1]);
      click(all('select-ledger')[0]);
      click(query('match-selected'));

      expect(workspaceStub.createMatch).toHaveBeenCalledWith('rec-1', ['bt-1'], ['gl-a'], null);
    });

    it('accepts every proposal one after another with Accept all (D12)', () => {
      setup();
      workspaceStub.acceptMatch.mockReturnValue(of(match()));

      click(query('accept-all'));

      expect(workspaceStub.acceptMatch.mock.calls).toEqual([
        ['rec-1', 'm-p1'],
        ['rec-1', 'm-p2'],
      ]);
      expect(component.outcome()?.key).toBe('ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.PROPOSALS_ACCEPTED');
    });

    it('re-reads the review on 409 MATCH_STATE_INVALID', () => {
      setup();
      workspaceStub.acceptMatch.mockReturnValue(throwError(() => httpError(409, { code: 'MATCH_STATE_INVALID' })));

      click(all('accept-proposal')[0]);

      expect(component.outcome()?.key).toBe('ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.MATCH_STATE_INVALID');
      expect(workspaceStub.getReview).toHaveBeenCalledTimes(2);
    });
  });

  describe('adjustments (§4.6, §4.7, AC7)', () => {
    it('re-reads the review when a link is no longer eligible', () => {
      setup();
      workspaceStub.addAdjustment.mockReturnValue(throwError(() => httpError(422, { code: 'ADJUSTMENT_LINK_NOT_ELIGIBLE' })));

      click(all('adjust-bank')[1]);
      component.submitAdjustment({
        type: 'OTHER', amount: -100, description: null, justification: 'Returned payment PAY-991', transactionDate: null,
        overrideJustification: null, bankTransactionId: 'bt-1', settlesMatchId: null, bridgesStatementId: null, counterGlAccountId: null,
      });
      fixture.detectChanges();

      expect(query('adjustment-error')?.textContent?.trim()).toBe('ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.ADJUSTMENT_LINK_NOT_ELIGIBLE');
      expect(workspaceStub.getReview).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['GL_ACCOUNT_NOT_ACTIVE', 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.GL_ACCOUNT_NOT_ACTIVE'],
      ['ACCOUNT_NOT_RECONCILABLE', 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.ACCOUNT_NOT_RECONCILABLE'],
      ['RECONCILIATION_ADJUSTMENT_APPROVAL_REQUIRED', 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.ADJUSTMENT_APPROVAL_REQUIRED'],
    ])('classifies %s in the dialog', (code, key) => {
      setup();
      workspaceStub.addAdjustment.mockReturnValue(throwError(() => httpError(code.startsWith('RECONCILIATION') ? 403 : 422, { code })));

      click(query('add-adjustment'));
      component.submitAdjustment({
        type: 'TRANSFER', amount: 500, description: null, justification: null, transactionDate: null,
        overrideJustification: null, bankTransactionId: null, settlesMatchId: null, bridgesStatementId: null, counterGlAccountId: 'gl-1020',
      });
      fixture.detectChanges();

      expect(query('adjustment-error')?.textContent?.trim()).toBe(key);
    });

    it('loads the bank accounts for the TRANSFER picker and posts, closing the dialog', () => {
      setup();
      workspaceStub.addAdjustment.mockReturnValue(of({ adjustmentId: 'adj-2' }));

      click(query('add-adjustment'));
      expect(bankRecStub.listBankAccounts).toHaveBeenCalledTimes(1);
      component.submitAdjustment({
        type: 'BANK_FEE', amount: -5, description: null, justification: null, transactionDate: null,
        overrideJustification: null, bankTransactionId: null, settlesMatchId: null, bridgesStatementId: null, counterGlAccountId: null,
      });
      fixture.detectChanges();

      expect(query('adjustment-dialog')).toBeNull();
      expect(component.outcome()?.key).toBe('ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.ADJUSTED');
    });

    it('proposes the first day of the next open period when the explaining period is closed (D7)', () => {
      const closed = workspaceReview();
      setup({ ...closed, header: { ...closed.header, periodState: 'CLOSED' } });
      const periods: AccountingPeriod[] = [
        { periodCode: '2026-10', startDate: null, endDate: null, status: 'CLOSED', closedAt: null, closedBy: null, reopenedAt: null, reopenedBy: null, reopenJustification: null },
      ];
      periodsStub.listPeriods.mockReturnValue(of(periods));

      click(query('add-adjustment'));

      expect(component.proposedDate()).toBe('2026-11-01');
    });

    it('proposes nothing while the explaining period is open', () => {
      setup();
      click(query('add-adjustment'));

      expect(periodsStub.listPeriods).not.toHaveBeenCalled();
      expect(component.proposedDate()).toBeNull();
    });
  });

  describe('outstanding items and duplicates (§3.6, §4.5)', () => {
    it('reaffirms an aged item with a justification of at least 10 characters', () => {
      setup();
      workspaceStub.reaffirmOutstanding.mockReturnValue(of(item()));

      click(query('reaffirm'));
      typePrompt('short');
      expect(button('confirm-prompt').disabled).toBe(true);
      typePrompt('Still waiting on the vendor to cash it');
      click(query('confirm-prompt'));

      expect(workspaceStub.reaffirmOutstanding).toHaveBeenCalledWith('rec-1', 'oi-1', 'Still waiting on the vendor to cash it');
    });

    it('offers clear in gap only for an earlier item of an acknowledged statement', () => {
      setup();

      const items = all('outstanding-item');
      expect(items.map(row => !!row.querySelector('[data-testid="clear-in-gap"]'))).toEqual([true, false]);
    });

    it('registers a ledger line as outstanding with the chosen kind', () => {
      setup();
      workspaceStub.registerOutstanding.mockReturnValue(of(item()));

      click(all('register-ledger')[0]);
      component.promptKind.setValue('DEPOSIT_IN_TRANSIT');
      click(query('confirm-prompt'));

      expect(workspaceStub.registerOutstanding).toHaveBeenCalledWith('rec-1', { glLineId: 'gl-a' }, 'DEPOSIT_IN_TRANSIT', null);
    });

    it('offers the served near-duplicates as candidate originals', () => {
      const base = workspaceReview();
      setup({ ...base, possibleDuplicates: [bankRow('bt-d', { status: 'POSSIBLE_DUPLICATE', nearDuplicates: [bankRow('bt-orig')] })] });
      workspaceStub.reviewDuplicate.mockReturnValue(of(undefined));

      click(query('review-duplicate'));
      expect(Array.from((query('prompt-original') as HTMLSelectElement).options).map(o => o.value)).toEqual(['bt-orig']);
      component.promptDecision.setValue('DUPLICATE');
      typePrompt('Same fee charged twice by the bank');
      click(query('confirm-prompt'));

      expect(workspaceStub.reviewDuplicate).toHaveBeenCalledWith('bt-d', 'DUPLICATE', 'Same fee charged twice by the bank', 'bt-orig');
    });
  });

  describe('lifecycle (§4.9)', () => {
    it('submits with the header version when the review allows it', () => {
      setup(withStatus('IN_PROGRESS', { canSubmit: true }));
      workspaceStub.submit.mockReturnValue(of('SUBMITTED'));

      click(query('submit'));

      expect(workspaceStub.submit).toHaveBeenCalledWith('rec-1', 7);
      expect(workspaceStub.getReview).toHaveBeenCalledTimes(2);
    });

    it('keeps submit disabled when the review says it cannot be submitted', () => {
      setup(withStatus('IN_PROGRESS', { canSubmit: false }));

      expect(button('submit').disabled).toBe(true);
      component.submit();
      expect(workspaceStub.submit).not.toHaveBeenCalled();
    });

    it('keeps submit enabled with a non-zero opening difference when canSubmit is true (D2, AC6)', () => {
      setup(withStatus('IN_PROGRESS', { canSubmit: true }));

      expect(component.review()?.diagnostics.openingDifference).not.toBe(0);
      expect(button('submit').disabled).toBe(false);
    });

    it('disables approve for the submitter, from the served SELF_APPROVAL reason, and classifies the 403', () => {
      setup(withStatus('SUBMITTED', { canApprove: false, reasons: ['SELF_APPROVAL'] }));

      expect(button('approve').disabled).toBe(true);
      expect(el.querySelector('[data-reason="SELF_APPROVAL"]')).not.toBeNull();
    });

    it('highlights the ids and reports both counts on RECONCILIATION_HAS_UNEXPLAINED_ITEMS', () => {
      setup(withStatus('SUBMITTED', { canApprove: true, countUnexplainedBank: 1, countUnexplainedLedger: 2 }));
      workspaceStub.approve.mockReturnValue(
        throwError(() =>
          httpError(422, {
            code: 'RECONCILIATION_HAS_UNEXPLAINED_ITEMS',
            fieldErrors: [{ field: 'bankTransactionIds', message: 'bt-1' }, { field: 'glLineIds', message: 'gl-b' }],
          }),
        ),
      );
      workspaceStub.getReview.mockReturnValue(new Subject());

      click(query('approve'));

      expect(component.outcome()).toMatchObject({
        tone: 'error',
        key: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.HAS_UNEXPLAINED_ITEMS',
        params: { bank: 1, ledger: 2 },
      });
      expect(el.querySelector('[data-bank="bt-1"]')?.classList.contains('row--flagged')).toBe(true);
      expect(el.querySelector('[data-line="gl-b"]')?.classList.contains('row--flagged')).toBe(true);
      expect(component.refreshing()).toBe(true);
    });

    it('re-reads on 409 OPTIMISTIC_LOCK, keeping the rows with writes disabled', () => {
      setup(withStatus('IN_PROGRESS', { canSubmit: true }));
      const reread = new Subject<ReconciliationReview>();
      workspaceStub.submit.mockReturnValue(throwError(() => httpError(409, { code: 'OPTIMISTIC_LOCK' })));
      workspaceStub.getReview.mockReturnValue(reread);

      click(query('submit'));

      expect(all('bank-row')).toHaveLength(3);
      expect(button('auto-match').disabled).toBe(true);
      reread.next(withStatus('IN_PROGRESS', { canSubmit: true }));
      fixture.detectChanges();
      expect(button('auto-match').disabled).toBe(false);
    });

    it('returns to the preparer with a reason and the version', () => {
      setup(withStatus('SUBMITTED'));
      workspaceStub.returnToPreparer.mockReturnValue(of('IN_PROGRESS'));

      click(query('return'));
      typePrompt('Recheck the bank fee');
      click(query('confirm-prompt'));

      expect(workspaceStub.returnToPreparer).toHaveBeenCalledWith('rec-1', 'Recheck the bank fee', 7);
    });

    it('supersedes a finalized reconciliation and opens the new one', () => {
      setup(withStatus('FINALIZED'));
      workspaceStub.supersede.mockReturnValue(of('rec-2'));

      click(query('supersede'));
      typePrompt('Ledger corrected after approval');
      click(query('confirm-prompt'));

      expect(workspaceStub.supersede).toHaveBeenCalledWith('rec-1', 'Ledger corrected after approval', 7);
      expect(navigate).toHaveBeenCalledWith(['/app', 'accounting', 'reconciliations', 'rec-2']);
    });

    it('offers nothing but supersede on a FINALIZED reconciliation, and nothing on a CANCELLED one', () => {
      setup(withStatus('FINALIZED'));
      expect(query('submit')).toBeNull();
      expect(query('toolbar')).toBeNull();
      expect(button('supersede').disabled).toBe(false);
      expect(all('select-bank').every(box => (box as HTMLInputElement).disabled)).toBe(true);
      TestBed.resetTestingModule();

      setup(withStatus('CANCELLED'));
      expect(query('lifecycle')?.querySelectorAll('button')).toHaveLength(0);
    });

    it('disables preparer actions while SUBMITTED', () => {
      setup(withStatus('SUBMITTED'));

      expect(button('adjust-bank').disabled).toBe(true);
      expect(button('reaffirm').disabled).toBe(true);
      expect(button('register-ledger').disabled).toBe(true);
    });
  });

  describe('permissions (ADR-0040 §6a, AC8)', () => {
    const approverOnly = (): void => {
      component.openExclude(bankRow('bt-1'));
      component.openRestore(bankRow('bt-x'));
      component.openReverse(workspaceReview().adjustments[0]);
      component.openClearInGap(item());
      component.openCancel();
      component.openSupersede();
      component.openReturn();
      component.approve();
    };

    it('with adjust only: approver controls are disabled and their handlers refuse; reaffirm and OTHER stay enabled', () => {
      authStub.granted = [ADJUST];
      setup();

      expect(button('exclude').disabled).toBe(true);
      expect(button('restore').disabled).toBe(true);
      expect(button('reverse').disabled).toBe(true);
      expect(button('clear-in-gap').disabled).toBe(true);
      expect(button('cancel').disabled).toBe(true);
      approverOnly();
      expect(component.prompt()).toBeNull();
      expect(workspaceStub.approve).not.toHaveBeenCalled();

      expect(button('reaffirm').disabled).toBe(false);
      expect(button('add-adjustment').disabled).toBe(false);
      expect(button('adjust-bank').disabled).toBe(false);
    });

    it('with adjust only: approve and return on a SUBMITTED reconciliation are disabled', () => {
      authStub.granted = [ADJUST];
      setup(withStatus('SUBMITTED', { canApprove: true }));

      expect(button('approve').disabled).toBe(true);
      expect(button('return').disabled).toBe(true);
    });

    it('with adjust only: supersede is disabled', () => {
      authStub.granted = [ADJUST];
      setup(withStatus('FINALIZED'));

      expect(button('supersede').disabled).toBe(true);
    });

    it('with approve only: match, reaffirm and submit are disabled and their handlers refuse', () => {
      authStub.granted = [APPROVE];
      setup(withStatus('IN_PROGRESS', { canSubmit: true }));

      expect(button('match-selected').disabled).toBe(true);
      expect(button('reaffirm').disabled).toBe(true);
      expect(button('submit').disabled).toBe(true);
      expect(button('auto-match').disabled).toBe(true);
      component.toggleBank('bt-1');
      component.toggleLedger('gl-a');
      component.matchSelected();
      component.openReaffirm(item());
      component.submit();
      component.autoMatch();
      expect(workspaceStub.createMatch).not.toHaveBeenCalled();
      expect(workspaceStub.submit).not.toHaveBeenCalled();
      expect(workspaceStub.autoMatch).not.toHaveBeenCalled();
      expect(component.prompt()).toBeNull();

      expect(button('exclude').disabled).toBe(false);
      expect(button('cancel').disabled).toBe(false);
    });

    it('follows the canAccess() fallback when the token carries no permissions', () => {
      authStub.known = false;
      authStub.granted = [];
      setup(withStatus('IN_PROGRESS', { canSubmit: true }));

      expect(button('submit').disabled).toBe(false);
      expect(button('exclude').disabled).toBe(false);
    });
  });

  describe('copy, against the shipped bundles', () => {
    const SHIPPED: readonly (readonly [string, Bundle])[] = [
      ['en-US', enUS],
      ['es-US', esUS],
      ['es-MX', esMX],
      ['fr-CA', frCA],
      ['fr-FR', frFR],
    ];

    for (const [locale, bundle] of SHIPPED) {
      it(`${locale}: row actions' accessible names start with their visible labels (Label in Name)`, () => {
        setup();
        const translate = TestBed.inject(TranslateService);
        translate.setTranslation(locale, bundle as TranslationObject);
        translate.use(locale);
        fixture.detectChanges();

        for (const [testId, key] of [
          ['show-candidates', 'ACCOUNTING.RECONCILIATION_WORKSPACE.ACTION.CANDIDATES'],
          ['adjust-bank', 'ACCOUNTING.RECONCILIATION_WORKSPACE.ACTION.EXPLAIN'],
          ['register-ledger', 'ACCOUNTING.RECONCILIATION_WORKSPACE.ACTION.OUTSTANDING'],
          ['reaffirm', 'ACCOUNTING.RECONCILIATION_WORKSPACE.ACTION.REAFFIRM'],
        ] as const) {
          const visible = lookup(bundle, key) as string;
          const name = (query(testId)?.textContent ?? '').replace(/\s+/g, ' ').trim();
          expect(name.startsWith(visible), `${locale} ${testId}`).toBe(true);
        }
      });
    }
  });

  describe('firstOpenDayAfter()', () => {
    const period = (periodCode: string, status: 'OPEN' | 'CLOSED'): AccountingPeriod => ({
      periodCode, startDate: null, endDate: null, status, closedAt: null, closedBy: null, reopenedAt: null, reopenedBy: null, reopenJustification: null,
    });

    it.each([
      ['2026-09-30', [], '2026-10-01'],
      ['2026-09-30', [period('2026-10', 'CLOSED')], '2026-11-01'],
      ['2026-12-31', [], '2027-01-01'],
      ['2026-09-30', [period('2026-10', 'OPEN')], '2026-10-01'],
      ['not a date', [], null],
    ])('after %s is %s', (end, periods, expected) => {
      expect(firstOpenDayAfter(end, periods as AccountingPeriod[])).toBe(expected);
    });
  });
});
