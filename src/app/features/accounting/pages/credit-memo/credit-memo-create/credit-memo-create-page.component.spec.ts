import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AccountingService } from '../../../services/accounting.service';
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
});
