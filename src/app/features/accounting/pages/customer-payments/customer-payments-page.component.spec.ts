import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JwtClaims } from '../../../../core/models/auth.models';
import {
  ApplyResult,
  AutomaticApplicationsList,
  ReceivablesTotals,
  WaitingPaymentsList,
} from '../../models/customer-payments.models';
import { CustomerPaymentsPageComponent } from './customer-payments-page.component';
import {
  NOW,
  PaymentsMocks,
  TODAY_ISO,
  applyResult,
  automaticList,
  automaticRow,
  configurePayments,
  createPaymentsMocks,
  payment,
  pending,
  waitingList,
} from './customer-payments-page.spec-helper';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe('CustomerPaymentsPageComponent (CAP:550 S6)', () => {
  let mocks: PaymentsMocks;
  let fixture: ComponentFixture<CustomerPaymentsPageComponent>;
  let component: CustomerPaymentsPageComponent;
  let host: HTMLElement;

  const CLAIMS: JwtClaims = { sub: 'clerk.ana', tid: 'tenant-a', exp: 4102444800 };
  const tenant = signal<string | null>('tenant-a');

  let now = new Date(NOW.getTime());

  function render(): void {
    configurePayments(mocks, { tenantId: tenant }, () => new Date(now.getTime()));
    fixture = TestBed.createComponent(CustomerPaymentsPageComponent);
    component = fixture.componentInstance;
    host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    fixture.detectChanges();
  }

  const q = (selector: string): HTMLElement | null => host.querySelector<HTMLElement>(selector);
  const qa = (selector: string): HTMLElement[] => Array.from(host.querySelectorAll<HTMLElement>(selector));
  const text = (selector: string): string => q(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const click = (selector: string): void => {
    q(selector)!.click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    mocks = createPaymentsMocks();
    mocks.claims.set(CLAIMS);
    tenant.set('tenant-a');
    now = new Date(NOW.getTime());
  });

  afterEach(() => {
    host?.remove();
  });

  describe('header, cards and the list (§5.3 items 1–3)', () => {
    it('reads the list, the aging as of today and this week’s automatic matches, and renders the served cards', () => {
      render();

      expect(component.state()).toBe('ready');
      expect(mocks.service.waitingPayments).toHaveBeenCalledTimes(1);
      expect(mocks.service.receivablesTotals).toHaveBeenCalledWith(TODAY_ISO);
      const since = new Date(mocks.service.automaticApplications.mock.calls[0][0]);
      expect([since.getFullYear(), since.getMonth(), since.getDate(), since.getHours()]).toEqual([2026, 8, 29, 0]);
      expect(text('h1')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.TITLE');
      expect(qa('.payments__steps li').length).toBe(4);
      expect(text('[data-testid="card-owed"] .stat-card__figure')).toBe('$18,240.50');
      expect(text('[data-testid="card-overdue"] .stat-card__figure')).toBe('$7,240.25');
      expect(text('[data-testid="card-waiting"] .stat-card__figure')).toBe('$600.00');
      expect(q('[data-testid="card-owed"] app-help-disclosure')).not.toBeNull();
      expect(q('[data-testid="who-owes-what"]')?.getAttribute('href')).toBe('/app/accounting/books?tab=owed');
    });

    it('renders no card whose figure is not served (Spec discrepancy 2)', () => {
      mocks.service.receivablesTotals.mockReturnValue(
        of({ asOfDate: TODAY_ISO, generatedAt: null, totalOutstanding: 100, overdue: null }),
      );
      mocks.service.waitingPayments.mockReturnValue(of(waitingList([payment()], { totalUnapplied: null })));
      render();

      expect(q('[data-testid="card-owed"]')).not.toBeNull();
      expect(q('[data-testid="card-overdue"]')).toBeNull();
      expect(q('[data-testid="card-waiting"]')).toBeNull();
    });

    it('lists each payment as an aria-pressed button with name, method · date, amount and its badge', () => {
      mocks.service.waitingPayments.mockReturnValue(
        of(
          waitingList([
            payment(),
            payment({
              paymentId: 'pay-2',
              customerName: 'Ana Ruiz',
              sourceInvoiceId: 'inv-old',
              sourceInvoiceNumber: 'INV-2026-01600',
              reasons: ['SAME_CUSTOMER'],
              suggestedInvoices: [],
            }),
            payment({ paymentId: 'pay-3', customerName: null, reasons: [], suggestedInvoices: [] }),
          ]),
        ),
      );
      render();

      const items = qa('[data-testid="payment-item"]');
      expect(items.length).toBe(3);
      expect(items.every(item => item.tagName === 'BUTTON' && item.getAttribute('aria-pressed') === 'false')).toBe(true);
      expect(items[0].querySelector('[data-testid="badge-suggested"]')?.textContent?.trim()).toBe(
        'ACCOUNTING.CUSTOMER_PAYMENTS.LIST.SUGGESTED',
      );
      expect(items[1].querySelector('[data-testid="badge-duplicate"]')?.textContent?.trim()).toBe(
        'ACCOUNTING.CUSTOMER_PAYMENTS.DUPLICATE.BADGE',
      );
      expect(items[2].querySelector('.status-badge')).toBeNull();
      expect(items[2].textContent).toContain('ACCOUNTING.CUSTOMER_PAYMENTS.LIST.NO_NAME');
      expect(items[0].textContent).toContain('ACCOUNTING.CUSTOMER_PAYMENTS.METHOD.CARD');
      expect(items[0].textContent).toContain('$600.00');
    });

    it('says nothing is waiting when the list is empty', () => {
      mocks.service.waitingPayments.mockReturnValue(of(waitingList([])));
      render();
      expect(text('[data-testid="payments-empty"]')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.LIST.EMPTY');
    });

    it('says when the bounded read did not reach every payment', () => {
      mocks.service.waitingPayments.mockReturnValue(of(waitingList([payment()], { truncated: true, waitingCount: 1200 })));
      render();
      expect(q('[data-testid="payments-truncated"]')).not.toBeNull();
    });
  });

  describe('read outcomes (ADR-0031, ADR-0064)', () => {
    it('goes to error with Retry when the list fails for a reason other than authorization', () => {
      mocks.service.waitingPayments.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
      render();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.LOAD');
      click('[data-testid="page-error"] button');
      expect(component.state()).toBe('ready');
      expect(qa('[data-testid="payment-item"]').length).toBe(1);
    });

    it('names the permission on a refused list and never calls it a connection problem', () => {
      mocks.service.waitingPayments.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
      render();

      expect(component.state()).toBe('ready');
      expect(q('[data-testid="page-error"]')).toBeNull();
      expect(text('[data-testid="payments-denied"]')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.REGION.DENIED');
      component.refresh();
      expect(mocks.service.waitingPayments).toHaveBeenCalledTimes(1);
    });

    it('stops rendering kept figures once a re-read is refused (ADR-0064 §6)', () => {
      render();
      mocks.service.receivablesTotals.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
      component.retryReceivables();
      fixture.detectChanges();

      expect(q('[data-testid="card-owed"]')).toBeNull();
      expect(q('[data-testid="cards-denied"]')).not.toBeNull();
    });

    it('shows no cards and reads no aging without reporting:view:financial-statements', () => {
      mocks.held.set(['accounting:payment:apply']);
      render();
      expect(mocks.service.receivablesTotals).not.toHaveBeenCalled();
      expect(q('[data-testid="card-owed"]')).toBeNull();
      expect(q('[data-testid="who-owes-what"]')).toBeNull();
    });

    it('clears everything and re-reads for another tenant (ADR-0063 §7)', () => {
      render();
      click('[data-testid="payment-item"]');
      expect(component.selected()).not.toBeNull();

      tenant.set('tenant-b');
      fixture.detectChanges();

      expect(component.selected()).toBeNull();
      expect(mocks.service.waitingPayments).toHaveBeenCalledTimes(2);
    });
  });

  describe('a refused list re-read (ADR-0064 §6)', () => {
    it('stops rendering the selected payment’s panel once the list is refused', () => {
      render();
      click('[data-testid="payment-item"]');
      expect(q('app-payment-match')).not.toBeNull();

      mocks.service.waitingPayments.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
      component.retryPayments();
      fixture.detectChanges();

      expect(component.selected()).toBeNull();
      expect(q('app-payment-match')).toBeNull();
      expect(q('[data-testid="payments-denied"]')).not.toBeNull();
    });

    it('drops even a panel that holds a result', () => {
      render();
      click('[data-testid="payment-item"]');
      click('[data-testid="apply"]');
      expect(q('[data-testid="match-result"]')).not.toBeNull();

      mocks.service.waitingPayments.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
      component.retryPayments();
      fixture.detectChanges();
      expect(q('app-payment-match')).toBeNull();
    });
  });

  describe('local midnight (ADR-0038 §6)', () => {
    it('re-reads the aging and the automatic window for the new day when a retry runs past midnight', () => {
      render();
      expect(q('[data-testid="card-owed"]')).not.toBeNull();
      now = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 1, 0, 5);
      const tomorrow = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      component.retryPayments();
      fixture.detectChanges();

      expect(mocks.service.receivablesTotals).toHaveBeenLastCalledWith(tomorrow);
      const since = new Date(mocks.service.automaticApplications.mock.lastCall![0]);
      expect([since.getMonth(), since.getDate(), since.getHours()]).toEqual([8, 30, 0]);
      expect(q('[data-testid="card-owed"]')).not.toBeNull();
      expect(q('[data-testid="automatic-row"]')).not.toBeNull();
    });

    it('reads each date-keyed section once per retry, past midnight or not', () => {
      render();
      const automaticReads = mocks.service.automaticApplications.mock.calls.length;
      const agingReads = mocks.service.receivablesTotals.mock.calls.length;

      component.retryAutomatic();
      component.retryReceivables();
      expect(mocks.service.automaticApplications.mock.calls.length).toBe(automaticReads + 1);
      expect(mocks.service.receivablesTotals.mock.calls.length).toBe(agingReads + 1);

      now = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 1, 0, 5);
      component.retryAutomatic();
      // The day changed: advanceToday read both for the new day; neither retry reads again.
      expect(mocks.service.automaticApplications.mock.calls.length).toBe(automaticReads + 2);
      expect(mocks.service.receivablesTotals.mock.calls.length).toBe(agingReads + 2);
      component.retryReceivables();
      expect(mocks.service.receivablesTotals.mock.calls.length).toBe(agingReads + 3);
    });

    it('reads the automatic window once after an Undo past midnight', () => {
      render();
      (q('[data-testid="automatic"]') as HTMLDetailsElement).open = true;
      fixture.detectChanges();
      click('[data-testid="undo"]');
      const field = q('[data-testid="undo-reason"]') as HTMLTextAreaElement;
      field.value = 'Customer paid the wrong invoice';
      field.dispatchEvent(new Event('input'));
      now = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 1, 0, 5);
      const reads = mocks.service.automaticApplications.mock.calls.length;

      click('[data-testid="undo-confirm"]');

      expect(mocks.service.automaticApplications.mock.calls.length).toBe(reads + 1);
    });

    it('re-reads the date-keyed sections after a write past midnight', () => {
      render();
      click('[data-testid="payment-item"]');
      now = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 1, 0, 5);
      const automaticReads = mocks.service.automaticApplications.mock.calls.length;
      const agingReads = mocks.service.receivablesTotals.mock.calls.length;

      click('[data-testid="apply"]');

      expect(mocks.service.automaticApplications.mock.calls.length).toBe(automaticReads + 1);
      expect(mocks.service.receivablesTotals.mock.calls.length).toBe(agingReads + 1);
      expect(q('[data-testid="card-owed"]')).not.toBeNull();
    });
  });

  describe('identity changes (ADR-0063 §7)', () => {
    it('never paints tenant A’s late list, aging or automatic answers after a switch to B', () => {
      const list = pending<WaitingPaymentsList>();
      const aging = pending<ReceivablesTotals>();
      const automatic = pending<AutomaticApplicationsList>();
      mocks.service.waitingPayments.mockReturnValueOnce(list);
      mocks.service.receivablesTotals.mockReturnValueOnce(aging);
      mocks.service.automaticApplications.mockReturnValueOnce(automatic);
      render();

      mocks.claims.set({ ...CLAIMS, tid: 'tenant-b' });
      tenant.set('tenant-b');
      fixture.detectChanges();
      list.next(waitingList([payment({ paymentId: 'a-only', customerName: 'Tenant A customer' })]));
      aging.next({ asOfDate: TODAY_ISO, generatedAt: null, totalOutstanding: 999999, overdue: 1 });
      automatic.next(automaticList([automaticRow({ customerName: 'Tenant A automatic' })]));
      fixture.detectChanges();

      expect(host.textContent).not.toContain('Tenant A customer');
      expect(host.textContent).not.toContain('Tenant A automatic');
      expect(host.textContent).not.toContain('$999,999.00');
      expect(qa('[data-testid="payment-item"]').length).toBe(1);
      expect(text('[data-testid="card-owed"] .stat-card__figure')).toBe('$18,240.50');
    });

    it('A→B→A: only the read issued last for A paints', () => {
      const first = pending<WaitingPaymentsList>();
      const third = pending<WaitingPaymentsList>();
      mocks.service.waitingPayments.mockReturnValueOnce(first).mockReturnValueOnce(of(waitingList([]))).mockReturnValueOnce(third);
      render();
      tenant.set('tenant-b');
      fixture.detectChanges();
      tenant.set('tenant-a');
      fixture.detectChanges();

      first.next(waitingList([payment({ customerName: 'Stale A' })]));
      fixture.detectChanges();
      expect(host.textContent).not.toContain('Stale A');

      third.next(waitingList([payment({ customerName: 'Fresh A' })]));
      fixture.detectChanges();
      expect(host.textContent).toContain('Fresh A');
    });

    it('drops an Undo in flight across the switch: no announcement, no re-read for the old tenant', () => {
      const answer = pending<void>();
      mocks.service.reverseApplication.mockReturnValue(answer);
      render();
      (q('[data-testid="automatic"]') as HTMLDetailsElement).open = true;
      click('[data-testid="undo"]');
      const field = q('[data-testid="undo-reason"]') as HTMLTextAreaElement;
      field.value = 'Customer paid the wrong invoice';
      field.dispatchEvent(new Event('input'));
      click('[data-testid="undo-confirm"]');

      tenant.set('tenant-b');
      fixture.detectChanges();
      const reads = mocks.service.automaticApplications.mock.calls.length;
      answer.next();
      answer.complete();
      fixture.detectChanges();

      expect(q('[data-testid="undo-dialog"]')).toBeNull();
      expect(component.announcement()).toBeNull();
      expect(component.undoing()).toBe(false);
      expect(mocks.service.automaticApplications.mock.calls.length).toBe(reads);
    });
  });

  describe('selecting a payment (§5.3 item 4)', () => {
    it('releases the payment when its apply is refused (400): the re-read without it closes the panel (ADR-0063 §1)', async () => {
      mocks.service.applyPayment.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 400, error: { code: 'VALIDATION_ERROR', message: 'x' } })),
      );
      render();
      click('[data-testid="payment-item"]');
      mocks.service.waitingPayments.mockReturnValue(of(waitingList([payment({ paymentId: 'pay-2' })])));

      click('[data-testid="apply"]');
      await fixture.whenStable();

      expect(component.selected()).toBeNull();
      expect(q('app-payment-match')).toBeNull();
      expect(document.activeElement?.id).toBe('payments-list-heading');
    });

    it('keeps the payment selected while its apply is in flight, even when a re-read drops it', () => {
      const answer = pending<ApplyResult>();
      mocks.service.applyPayment.mockReturnValue(answer);
      render();
      click('[data-testid="payment-item"]');
      click('[data-testid="apply"]');

      mocks.service.waitingPayments.mockReturnValue(of(waitingList([])));
      component.refresh();
      fixture.detectChanges();
      expect(component.selected()?.paymentId).toBe('pay-1');

      answer.next(applyResult());
      fixture.detectChanges();
      expect(q('[data-testid="match-result"]')).not.toBeNull();
    });

    it('opens the match panel for the pressed payment', () => {
      render();
      click('[data-testid="payment-item"]');

      expect(q('[data-testid="payment-item"]')?.getAttribute('aria-pressed')).toBe('true');
      expect(q('app-payment-match')).not.toBeNull();
      expect(mocks.service.openInvoices).toHaveBeenCalledWith('cust-1');
    });

    it('preselects the payment named by ?paymentId= (S4’s home link)', () => {
      mocks.queryParams.next({ paymentId: 'pay-1' });
      render();
      expect(component.selected()?.paymentId).toBe('pay-1');
      expect(q('[data-testid="payment-item"]')?.getAttribute('aria-pressed')).toBe('true');
    });

    it('says when ?paymentId= names a payment that is no longer waiting', () => {
      mocks.queryParams.next({ paymentId: 'pay-gone' });
      render();
      expect(component.selected()).toBeNull();
      expect(q('[data-testid="query-not-waiting"]')).not.toBeNull();
    });

    it('keeps the result on screen after the applied payment leaves the list, and re-reads list and cards', () => {
      render();
      click('[data-testid="payment-item"]');
      mocks.service.waitingPayments.mockReturnValue(of(waitingList([])));

      click('[data-testid="apply"]');

      expect(mocks.service.applyPayment).toHaveBeenCalledTimes(1);
      expect(mocks.service.waitingPayments).toHaveBeenCalledTimes(2);
      expect(mocks.service.receivablesTotals).toHaveBeenCalledTimes(2);
      expect(qa('[data-testid="payment-item"]').length).toBe(0);
      expect(q('[data-testid="match-result"]')).not.toBeNull();
      expect(text('[data-testid="announcement"]')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.RESULT.ANNOUNCE_APPLIED');
    });

    it('clears a selection whose payment left the list while still being edited, and focuses the list heading', async () => {
      const later = pending<WaitingPaymentsList>();
      render();
      click('[data-testid="payment-item"]');
      mocks.service.waitingPayments.mockReturnValue(later);
      component.refresh();
      later.next(waitingList([payment({ paymentId: 'pay-2' })]));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.selected()).toBeNull();
      expect(document.activeElement?.id).toBe('payments-list-heading');
    });

    it('updates the selected payment from the re-read row without discarding the draft', () => {
      render();
      click('[data-testid="payment-item"]');
      mocks.service.waitingPayments.mockReturnValue(of(waitingList([payment({ unappliedAmount: 550 })])));
      component.refresh();
      fixture.detectChanges();

      expect(component.selected()?.unappliedAmount).toBe(550);
      expect(mocks.service.openInvoices).toHaveBeenCalledTimes(1);
    });
  });

  describe('Matched automatically this week: Undo (AC 6, AC 7)', () => {
    function openUndo(): void {
      (q('[data-testid="automatic"]') as HTMLDetailsElement).open = true;
      click('[data-testid="undo"]');
    }

    function typeReason(value: string): void {
      const field = q('[data-testid="undo-reason"]') as HTMLTextAreaElement;
      field.value = value;
      field.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    it('reverses once with a reason of at least 10 characters, and the payment reappears under Payments waiting', async () => {
      render();
      openUndo();
      const dialog = q('[data-testid="undo-dialog"]') as HTMLDialogElement;
      expect(dialog.matches(':modal')).toBe(true);

      typeReason('too short');
      click('[data-testid="undo-confirm"]');
      expect(mocks.service.reverseApplication).not.toHaveBeenCalled();
      expect(q('[data-testid="undo-confirm"]')?.getAttribute('aria-disabled')).toBe('true');

      mocks.service.waitingPayments.mockReturnValue(
        of(waitingList([payment(), payment({ paymentId: 'pay-7', customerName: 'Ana Ruiz' })])),
      );
      mocks.service.automaticApplications.mockReturnValue(of(automaticList([automaticRow({ reversed: true, undoOffered: false })])));
      typeReason('Customer paid the wrong invoice');
      click('[data-testid="undo-confirm"]');
      await fixture.whenStable();

      expect(mocks.service.reverseApplication).toHaveBeenCalledTimes(1);
      expect(mocks.service.reverseApplication).toHaveBeenCalledWith('app-1', 'Customer paid the wrong invoice');
      expect(q('[data-testid="undo-dialog"]')).toBeNull();
      expect(qa('[data-testid="payment-item"]').map(item => item.textContent)).toEqual([
        expect.stringContaining('Harbor Fleet Services'),
        expect.stringContaining('Ana Ruiz'),
      ]);
      expect(q('[data-testid="automatic-undone"]')).not.toBeNull();
      expect(text('[data-testid="announcement"]')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.AUTOMATIC.UNDONE');
      expect(document.activeElement?.id).toBe('automatic-heading');
    });

    it('sends one reversal for a double click while it is in flight', () => {
      const answer = pending<void>();
      mocks.service.reverseApplication.mockReturnValue(answer);
      render();
      openUndo();
      typeReason('Customer paid the wrong invoice');
      click('[data-testid="undo-confirm"]');
      click('[data-testid="undo-confirm"]');

      expect(mocks.service.reverseApplication).toHaveBeenCalledTimes(1);
      expect(q('[data-testid="undo-confirm"]')?.getAttribute('aria-disabled')).toBe('true');
    });

    it('retires the attempt on an unknown outcome so it can never be sent twice, and re-reads (Copilot)', async () => {
      mocks.service.reverseApplication.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 504 })));
      render();
      openUndo();
      typeReason('Customer paid the wrong invoice');
      const reads = mocks.service.automaticApplications.mock.calls.length;
      click('[data-testid="undo-confirm"]');
      await fixture.whenStable();

      expect(q('[data-testid="undo-dialog"]')).toBeNull();
      expect(component.undoTarget()).toBeNull();
      expect(text('[data-testid="announcement"]')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.AUTOMATIC.ERROR.UNKNOWN');
      expect(mocks.service.automaticApplications.mock.calls.length).toBe(reads + 1);
      component.confirmUndo();
      expect(mocks.service.reverseApplication).toHaveBeenCalledTimes(1);
      expect(document.activeElement?.id).toBe('automatic-heading');
    });

    it('explains WHOLE_REQUEST_REVERSAL_REQUIRED in the dialog', () => {
      mocks.service.reverseApplication.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 422,
              error: { code: 'WHOLE_REQUEST_REVERSAL_REQUIRED', message: 'x' },
            }),
        ),
      );
      render();
      openUndo();
      typeReason('Customer paid the wrong invoice');
      click('[data-testid="undo-confirm"]');

      expect(text('[data-testid="undo-error"]')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.AUTOMATIC.ERROR.WHOLE_REQUEST');
      expect(q('[data-testid="undo-error"]')?.getAttribute('role')).toBe('alert');
    });

    it('names accounting:payment:reverse on a refused undo', () => {
      mocks.service.reverseApplication.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
      render();
      openUndo();
      typeReason('Customer paid the wrong invoice');
      click('[data-testid="undo-confirm"]');

      expect(component.undoErrorKey()).toEqual({
        key: 'ACCOUNTING.CUSTOMER_PAYMENTS.AUTOMATIC.ERROR.FORBIDDEN',
        params: { permission: 'accounting:payment:reverse' },
      });
    });

    it('has no Undo without accounting:payment:reverse, and the handlers refuse', () => {
      mocks.held.set(['accounting:payment:apply']);
      render();
      (q('[data-testid="automatic"]') as HTMLDetailsElement).open = true;
      fixture.detectChanges();

      expect(q('[data-testid="automatic-row"]')).not.toBeNull();
      expect(q('[data-testid="undo"]')).toBeNull();
      component.openUndo(automaticRow());
      expect(component.undoTarget()).toBeNull();
      component.undoTarget.set(automaticRow());
      component.undoReason.set('Customer paid the wrong invoice');
      component.confirmUndo();
      expect(mocks.service.reverseApplication).not.toHaveBeenCalled();
    });

    it('offers no Undo on a row the server does not offer it for', () => {
      mocks.service.automaticApplications.mockReturnValue(of(automaticList([automaticRow({ undoOffered: false })])));
      render();
      expect(q('[data-testid="undo"]')).toBeNull();
    });

    it('names the Undo button by its visible text first, then the invoice (Label in Name)', () => {
      render();
      const undo = q('[data-testid="undo"]')!;
      expect(undo.hasAttribute('aria-label')).toBe(false);
      expect(undo.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        'ACCOUNTING.CUSTOMER_PAYMENTS.AUTOMATIC.UNDO ACCOUNTING.CUSTOMER_PAYMENTS.AUTOMATIC.UNDO_CONTEXT',
      );
      expect(undo.querySelector('.sr-only')).not.toBeNull();
    });
  });

  describe('P8', () => {
    it('renders no UUID in text or accessible names (AC 12)', () => {
      const id = '018f2a6e-0000-7000-8000-000000000001';
      mocks.service.waitingPayments.mockReturnValue(
        of(waitingList([payment({ paymentId: id, customerId: id, sourceInvoiceId: id })])),
      );
      mocks.service.automaticApplications.mockReturnValue(
        of(automaticList([automaticRow({ applicationId: id, paymentId: id })])),
      );
      mocks.service.applyPayment.mockReturnValue(
        of(applyResult({ lines: [{ invoiceId: id, appliedAmount: 600, balanceAfter: 0 }] })),
      );
      mocks.queryParams.next({ paymentId: id });
      render();
      (q('[data-testid="automatic"]') as HTMLDetailsElement).open = true;
      fixture.detectChanges();

      expect(host.textContent ?? '').not.toMatch(UUID);
      for (const element of qa('[aria-label]')) expect(element.getAttribute('aria-label') ?? '').not.toMatch(UUID);
    });
  });
});
