import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RefundContext } from '../../models/billing.models';
import { BillingTransportService } from '../../services/billing-transport.service';
import { PaymentVoidRefundPageComponent } from './payment-void-refund-page.component';

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

const contextFixture: RefundContext = {
  priorRefundsTotal: 20,
};

describe('PaymentVoidRefundPageComponent', () => {
  let fixture: ComponentFixture<PaymentVoidRefundPageComponent>;
  let component: PaymentVoidRefundPageComponent;

  const billingTransportStub = {
    executeVoid: vi.fn(),
    executeRefund: vi.fn(),
    loadRefundContext: vi.fn(),
  };

  function setup(): void {
    fixture = TestBed.createComponent(PaymentVoidRefundPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    billingTransportStub.executeVoid.mockReset();
    billingTransportStub.executeRefund.mockReset();
    billingTransportStub.loadRefundContext.mockReset();
    billingTransportStub.loadRefundContext.mockReturnValue(of(contextFixture));

    await TestBed.configureTestingModule({
      imports: [PaymentVoidRefundPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BillingTransportService, useValue: billingTransportStub },
        { provide: ActivatedRoute, useValue: routeStub },
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

  it('maps a 403 from executeRefund to a localized permission error instead of a frontend gate (Copilot #4106105951/#4106105999/#4106194893/#4106194936, durion-positivity-backend#2226)', () => {
    billingTransportStub.executeRefund.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403 })),
    );

    component.executeRefund('test reason', 'AUTH1', 42.5);

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.PAYMENT.ERROR.REFUND_PERMISSION_DENIED');
    expect(billingTransportStub.executeRefund).toHaveBeenCalledWith(
      'inv-001',
      'pay-001',
      'test reason',
      'AUTH1',
      42.5,
    );
  });

  it('sets ready state on successful refund, sending the entered amount explicitly (issue #381), and re-reads the prior-refunds context (ADR-0063 §5)', () => {
    billingTransportStub.executeRefund.mockReturnValue(of(undefined));
    billingTransportStub.loadRefundContext.mockClear();

    component.executeRefund('reason', 'AUTH1', 42.5);

    expect(component.state()).toBe('ready');
    expect(billingTransportStub.executeRefund).toHaveBeenCalledWith(
      'inv-001',
      'pay-001',
      'reason',
      'AUTH1',
      42.5,
    );
    expect(billingTransportStub.loadRefundContext).toHaveBeenCalledWith('inv-001', 'pay-001');
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

  it('sends the entered amount through even when it exceeds the prior-refunds context — no client-side balance check (Copilot #4106106128: no safe local figure to validate against; the server 422 is authoritative)', () => {
    billingTransportStub.executeRefund.mockReturnValue(of(undefined));
    component.setMode('refund'); // loads the prior-refunds context, informational only

    component.executeRefund('reason', 'AUTH1', 999);

    expect(billingTransportStub.executeRefund).toHaveBeenCalledWith('inv-001', 'pay-001', 'reason', 'AUTH1', 999);
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

  describe('refund context (durion-positivity-backend#2215, Copilot #4106106128)', () => {
    it('loads the prior-refunds context once refund mode is entered', () => {
      expect(billingTransportStub.loadRefundContext).not.toHaveBeenCalled();

      component.setMode('refund');

      expect(billingTransportStub.loadRefundContext).toHaveBeenCalledWith('inv-001', 'pay-001');
      expect(component.refundContextStatus()).toBe('OK');
      expect(component.refundContext()).toEqual(contextFixture);
    });

    it('sets a FAILED status and never crashes when the context load errors', () => {
      billingTransportStub.loadRefundContext.mockReturnValue(throwError(() => new Error('load failed')));

      component.setMode('refund');

      expect(component.refundContextStatus()).toBe('FAILED');
      expect(component.refundContext()).toBeNull();
    });

    it('retryLoadRefundContext() re-issues the read after a failure', () => {
      billingTransportStub.loadRefundContext.mockReturnValueOnce(throwError(() => new Error('load failed')));
      component.setMode('refund');
      expect(component.refundContextStatus()).toBe('FAILED');

      billingTransportStub.loadRefundContext.mockReturnValue(of(contextFixture));
      component.retryLoadRefundContext();

      expect(component.refundContextStatus()).toBe('OK');
      expect(component.refundContext()).toEqual(contextFixture);
    });

    it('a superseded context read never lands (ADR-0063 request-keyed ownership)', () => {
      const first$ = new Subject<RefundContext>();
      billingTransportStub.loadRefundContext.mockReturnValueOnce(first$);
      component.setMode('refund'); // issues the first (still-pending) read

      const second: RefundContext = { priorRefundsTotal: 5 };
      billingTransportStub.loadRefundContext.mockReturnValueOnce(of(second));
      component.retryLoadRefundContext(); // supersedes it — the retry lands first

      expect(component.refundContext()?.priorRefundsTotal).toBe(5);

      // The stale first read landing after the retry must not overwrite the current value.
      first$.next(contextFixture);
      expect(component.refundContext()?.priorRefundsTotal).toBe(5);
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

  describe('no frontend permission gate (Copilot #4106105951/#4106105999/#4106194893/#4106194936, durion-positivity-backend#2226)', () => {
    it('enables the refund control on form validity alone — REFUND_PAYMENT has no catalog entry to gate on', () => {
      component.setMode('refund');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="refund-permission-denied"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('.pvm__refund-btn').disabled).toBe(true); // form incomplete

      component.refundReason.set('reason');
      component.refundAuthorityCode.set('AUTH1');
      component.setRefundAmount('25');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.pvm__refund-btn').disabled).toBe(false);
    });
  });
});
