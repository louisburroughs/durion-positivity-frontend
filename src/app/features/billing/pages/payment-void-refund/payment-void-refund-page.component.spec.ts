import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { PaymentActionResult } from '../../models/billing.models';
import { BillingService } from '../../services/billing.service';
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

  const billingMock = {
    voidPayment: vi.fn(),
    refundPayment: vi.fn(),
  };

  beforeEach(async () => {
    billingMock.voidPayment.mockReset();
    billingMock.refundPayment.mockReset();

    await TestBed.configureTestingModule({
      imports: [PaymentVoidRefundPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BillingService, useValue: billingMock },
        { provide: ActivatedRoute, useValue: routeStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentVoidRefundPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('executes void successfully and returns to ready state', () => {
    const voidResultFixture: PaymentActionResult = {
      paymentId: 'pay-001',
      invoiceId: 'inv-001',
      status: 'VOIDED',
      actionAt: '2026-03-30T10:00:00Z',
    };
    billingMock.voidPayment.mockReturnValue(of(voidResultFixture));

    component.executeVoid('CUSTOMER_REQUEST', 'AUTH-VOID');

    expect(component.state()).toBe('ready');
    expect(component.mode()).toBe('void');
  });

  it('sets error state before errorKey when void fails', () => {
    billingMock.voidPayment.mockReturnValue(throwError(() => new Error('void failed')));
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
    billingMock.refundPayment.mockReturnValue(throwError(() => new Error('refund fail')));
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
    const refundResultFixture: PaymentActionResult = {
      paymentId: 'pay-001',
      invoiceId: 'inv-001',
      status: 'REFUNDED',
      actionAt: '2026-03-30T10:00:00Z',
    };
    billingMock.refundPayment.mockReturnValue(of(refundResultFixture));

    component.executeRefund('reason', 'AUTH1');

    expect(component.state()).toBe('ready');
  });
});
