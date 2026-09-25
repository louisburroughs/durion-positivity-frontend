import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { RefundBalance } from '../../models/billing.models';
import { BillingTransportService } from '../../services/billing-transport.service';
import { PaymentVoidRefundPageComponent } from './payment-void-refund-page.component';

const REFUND_PAYMENT = 'REFUND_PAYMENT';

const routeStub = {
  snapshot: {
    paramMap: {
      get: (key: string) => {
        if (key === 'invoiceId') {
          return 'inv-001';
        }
        if (key === 'paymentId') {
          return 'pay-001';
        }
        return null;
      },
    },
  },
};

const balanceFixture: RefundBalance = {
  capturedAmount: 100,
  priorRefundsTotal: 20,
  refundableBalance: 80,
};

describe('PaymentVoidRefundPageComponent', () => {
  let fixture: ComponentFixture<PaymentVoidRefundPageComponent>;
  let component: PaymentVoidRefundPageComponent;

  const billingTransportStub = {
    executeVoid: vi.fn(),
    executeRefund: vi.fn(),
    loadRefundBalance: vi.fn(),
  };

  /** Permissions known, refund authority held, unless a test narrows this before `setup()`. */
  const authStub = {
    known: true,
    granted: [REFUND_PAYMENT] as readonly string[],
    permissionsKnown(): boolean {
      return this.known;
    },
    hasAnyPermission(required: readonly string[]): boolean {
      return required.some(code => this.granted.includes(code));
    },
  };

  function setup(): void {
    fixture = TestBed.createComponent(PaymentVoidRefundPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    billingTransportStub.executeVoid.mockReset();
    billingTransportStub.executeRefund.mockReset();
    billingTransportStub.loadRefundBalance.mockReset();
    billingTransportStub.loadRefundBalance.mockReturnValue(of(balanceFixture));
    authStub.known = true;
    authStub.granted = [REFUND_PAYMENT];

    await TestBed.configureTestingModule({
      imports: [PaymentVoidRefundPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BillingTransportService, useValue: billingTransportStub },
        { provide: ActivatedRoute, useValue: routeStub },
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();

    setup();
  });

  it('executes void successfully and returns to ready state', () => {
    billingTransportStub.executeVoid.mockReturnValue(of(undefined));

    component.executeVoid('CUSTOMER_REQUEST', 'AUTH-VOID');

    expect(billingTransportStub.executeVoid).toHaveBeenCalledWith(
      'inv-001',
      'pay-001',
      'CUSTOMER_REQUEST',
      'AUTH-VOID',
    );
    expect(component.state()).toBe('ready');
    expect(component.mode()).toBe('void');
  });

  it('sets error state before errorKey when void fails', () => {
    billingTransportStub.executeVoid.mockReturnValue(throwError(() => new Error('void failed')));
    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    component.executeVoid('CUSTOMER_REQUEST', 'AUTH-VOID');

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.PAYMENT.ERROR.VOID');

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });

  it('sets error state before errorKey when executeRefund() fails', () => {
    billingTransportStub.executeRefund.mockReturnValue(throwError(() => new Error('refund fail')));
    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    component.executeRefund('test reason', 'AUTH1', 42.5);

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.PAYMENT.ERROR.REFUND');

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });

  it('maps a 422 from executeRefund to the balance-exceeded key', () => {
    billingTransportStub.executeRefund.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 422 })),
    );

    component.executeRefund('test reason', 'AUTH1', 42.5);

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.PAYMENT.ERROR.REFUND_AMOUNT_EXCEEDS_BALANCE');
  });

  it('sets ready state on successful refund, sending the entered amount explicitly (issue #381)', () => {
    billingTransportStub.executeRefund.mockReturnValue(of(undefined));

    component.executeRefund('reason', 'AUTH1', 42.5);

    expect(component.state()).toBe('ready');
    expect(billingTransportStub.executeRefund).toHaveBeenCalledWith(
      'inv-001',
      'pay-001',
      'reason',
      'AUTH1',
      42.5,
    );
  });

  it('sets error state before errorKey and never calls the service when refund amount is missing (issue #381: no more implicit full refund)', () => {
    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    component.executeRefund('reason', 'AUTH1', null);

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.PAYMENT.ERROR.REFUND_AMOUNT_REQUIRED');
    expect(billingTransportStub.executeRefund).not.toHaveBeenCalled();

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });

  it('sets error state and never calls the service when refund amount is zero or negative', () => {
    component.executeRefund('reason', 'AUTH1', 0);
    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.PAYMENT.ERROR.REFUND_AMOUNT_REQUIRED');

    component.executeRefund('reason', 'AUTH1', -5);
    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.PAYMENT.ERROR.REFUND_AMOUNT_REQUIRED');

    expect(billingTransportStub.executeRefund).not.toHaveBeenCalled();
  });

  it('sets error state and never calls the service when the amount exceeds the loaded refundable balance', () => {
    component.setMode('refund');

    component.executeRefund('reason', 'AUTH1', 999);

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.PAYMENT.ERROR.REFUND_AMOUNT_EXCEEDS_BALANCE');
    expect(billingTransportStub.executeRefund).not.toHaveBeenCalled();
  });

  it('canSubmitRefund() is false with no amount entered and true once a positive amount is entered', () => {
    component.refundReason.set('reason');
    component.refundAuthorityCode.set('AUTH1');
    expect(component.canSubmitRefund()).toBe(false);

    component.setRefundAmount('0');
    expect(component.canSubmitRefund()).toBe(false);

    component.setRefundAmount('25');
    expect(component.canSubmitRefund()).toBe(true);
  });

  it('setRefundAmount with empty string sets refundAmount to null', () => {
    component.setRefundAmount('');
    expect(component.refundAmount()).toBeNull();
  });

  it('setRefundAmount with non-empty value sets correct numeric amount', () => {
    component.setRefundAmount('42.50');
    expect(component.refundAmount()).toBe(42.5);
  });

  it('sets error state when executeVoid called with empty invoiceId', () => {
    component.invoiceId.set('');

    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    component.executeVoid('CUSTOMER_REQUEST', 'AUTH-VOID');

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.PAYMENT.ERROR.MISSING_IDS');
    expect(billingTransportStub.executeVoid).not.toHaveBeenCalled();

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-2) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });

  it('sets error state when executeRefund called with empty paymentId', () => {
    component.paymentId.set('');

    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    component.executeRefund('DAMAGE', 'AUTH-REFUND', 25);

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.PAYMENT.ERROR.MISSING_IDS');
    expect(billingTransportStub.executeRefund).not.toHaveBeenCalled();

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-2) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });

  describe('refund balance (durion-positivity-backend#2215)', () => {
    it('loads the balance once refund mode is entered', () => {
      expect(billingTransportStub.loadRefundBalance).not.toHaveBeenCalled();

      component.setMode('refund');

      expect(billingTransportStub.loadRefundBalance).toHaveBeenCalledWith('inv-001', 'pay-001');
      expect(component.refundBalanceStatus()).toBe('OK');
      expect(component.refundBalance()).toEqual(balanceFixture);
    });

    it('derives the balance as capturedAmount minus non-failed prior refunds (excludes failed ones at the source)', () => {
      // The transport service is the one summing refunds and excluding FAILED ones; this
      // component-level test asserts the page renders whatever balance it is handed, unmodified.
      component.setMode('refund');

      expect(component.refundBalance()?.refundableBalance).toBe(80);
    });

    it('sets a FAILED status and never crashes when the balance load errors', () => {
      billingTransportStub.loadRefundBalance.mockReturnValue(throwError(() => new Error('load failed')));

      component.setMode('refund');

      expect(component.refundBalanceStatus()).toBe('FAILED');
      expect(component.refundBalance()).toBeNull();
    });

    it('retryLoadRefundBalance() re-issues the read after a failure', () => {
      billingTransportStub.loadRefundBalance.mockReturnValueOnce(throwError(() => new Error('load failed')));
      component.setMode('refund');
      expect(component.refundBalanceStatus()).toBe('FAILED');

      billingTransportStub.loadRefundBalance.mockReturnValue(of(balanceFixture));
      component.retryLoadRefundBalance();

      expect(component.refundBalanceStatus()).toBe('OK');
      expect(component.refundBalance()).toEqual(balanceFixture);
    });

    it('a superseded balance read never lands (ADR-0063 request-keyed ownership)', () => {
      const first$ = new Subject<RefundBalance>();
      billingTransportStub.loadRefundBalance.mockReturnValueOnce(first$);
      component.setMode('refund'); // issues the first (still-pending) read

      const second: RefundBalance = { capturedAmount: 5, priorRefundsTotal: 0, refundableBalance: 5 };
      billingTransportStub.loadRefundBalance.mockReturnValueOnce(of(second));
      component.retryLoadRefundBalance(); // supersedes it — the retry lands first

      expect(component.refundBalance()?.refundableBalance).toBe(5);

      // The stale first read landing after the retry must not overwrite the current value.
      first$.next(balanceFixture);
      expect(component.refundBalance()?.refundableBalance).toBe(5);
    });

    it('useFullRefundBalance() prefills the amount from the balance without submitting (operator confirms before sending)', () => {
      component.setMode('refund');

      component.useFullRefundBalance();

      expect(component.refundAmount()).toBe(80);
      expect(billingTransportStub.executeRefund).not.toHaveBeenCalled();
    });

    it('useFullRefundBalance() is a no-op before the balance has loaded', () => {
      billingTransportStub.loadRefundBalance.mockReturnValue(throwError(() => new Error('load failed')));
      component.setMode('refund');

      component.useFullRefundBalance();

      expect(component.refundAmount()).toBeNull();
    });
  });

  describe('inline amount validation (ADR-0029 §8.3)', () => {
    it('shows no error before the field is touched', () => {
      expect(component.refundAmountErrorKey()).toBeNull();
    });

    it('shows the required key once touched with no amount', () => {
      component.markRefundAmountTouched();
      expect(component.refundAmountErrorKey()).toBe('BILLING.PAYMENT.ERROR.REFUND_AMOUNT_REQUIRED');
    });

    it('shows the exceeds-balance key once touched with an amount over the loaded balance', () => {
      component.setMode('refund');
      component.markRefundAmountTouched();
      component.setRefundAmount('500');

      expect(component.refundAmountErrorKey()).toBe('BILLING.PAYMENT.ERROR.REFUND_AMOUNT_EXCEEDS_BALANCE');
    });

    it('clears once a valid amount is entered', () => {
      component.setMode('refund');
      component.markRefundAmountTouched();
      component.setRefundAmount('25');

      expect(component.refundAmountErrorKey()).toBeNull();
    });

    it('the rendered field wires aria-invalid and aria-describedby to the error', () => {
      component.setMode('refund');
      fixture.detectChanges();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('#refund-amount-input');

      input.dispatchEvent(new Event('blur'));
      fixture.detectChanges();

      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe('refund-amount-error');
      expect(fixture.nativeElement.querySelector('#refund-amount-error')).toBeTruthy();
    });
  });

  describe('refund permission gate (ADR-0040 §6a)', () => {
    it('disables the refund control and refuses the method when the permission is denied', async () => {
      TestBed.resetTestingModule();
      authStub.known = true;
      authStub.granted = [];
      await TestBed.configureTestingModule({
        imports: [PaymentVoidRefundPageComponent, TranslateModule.forRoot()],
        providers: [
          provideRouter([]),
          { provide: BillingTransportService, useValue: billingTransportStub },
          { provide: ActivatedRoute, useValue: routeStub },
          { provide: AuthService, useValue: authStub },
        ],
      }).compileComponents();
      setup();
      component.setMode('refund');
      fixture.detectChanges();

      expect(component.canRefund()).toBe(false);
      expect(component.canSubmitRefund()).toBe(false);
      expect(fixture.nativeElement.querySelector('.pvm__refund-btn').disabled).toBe(true);
      expect(fixture.nativeElement.querySelector('[data-testid="refund-permission-denied"]')).toBeTruthy();

      component.refundReason.set('reason');
      component.refundAuthorityCode.set('AUTH1');
      component.setRefundAmount('25');
      component.executeRefund('reason', 'AUTH1', 25);

      expect(billingTransportStub.executeRefund).not.toHaveBeenCalled();
    });

    it('follows the unknown-permission (legacy token) fallback and stays open', async () => {
      TestBed.resetTestingModule();
      authStub.known = false;
      authStub.granted = [];
      await TestBed.configureTestingModule({
        imports: [PaymentVoidRefundPageComponent, TranslateModule.forRoot()],
        providers: [
          provideRouter([]),
          { provide: BillingTransportService, useValue: billingTransportStub },
          { provide: ActivatedRoute, useValue: routeStub },
          { provide: AuthService, useValue: authStub },
        ],
      }).compileComponents();
      setup();

      expect(component.canRefund()).toBe(true);
    });
  });
});
