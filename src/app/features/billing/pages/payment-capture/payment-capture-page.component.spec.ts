import { formatCurrency, getCurrencySymbol } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { LocaleService } from '../../../../core/services/locale.service';
import { PaymentTransactionRef } from '../../models/billing.models';
import { BillingTransportService } from '../../services/billing-transport.service';
import { PaymentCapturePageComponent } from './payment-capture-page.component';

const routeStub = {
  snapshot: {
    paramMap: {
      get: (key: string) => (key === 'invoiceId' ? 'inv-001' : null),
    },
  },
};

const initiatedTxFixture: PaymentTransactionRef = {
  paymentId: 'pay-001',
  invoiceId: 'inv-001',
  transactionId: 'txn-001',
  authCode: 'AUTH-001',
  status: 'AUTHORIZED',
  amount: 150,
  currency: 'USD',
  createdAt: '2026-03-30T10:00:00Z',
};

const capturedTxFixture: PaymentTransactionRef = {
  ...initiatedTxFixture,
  status: 'CAPTURED',
  capturedAt: '2026-03-30T10:01:00Z',
};

/** `null` = token with no permission claim (permissions unknown), as in AuthService. */
const session: { permissions: string[] | null } = { permissions: null };
const authStub = {
  permissionsKnown: () => session.permissions !== null,
  hasAnyPermission: (permissions: readonly string[]) =>
    permissions.some(p => session.permissions?.includes(p) ?? false),
};

describe('PaymentCapturePageComponent', () => {
  let fixture: ComponentFixture<PaymentCapturePageComponent>;
  let component: PaymentCapturePageComponent;

  const billingTransportStub = {
    initiateAndCapturePayment: vi.fn(),
  };

  beforeEach(async () => {
    billingTransportStub.initiateAndCapturePayment.mockReset();
    session.permissions = null;

    await TestBed.configureTestingModule({
      imports: [PaymentCapturePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BillingTransportService, useValue: billingTransportStub },
        { provide: ActivatedRoute, useValue: routeStub },
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentCapturePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('transitions to ready after initiate and capture succeeds', () => {
    billingTransportStub.initiateAndCapturePayment.mockReturnValueOnce(of(capturedTxFixture));

    component.initiateAndCapture('CARD', 150);

    expect(billingTransportStub.initiateAndCapturePayment).toHaveBeenCalledWith('inv-001', 'CARD', 150);
    expect(component.state()).toBe('ready');
    expect(component.transaction()).toEqual(capturedTxFixture);
  });

  it('links to the receipt page carrying the captured paymentId, so the receipt is generated for this tender', () => {
    billingTransportStub.initiateAndCapturePayment.mockReturnValueOnce(of(capturedTxFixture));

    component.initiateAndCapture('CARD', 150);
    fixture.detectChanges();

    const link: HTMLAnchorElement | null = fixture.nativeElement.querySelector('.payment-capture__receipt-link');
    expect(link).not.toBeNull();
    const url = new URL(link!.href);
    expect(url.pathname).toBe('/app/billing/invoices/inv-001/receipts');
    expect(url.searchParams.get('paymentId')).toBe(capturedTxFixture.paymentId);
  });

  it('sets error state before errorKey when capture flow fails', () => {
    billingTransportStub.initiateAndCapturePayment.mockReturnValue(
      throwError(() => new Error('capture failed')),
    );
    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    component.initiateAndCapture('CARD', 150);

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.PAYMENT.ERROR.CAPTURE');

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });

  it('fails fast when invoiceId is missing without calling transport', () => {
    component.invoiceId.set('');

    component.initiateAndCapture('CARD', 150);

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.PAYMENT.ERROR.CAPTURE');
    expect(billingTransportStub.initiateAndCapturePayment).not.toHaveBeenCalled();
  });

  describe('payment limit override (#431)', () => {
    const warning = (): HTMLElement | null =>
      (fixture.nativeElement as HTMLElement).querySelector('#payment-limit-warning');
    const submit = (): HTMLButtonElement =>
      (fixture.nativeElement as HTMLElement).querySelector('.payment-capture__submit')!;

    it('warns and blocks a payment above 500.00 for a caller without invoice:payment:limit_override', () => {
      session.permissions = ['invoice:payment:process'];
      component.setAmount('500.01');
      fixture.detectChanges();

      expect(component.limitOverrideRequired()).toBe(true);
      expect(warning()).not.toBeNull();
      expect(submit().disabled).toBe(true);

      component.initiateAndCapture('CARD', 500.01);
      expect(billingTransportStub.initiateAndCapturePayment).not.toHaveBeenCalled();
      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('BILLING.PAYMENT.ERROR.LIMIT_OVERRIDE_REQUIRED');
    });

    it('allows exactly 500.00 without the override', () => {
      session.permissions = ['invoice:payment:process'];
      component.setAmount('500');
      fixture.detectChanges();

      expect(warning()).toBeNull();
      expect(submit().disabled).toBe(false);
    });

    it('allows a payment above 500.00 for a caller holding the override', () => {
      session.permissions = ['invoice:payment:process', 'invoice:payment:limit_override'];
      component.setAmount('750');
      fixture.detectChanges();

      expect(warning()).toBeNull();
      expect(submit().disabled).toBe(false);
    });

    it('treats a token without a permission claim as granted', () => {
      component.setAmount('750');
      fixture.detectChanges();

      expect(component.limitOverrideRequired()).toBe(false);
    });
  });

  it('maps a 403 to a localized permission error, and a location-scope 403 to its own', () => {
    billingTransportStub.initiateAndCapturePayment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 403 })),
    );
    component.initiateAndCapture('CARD', 150);
    expect(component.errorKey()).toBe('BILLING.PAYMENT.ERROR.CAPTURE_PERMISSION_DENIED');

    billingTransportStub.initiateAndCapturePayment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 403, error: { code: 'LOCATION_SCOPE_DENIED' } })),
    );
    component.initiateAndCapture('CARD', 150);
    expect(component.errorKey()).toBe('BILLING.PAYMENT.ERROR.LOCATION_SCOPE_DENIED');
  });

  describe('captured amount locale (#408)', () => {
    const usd = (value: number, locale: string): string =>
      formatCurrency(value, locale, getCurrencySymbol('USD', 'wide', locale), 'USD');

    const amount = (): string =>
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="payment-capture-amount"]')?.textContent ?? '';

    afterEach(() => TestBed.inject(LocaleService).currentLocale.set('en-US'));

    it.each(['fr-FR', 'es-MX', 'fr-CA'] as const)('formats the amount in the user locale %s, and back to en-US on switch', (locale) => {
      billingTransportStub.initiateAndCapturePayment.mockReturnValueOnce(of(capturedTxFixture));
      component.initiateAndCapture('CARD', 150);
      const service = TestBed.inject(LocaleService);

      service.currentLocale.set(locale);
      fixture.detectChanges();
      expect(amount()).toBe(usd(150, locale));

      service.currentLocale.set('en-US');
      fixture.detectChanges();
      expect(amount()).toBe(usd(150, 'en-US'));
    });
  });
});
