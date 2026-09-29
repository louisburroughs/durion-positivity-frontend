import { ComponentFixture, TestBed } from '@angular/core/testing';
import { formatCurrency, getCurrencySymbol } from '@angular/common';
import type { CreditMemo } from '../../../models/accounting.models';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AccountingService } from '../../../services/accounting.service';
import { CUSTOMER_LOOKUP_SOURCE } from '../../../../../shared/customer-lookup/customer-lookup.tokens';
import { CreditMemoCreatePageComponent } from './credit-memo-create-page.component';

describe('CreditMemoCreatePageComponent', () => {
  let fixture: ComponentFixture<CreditMemoCreatePageComponent>;
  let component: CreditMemoCreatePageComponent;

  const accountingServiceStub = {
    createCreditMemo: vi.fn().mockReturnValue(
      of({
        creditMemoId: 'cm-new',
        originalInvoiceId: 'inv-1',
        customerId: 'cust-1',
        creditAmount: 10,
        totalAmount: 10,
        status: 'ISSUED',
        reasonCode: 'RETURN',
        justificationNote: 'Long enough note here',
        creationTimestamp: '2024-01-01',
      }),
    ),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreditMemoCreatePageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: AccountingService, useValue: accountingServiceStub },
        // Stubs the embedded app-customer-lookup control's search source.
        {
          provide: CUSTOMER_LOOKUP_SOURCE,
          useValue: { search: vi.fn().mockReturnValue(of([])), getById: vi.fn().mockReturnValue(of(null)) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreditMemoCreatePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders form in idle state', () => {
    const form = fixture.nativeElement.querySelector('form');
    expect(form).toBeTruthy();
  });

  it('submit button is disabled when form is invalid', () => {
    const btn = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(btn.disabled).toBe(true);
  });

  it('submit button is enabled when form is valid', () => {
    component.form.patchValue({
      originalInvoiceId: 'inv-1',
      customerId: 'cust-1',
      creditAmount: 10,
      outstandingBalance: 100,
      reasonCode: 'RETURN',
      justificationNote: 'Long enough note here',
    });
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(btn.disabled).toBe(false);
  });

  it('shows result panel on successful submission', () => {
    component.form.patchValue({
      originalInvoiceId: 'inv-1',
      customerId: 'cust-1',
      creditAmount: 10,
      outstandingBalance: 100,
      reasonCode: 'RETURN',
      justificationNote: 'Long enough note here',
    });
    component.submit();
    fixture.detectChanges();
    expect(component.state()).toBe('success');
    expect(component.result()?.creditMemoId).toBe('cm-new');
  });

  it('sets state to error when service errors with 500', () => {
    accountingServiceStub.createCreditMemo.mockReturnValueOnce(
      throwError(() => ({ status: 500 })),
    );
    component.form.patchValue({
      originalInvoiceId: 'inv-1',
      customerId: 'cust-1',
      creditAmount: 10,
      outstandingBalance: 100,
      reasonCode: 'RETURN',
      justificationNote: 'Long enough note here',
    });
    component.submit();
    fixture.detectChanges();
    expect(component.state()).toBe('error');
  });

  it('sets state to forbidden when service errors with 403', () => {
    accountingServiceStub.createCreditMemo.mockReturnValueOnce(
      throwError(() => ({ status: 403 })),
    );
    component.form.patchValue({
      originalInvoiceId: 'inv-1',
      customerId: 'cust-1',
      creditAmount: 10,
      outstandingBalance: 100,
      reasonCode: 'RETURN',
      justificationNote: 'Long enough note here',
    });
    component.submit();
    fixture.detectChanges();
    expect(component.state()).toBe('forbidden');
  });

  it('does not call service when form is invalid', () => {
    accountingServiceStub.createCreditMemo.mockClear();
    component.submit();
    expect(accountingServiceStub.createCreditMemo).not.toHaveBeenCalled();
  });

  it('validates creditAmount must not exceed outstandingBalance', () => {
    component.form.patchValue({
      originalInvoiceId: 'inv-1',
      customerId: 'cust-1',
      creditAmount: 200,
      outstandingBalance: 100,
      reasonCode: 'RETURN',
      justificationNote: 'Long enough note here',
    });
    expect(component.form.hasError('exceedsOutstandingBalance')).toBe(true);
  });

  describe('result total (#409)', () => {
    const money = (value: number, currency: string): string =>
      formatCurrency(value, 'en-US', getCurrencySymbol(currency, 'wide', 'en-US'), currency);

    const memo = (currency: string): CreditMemo => ({
      creditMemoId: 'cm-new',
      creditMemoReference: 'CM-202609-1',
      totalAmount: 250,
      currency,
    });

    const total = (): string =>
      (fixture.nativeElement as HTMLElement).querySelector('.state-panel--success .amount-field')?.textContent ?? '';

    it('formats the total in the currency of the memo (EUR)', () => {
      component.result.set(memo('EUR'));
      fixture.detectChanges();
      expect(total()).toContain(money(250, 'EUR'));
      expect(total()).not.toContain(money(250, 'USD'));
    });

    it('formats a USD memo as USD', () => {
      component.result.set(memo('USD'));
      fixture.detectChanges();
      expect(total()).toContain(money(250, 'USD'));
    });
  });
});
