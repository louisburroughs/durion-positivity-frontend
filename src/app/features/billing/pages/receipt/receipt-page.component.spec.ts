import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReceiptRef } from '../../models/billing.models';
import { BillingTransportService } from '../../services/billing-transport.service';
import { ReceiptPageComponent } from './receipt-page.component';

const receiptFixture: ReceiptRef = {
  receiptId: 'rcpt-001',
  invoiceId: 'inv-001',
  paymentId: 'pay-001',
  receiptNumber: 'R-1001',
  generatedAt: '2026-03-30T10:00:00Z',
  emailedTo: 'cashier@example.com',
  pdfUrl: 'https://example.test/r/R-1001.pdf',
};

describe('ReceiptPageComponent', () => {
  let fixture: ComponentFixture<ReceiptPageComponent>;
  let component: ReceiptPageComponent;

  const billingTransportStub = {
    loadReceipt: vi.fn(),
    generateReceipt: vi.fn(),
    reprintReceipt: vi.fn(),
  };

  beforeEach(async () => {
    billingTransportStub.loadReceipt.mockReset();
    billingTransportStub.generateReceipt.mockReset();
    billingTransportStub.reprintReceipt.mockReset();

    await TestBed.configureTestingModule({
      imports: [ReceiptPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BillingTransportService, useValue: billingTransportStub },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => {
                  if (key === 'invoiceId') {
                    return 'inv-001';
                  }
                  if (key === 'receiptId') {
                    return 'rcpt-001';
                  }
                  return null;
                },
              },
            },
          },
        },
      ],
    }).compileComponents();
  });

  it('loads receipt successfully when receiptId is present', () => {
    billingTransportStub.loadReceipt.mockReturnValue(of(receiptFixture));

    fixture = TestBed.createComponent(ReceiptPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(billingTransportStub.loadReceipt).toHaveBeenCalledWith('inv-001', 'rcpt-001');
    expect(component.state()).toBe('ready');
    expect(component.receipt()).toEqual(receiptFixture);
  });

  it('sets error state before errorKey when receipt load fails', () => {
    billingTransportStub.loadReceipt.mockReturnValue(throwError(() => new Error('load failed')));

    fixture = TestBed.createComponent(ReceiptPageComponent);
    component = fixture.componentInstance;

    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.LOAD');

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });

  it('sets error state before errorKey when generateAndShow fails', () => {
    billingTransportStub.loadReceipt.mockReturnValue(of(receiptFixture));

    fixture = TestBed.createComponent(ReceiptPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    billingTransportStub.generateReceipt.mockReturnValue(throwError(() => new Error('gen failed')));

    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    component.generateAndShow({ deliveryMethod: 'PRINT' });

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.GENERATE');

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });

  it('sets error state before errorKey when reprint fails', () => {
    billingTransportStub.loadReceipt.mockReturnValue(of(receiptFixture));

    fixture = TestBed.createComponent(ReceiptPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    billingTransportStub.reprintReceipt.mockReturnValue(throwError(() => new Error('reprint fail')));

    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    component.reprint();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.REPRINT');

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });

  it('sets error state when generateAndShow called before invoiceId is available', () => {
    fixture = TestBed.createComponent(ReceiptPageComponent);
    component = fixture.componentInstance;
    // Do not call detectChanges — invoiceId remains '' (initial signal value)

    component.generateAndShow({ deliveryMethod: 'PRINT' });

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.MISSING_INVOICE');
    expect(billingTransportStub.generateReceipt).not.toHaveBeenCalled();
  });

  describe('loadReceipt with empty invoiceId', () => {
    beforeEach(async () => {
      billingTransportStub.loadReceipt.mockReset();
      billingTransportStub.generateReceipt.mockReset();
      billingTransportStub.reprintReceipt.mockReset();
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ReceiptPageComponent, TranslateModule.forRoot()],
        providers: [
          provideRouter([]),
          { provide: BillingTransportService, useValue: billingTransportStub },
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: {
                paramMap: {
                  get: (key: string) => {
                    if (key === 'invoiceId') {
                      return '';
                    }
                    if (key === 'receiptId') {
                      return 'rcpt-001';
                    }
                    return null;
                  },
                },
              },
            },
          },
        ],
      }).compileComponents();
    });

    it('sets error state when invoiceId is empty and receiptId triggers loadReceipt', () => {
      fixture = TestBed.createComponent(ReceiptPageComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.MISSING_INVOICE');
      expect(billingTransportStub.loadReceipt).not.toHaveBeenCalled();
    });
  });
});
