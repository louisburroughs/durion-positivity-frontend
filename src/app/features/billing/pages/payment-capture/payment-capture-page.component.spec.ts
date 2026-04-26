import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('PaymentCapturePageComponent', () => {
  let fixture: ComponentFixture<PaymentCapturePageComponent>;
  let component: PaymentCapturePageComponent;

  const billingTransportStub = {
    initiateAndCapturePayment: vi.fn(),
  };

  beforeEach(async () => {
    billingTransportStub.initiateAndCapturePayment.mockReset();

    await TestBed.configureTestingModule({
      imports: [PaymentCapturePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BillingTransportService, useValue: billingTransportStub },
        { provide: ActivatedRoute, useValue: routeStub },
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
});
