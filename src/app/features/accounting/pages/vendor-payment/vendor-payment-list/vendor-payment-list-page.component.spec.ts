import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { AccountingService } from '../../../services/accounting.service';
import { VendorPaymentListPageComponent } from './vendor-payment-list-page.component';

describe('VendorPaymentListPageComponent', () => {
  let fixture: ComponentFixture<VendorPaymentListPageComponent>;
  let component: VendorPaymentListPageComponent;

  const accountingServiceStub = {
    listBills: vi.fn().mockReturnValue(of({ items: [], totalCount: 0 })),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VendorPaymentListPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AccountingService, useValue: accountingServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VendorPaymentListPageComponent);
    component = fixture.componentInstance;
  });

  it('renders loading state initially', () => {
    accountingServiceStub.listBills.mockReturnValueOnce(new Subject());
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="loading-state"]');
    expect(el).toBeTruthy();
  });

  it('renders bill rows when service returns data', () => {
    accountingServiceStub.listBills.mockReturnValueOnce(
      of({
        items: [
          {
            vendorBillId: 'bill-1',
            vendorName: 'Vendor A',
            billNumber: 'B-001',
            billDate: '2024-01-01',
            totalAmount: 500,
            dueDate: '2024-02-01',
            status: 'OPEN',
          },
        ],
        totalCount: 1,
      }),
    );
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="bill-row"]');
    expect(rows.length).toBe(1);
  });

  it('renders empty state when service returns no items', () => {
    accountingServiceStub.listBills.mockReturnValueOnce(
      of({ items: [], totalCount: 0 }),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="empty-state"]');
    expect(el).toBeTruthy();
  });

  it('renders error state when service errors with 500', () => {
    accountingServiceStub.listBills.mockReturnValueOnce(
      throwError(() => ({ status: 500 })),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="error-state"]');
    expect(el).toBeTruthy();
  });

  it('renders forbidden state when service errors with 403', () => {
    accountingServiceStub.listBills.mockReturnValueOnce(
      throwError(() => ({ status: 403 })),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('[data-testid="forbidden-state"]');
    expect(el).toBeTruthy();
  });

  it('shows new payment button', () => {
    accountingServiceStub.listBills.mockReturnValueOnce(of({ items: [], totalCount: 0 }));
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('[data-testid="new-payment-button"]');
    expect(btn).toBeTruthy();
  });

  it('newPayment() navigates to vendor-payments/new', () => {
    accountingServiceStub.listBills.mockReturnValueOnce(new Subject());
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const spy = vi.spyOn(router, 'navigate');
    component.newPayment();
    expect(spy).toHaveBeenCalledWith(['/app/accounting/vendor-payments/new']);
  });

  it('openPayment(bill) navigates to vendor-payments/new with vendorBillId query param', () => {
    accountingServiceStub.listBills.mockReturnValueOnce(new Subject());
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const spy = vi.spyOn(router, 'navigate');
    component.openPayment({
      vendorBillId: 'bill-99',
      vendorName: 'Vendor A',
      billNumber: 'B-001',
      billDate: '2024-01-01',
      totalAmount: 500,
      dueDate: '2024-02-01',
      status: 'APPROVED',
    });
    expect(spy).toHaveBeenCalledWith(['/app/accounting/vendor-payments/new'], {
      queryParams: { vendorBillId: 'bill-99' },
    });
  });

  it('load() resets pageState to loading when re-invoked', () => {
    accountingServiceStub.listBills.mockReturnValueOnce(
      of({
        items: [
          { vendorBillId: 'bill-1', vendorName: 'X', billNumber: 'B-1', billDate: '2024-01-01', totalAmount: 100, dueDate: '2024-02-01', status: 'OPEN' },
        ],
        totalCount: 1,
      }),
    );
    fixture.detectChanges();
    expect(component.pageState()).toBe('ready');
    accountingServiceStub.listBills.mockReturnValueOnce(new Subject());
    component.load();
    expect(component.pageState()).toBe('loading');
  });
});
