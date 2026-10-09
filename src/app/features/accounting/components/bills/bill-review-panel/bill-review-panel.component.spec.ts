import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../../../../../core/services/auth.service';
import { BillDetail, NO_POSTING_INPUT, VendorDefaultClass } from '../../../models/payables.models';
import {
  APPROVE_ONLY,
  CLERK,
  OVER_LIMIT,
  PayablesMock,
  REJECT_ONLY,
  VIEW_ONLY,
  action,
  apiError,
  approval,
  authMock,
  awaitingBill,
  bill,
  check,
  exceptionBill,
  payablesMock,
  pending,
} from '../../../pages/bills/bills-page.spec-helper';
import { AccountingPreferencesService } from '../../../services/accounting-preferences.service';
import { PayablesService } from '../../../services/payables.service';
import { BillReviewPanelComponent } from './bill-review-panel.component';

describe('BillReviewPanelComponent (§5.2 item 4, story items 5–6, 12)', () => {
  let fixture: ComponentFixture<BillReviewPanelComponent>;
  let payables: PayablesMock;
  let changed: number;
  const showTerms = signal(false);
  let tenant = signal<string | null>(null);
  let nextVendorDefault: VendorDefaultClass = null;
  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(selector: string): T | null => host().querySelector<T>(selector);

  function render(held: readonly string[] | null, detail: BillDetail = bill(), billId = detail.billId): BillReviewPanelComponent {
    payables = payablesMock(detail);
    payables.getVendorDefaultClass.mockReturnValue(of(nextVendorDefault));
    TestBed.configureTestingModule({
      imports: [BillReviewPanelComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: PayablesService, useValue: payables },
        { provide: AuthService, useValue: authMock(held, { tenantId: tenant }).service },
        { provide: AccountingPreferencesService, useValue: { showTerms } },
      ],
    });
    fixture = TestBed.createComponent(BillReviewPanelComponent);
    changed = 0;
    fixture.componentInstance.changed.subscribe(() => changed++);
    fixture.componentRef.setInput('billId', billId);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    showTerms.set(false);
    tenant = signal<string | null>(null);
    nextVendorDefault = null;
  });

  describe('reading the bill', () => {
    it('reads straight from its id and shows header, details, checks and totals', () => {
      render(CLERK);

      expect(payables.getBill).toHaveBeenCalledWith('bill-1');
      expect(q('h2')?.textContent).toContain('ACCOUNTING.BILLS.PANEL.HEADING');
      expect(q('[data-testid="panel-status"]')?.textContent).toContain('ACCOUNTING.BILLS.STATUS.WAITING_DELIVERY');
      expect(q('[data-testid="panel-vendor"]')?.textContent).toContain('Northside Parts');
      expect(q('[data-testid="panel-check"]')?.dataset['code']).toBe('MATCHED_TO_DELIVERY');
      expect(q('[data-testid="due-date-value"]')?.textContent).toContain('ACCOUNTING.BILLS.PANEL.NO_DUE_DATE');
    });

    it('an EDI bill without lines says so and still shows the served totals (§5.2)', () => {
      render(CLERK);

      expect(q('[data-testid="panel-no-lines"]')?.textContent).toContain('ACCOUNTING.BILLS.LINES.NONE');
      expect(q('[data-testid="panel-totals"]')?.textContent).toContain('$1,700.00');
      expect(q('[data-testid="panel-totals"]')?.textContent).toContain('$140.50');
      expect(q('[data-testid="panel-totals"]')?.textContent).toContain('$1,840.50');
    });

    it('lines get a caption and column headers; a line amount is never computed (P7)', () => {
      render(
        CLERK,
        bill({
          lines: [
            { lineNumber: 1, description: 'Brake pads', inventoryItem: true, receivedQuantity: 4, receivedUnitPrice: 20, billedQuantity: 4, billedUnitPrice: 21, currencyCode: 'USD' },
          ],
        }),
      );

      const table = q('[data-testid="panel-lines"]')!;
      expect(table.querySelector('caption')).not.toBeNull();
      expect(Array.from(table.querySelectorAll('thead th')).every(th => th.getAttribute('scope') === 'col')).toBe(true);
      const cells = Array.from(table.querySelectorAll('tbody td')).map(cell => cell.textContent?.trim());
      expect(cells[3]).toBe('$21.00');
      expect(cells[4]).toBe('COMMON.NOT_AVAILABLE');
      expect(host().textContent).not.toContain('$84.00');
    });

    it('shows the accountant’s term only with Show accounting terms on (P1)', () => {
      showTerms.set(true);
      render(CLERK);

      expect(q('[data-testid="panel-status-term"]')?.textContent).toContain('ACCOUNTING.BILLS.TERM.PENDING_RECEIPT_MATCH');
    });

    it('notes the routing from the served tier and limit', () => {
      render(CLERK, awaitingBill({ approval: approval({ requiredTier: 'OVER_LIMIT', clerkLimit: 1000 }) }));

      expect(q('[data-testid="panel-routing"]')?.textContent).toContain('ACCOUNTING.BILLS.ROUTING.OVER_LIMIT');
      expect(q('[data-testid="panel-routing"] app-help-disclosure')).not.toBeNull();
    });

    it('a read for bill A that lands after bill B was picked never paints over B (ADR-0063)', () => {
      const panel = render(CLERK);
      const slowA = pending<BillDetail>();
      const fastB = pending<BillDetail>();
      payables.getBill.mockImplementation((id: string) => (id === 'bill-a' ? slowA : fastB));

      fixture.componentRef.setInput('billId', 'bill-a');
      fixture.detectChanges();
      fixture.componentRef.setInput('billId', 'bill-b');
      fixture.detectChanges();
      fastB.next(bill({ billId: 'bill-b', billNumber: 'INV-B' }));
      slowA.next(bill({ billId: 'bill-a', billNumber: 'INV-A' }));
      fixture.detectChanges();

      expect(panel.bill()?.billNumber).toBe('INV-B');
    });

    it('says "This bill no longer exists" with the way back for an unknown or invisible id', () => {
      payables = payablesMock();
      render(CLERK);
      payables.getBill.mockReturnValue(throwError(() => apiError(404, 'VENDOR_BILL_NOT_FOUND')));
      fixture.componentInstance.retry();
      fixture.detectChanges();

      expect(q('[data-testid="panel-not-found"]')?.textContent).toContain('ACCOUNTING.BILLS.ERROR.NOT_FOUND');
      expect(q('[data-testid="panel-not-found"] a')?.getAttribute('href')).toBe('/app/accounting/bills');
      expect(host().textContent).not.toContain('Northside Parts');
    });

    it('keeps the bill visible with writes off while it is read again (refreshing)', () => {
      const panel = render(CLERK, awaitingBill());
      const again = pending<BillDetail>();
      payables.getBill.mockReturnValue(again);
      panel.retry();
      fixture.detectChanges();

      expect(panel.state()).toBe('refreshing');
      expect(q('[data-testid="panel-refreshing"]')).not.toBeNull();
      expect(q<HTMLButtonElement>('[data-testid="approve"]')!.disabled).toBe(true);
      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });
      expect(payables.approve).not.toHaveBeenCalled();
    });
  });

  describe('decisions (story item 6, ADR-0040 §6a)', () => {
    it('success re-reads the bill, tells the page to re-read its counts and list, and announces', () => {
      const panel = render(CLERK);
      payables.getBill.mockReturnValue(of(awaitingBill()));

      panel.run({ kind: 'SUBMIT', justification: 'Shop rags and gloves' });
      fixture.detectChanges();

      expect(payables.submitForApproval).toHaveBeenCalledWith('bill-1', { justification: 'Shop rags and gloves', posting: NO_POSTING_INPUT });
      expect(payables.getBill).toHaveBeenCalledTimes(2);
      expect(changed).toBe(1);
      expect(q('[data-testid="panel-status"]')?.textContent).toContain('ACCOUNTING.BILLS.STATUS.AWAITING_APPROVAL');
      expect(q('[data-testid="panel-announcement"]')?.textContent).toContain('ACCOUNTING.BILLS.DONE.SENT');
    });

    it('a 409 says the bill changed and re-reads everything (story item 12)', () => {
      const panel = render(CLERK, awaitingBill());
      payables.approve.mockReturnValue(throwError(() => apiError(409, 'AP_BILL_NOT_APPROVABLE')));

      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });
      fixture.detectChanges();

      expect(panel.failure()?.view.message.key).toBe('ACCOUNTING.BILLS.ERROR.CHANGED');
      expect(payables.getBill).toHaveBeenCalledTimes(2);
      expect(changed).toBe(1);
    });

    it('a raced ACCEPT refused 403 AP_APPROVAL_LIMIT_EXCEEDED is classified and re-read (AC 3)', () => {
      const panel = render(CLERK, exceptionBill());
      payables.resolveException.mockReturnValue(throwError(() => apiError(403, 'AP_APPROVAL_LIMIT_EXCEEDED')));

      panel.run({ kind: 'RESOLVE', action: 'ACCEPT', reason: 'Price rise agreed', taxOnResale: null });
      fixture.detectChanges();

      expect(panel.failure()).toMatchObject({ kind: 'RESOLVE', view: { reread: true } });
      expect(panel.failure()?.view.message.key).toBe('ACCOUNTING.BILLS.ERROR.LIMIT_EXCEEDED');
      expect(payables.getBill).toHaveBeenCalledTimes(2);
      expect(q('[data-testid="exception-error"]')?.textContent).toContain('ACCOUNTING.BILLS.ERROR.LIMIT_EXCEEDED');
    });

    it('a validation refusal keeps the bill as read (no re-read)', () => {
      const panel = render(CLERK, awaitingBill());
      payables.reject.mockReturnValue(throwError(() => apiError(400, 'JUSTIFICATION_REQUIRED')));

      panel.run({ kind: 'REJECT', reason: 'Not our order at all' });

      expect(panel.failure()?.view.field).toBe('reason');
      expect(payables.getBill).toHaveBeenCalledTimes(1);
      expect(changed).toBe(0);
    });

    it('selecting a candidate is matching only: the bill re-reads into Approve (AC 7)', () => {
      const ambiguous = exceptionBill({
        openCandidates: [{ candidateId: 'cand-1', billNumber: 'REC-1001', billTotal: 1200, currencyCode: 'USD', score: 74, points: null }],
        availableActions: [action('SELECT_CANDIDATE')],
      });
      const panel = render(CLERK, ambiguous);
      payables.getBill.mockReturnValue(of(awaitingBill({ billId: 'bill-2' })));

      panel.run({ kind: 'SELECT', candidateId: 'cand-1', billNumber: 'REC-1001' });
      fixture.detectChanges();

      expect(payables.selectMatchCandidate).toHaveBeenCalledWith('cand-1');
      expect(panel.bill()?.status).toBe('AWAITING_APPROVAL');
      expect(changed).toBe(1);
    });

    it('refuses a candidate the bill does not serve', () => {
      const panel = render(CLERK, exceptionBill({ availableActions: [action('SELECT_CANDIDATE')] }));

      panel.run({ kind: 'SELECT', candidateId: 'cand-other', billNumber: null });

      expect(payables.selectMatchCandidate).not.toHaveBeenCalled();
    });

    it('ignores a second decision while one is in flight', () => {
      const panel = render(CLERK, awaitingBill());
      const inFlight = new Subject<void>();
      payables.approve.mockReturnValue(inFlight);

      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });
      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });

      expect(payables.approve).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * AC 12: each decision's control and its method, per session. The bill serves
   * every action as allowed; only the session's codes differ.
   */
  describe('action matrix per session (AC 12)', () => {
    const everything = awaitingBill({
      status: 'MATCH_EXCEPTION',
      availableActions: [
        action('SUBMIT_FOR_APPROVAL'),
        action('APPROVE'),
        action('REJECT'),
        action('ACCEPT_EXCEPTION'),
        action('CORRECT_EXCEPTION'),
        action('VOID_EXCEPTION'),
        action('SELECT_CANDIDATE'),
        action('SET_DUE_DATE'),
      ],
      openCandidates: [{ candidateId: 'cand-1', billNumber: 'REC-1001', billTotal: 1200, currencyCode: 'USD', score: 74, points: null }],
    });

    function attempt(panel: BillReviewPanelComponent): Record<string, boolean> {
      panel.run({ kind: 'SUBMIT', justification: 'Long enough reason' });
      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });
      panel.run({ kind: 'REJECT', reason: 'Long enough reason' });
      panel.run({ kind: 'RESOLVE', action: 'VOID', reason: 'Long enough reason', taxOnResale: null });
      panel.run({ kind: 'RESOLVE', action: 'ACCEPT', reason: 'Long enough reason', taxOnResale: null });
      panel.run({ kind: 'RESOLVE', action: 'CORRECT', reason: 'Long enough reason', taxOnResale: null });
      panel.run({ kind: 'SELECT', candidateId: 'cand-1', billNumber: 'REC-1001' });
      panel.run({ kind: 'DUE_DATE', dueDate: '2026-11-01', justification: null });
      const resolved = (action: string): boolean =>
        payables.resolveException.mock.calls.some(([, command]) => command.resolutionAction === action);
      return {
        submit: payables.submitForApproval.mock.calls.length > 0,
        approve: payables.approve.mock.calls.length > 0,
        reject: payables.reject.mock.calls.length > 0,
        voidException: resolved('VOID'),
        accept: resolved('ACCEPT'),
        correct: resolved('CORRECT'),
        select: payables.selectMatchCandidate.mock.calls.length > 0,
        dueDate: payables.setDueDate.mock.calls.length > 0,
      };
    }

    function controls(): Record<string, boolean> {
      return {
        submit: !!q('[data-testid="send"]'),
        approve: !!q('[data-testid="approve"]'),
        reject: !!q('[data-testid="reject"]'),
        voidException: !!q('[data-choice="VOID"]'),
        accept: !!q('[data-choice="ACCEPT"]'),
        correct: !!q('[data-choice="CORRECT"]'),
        select: !!q('[data-testid="candidate-pick"]'),
        dueDate: !!q('[data-testid="due-date-open"]'),
      };
    }

    // Every call resolves synchronously with `of`, so each run settles before the next one.
    it.each([
      ['accounting:ap:view only', VIEW_ONLY, { submit: false, approve: false, reject: false, voidException: false, accept: false, correct: false, select: false, dueDate: false }],
      ['accounting:ap:approve', APPROVE_ONLY, { submit: true, approve: true, reject: false, voidException: false, accept: true, correct: true, select: true, dueDate: true }],
      ['accounting:ap:approve_over_limit', OVER_LIMIT, { submit: true, approve: true, reject: false, voidException: false, accept: true, correct: true, select: true, dueDate: false }],
      ['accounting:ap:reject', REJECT_ONLY, { submit: false, approve: false, reject: true, voidException: true, accept: false, correct: false, select: false, dueDate: false }],
      ['unknown perm_bits (canAccess fallback)', null, { submit: true, approve: true, reject: true, voidException: true, accept: true, correct: true, select: true, dueDate: true }],
    ] as const)('%s', (_name, held, expected) => {
      const panel = render(held, everything);
      const shown = controls();
      payables.getBill.mockReturnValue(of(everything));

      expect(shown).toEqual(expected);
      expect(attempt(panel)).toEqual(expected);
    });

    it('a listed but blocked action is refused at the method too', () => {
      const panel = render(OVER_LIMIT, awaitingBill({ availableActions: [action('APPROVE', { allowed: false, blockedReason: 'AP_BILL_SELF_APPROVAL' })] }));

      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });

      expect(payables.approve).not.toHaveBeenCalled();
    });

    it('the retired accounting:ap:view alone never enables a write (negative test on the read code)', () => {
      const panel = render(['accounting:ap:view', 'accounting:analytics:view'], everything);

      const none = { submit: false, approve: false, reject: false, voidException: false, accept: false, correct: false, select: false, dueDate: false };
      expect(controls()).toEqual(none);
      expect(attempt(panel)).toEqual(none);
    });
  });

  describe('review A2, A5 and ruling Q5', () => {
    it('drops the bill and a read in flight when the tenant or person changes, then reads again (A2)', () => {
      const panel = render(CLERK);
      const slow = pending<BillDetail>();
      payables.getBill.mockReturnValue(slow);
      panel.retry();
      const again = pending<BillDetail>();
      payables.getBill.mockReturnValue(again);
      tenant.set('tenant-b');
      fixture.detectChanges();

      expect(panel.bill()).toBeNull();
      slow.next(bill({ vendorName: 'Tenant A Vendor' }));
      fixture.detectChanges();
      expect(panel.bill()).toBeNull();
      expect(host().textContent).not.toContain('Tenant A Vendor');
      again.next(bill({ vendorName: 'Tenant B Vendor' }));
      fixture.detectChanges();
      expect(panel.bill()?.vendorName).toBe('Tenant B Vendor');
    });

    it('a decision sent before the identity change settles silently (A2)', () => {
      const panel = render(CLERK, awaitingBill());
      const decision = new Subject<void>();
      payables.approve.mockReturnValue(decision);
      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });
      tenant.set('tenant-b');
      fixture.detectChanges();
      decision.next();
      decision.complete();

      expect(changed).toBe(0);
      expect(panel.announcement()).toBeNull();
    });

    it('a decision still in flight when another bill is picked settles and re-reads the list and counts (A5)', () => {
      const panel = render(CLERK, awaitingBill());
      const decision = new Subject<void>();
      payables.approve.mockReturnValue(decision);
      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });
      payables.getBill.mockReturnValue(of(awaitingBill({ billId: 'bill-b', billNumber: 'INV-B' })));
      fixture.componentRef.setInput('billId', 'bill-b');
      fixture.detectChanges();
      expect(panel.inFlight()).toBeNull();
      decision.next();
      decision.complete();
      fixture.detectChanges();

      expect(changed).toBe(1);
      // Only panel-local updates are skipped: B shows no announcement for A.
      expect(panel.bill()?.billNumber).toBe('INV-B');
      expect(panel.announcement()).toBeNull();
    });

    it('a candidate that matched another bill emits moved and changed, and paints nothing under this bill (Q5, AC 7)', () => {
      const ambiguous = exceptionBill({
        openCandidates: [{ candidateId: 'cand-9', billNumber: 'REC-9', billTotal: 1200, currencyCode: 'USD', score: 74, points: null }],
        availableActions: [action('SELECT_CANDIDATE')],
      });
      const panel = render(CLERK, ambiguous);
      const moved: unknown[] = [];
      panel.moved.subscribe(selection => moved.push(selection));
      payables.selectMatchCandidate.mockReturnValue(of({ billId: 'bill-9', billNumber: 'REC-9' }));

      panel.run({ kind: 'SELECT', candidateId: 'cand-9', billNumber: 'REC-9' });

      expect(moved).toEqual([{ billId: 'bill-9', billNumber: 'REC-9' }]);
      expect(changed).toBe(1);
      expect(panel.inFlight()).toBeNull();
      expect(payables.getBill).toHaveBeenCalledTimes(1);
    });
  });

  describe('posting choices (ruling Q1, rows 7–10)', () => {
    const edi = (overrides: Partial<BillDetail> = {}): BillDetail => awaitingBill({ lines: [], ...overrides });

    it('an EDI bill with no lines, proposal or default requires Stock on Approve, and sends {debitClass: GOODS} (AC a)', () => {
      const panel = render(CLERK, edi());
      expect(payables.getVendorDefaultClass).toHaveBeenCalledWith('vendor-uuid-1');
      expect(q('[data-testid="classification"]')).not.toBeNull();
      expect(q<HTMLButtonElement>('[data-testid="approve"]')!.disabled).toBe(true);
      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });
      expect(payables.approve).not.toHaveBeenCalled();

      q<HTMLInputElement>('[data-testid="classification-goods"]')!.click();
      fixture.detectChanges();
      q<HTMLButtonElement>('[data-testid="approve"]')!.click();

      expect(payables.approve).toHaveBeenCalledWith('bill-1', {
        justification: null,
        taxOnResaleOverrideJustification: null,
        posting: { classification: 'GOODS', difference: null, overrideJustification: null },
      });
    });

    it('a 422 AP_BILL_UNCLASSIFIED marks the field, keeps the input and reads nothing again (AC a)', () => {
      const panel = render(CLERK, edi());
      panel.postClass.set('GOODS');
      payables.approve.mockReturnValue(throwError(() => apiError(422, 'AP_BILL_UNCLASSIFIED')));
      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });
      fixture.detectChanges();

      expect(q('[data-testid="classification-error"]')?.textContent).toContain('ACCOUNTING.BILLS.ERROR.UNCLASSIFIED');
      expect(panel.postClass()).toBe('GOODS');
      expect(payables.getBill).toHaveBeenCalledTimes(1);
    });

    it('reveals the field on a goods-receipt bill when Approve answers AP_BILL_UNCLASSIFIED', () => {
      const panel = render(CLERK, awaitingBill());
      expect(q('[data-testid="classification"]')).toBeNull();
      payables.approve.mockReturnValue(throwError(() => apiError(422, 'AP_BILL_UNCLASSIFIED')));
      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });
      fixture.detectChanges();

      expect(q('[data-testid="classification"]')).not.toBeNull();
    });

    it('pre-fills Stock from the vendor’s default and labels it', () => {
      nextVendorDefault = 'GOODS';
      const panel = render(CLERK, edi());

      expect(panel.postClass()).toBe('GOODS');
      expect(q('[data-testid="classification-note"]')?.textContent).toContain('ACCOUNTING.BILLS.POSTING.CLASSIFICATION.FROM_VENDOR');
    });

    it('an EXPENSE vendor default approves without sending a classification (Q1 C)', () => {
      nextVendorDefault = 'EXPENSE';
      const panel = render(CLERK, edi());

      expect(q('[data-testid="classification-expense"]')?.textContent).toContain('ACCOUNTING.BILLS.POSTING.CLASSIFICATION.EXPENSE_VENDOR');
      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });
      expect(payables.approve.mock.calls[0][1].posting.classification).toBeNull();
    });

    it('an EXPENSE proposal approves without sending a classification, labelled as the proposal (AC c)', () => {
      const panel = render(
        CLERK,
        edi({ approval: approval({ proposedClassification: { debitClass: 'EXPENSE', expenseMappingKey: 'EXPENSE_SHOP_SUPPLIES' } }) }),
      );
      expect(payables.getVendorDefaultClass).not.toHaveBeenCalled();
      expect(q('[data-testid="classification-expense"]')?.textContent).toContain('ACCOUNTING.BILLS.POSTING.CLASSIFICATION.EXPENSE_PROPOSAL');

      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });

      expect(payables.approve.mock.calls[0][1].posting).toEqual({ classification: null, difference: null, overrideJustification: null });
    });

    it('a GOODS proposal pre-fills Stock (AC c)', () => {
      const panel = render(CLERK, edi({ approval: approval({ proposedClassification: { debitClass: 'GOODS', expenseMappingKey: null } }) }));

      expect(panel.postClass()).toBe('GOODS');
      expect(q('[data-testid="classification-note"]')?.textContent).toContain('ACCOUNTING.BILLS.POSTING.CLASSIFICATION.FROM_PROPOSAL');
    });

    it('a failing TOTALS_ADD_UP needs where the difference goes and why, and sends it (AC b)', () => {
      const unreconciled = awaitingBill({ checks: [check('TOTALS_ADD_UP', 'FAIL', { difference: '2.00', netAmount: '100.00', taxAmount: '13.00', totalAmount: '115.00' })] });
      const panel = render(CLERK, unreconciled);
      expect(q('[data-testid="difference"]')).not.toBeNull();
      expect(panel.postingReady()).toBe(false);
      panel.diffClass.set('FREIGHT');
      panel.diffReason.set('Delivery charge on the invoice');
      fixture.detectChanges();

      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });

      expect(payables.approve.mock.calls[0][1].posting.difference).toEqual({ differenceClass: 'FREIGHT', justification: 'Delivery charge on the invoice' });
    });

    it('a proposed difference pre-fills the group (AC c)', () => {
      const panel = render(
        CLERK,
        awaitingBill({
          checks: [check('TOTALS_ADD_UP', 'FAIL', { difference: '2.00' })],
          approval: approval({ proposedDifference: { differenceClass: 'PRICE_DIFFERENCE', justification: 'Price rise agreed' } }),
        }),
      );

      expect(panel.diffClass()).toBe('PRICE_DIFFERENCE');
      expect(panel.diffReason()).toBe('Price rise agreed');
    });

    it('PERIOD_CLOSED: a holder of accounting:period:override gives a reason and the approve is resent with it (row 8)', () => {
      const panel = render([...CLERK, 'accounting:period:override'], awaitingBill());
      payables.approve.mockReturnValueOnce(throwError(() => apiError(422, 'PERIOD_CLOSED')));
      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });
      fixture.detectChanges();

      expect(q('[data-testid="override"]')).not.toBeNull();
      expect(q<HTMLButtonElement>('[data-testid="approve"]')!.disabled).toBe(true);
      panel.overrideReason.set('September closed before the invoice came');
      fixture.detectChanges();
      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });

      expect(payables.approve.mock.calls[1][1].posting.overrideJustification).toBe('September closed before the invoice came');
    });

    it('PERIOD_CLOSED for anyone else says who can approve, with no override field (row 8)', () => {
      const panel = render(CLERK, awaitingBill());
      payables.approve.mockReturnValue(throwError(() => apiError(422, 'PERIOD_CLOSED')));
      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });
      fixture.detectChanges();

      expect(q('[data-testid="override"]')).toBeNull();
      expect(q('[data-testid="approve-error"]')?.textContent).toContain('ACCOUNTING.BILLS.ERROR.PERIOD_CLOSED');
    });

    it('LOCK_TIMEOUT keeps the input and the bill as read; the same request can be sent again (row 10)', () => {
      const panel = render(CLERK, awaitingBill());
      payables.approve.mockReturnValueOnce(throwError(() => apiError(409, 'LOCK_TIMEOUT')));
      panel.run({ kind: 'APPROVE', justification: 'Matches the signed PO', taxOnResale: null });
      fixture.detectChanges();

      expect(q('[data-testid="approve-error"]')?.textContent).toContain('ACCOUNTING.BILLS.ERROR.LOCK_TIMEOUT');
      expect(payables.getBill).toHaveBeenCalledTimes(1);
      expect(changed).toBe(0);
      panel.run({ kind: 'APPROVE', justification: 'Matches the signed PO', taxOnResale: null });
      expect(payables.approve.mock.calls[1]).toEqual(payables.approve.mock.calls[0]);
    });

    it('voids an approved bill through the panel with the served action and accounting:ap:reject (row 5)', () => {
      const panel = render(CLERK, bill({ status: 'APPROVED', availableActions: [action('VOID_APPROVED')] }));

      panel.run({ kind: 'VOID', voidKind: 'VOID_APPROVED', reason: 'Billed twice by mistake', overrideJustification: null });

      expect(payables.voidBill).toHaveBeenCalledWith('bill-1', { reason: 'Billed twice by mistake', overrideJustification: null });
      panel.run({ kind: 'VOID', voidKind: 'VOID_UNMATCHED', reason: 'Billed twice by mistake', overrideJustification: null });
      expect(payables.voidBill).toHaveBeenCalledTimes(1);
    });

    it('shows On the books with the entry link and the closed-month note, never the entry id (row 7)', () => {
      showTerms.set(true);
      render(
        [...CLERK, 'accounting:je:view'],
        bill({
          status: 'APPROVED',
          availableActions: [],
          posting: {
            journalEntryId: 'je-uuid-7',
            journalEntryReference: 'JE-202610-14',
            postingDate: '2026-10-03',
            postingDateRule: 'APPROVAL_DATE_BILL_PERIOD_NOT_OPEN',
            differenceClass: 'FREIGHT',
            differenceAmount: 2,
            roundingAdjustment: 0.01,
            reversalReference: null,
            currencyCode: 'USD',
          },
        }),
      );

      const books = q('[data-testid="panel-on-the-books"]')!;
      expect(books.textContent).toContain('ACCOUNTING.BILLS.PANEL.ON_THE_BOOKS');
      expect(q('[data-testid="panel-entry-link"]')?.getAttribute('href')).toBe('/app/accounting/books/entries/je-uuid-7');
      expect(q('[data-testid="panel-month-closed"]')).not.toBeNull();
      expect(host().textContent).not.toContain('je-uuid-7');
      expect(q('[data-testid="panel-posting-terms"]')?.textContent).toContain('ACCOUNTING.BILLS.PANEL.POSTED_DIFFERENCE');
    });

    it('labels an automatic approval "Automatic" and never shows an actor username (Q4)', () => {
      render(CLERK, bill({ status: 'APPROVED', availableActions: [], approval: approval({ approvedAutomatically: true }) }));

      expect(q('[data-testid="panel-approved-automatically"]')?.textContent).toContain('ACCOUNTING.BILLS.PANEL.APPROVED_AUTOMATICALLY');
    });

    it('keeps one Match score heading (review B3)', () => {
      render(CLERK, awaitingBill());

      const headings = Array.from(host().querySelectorAll('h2, h3')).filter(heading => heading.textContent?.includes('ACCOUNTING.BILLS.MATCH.HEADING'));
      expect(headings.length).toBe(1);
    });
  });

  describe('re-review R2', () => {
    it('PERIOD_CLOSED → override reason → 409 LOCK_TIMEOUT → Try again still sends overrideJustification (item 2)', () => {
      const panel = render([...CLERK, 'accounting:period:override'], awaitingBill());
      payables.approve.mockReturnValueOnce(throwError(() => apiError(422, 'PERIOD_CLOSED')));
      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });
      fixture.detectChanges();
      panel.overrideReason.set('September closed before the invoice came');
      payables.approve.mockReturnValueOnce(throwError(() => apiError(409, 'LOCK_TIMEOUT')));
      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });
      fixture.detectChanges();

      expect(q('[data-testid="override"]')).not.toBeNull();
      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });

      expect(payables.approve).toHaveBeenCalledTimes(3);
      expect(payables.approve.mock.calls[2][1]).toEqual(payables.approve.mock.calls[1][1]);
      expect(payables.approve.mock.calls[2][1].posting.overrideJustification).toBe('September closed before the invoice came');
    });

    it('a classification revealed on a goods-receipt bill survives a 503 and is resent (item 2)', () => {
      const panel = render(CLERK, awaitingBill());
      payables.approve.mockReturnValueOnce(throwError(() => apiError(422, 'AP_BILL_UNCLASSIFIED')));
      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });
      fixture.detectChanges();
      q<HTMLInputElement>('[data-testid="classification-goods"]')!.click();
      fixture.detectChanges();
      payables.approve.mockReturnValueOnce(throwError(() => apiError(503, 'SERVICE_UNAVAILABLE')));
      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });
      fixture.detectChanges();

      expect(q('[data-testid="classification"]')).not.toBeNull();
      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });
      expect(payables.approve.mock.calls[2][1].posting.classification).toBe('GOODS');
    });

    it('a void override revealed by PERIOD_CLOSED stays after LOCK_TIMEOUT (item 2)', () => {
      const panel = render([...CLERK, 'accounting:period:override'], bill({ status: 'APPROVED', availableActions: [action('VOID_APPROVED')] }));
      payables.voidBill.mockReturnValueOnce(throwError(() => apiError(422, 'PERIOD_CLOSED')));
      panel.run({ kind: 'VOID', voidKind: 'VOID_APPROVED', reason: 'Billed twice by mistake', overrideJustification: null });
      payables.voidBill.mockReturnValueOnce(throwError(() => apiError(409, 'LOCK_TIMEOUT')));
      panel.run({ kind: 'VOID', voidKind: 'VOID_APPROVED', reason: 'Billed twice by mistake', overrideJustification: 'September is closed' });

      expect(panel.revealed().override).toContain('VOID');
      expect(panel.failure()?.view.code).toBe('LOCK_TIMEOUT');
    });

    it('success and another bill clear what was revealed (item 2)', () => {
      const panel = render([...CLERK, 'accounting:period:override'], awaitingBill());
      payables.approve.mockReturnValueOnce(throwError(() => apiError(422, 'PERIOD_CLOSED')));
      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });
      expect(panel.revealed().override).toEqual(['APPROVE']);
      fixture.componentRef.setInput('billId', 'bill-b');
      fixture.detectChanges();

      expect(panel.revealed().override).toEqual([]);
    });

    it('re-applies the served proposal after an in-place Send resets the choices (item 3)', () => {
      const proposed = bill({
        lines: [],
        approval: approval({ proposedClassification: { debitClass: 'GOODS', expenseMappingKey: null } }),
        checks: [check('TOTALS_ADD_UP', 'FAIL', { difference: '2.00' })],
      });
      const panel = render(CLERK, proposed);
      panel.diffClass.set('FREIGHT');
      panel.diffReason.set('Delivery charge on the invoice');
      payables.getBill.mockReturnValue(
        of(bill({ ...proposed, approval: approval({ proposedClassification: { debitClass: 'GOODS', expenseMappingKey: null }, proposedDifference: { differenceClass: 'FREIGHT', justification: 'Delivery charge on the invoice' } }) })),
      );

      panel.run({ kind: 'SUBMIT', justification: 'Shop rags and gloves' });
      fixture.detectChanges();

      expect(panel.postClass()).toBe('GOODS');
      expect(panel.diffClass()).toBe('FREIGHT');
      expect(panel.diffReason()).toBe('Delivery charge on the invoice');
    });

    it('without accounting:je:view, On the books shows as text with no entry link (item 5)', () => {
      render(
        CLERK,
        bill({
          status: 'APPROVED',
          availableActions: [],
          posting: {
            journalEntryId: 'je-uuid-7',
            journalEntryReference: 'JE-202610-14',
            postingDate: '2026-10-03',
            postingDateRule: 'BILL_DATE',
            differenceClass: null,
            differenceAmount: null,
            roundingAdjustment: 0,
            reversalReference: null,
            currencyCode: 'USD',
          },
        }),
      );

      expect(q('[data-testid="panel-on-the-books"]')?.textContent).toContain('ACCOUNTING.BILLS.PANEL.ON_THE_BOOKS');
      expect(q('[data-testid="panel-entry-link"]')).toBeNull();
      expect(q('[data-testid="panel-month-closed"]')).toBeNull();
      expect(host().textContent).not.toContain('je-uuid-7');
    });
  });

  /** Re-review R3: the panel → child bindings that keep a revealed field across a retry, driven through the DOM. */
  describe('re-review R3', () => {
    const typeInto = (selector: string, value: string): void => {
      const field = q<HTMLTextAreaElement>(selector)!;
      field.value = value;
      field.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const click = (selector: string): void => {
      q<HTMLElement>(selector)!.click();
      fixture.detectChanges();
    };

    it('(a) Approve: 422 AP_BILL_TAX_ON_RESALE_GOODS without a served hold, then a 503 — the field stays and the retry resends it', () => {
      render(CLERK, awaitingBill());
      expect(q('[data-testid="approve-resale"]')).toBeNull();
      payables.approve.mockReturnValueOnce(throwError(() => apiError(422, 'AP_BILL_TAX_ON_RESALE_GOODS')));
      click('[data-testid="approve"]');

      expect(q('[data-testid="approve-resale"]')).not.toBeNull();
      typeInto('[data-testid="approve-resale-reason"]', 'Resold at cost to a fleet customer');
      payables.approve.mockReturnValueOnce(throwError(() => apiError(503, 'SERVICE_UNAVAILABLE')));
      click('[data-testid="approve"]');

      expect(q('[data-testid="approve-resale"]')).not.toBeNull();
      click('[data-testid="approve"]');
      expect(payables.approve).toHaveBeenCalledTimes(3);
      expect(payables.approve.mock.calls[1][1].taxOnResaleOverrideJustification).toBe('Resold at cost to a fleet customer');
      expect(payables.approve.mock.calls[2][1].taxOnResaleOverrideJustification).toBe('Resold at cost to a fleet customer');
    });

    it('(b) VOID_APPROVED: PERIOD_CLOSED, then LOCK_TIMEOUT — the dialog’s override input stays and the retry carries it', () => {
      render([...CLERK, 'accounting:period:override'], bill({ status: 'APPROVED', availableActions: [action('VOID_APPROVED')] }));
      document.body.appendChild(host());
      click('[data-testid="void-approved"]');
      typeInto('[data-testid="void-reason"]', 'Billed twice by mistake');
      payables.voidBill.mockReturnValueOnce(throwError(() => apiError(422, 'PERIOD_CLOSED')));
      click('[data-testid="void-confirm"]');

      expect(q('[data-testid="void-override-reason"]')).not.toBeNull();
      typeInto('[data-testid="void-override-reason"]', 'September closed before the vendor credit');
      payables.voidBill.mockReturnValueOnce(throwError(() => apiError(409, 'LOCK_TIMEOUT')));
      click('[data-testid="void-confirm"]');

      expect(q('[data-testid="void-override-reason"]')).not.toBeNull();
      click('[data-testid="void-confirm"]');
      expect(payables.voidBill).toHaveBeenCalledTimes(3);
      expect(payables.voidBill.mock.calls[1][1]).toEqual({ reason: 'Billed twice by mistake', overrideJustification: 'September closed before the vendor credit' });
      expect(payables.voidBill.mock.calls[2][1]).toEqual(payables.voidBill.mock.calls[1][1]);
      host().remove();
    });

    it('(c) Accept as billed: 422 AP_BILL_TAX_ON_RESALE_GOODS without a served hold, then a 503 — the field stays and the retry resends it', () => {
      render(CLERK, exceptionBill());
      q<HTMLInputElement>('[data-choice="ACCEPT"] input')!.click();
      fixture.detectChanges();
      typeInto('[data-testid="exception-why"]', 'Price rise agreed with vendor');
      expect(q('[data-testid="exception-resale"]')).toBeNull();
      payables.resolveException.mockReturnValueOnce(throwError(() => apiError(422, 'AP_BILL_TAX_ON_RESALE_GOODS')));
      click('[data-testid="resolve"]');

      expect(q('[data-testid="exception-resale"]')).not.toBeNull();
      typeInto('[data-testid="exception-resale-reason"]', 'Resold at cost to a fleet customer');
      payables.resolveException.mockReturnValueOnce(throwError(() => apiError(503, 'SERVICE_UNAVAILABLE')));
      click('[data-testid="resolve"]');

      expect(q('[data-testid="exception-resale"]')).not.toBeNull();
      click('[data-testid="resolve"]');
      expect(payables.resolveException).toHaveBeenCalledTimes(3);
      expect(payables.resolveException.mock.calls[1][1].taxOnResaleOverrideJustification).toBe('Resold at cost to a fleet customer');
      expect(payables.resolveException.mock.calls[2][1].taxOnResaleOverrideJustification).toBe('Resold at cost to a fleet customer');
    });

    it('a revealed classification on a goods-receipt bill keeps its interim note through a retry (unclassifiedRevealed)', () => {
      render(CLERK, awaitingBill());
      payables.approve.mockReturnValueOnce(throwError(() => apiError(422, 'AP_BILL_UNCLASSIFIED')));
      click('[data-testid="approve"]');
      click('[data-testid="classification-goods"]');
      payables.approve.mockReturnValueOnce(throwError(() => apiError(409, 'LOCK_TIMEOUT')));
      click('[data-testid="approve"]');

      expect(payables.approve).toHaveBeenCalledTimes(2);
      expect(payables.approve.mock.calls[1][1].posting.classification).toBe('GOODS');
      expect(q('[data-testid="classification-note"]')?.textContent).toContain('ACCOUNTING.BILLS.POSTING.CLASSIFICATION.EXPENSE_LATER');
    });

    it('a re-serve of the proposed FREIGHT after a reread:true refusal keeps the person’s own class and reason (item 2)', () => {
      const served = awaitingBill({
        checks: [check('TOTALS_ADD_UP', 'FAIL', { difference: '2.00' })],
        approval: approval({ proposedDifference: { differenceClass: 'FREIGHT', justification: 'Delivery charge on the invoice' } }),
      });
      const panel = render(CLERK, served);
      expect(panel.diffClass()).toBe('FREIGHT');
      panel.diffClass.set('PRICE_DIFFERENCE');
      panel.diffReason.set('Price rise agreed with vendor');
      fixture.detectChanges();
      payables.approve.mockReturnValueOnce(throwError(() => apiError(409, 'AP_BILL_NOT_APPROVABLE')));

      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });
      fixture.detectChanges();

      expect(payables.getBill).toHaveBeenCalledTimes(2);
      expect(panel.diffClass()).toBe('PRICE_DIFFERENCE');
      expect(panel.diffReason()).toBe('Price rise agreed with vendor');
    });
  });
});
