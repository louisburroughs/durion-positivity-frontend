import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocaleService } from '../../../../core/services/locale.service';
import { ApplyResult, OpenInvoicesList, RemainderCredit, WaitingPayment } from '../../models/customer-payments.models';
import {
  PaymentsMocks,
  applyResult,
  configurePayments,
  createPaymentsMocks,
  invoice,
  openInvoices,
  payment,
  pending,
  remainderCredit,
} from '../../pages/customer-payments/customer-payments-page.spec-helper';
import { MatchMessage, PaymentApplied, PaymentMatchComponent } from './payment-match.component';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const httpError = (status: number, code?: string): HttpErrorResponse =>
  new HttpErrorResponse({ status, error: code ? { code, message: code } : null });

describe('PaymentMatchComponent (CAP:550 S6 match panel)', () => {
  let mocks: PaymentsMocks;
  let fixture: ComponentFixture<PaymentMatchComponent>;
  let component: PaymentMatchComponent;
  let host: HTMLElement;
  let applied: PaymentApplied[];
  let changed: number;
  let announced: MatchMessage[];

  function render(selected: WaitingPayment = payment()): void {
    configurePayments(mocks, { tenantId: signal<string | null>('tenant-a') });
    fixture = TestBed.createComponent(PaymentMatchComponent);
    component = fixture.componentInstance;
    host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    applied = [];
    changed = 0;
    announced = [];
    component.applied.subscribe(event => applied.push(event));
    component.changed.subscribe(() => changed++);
    component.announce.subscribe(message => announced.push(message));
    fixture.componentRef.setInput('payment', selected);
    fixture.detectChanges();
  }

  const q = (selector: string): HTMLElement | null => host.querySelector<HTMLElement>(selector);
  const qa = (selector: string): HTMLElement[] => Array.from(host.querySelectorAll<HTMLElement>(selector));
  const text = (selector: string): string => q(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const row = (number: string): HTMLElement => q(`li[data-invoice="${number}"]`)!;
  const tick = (number: string): HTMLInputElement => row(number).querySelector<HTMLInputElement>('[data-testid="invoice-tick"]')!;
  const amountField = (number: string): HTMLInputElement =>
    row(number).querySelector<HTMLInputElement>('[data-testid="invoice-amount"]')!;
  const setTick = (number: string, value: boolean): void => {
    const box = tick(number);
    box.checked = value;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const type = (number: string, value: string): void => {
    const field = amountField(number);
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const click = (selector: string): void => {
    q(selector)!.click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    mocks = createPaymentsMocks();
  });

  afterEach(() => {
    host?.remove();
  });

  describe('suggestions and the preview (AC 1, P7)', () => {
    it('ticks both suggested invoices with the suggested amounts; unticking one updates Applying and Left over', () => {
      render();

      expect(mocks.service.openInvoices).toHaveBeenCalledWith('cust-1');
      expect(tick('INV-2026-01701').checked).toBe(true);
      expect(tick('INV-2026-01702').checked).toBe(true);
      expect(tick('INV-2026-01710').checked).toBe(false);
      expect(amountField('INV-2026-01701').value).toBe('250.00');
      expect(amountField('INV-2026-01702').value).toBe('350.00');
      expect(qa('[data-testid="badge-suggested"]').length).toBe(2);
      expect(text('[data-testid="preview-applying"]')).toBe('$600.00');
      expect(text('[data-testid="preview-left-over"]')).toBe('$0.00');

      setTick('INV-2026-01702', false);

      expect(component.tickedCount()).toBe(1);
      expect(text('[data-testid="preview-applying"]')).toBe('$250.00');
      expect(text('[data-testid="preview-left-over"]')).toBe('$350.00');
    });

    it('ticks a non-suggested invoice with its still-owed amount', () => {
      render();
      setTick('INV-2026-01702', false);
      setTick('INV-2026-01710', true);

      expect(amountField('INV-2026-01710').value).toBe('900.00');
    });

    it('sums typed amounts in minor units, a comma decimal included (fr-CA "1,5")', () => {
      render();
      TestBed.inject(LocaleService).currentLocale.set('fr-CA');
      type('INV-2026-01701', '0,1');
      type('INV-2026-01702', '0,2');

      expect(component.applyingMinor()).toBe(30);
      expect(component.leftOverMinor()).toBe(60000 - 30);

      type('INV-2026-01701', '1,5');
      expect(component.applyingMinor()).toBe(150 + 20);
    });

    it('pre-fills amounts with the locale’s decimal sign', () => {
      mocks.held.set(['accounting:payment:apply']);
      configurePayments(mocks, { tenantId: signal<string | null>('tenant-a') });
      TestBed.inject(LocaleService).currentLocale.set('fr-CA');
      fixture = TestBed.createComponent(PaymentMatchComponent);
      host = fixture.nativeElement as HTMLElement;
      fixture.componentRef.setInput('payment', payment());
      fixture.detectChanges();

      expect(amountField('INV-2026-01701').value).toBe('250,00');
    });

    it('labels each amount field with its invoice number and each checkbox by the number', () => {
      render();
      const field = amountField('INV-2026-01701');
      expect(host.querySelector(`label[for="${field.id}"]`)?.textContent?.trim()).toBe(
        'ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.AMOUNT_LABEL',
      );
      expect(field.getAttribute('inputmode')).toBe('decimal');
      expect(field.type).toBe('text');
      const box = tick('INV-2026-01701');
      expect(host.querySelector(`label[for="${box.id}"]`)?.textContent?.trim()).toBe('INV-2026-01701');
    });

    it('narrows the list by invoice number and keeps ticked invoices in view', () => {
      render();
      const filter = q('[data-testid="invoice-filter"]') as HTMLInputElement;
      filter.value = '01710';
      filter.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(qa('li[data-invoice]').map(li => li.getAttribute('data-invoice'))).toEqual([
        'INV-2026-01701',
        'INV-2026-01702',
        'INV-2026-01710',
      ]);
      setTick('INV-2026-01702', false);
      expect(qa('li[data-invoice]').map(li => li.getAttribute('data-invoice'))).toEqual(['INV-2026-01701', 'INV-2026-01710']);
    });
  });

  describe('refusing what the backend would not take (AC 2, §4.4 item 5)', () => {
    it('disables Apply and names the excess in role="alert" when typed amounts exceed the payment', () => {
      render();
      setTick('INV-2026-01710', true);

      expect(component.overMinor()).toBe(90000);
      expect(q('[data-testid="over-alert"]')?.getAttribute('role')).toBe('alert');
      expect(text('[data-testid="over-alert"]')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.PREVIEW.OVER_APPLIED');
      expect(q('[data-testid="apply"]')?.getAttribute('aria-disabled')).toBe('true');

      click('[data-testid="apply"]');
      expect(mocks.service.applyPayment).not.toHaveBeenCalled();
    });

    it('shows a field error for an amount above the invoice’s still-owed and holds Apply', () => {
      render(payment({ unappliedAmount: 1000, totalAmount: 1000 }));
      type('INV-2026-01701', '250.01');

      const error = row('INV-2026-01701').querySelector('[data-testid="amount-error"]');
      expect(error?.textContent?.trim()).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.ERROR_AMOUNT_OVER_BALANCE');
      expect(amountField('INV-2026-01701').getAttribute('aria-invalid')).toBe('true');
      expect(amountField('INV-2026-01701').getAttribute('aria-describedby')).toBe(error?.id);
      expect(component.applyEnabled()).toBe(false);
    });

    it('refuses non-amounts, three decimals and zero', () => {
      render();
      type('INV-2026-01701', 'abc');
      expect(text('li[data-invoice="INV-2026-01701"] [data-testid="amount-error"]')).toBe(
        'ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.ERROR_AMOUNT_INVALID',
      );
      type('INV-2026-01701', '10.005');
      expect(text('li[data-invoice="INV-2026-01701"] [data-testid="amount-error"]')).toBe(
        'ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.ERROR_AMOUNT_PRECISION',
      );
      type('INV-2026-01701', '0');
      expect(text('li[data-invoice="INV-2026-01701"] [data-testid="amount-error"]')).toBe(
        'ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.ERROR_AMOUNT_MINIMUM',
      );
      expect(component.applyEnabled()).toBe(false);
    });

    it('holds Apply with nothing ticked', () => {
      render();
      setTick('INV-2026-01701', false);
      setTick('INV-2026-01702', false);
      expect(component.applyEnabled()).toBe(false);
    });
  });

  describe('the request key (AC 3, §8.2)', () => {
    it('sends one request for a double click, with a UUIDv7 key and the ticked lines', () => {
      const answer = pending<ApplyResult>();
      mocks.service.applyPayment.mockReturnValue(answer);
      render();

      click('[data-testid="apply"]');
      click('[data-testid="apply"]');

      expect(mocks.service.applyPayment).toHaveBeenCalledTimes(1);
      const [paymentId, key, lines] = mocks.service.applyPayment.mock.calls[0];
      expect(paymentId).toBe('pay-1');
      expect(key).toMatch(UUID_V7);
      expect(lines).toEqual([
        { invoiceId: 'inv-1', amount: 250 },
        { invoiceId: 'inv-2', amount: 350 },
      ]);
      expect(qa('[data-testid="invoice-tick"]').every(box => (box as HTMLInputElement).disabled)).toBe(true);
    });

    it('retries a timeout with the same key and the same lines, and the replay lands once', () => {
      mocks.service.applyPayment.mockReturnValueOnce(throwError(() => httpError(0)));
      render();
      click('[data-testid="apply"]');

      expect(component.phase()).toBe('unknown');
      expect(text('[data-testid="match-message"]')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.APPLY_UNKNOWN');
      expect(q('[data-testid="apply"]')).toBeNull();
      expect(amountField('INV-2026-01701').disabled).toBe(true);

      mocks.service.applyPayment.mockReturnValueOnce(throwError(() => httpError(503)));
      click('[data-testid="retry-apply"]');
      click('[data-testid="retry-apply"]');

      const keys = mocks.service.applyPayment.mock.calls.map(call => call[1]);
      expect(keys.length).toBe(3);
      expect(new Set(keys).size).toBe(1);
      expect(mocks.service.applyPayment.mock.calls[2][2]).toEqual(mocks.service.applyPayment.mock.calls[0][2]);
      expect(component.result()).not.toBeNull();
      expect(applied).toEqual([{ paymentId: 'pay-1' }]);
    });

    it('rotates the key after a confirmed success', () => {
      render();
      const before = component.currentApplicationRequestId();
      click('[data-testid="apply"]');
      expect(component.currentApplicationRequestId()).not.toBe(before);
    });

    it('rotates the key and restores the suggestions on Start over', () => {
      render();
      setTick('INV-2026-01701', false);
      const before = component.currentApplicationRequestId();

      click('[data-testid="start-over"]');

      expect(component.currentApplicationRequestId()).not.toBe(before);
      expect(tick('INV-2026-01701').checked).toBe(true);
      expect(mocks.service.openInvoices).toHaveBeenCalledTimes(2);
    });

    it('rotates the key and discards the draft when another payment is selected', () => {
      render();
      setTick('INV-2026-01701', false);
      const before = component.currentApplicationRequestId();

      fixture.componentRef.setInput('payment', payment({ paymentId: 'pay-2', customerId: 'cust-2' }));
      fixture.detectChanges();

      expect(component.currentApplicationRequestId()).not.toBe(before);
      expect(mocks.service.openInvoices).toHaveBeenLastCalledWith('cust-2');
      expect(tick('INV-2026-01701').checked).toBe(true);
    });

    it('keeps the key and the draft when the same payment is re-read', () => {
      render();
      setTick('INV-2026-01701', false);
      const before = component.currentApplicationRequestId();

      fixture.componentRef.setInput('payment', payment({ unappliedAmount: 600 }));
      fixture.detectChanges();

      expect(component.currentApplicationRequestId()).toBe(before);
      expect(tick('INV-2026-01701').checked).toBe(false);
    });
  });

  describe('a successful apply (AC 4, P7)', () => {
    it('replaces the preview with the server’s applied amounts and balances after, and focuses the result', async () => {
      mocks.service.applyPayment.mockReturnValue(
        of(
          applyResult({
            appliedAmount: 500,
            remainingAmount: 100,
            lines: [
              { invoiceId: 'inv-1', appliedAmount: 250, balanceAfter: 0 },
              { invoiceId: 'inv-2', appliedAmount: 250, balanceAfter: 100 },
            ],
          }),
        ),
      );
      render(payment({ leftOver: null }));
      type('INV-2026-01702', '250');
      click('[data-testid="apply"]');
      await fixture.whenStable();

      expect(q('[data-testid="preview"]')).toBeNull();
      expect(
        qa('[data-testid="result-line"]').map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim()).join(' ')),
      ).toEqual([
        'INV-2026-01701 $250.00 $0.00',
        'INV-2026-01702 $250.00 $100.00',
      ]);
      expect(text('[data-testid="result-remaining"]')).toBe('$100.00');
      expect(document.activeElement?.textContent?.trim()).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.RESULT.HEADING');
      expect(applied).toEqual([{ paymentId: 'pay-1' }]);
      expect(announced.at(-1)?.key).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.RESULT.ANNOUNCE_APPLIED');
      expect(announced.at(-1)?.params['amount']).toBe('$500.00');
      // Walk-in: no remainder credit is ever asked for.
      expect(mocks.service.creditRemainder).not.toHaveBeenCalled();
      expect(mocks.service.openInvoices).toHaveBeenCalledTimes(2);
    });
  });

  describe('left over: keep as credit or refund (AC 5, S35)', () => {
    function leaveHundred(): void {
      type('INV-2026-01702', '250');
    }

    it('keeps the left-over as credit by default, with the served remainder and its own key', () => {
      mocks.service.applyPayment.mockReturnValue(of(applyResult({ appliedAmount: 500, remainingAmount: 100 })));
      render();
      leaveHundred();

      expect(q('[data-testid="leftover-choice"]')).not.toBeNull();
      expect((q('[data-testid="leftover-credit"]') as HTMLInputElement).checked).toBe(true);
      expect(component.applyLabelKey()).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.APPLY_AND_KEEP');

      click('[data-testid="apply"]');

      expect(mocks.service.creditRemainder).toHaveBeenCalledTimes(1);
      const [paymentId, expected, creditKey] = mocks.service.creditRemainder.mock.calls[0];
      expect(paymentId).toBe('pay-1');
      expect(expected).toBe(100);
      expect(creditKey).toMatch(UUID_V7);
      expect(creditKey).not.toBe(mocks.service.applyPayment.mock.calls[0][1]);
      expect(text('[data-testid="result-credit"]')).toBe('$100.00');
      expect(mocks.service.refundCredit).not.toHaveBeenCalled();
      expect(announced.at(-1)?.key).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.RESULT.ANNOUNCE_KEPT');
    });

    it('confirms a refund first, then applies, credits and refunds, each with its own key', () => {
      mocks.service.applyPayment.mockReturnValue(of(applyResult({ appliedAmount: 500, remainingAmount: 100 })));
      render();
      leaveHundred();
      click('[data-testid="leftover-refund"]');
      expect(component.applyLabelKey()).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.APPLY_AND_REFUND');

      click('[data-testid="apply"]');

      expect(mocks.service.applyPayment).not.toHaveBeenCalled();
      const dialog = q('[data-testid="refund-dialog"]') as HTMLDialogElement;
      expect(dialog.matches(':modal')).toBe(true);
      expect(text('#refund-body')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.REFUND.BODY');

      click('[data-testid="refund-confirm"]');

      expect(mocks.service.applyPayment).toHaveBeenCalledTimes(1);
      expect(mocks.service.creditRemainder).toHaveBeenCalledTimes(1);
      expect(mocks.service.refundCredit).toHaveBeenCalledWith('credit-1', 100, expect.stringMatching(UUID_V7));
      const keys = [
        mocks.service.applyPayment.mock.calls[0][1],
        mocks.service.creditRemainder.mock.calls[0][2],
        mocks.service.refundCredit.mock.calls[0][2],
      ];
      expect(new Set(keys).size).toBe(3);
      expect(text('[data-testid="result-refunded"]')).toBe('$100.00');
      expect(announced.at(-1)?.key).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.RESULT.ANNOUNCE_REFUNDED');
    });

    it('says the credit is kept when the refund fails, and retries it with the same key', () => {
      mocks.service.applyPayment.mockReturnValue(of(applyResult({ appliedAmount: 500, remainingAmount: 100 })));
      mocks.service.refundCredit.mockReturnValueOnce(throwError(() => httpError(503)));
      render();
      leaveHundred();
      click('[data-testid="leftover-refund"]');
      click('[data-testid="apply"]');
      click('[data-testid="refund-confirm"]');

      expect(component.phase()).toBe('refund-failed');
      expect(text('[data-testid="match-message"]')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.REFUND_FAILED');
      expect(text('[data-testid="result-credit"]')).toBe('$100.00');

      click('[data-testid="retry-refund"]');

      expect(mocks.service.refundCredit).toHaveBeenCalledTimes(2);
      expect(mocks.service.refundCredit.mock.calls[1][2]).toBe(mocks.service.refundCredit.mock.calls[0][2]);
      expect(mocks.service.creditRemainder).toHaveBeenCalledTimes(1);
      expect(mocks.service.applyPayment).toHaveBeenCalledTimes(1);
      expect(component.refunded()).toBe(100);
    });

    it('re-reads and keeps nothing as credit when the remainder changed (422 PAYMENT_REMAINDER_CHANGED)', () => {
      mocks.service.applyPayment.mockReturnValue(of(applyResult({ appliedAmount: 500, remainingAmount: 100 })));
      mocks.service.creditRemainder.mockReturnValue(throwError(() => httpError(422, 'PAYMENT_REMAINDER_CHANGED')));
      render();
      leaveHundred();
      click('[data-testid="apply"]');

      expect(text('[data-testid="match-message"]')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.CREDIT_CHANGED');
      expect(changed).toBe(1);
      expect(component.credit()).toBeNull();
    });

    it('never offers keep-as-credit or refund for a walk-in (CASH) payment', () => {
      render(payment({ leftOver: null }));
      leaveHundred();

      expect(q('[data-testid="leftover-choice"]')).toBeNull();
      expect(text('[data-testid="leftover-stays"]')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.LEFTOVER.STAYS');
      expect(component.applyLabelKey()).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.APPLY');
    });
  });

  describe('permissions (AC 6, ADR-0040 §6a)', () => {
    it('has no refund option without accounting:customer-credit:refund, and its handlers refuse', () => {
      mocks.held.set(['accounting:payment:apply']);
      mocks.service.applyPayment.mockReturnValue(of(applyResult({ appliedAmount: 500, remainingAmount: 100 })));
      render();
      type('INV-2026-01702', '250');

      expect(q('[data-testid="leftover-credit"]')).not.toBeNull();
      expect(q('[data-testid="leftover-refund"]')).toBeNull();

      component.chooseLeftover('REFUND');
      component.submit();
      fixture.detectChanges();

      expect(q('[data-testid="refund-dialog"]')).toBeNull();
      expect(mocks.service.refundCredit).not.toHaveBeenCalled();
      expect(mocks.service.creditRemainder).toHaveBeenCalledTimes(1);
    });

    it('refuses a refund confirmed after the permission went away', () => {
      mocks.service.applyPayment.mockReturnValue(of(applyResult({ appliedAmount: 500, remainingAmount: 100 })));
      render();
      type('INV-2026-01702', '250');
      click('[data-testid="leftover-refund"]');
      click('[data-testid="apply"]');
      mocks.held.set(['accounting:payment:apply']);
      component.confirmRefund();

      expect(mocks.service.applyPayment).not.toHaveBeenCalled();
      expect(mocks.service.refundCredit).not.toHaveBeenCalled();
    });

    it('has no Apply without accounting:payment:apply, and submit refuses', () => {
      mocks.held.set(['reporting:view:financial-statements']);
      render();

      expect(q('[data-testid="apply"]')).toBeNull();
      component.submit();
      expect(mocks.service.applyPayment).not.toHaveBeenCalled();
    });

    it('follows the canAccess fallback when perm_bits is unknown', () => {
      mocks.held.set(null);
      render();
      expect(q('[data-testid="apply"]')).not.toBeNull();
      expect(q('[data-testid="leftover-refund"]')).toBeNull(); // no left-over to choose for
      expect(component.canRefund()).toBe(true);
    });
  });

  describe('refusals (story "Alternate and error flows")', () => {
    it('re-reads the invoices on 409, unticks the stale invoice and names it (AC 8)', () => {
      mocks.service.applyPayment.mockReturnValue(throwError(() => httpError(409, 'CONFLICT')));
      render();
      const before = component.currentApplicationRequestId();
      mocks.service.openInvoices.mockReturnValue(of(openInvoices([invoice(), invoice({ invoiceId: 'inv-3', invoiceNumber: 'INV-2026-01710', balanceDue: 900 })])));

      click('[data-testid="apply"]');

      expect(mocks.service.openInvoices).toHaveBeenCalledTimes(2);
      expect(component.currentApplicationRequestId()).not.toBe(before);
      expect(qa('li[data-invoice]').map(li => li.getAttribute('data-invoice'))).toEqual(['INV-2026-01701', 'INV-2026-01710']);
      expect(component.message()?.key).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.APPLY_CONFLICT_NAMED');
      expect(component.message()?.params['invoices']).toBe('INV-2026-01702');
      expect(component.tickedCount()).toBe(1);
    });

    it('says the payment changed on 400, keeps typed amounts, rotates the key and asks the host to re-read', () => {
      mocks.service.applyPayment.mockReturnValue(throwError(() => httpError(400, 'VALIDATION_ERROR')));
      render();
      type('INV-2026-01702', '300');
      const before = component.currentApplicationRequestId();

      click('[data-testid="apply"]');

      expect(text('[data-testid="match-message"]')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.APPLY_CHANGED');
      expect(amountField('INV-2026-01702').value).toBe('300');
      expect(component.currentApplicationRequestId()).not.toBe(before);
      expect(changed).toBe(1);
      expect(component.phase()).toBe('editing');
    });

    it('names accounting:payment:apply on 403 and the currency on CURRENCY_NOT_SUPPORTED', () => {
      mocks.service.applyPayment.mockReturnValueOnce(throwError(() => httpError(403)));
      render();
      click('[data-testid="apply"]');
      expect(component.message()).toEqual({
        key: 'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.APPLY_FORBIDDEN',
        params: { permission: 'accounting:payment:apply' },
        tone: 'error',
      });

      mocks.service.applyPayment.mockReturnValueOnce(throwError(() => httpError(422, 'CURRENCY_NOT_SUPPORTED')));
      click('[data-testid="apply"]');
      expect(component.message()?.key).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.CURRENCY');
    });

    it('shows the invoices read failure with Retry, keeps Apply held, and never treats 403 as a connection problem', () => {
      mocks.service.openInvoices.mockReturnValueOnce(throwError(() => httpError(500)));
      render();

      expect(q('[data-testid="invoices-error"]')).not.toBeNull();
      expect(component.applyEnabled()).toBe(false);
      click('[data-testid="invoices-retry"]');
      expect(q('[data-testid="invoices-error"]')).toBeNull();
      expect(component.applyEnabled()).toBe(true);

      mocks.service.openInvoices.mockReturnValueOnce(throwError(() => httpError(403)));
      fixture.componentRef.setInput('payment', payment({ paymentId: 'pay-9', customerId: 'cust-9' }));
      fixture.detectChanges();
      expect(q('[data-testid="invoices-denied"]')).not.toBeNull();
      expect(q('[data-testid="invoices-error"]')).toBeNull();
      expect(q('[data-testid="invoice-list"]')).toBeNull();
    });
  });

  describe('ordering (AC 9, ADR-0063)', () => {
    it('never renders payment A’s invoices under payment B, even when A answers last (A→B→A)', () => {
      const first = pending<OpenInvoicesList>();
      const second = pending<OpenInvoicesList>();
      const third = pending<OpenInvoicesList>();
      mocks.service.openInvoices.mockReturnValueOnce(first).mockReturnValueOnce(second).mockReturnValueOnce(third);
      render(payment());

      fixture.componentRef.setInput('payment', payment({ paymentId: 'pay-2', customerId: 'cust-2', suggestedInvoices: [] }));
      fixture.detectChanges();
      first.next(openInvoices([invoice({ invoiceNumber: 'A-ONLY' })]));
      first.complete();
      fixture.detectChanges();

      expect(q('li[data-invoice="A-ONLY"]')).toBeNull();
      expect(component.invoicesData()).toBeNull();

      second.next(openInvoices([invoice({ invoiceId: 'inv-b', invoiceNumber: 'B-ONLY' })]));
      second.complete();
      fixture.detectChanges();
      expect(q('li[data-invoice="B-ONLY"]')).not.toBeNull();

      fixture.componentRef.setInput('payment', payment());
      fixture.detectChanges();
      expect(q('li[data-invoice="B-ONLY"]')).toBeNull();
      third.next(openInvoices());
      fixture.detectChanges();
      expect(q('li[data-invoice="INV-2026-01701"]')).not.toBeNull();
    });

    it('ignores a late apply answer for a payment the person left, but still tells the host', () => {
      const answer = pending<ApplyResult>();
      mocks.service.applyPayment.mockReturnValue(answer);
      render();
      click('[data-testid="apply"]');

      fixture.componentRef.setInput('payment', payment({ paymentId: 'pay-2', customerId: 'cust-2' }));
      fixture.detectChanges();
      answer.next(applyResult());
      answer.complete();
      fixture.detectChanges();

      expect(component.result()).toBeNull();
      expect(component.phase()).toBe('editing');
      expect(applied).toEqual([{ paymentId: 'pay-1' }]);
    });

    it('ignores a late remainder credit after Start over', () => {
      const credit = pending<RemainderCredit>();
      mocks.service.applyPayment.mockReturnValue(of(applyResult({ appliedAmount: 500, remainingAmount: 100 })));
      mocks.service.creditRemainder.mockReturnValue(credit);
      render();
      type('INV-2026-01702', '250');
      click('[data-testid="apply"]');
      expect(component.phase()).toBe('crediting');

      fixture.componentRef.setInput('payment', payment({ paymentId: 'pay-3', customerId: 'cust-3' }));
      fixture.detectChanges();
      credit.next(remainderCredit);
      fixture.detectChanges();

      expect(component.credit()).toBeNull();
    });
  });

  describe('possible duplicate and P8', () => {
    it('labels a payment whose invoice is no longer open as a possible duplicate', () => {
      render(payment({ sourceInvoiceNumber: 'INV-2026-01600', sourceInvoiceId: 'inv-old', reasons: ['SAME_CUSTOMER'], suggestedInvoices: [] }));
      expect(text('[data-testid="possible-duplicate"] .status-badge')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.DUPLICATE.BADGE');
    });

    it('does not label a payment suggested against its own invoice', () => {
      render(payment({ sourceInvoiceNumber: 'INV-2026-01701', sourceInvoiceId: 'inv-1', reasons: ['REMITTANCE_REFERENCE', 'SAME_CUSTOMER'] }));
      expect(q('[data-testid="possible-duplicate"]')).toBeNull();
    });

    it('shows reason chips, Unknown for an unlisted code', () => {
      render(payment({ reasons: ['SAME_CUSTOMER', 'BRAND_NEW'] }));
      expect(qa('[data-testid="reason-chips"] li').map(li => li.textContent?.trim())).toEqual([
        'ACCOUNTING.CUSTOMER_PAYMENTS.REASON.SAME_CUSTOMER',
        'ACCOUNTING.CUSTOMER_PAYMENTS.REASON.UNKNOWN',
      ]);
    });

    it('renders no UUID in text or accessible names', () => {
      const id = '018f2a6e-0000-7000-8000-000000000001';
      mocks.service.openInvoices.mockReturnValue(of(openInvoices([invoice({ invoiceId: id, invoiceNumber: null })])));
      render(payment({ paymentId: id, customerId: id, sourceInvoiceId: id, suggestedInvoices: [] }));

      expect(host.textContent ?? '').not.toMatch(UUID);
      for (const element of qa('[aria-label]')) expect(element.getAttribute('aria-label') ?? '').not.toMatch(UUID);
      expect(text('label.match__invoice-number')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.NO_NUMBER');
    });
  });
});
