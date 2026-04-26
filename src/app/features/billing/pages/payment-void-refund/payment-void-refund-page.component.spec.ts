import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ApiBaseService } from '../../../../core/services/api-base.service';
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

  const apiMock = {
    post: vi.fn(),
  };

  beforeEach(async () => {
    apiMock.post.mockReset();

    await TestBed.configureTestingModule({
      imports: [PaymentVoidRefundPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ApiBaseService, useValue: apiMock },
        { provide: ActivatedRoute, useValue: routeStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentVoidRefundPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('executes void successfully and returns to ready state', () => {
    apiMock.post.mockReturnValue(of({}));

    component.executeVoid('CUSTOMER_REQUEST', 'AUTH-VOID');

    expect(component.state()).toBe('ready');
    expect(component.mode()).toBe('void');
  });

  it('sets error state before errorKey when void fails', () => {
    apiMock.post.mockReturnValue(throwError(() => new Error('void failed')));
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
    apiMock.post.mockReturnValue(throwError(() => new Error('refund fail')));
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
    apiMock.post.mockReturnValue(of({}));

    component.executeRefund('reason', 'AUTH1');

    expect(component.state()).toBe('ready');
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
    expect(apiMock.post).not.toHaveBeenCalled();

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
    expect(apiMock.post).not.toHaveBeenCalled();

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-2) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });
});
