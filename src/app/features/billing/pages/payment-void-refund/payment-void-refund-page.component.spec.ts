import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('PaymentVoidRefundPageComponent', () => {
  let fixture: ComponentFixture<PaymentVoidRefundPageComponent>;
  let component: PaymentVoidRefundPageComponent;

  const billingTransportStub = {
    executeVoid: vi.fn(),
    executeRefund: vi.fn(),
  };

  beforeEach(async () => {
    billingTransportStub.executeVoid.mockReset();
    billingTransportStub.executeRefund.mockReset();

    await TestBed.configureTestingModule({
      imports: [PaymentVoidRefundPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BillingTransportService, useValue: billingTransportStub },
        { provide: ActivatedRoute, useValue: routeStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentVoidRefundPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
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

    component.executeRefund('test reason', 'AUTH1');

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.PAYMENT.ERROR.REFUND');

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });

  it('sets ready state on successful refund', () => {
    billingTransportStub.executeRefund.mockReturnValue(of(undefined));

    component.executeRefund('reason', 'AUTH1');

    expect(component.state()).toBe('ready');
    expect(billingTransportStub.executeRefund).toHaveBeenCalledWith(
      'inv-001',
      'pay-001',
      'reason',
      'AUTH1',
      undefined,
    );
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

    component.executeRefund('DAMAGE', 'AUTH-REFUND');

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.PAYMENT.ERROR.MISSING_IDS');
    expect(billingTransportStub.executeRefund).not.toHaveBeenCalled();

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-2) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });
});
