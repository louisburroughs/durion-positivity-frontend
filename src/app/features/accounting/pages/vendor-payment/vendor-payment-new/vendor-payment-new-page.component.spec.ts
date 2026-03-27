import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AccountingService } from '../../../services/accounting.service';
import { VendorPaymentNewPageComponent } from './vendor-payment-new-page.component';

describe('VendorPaymentNewPageComponent', () => {
  let fixture: ComponentFixture<VendorPaymentNewPageComponent>;
  let component: VendorPaymentNewPageComponent;

  const accountingServiceStub = {
    listBillsByVendor: vi.fn().mockReturnValue(of([])),
    executePayment: vi.fn().mockReturnValue(
      of({ paymentId: 'pay-new', status: 'SETTLED' }),
    ),
  };

  const queryParamGetSpy = vi.fn().mockReturnValue(null);
  const activatedRouteStub = {
    snapshot: {
      queryParamMap: { get: queryParamGetSpy },
    },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VendorPaymentNewPageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: AccountingService, useValue: accountingServiceStub },
        { provide: ActivatedRoute, useValue: activatedRouteStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VendorPaymentNewPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders form in initial state', () => {
    const form = fixture.nativeElement.querySelector('form');
    expect(form).toBeTruthy();
  });

  it('Load Bills button is disabled when vendorId is empty', () => {
    component.form.controls.vendorId.setValue('');
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('button[type="button"]');
    expect(btn.disabled).toBe(true);
  });

  it('Load Bills button is enabled when vendorId is set', () => {
    component.form.controls.vendorId.setValue('vendor-1');
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('button[type="button"]');
    expect(btn.disabled).toBe(false);
  });

  it('populates bills table after loadBills succeeds', () => {
    accountingServiceStub.listBillsByVendor.mockReturnValueOnce(
      of([
        {
          vendorBillId: 'bill-1',
          billNumber: 'B-001',
          dueDate: '2024-02-01',
          openAmount: 200,
          status: 'OPEN',
          vendorName: 'Vendor A',
          billDate: '2024-01-01',
          totalAmount: 200,
        },
      ]),
    );
    component.form.controls.vendorId.setValue('vendor-1');
    component.loadBills();
    fixture.detectChanges();
    expect(component.bills().length).toBe(1);
  });

  it('sets state to forbidden when loadBills errors with 403', () => {
    accountingServiceStub.listBillsByVendor.mockReturnValueOnce(
      throwError(() => ({ status: 403 })),
    );
    component.form.controls.vendorId.setValue('vendor-1');
    component.loadBills();
    fixture.detectChanges();
    expect(component.state()).toBe('forbidden');
    const el = fixture.nativeElement.querySelector('[role="alert"]');
    expect(el).toBeTruthy();
  });

  it('sets state to error when loadBills errors with 500', () => {
    accountingServiceStub.listBillsByVendor.mockReturnValueOnce(
      throwError(() => ({ status: 500 })),
    );
    component.form.controls.vendorId.setValue('vendor-1');
    component.loadBills();
    fixture.detectChanges();
    expect(component.state()).toBe('error');
  });

  it('submit button is disabled when form is invalid', () => {
    component.form.controls.vendorId.setValue('');
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(btn.disabled).toBe(true);
  });

  it('shows result on successful payment submission', () => {
    component.form.patchValue({
      vendorId: 'vendor-1',
      grossAmount: 100,
      currency: 'USD',
      paymentMethod: 'ACH',
      paymentRef: 'ref-001',
    });
    component.submit();
    fixture.detectChanges();
    expect(component.state()).toBe('success');
    expect(component.result()?.paymentId).toBe('pay-new');
  });

  it('sets state to forbidden when executePayment errors with 403', () => {
    accountingServiceStub.executePayment.mockReturnValueOnce(
      throwError(() => ({ status: 403 })),
    );
    component.form.patchValue({
      vendorId: 'vendor-1',
      grossAmount: 100,
      currency: 'USD',
      paymentMethod: 'ACH',
      paymentRef: 'ref-001',
    });
    component.submit();
    fixture.detectChanges();
    expect(component.state()).toBe('forbidden');
  });

  it('sets state to conflict when executePayment errors with 409', () => {
    accountingServiceStub.executePayment.mockReturnValueOnce(
      throwError(() => ({ status: 409 })),
    );
    component.form.patchValue({
      vendorId: 'vendor-1',
      grossAmount: 100,
      currency: 'USD',
      paymentMethod: 'ACH',
      paymentRef: 'ref-001',
    });
    component.submit();
    fixture.detectChanges();
    expect(component.state()).toBe('conflict');
  });

  describe('submit()', () => {
    it('should set error state when allocationsJson is invalid JSON', () => {
      component.form.patchValue({
        vendorId: 'vendor-1',
        grossAmount: 100,
        currency: 'USD',
        paymentMethod: 'ACH',
        paymentRef: 'ref-001',
        allocationsJson: '{invalid}',
      });
      component.submit();
      expect(component.state()).toBe('error');
    });
  });

  describe('ngOnInit()', () => {
    it('should prefill vendorId from query param', () => {
      queryParamGetSpy.mockReturnValueOnce('v-123');
      component.ngOnInit();
      expect(component.form.controls.vendorId.value).toBe('v-123');
    });

    it('should not prefill vendorId when query param absent', () => {
      component.form.controls.vendorId.setValue('');
      component.ngOnInit();
      expect(component.form.controls.vendorId.value).toBe('');
    });
  });
});
