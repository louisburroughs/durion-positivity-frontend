import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { AccountingService } from '../../../services/accounting.service';
import { VendorPaymentDetailPageComponent } from './vendor-payment-detail-page.component';

describe('VendorPaymentDetailPageComponent', () => {
  let fixture: ComponentFixture<VendorPaymentDetailPageComponent>;
  let component: VendorPaymentDetailPageComponent;

  const accountingServiceStub = {
    getPayment: vi.fn().mockReturnValue(
      of({
        paymentId: 'payment-1',
        paymentRef: 'ref-001',
        vendorName: 'Vendor A',
        grossAmount: 500,
        netAmount: 500,
        status: 'SETTLED',
        gatewayTransactionId: 'txn-1',
        createdAt: '2024-01-01',
      }),
    ),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VendorPaymentDetailPageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: AccountingService, useValue: accountingServiceStub },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ paymentId: 'payment-1' }) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VendorPaymentDetailPageComponent);
    component = fixture.componentInstance;
  });

  it('renders loading state initially', () => {
    accountingServiceStub.getPayment.mockReturnValueOnce(new Subject());
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="loading-state"]');
    expect(el).toBeTruthy();
  });

  it('renders payment detail when service returns data', () => {
    accountingServiceStub.getPayment.mockReturnValueOnce(
      of({
        paymentId: 'payment-1',
        paymentRef: 'ref-001',
        vendorName: 'Vendor A',
        grossAmount: 500,
        netAmount: 500,
        status: 'SETTLED',
        gatewayTransactionId: 'txn-1',
        createdAt: '2024-01-01',
      }),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="payment-detail"]');
    expect(el).toBeTruthy();
  });

  it('renders error state when service errors with 500', () => {
    accountingServiceStub.getPayment.mockReturnValueOnce(
      throwError(() => ({ status: 500 })),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="error-state"]');
    expect(el).toBeTruthy();
  });

  it('renders forbidden state when service errors with 403', () => {
    accountingServiceStub.getPayment.mockReturnValueOnce(
      throwError(() => ({ status: 403 })),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="forbidden-state"]');
    expect(el).toBeTruthy();
  });

  it('renders not-found state when service errors with 404', () => {
    accountingServiceStub.getPayment.mockReturnValueOnce(
      throwError(() => ({ status: 404 })),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="empty-state"]');
    expect(el).toBeTruthy();
  });
});
