import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AccountingService } from '../../services/accounting.service';
import { PaymentApplyPageComponent } from './payment-apply-page.component';

describe('PaymentApplyPageComponent', () => {
  let fixture: ComponentFixture<PaymentApplyPageComponent>;
  let component: PaymentApplyPageComponent;

  const accountingServiceStub = {
    applyPayment: vi.fn().mockReturnValue(
      of({
        paymentId: 'pay-1',
        customerCredit: { creditId: 'credit-1' },
      }),
    ),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentApplyPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AccountingService, useValue: accountingServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentApplyPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('generates idempotency key on init', () => {
    expect(component.applicationRequestId()).toBeTruthy();
  });

  it('shows result on success', () => {
    component.form.patchValue({
      paymentId: 'payment-1',
      applicationsJson: '[{"invoiceId":"inv-1","amount":10}]',
    });
    component.submit();
    fixture.detectChanges();

    const result = fixture.nativeElement.querySelector('[data-testid="apply-result"]');
    expect(result.textContent).toContain('pay-1');
  });

  it('submit() sets state to error when service returns 500', () => {
    accountingServiceStub.applyPayment.mockReturnValueOnce(
      throwError(() => ({ status: 500 })),
    );
    component.form.patchValue({
      paymentId: 'payment-1',
      applicationsJson: '[{"invoiceId":"inv-1","amount":10}]',
    });
    component.submit();
    expect(component.state()).toBe('error');
  });

  it('submit() sets state to forbidden when service returns 403', () => {
    accountingServiceStub.applyPayment.mockReturnValueOnce(
      throwError(() => ({ status: 403 })),
    );
    component.form.patchValue({
      paymentId: 'payment-1',
      applicationsJson: '[{"invoiceId":"inv-1","amount":10}]',
    });
    component.submit();
    expect(component.state()).toBe('forbidden');
  });

  it('submit button is disabled when paymentId is empty', () => {
    component.form.patchValue({ paymentId: '', applicationsJson: '[]' });
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(btn.disabled).toBe(true);
  });

  describe('submit()', () => {
    it('should set error state when applicationsJson is invalid JSON', () => {
      component.form.patchValue({
        paymentId: 'p-1',
        applicationsJson: 'not-json',
      });
      component.submit();
      expect(component.state()).toBe('error');
    });
  });
});
