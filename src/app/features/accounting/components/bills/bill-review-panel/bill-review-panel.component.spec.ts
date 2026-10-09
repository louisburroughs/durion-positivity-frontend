import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../../../../../core/services/auth.service';
import { BillDetail } from '../../../models/payables.models';
import {
  APPROVE_ONLY,
  CLERK,
  OVER_LIMIT,
  PayablesMock,
  REJECT_ONLY,
  VIEW_ONLY,
  action,
  apiError,
  authMock,
  awaitingBill,
  bill,
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
  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(selector: string): T | null => host().querySelector<T>(selector);

  function render(held: readonly string[] | null, detail: BillDetail = bill(), billId = detail.billId): BillReviewPanelComponent {
    payables = payablesMock(detail);
    TestBed.configureTestingModule({
      imports: [BillReviewPanelComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: PayablesService, useValue: payables },
        { provide: AuthService, useValue: authMock(held, { tenantId: signal<string | null>(null) }).service },
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

  beforeEach(() => showTerms.set(false));

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
      render(CLERK, awaitingBill({ approval: { requiredTier: 'OVER_LIMIT', clerkLimit: 1000, currencyCode: 'USD', submittedAt: null, submissionJustification: null, approvalJustification: null } }));

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

      expect(payables.submitForApproval).toHaveBeenCalledWith('bill-1', 'Shop rags and gloves');
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
        action('SET_DUE_DATE'),
      ],
    });

    function attempt(panel: BillReviewPanelComponent): Record<string, boolean> {
      panel.run({ kind: 'SUBMIT', justification: 'Long enough reason' });
      panel.run({ kind: 'APPROVE', justification: null, taxOnResale: null });
      panel.run({ kind: 'REJECT', reason: 'Long enough reason' });
      panel.run({ kind: 'RESOLVE', action: 'VOID', reason: 'Long enough reason', taxOnResale: null });
      panel.run({ kind: 'DUE_DATE', dueDate: '2026-11-01', justification: null });
      return {
        submit: payables.submitForApproval.mock.calls.length > 0,
        approve: payables.approve.mock.calls.length > 0,
        reject: payables.reject.mock.calls.length > 0,
        voidException: payables.resolveException.mock.calls.length > 0,
        dueDate: payables.setDueDate.mock.calls.length > 0,
      };
    }

    function controls(): Record<string, boolean> {
      return {
        submit: !!q('[data-testid="send"]'),
        approve: !!q('[data-testid="approve"]'),
        reject: !!q('[data-testid="reject"]'),
        voidException: !!q('[data-choice="VOID"]'),
        dueDate: !!q('[data-testid="due-date-open"]'),
      };
    }

    // Every call resolves synchronously with `of`, so each run settles before the next one.
    it.each([
      ['accounting:ap:view only', VIEW_ONLY, { submit: false, approve: false, reject: false, voidException: false, dueDate: false }],
      ['accounting:ap:approve', APPROVE_ONLY, { submit: true, approve: true, reject: false, voidException: false, dueDate: true }],
      ['accounting:ap:approve_over_limit', OVER_LIMIT, { submit: true, approve: true, reject: false, voidException: false, dueDate: false }],
      ['accounting:ap:reject', REJECT_ONLY, { submit: false, approve: false, reject: true, voidException: true, dueDate: false }],
      ['unknown perm_bits (canAccess fallback)', null, { submit: true, approve: true, reject: true, voidException: true, dueDate: true }],
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

      expect(controls()).toEqual({ submit: false, approve: false, reject: false, voidException: false, dueDate: false });
      expect(attempt(panel)).toEqual({ submit: false, approve: false, reject: false, voidException: false, dueDate: false });
    });
  });
});
