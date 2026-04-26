import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ApiBaseService } from '../../../../core/services/api-base.service';
import { ReceiptRef } from '../../models/billing.models';
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

  const apiMock = {
    get: vi.fn(),
    post: vi.fn(),
  };

  beforeEach(async () => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();

    await TestBed.configureTestingModule({
      imports: [ReceiptPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ApiBaseService, useValue: apiMock },
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
    apiMock.get.mockReturnValue(of(receiptFixture));

    fixture = TestBed.createComponent(ReceiptPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.state()).toBe('ready');
    expect(component.receipt()).toEqual(receiptFixture);
  });

  it('sets error state before errorKey when receipt load fails', () => {
    apiMock.get.mockReturnValue(throwError(() => new Error('load failed')));

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
    apiMock.get.mockReturnValue(of(receiptFixture));

    fixture = TestBed.createComponent(ReceiptPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    apiMock.post.mockReturnValue(throwError(() => new Error('gen failed')));

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
    apiMock.get.mockReturnValue(of(receiptFixture));

    fixture = TestBed.createComponent(ReceiptPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    apiMock.post.mockReturnValue(throwError(() => new Error('reprint fail')));

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
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  describe('loadReceipt with empty invoiceId', () => {
    beforeEach(async () => {
      apiMock.get.mockReset();
      apiMock.post.mockReset();
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ReceiptPageComponent, TranslateModule.forRoot()],
        providers: [
          provideRouter([]),
          { provide: ApiBaseService, useValue: apiMock },
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
      expect(apiMock.get).not.toHaveBeenCalled();
    });
  });
});
