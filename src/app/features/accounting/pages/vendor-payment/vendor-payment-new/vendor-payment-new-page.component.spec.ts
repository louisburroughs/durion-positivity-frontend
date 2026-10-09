import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import enUS from '../../../../../../assets/i18n/en-US.json';
import { of, throwError } from 'rxjs';
import { AccountingService } from '../../../services/accounting.service';
import { VendorPaymentNewPageComponent, paymentRefusal, selfApprovedBills } from './vendor-payment-new-page.component';

describe('VendorPaymentNewPageComponent', () => {
  let fixture: ComponentFixture<VendorPaymentNewPageComponent>;
  let component: VendorPaymentNewPageComponent;

  const accountingServiceStub = {
    listBillsByVendor: vi.fn().mockReturnValue(of([])),
    executePayment: vi.fn().mockReturnValue(
      of({ paymentId: 'pay-new', status: 'SETTLED' }),
    ),
    // Used by the embedded app-vendor-lookup typeahead (issue #816).
    searchVendors: vi.fn().mockReturnValue(of([])),
    getVendor: vi.fn().mockReturnValue(
      of({ vendorId: 'vendor-1', name: 'Acme Auto Parts', status: 'ACTIVE' }),
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

  it('offers only the payment methods the API accepts (ACH, CHECK, WIRE)', () => {
    const options = Array.from(
      fixture.nativeElement.querySelectorAll('select#payment-method option') as NodeListOf<HTMLOptionElement>,
    ).map(o => o.value);
    expect(options).toEqual(['ACH', 'CHECK', 'WIRE']);
  });

  it('renders the vendor typeahead instead of a raw Vendor ID input (uuid-on-screen)', () => {
    const lookup = fixture.nativeElement.querySelector('app-vendor-lookup input#vendor-id');
    expect(lookup).toBeTruthy();
    expect(lookup.getAttribute('role')).toBe('combobox');
  });

  it('resolves a prefilled vendorId to a readable vendor name in the typeahead', () => {
    component.form.controls.vendorId.setValue('vendor-1');
    fixture.detectChanges();
    expect(accountingServiceStub.getVendor).toHaveBeenCalledWith('vendor-1');
    const lookup = fixture.nativeElement.querySelector('app-vendor-lookup input#vendor-id');
    expect(lookup.value).toBe('Acme Auto Parts');
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

  it('announces the bills a 403 AP_PAYMENT_SELF_APPROVED_BILL names in a role="alert" (CAP:550 S14, AC 9)', () => {
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS as TranslationObject);
    translate.use('en-US');
    accountingServiceStub.executePayment.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 403,
            error: {
              code: 'AP_PAYMENT_SELF_APPROVED_BILL',
              fieldErrors: [
                { field: 'selfApprovedBillNumbers', message: 'INV-4471' },
                { field: 'selfApprovedBillNumbers', message: 'INV-5520' },
              ],
            },
          }),
      ),
    );
    component.form.patchValue({ vendorId: 'vendor-1', grossAmount: 100, currency: 'USD', paymentMethod: 'ACH', paymentRef: 'ref-001' });
    component.submit();
    fixture.detectChanges();

    expect(component.state()).toBe('self-approved');
    const alert = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="self-approved-alert"]')!;
    expect(alert.getAttribute('role')).toBe('alert');
    expect(component.selfApproved()).toBe('INV-4471, INV-5520');
    // Both bill numbers reach the alert through the real en-US sentence (review B7).
    expect(alert.textContent?.trim()).toBe('You approved INV-4471, INV-5520; someone else must pay them.');
    // The form stays, so the payment can leave those bills out.
    expect((fixture.nativeElement as HTMLElement).querySelector('form')).not.toBeNull();
  });

  it.each([
    [422, 'AP_PAYMENT_METHOD_NOT_SUPPORTED', [], {}, 'ACCOUNTING.VENDOR_PAYMENT_NEW.REFUSAL.METHOD', {}],
    [422, 'VENDOR_INACTIVE', [], {}, 'ACCOUNTING.VENDOR_PAYMENT_NEW.REFUSAL.VENDOR_INACTIVE', {}],
    [503, 'VENDOR_REPLICATION_PENDING', [], { 'Retry-After': '15' }, 'ACCOUNTING.VENDOR_PAYMENT_NEW.REFUSAL.REPLICATION_PENDING_AFTER', { seconds: 15 }],
    [409, 'LOCK_TIMEOUT', [], {}, 'ACCOUNTING.VENDOR_PAYMENT_NEW.REFUSAL.LOCK_TIMEOUT', {}],
    [400, 'VALIDATION_ERROR', [{ field: 'bankAccountId', message: 'required' }], {}, 'ACCOUNTING.VENDOR_PAYMENT_NEW.REFUSAL.PAY_FROM', {}],
  ])('classifies %s %s by code (ruling rows 10–13)', (status, code, fieldErrors, headers, key, params) => {
    accountingServiceStub.executePayment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status, error: { code, fieldErrors }, headers: new HttpHeaders(headers) })),
    );
    component.form.patchValue({ vendorId: 'vendor-1', grossAmount: 100, currency: 'USD', paymentMethod: 'ACH', paymentRef: 'ref-001' });
    component.submit();
    fixture.detectChanges();

    expect(component.state()).toBe('refused');
    expect(component.refusal()).toEqual({ key, params });
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="payment-refusal"]')?.getAttribute('role')).toBe('alert');
  });

  it('names the bills of a 409 VENDOR_PAYMENT_DETAILS_CHANGED from the fieldError fields, as the backend builds them (row 13)', () => {
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS as TranslationObject);
    translate.use('en-US');
    accountingServiceStub.executePayment.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              code: 'VENDOR_PAYMENT_DETAILS_CHANGED',
              fieldErrors: [
                { field: 'INV-1', message: 'approved at remit-to version 1; vendor V-100 is now at version 2' },
                { field: 'INV-2', message: 'approved at remit-to version none; vendor V-100 is now at version 2' },
              ],
            },
          }),
      ),
    );
    component.form.patchValue({ vendorId: 'vendor-1', grossAmount: 100, currency: 'USD', paymentMethod: 'ACH', paymentRef: 'ref-001' });
    component.submit();
    fixture.detectChanges();

    expect(component.refusal()).toEqual({ key: 'ACCOUNTING.VENDOR_PAYMENT_NEW.REFUSAL.DETAILS_CHANGED', params: { bills: 'INV-1, INV-2' } });
    const alert = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="payment-refusal"]')!;
    expect(alert.textContent?.trim()).toBe(
      'The vendor’s payment details changed after INV-1, INV-2 were approved. Someone who approves bills must confirm the new details before they’re paid.',
    );
    expect(alert.textContent).not.toContain('remit-to version');
  });

  it('never classifies VENDOR_REPLICATION_PENDING as an outcome that may have landed', () => {
    expect(paymentRefusal(new HttpErrorResponse({ status: 503, error: { code: 'VENDOR_REPLICATION_PENDING' } }))?.key).toBe(
      'ACCOUNTING.VENDOR_PAYMENT_NEW.REFUSAL.REPLICATION_PENDING',
    );
  });

  it('keeps today’s handling for any other 403 (classified by code, not status)', () => {
    accountingServiceStub.executePayment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 403, error: { code: 'FORBIDDEN' } })),
    );
    component.form.patchValue({ vendorId: 'vendor-1', grossAmount: 100, currency: 'USD', paymentMethod: 'ACH', paymentRef: 'ref-001' });
    component.submit();

    expect(component.state()).toBe('forbidden');
    expect(selfApprovedBills({ error: { code: 'FORBIDDEN' } })).toBeNull();
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
