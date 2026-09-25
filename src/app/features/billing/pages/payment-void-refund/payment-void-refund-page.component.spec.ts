import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { BILLING_SECTION } from '../../../../core/security/route-permissions';
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
  capturedAmount: 100,
  refundedAmount: 20,
  refundableAmount: 80,
  status: 'CAPTURED',
};

/** `null` = token with no permission claim (permissions unknown), as in AuthService. */
const session: { permissions: string[] | null } = { permissions: null };
const authStub = {
  permissionsKnown: () => session.permissions !== null,
  hasAnyPermission: (permissions: readonly string[]) =>
    permissions.some(p => session.permissions?.includes(p) ?? false),
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
    session.permissions = null;
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

  it('maps a 403 from executeVoid to a permission-denied key', () => {
    billingTransportStub.executeVoid.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403 })),
    );

    component.executeVoid('CUSTOMER_REQUEST', 'AUTH-VOID');

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.PAYMENT.ERROR.VOID_PERMISSION_DENIED');
  });

  it('maps a 403 with a LOCATION_SCOPE_DENIED body code from executeVoid to the location-scope key', () => {
    billingTransportStub.executeVoid.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, error: { code: 'LOCATION_SCOPE_DENIED' } })),
    );

    component.executeVoid('CUSTOMER_REQUEST', 'AUTH-VOID');

    expect(component.errorKey()).toBe('BILLING.PAYMENT.ERROR.LOCATION_SCOPE_DENIED');
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

  it('maps a plain 403 from executeRefund to the permission-denied key', () => {
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

  it('maps a 403 with a LOCATION_SCOPE_DENIED body code from executeRefund to the location-scope key', () => {
    billingTransportStub.executeRefund.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, error: { code: 'LOCATION_SCOPE_DENIED' } })),
    );

    component.executeRefund('test reason', 'AUTH1', 42.5);

    expect(component.errorKey()).toBe('BILLING.PAYMENT.ERROR.LOCATION_SCOPE_DENIED');
  });

  it('sets ready state on successful refund, sending the entered amount explicitly (issue #381), and re-reads the refund context (ADR-0063 §5)', () => {
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

  describe('refund context (durion-positivity-backend#2226: getInvoicePayment)', () => {
    it('loads the refund context once refund mode is entered', () => {
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

      const second: RefundContext = { capturedAmount: 100, refundedAmount: 0, refundableAmount: 5, status: 'CAPTURED' };
      billingTransportStub.loadRefundContext.mockReturnValueOnce(of(second));
      component.retryLoadRefundContext(); // supersedes it — the retry lands first

      expect(component.refundContext()?.refundableAmount).toBe(5);

      // The stale first read landing after the retry must not overwrite the current value.
      first$.next(contextFixture);
      expect(component.refundContext()?.refundableAmount).toBe(5);
    });
  });

  describe('full-balance prefill (durion-positivity-backend#2215 ruling)', () => {
    it('prefillFullBalance() sets the amount from refundableAmount and marks the field touched', () => {
      component.setMode('refund');

      component.prefillFullBalance();

      expect(component.refundAmount()).toBe(80);
      expect(component.refundAmountErrorKey()).toBeNull();
    });

    it('prefillFullBalance() is a no-op when refundableAmount is null (not yet captured)', () => {
      billingTransportStub.loadRefundContext.mockReturnValue(
        of({ capturedAmount: 0, refundedAmount: 0, refundableAmount: null, status: 'AUTHORIZED' } as RefundContext),
      );
      component.setMode('refund');

      component.prefillFullBalance();

      expect(component.refundAmount()).toBeNull();
    });

    it('rejects a typed amount above the refundable balance client-side, distinct from the server 422', () => {
      component.setMode('refund');
      component.markRefundAmountTouched();
      component.setRefundAmount('81');

      expect(component.refundAmountErrorKey()).toBe('BILLING.PAYMENT.ERROR.REFUND_AMOUNT_EXCEEDS_BALANCE');
      expect(component.canSubmitRefund()).toBe(false);
    });

    it('allows a partial refund amount at or under the refundable balance', () => {
      component.setMode('refund');
      component.refundReason.set('reason');
      component.refundAuthorityCode.set('AUTH1');
      component.markRefundAmountTouched();
      component.setRefundAmount('80');

      expect(component.refundAmountErrorKey()).toBeNull();
      expect(component.canSubmitRefund()).toBe(true);
    });
  });

  describe('per-control permission gates (durion-positivity-backend#2226, catalog v92)', () => {
    /**
     * A fresh component per scenario, with `session.permissions` set *before* creation: `canVoid`/
     * `canRefund` are Angular `computed()`s wrapping a plain (non-signal) stub method, so they
     * memoize on first read and never re-evaluate on a later mutation of `session.permissions` —
     * unlike the real `AuthService`, whose `permissionsKnown`/`hasAnyPermission` read actual
     * signals, so a real gate does react to a token refresh.
     */
    async function freshComponentWith(permissions: string[] | null): Promise<PaymentVoidRefundPageComponent> {
      session.permissions = permissions;
      TestBed.resetTestingModule();
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
      return component;
    }

    it('grants both controls when the permission claim is unknown (legacy token), matching canAccess()', async () => {
      const c = await freshComponentWith(null);
      expect(c.canVoid()).toBe(true);
      expect(c.canRefund()).toBe(true);
    });

    it('grants both controls when the session holds the exact catalog codes', async () => {
      const c = await freshComponentWith([...BILLING_SECTION.voidExecute, ...BILLING_SECTION.refundExecute]);
      expect(c.canVoid()).toBe(true);
      expect(c.canRefund()).toBe(true);
    });

    it('denies a control when permissions are known but the code is absent, and shows the hint', async () => {
      const c = await freshComponentWith([]);

      expect(c.canVoid()).toBe(false);
      expect(c.canRefund()).toBe(false);

      c.voidReason.set('reason');
      c.voidAuthorityCode.set('AUTH1');
      fixture.detectChanges();

      expect(c.canSubmitVoid()).toBe(false);
      expect(fixture.nativeElement.querySelector('[data-testid="void-permission-hint"]')).toBeTruthy();
    });
  });
});
