import { ComponentFixture, TestBed } from '@angular/core/testing';
import { formatCurrency, getCurrencySymbol } from '@angular/common';
import { LocaleService } from '../../../../core/services/locale.service';
import type { PaymentApplication } from '../../models/accounting.models';
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

  describe('result amounts (#408, #409)', () => {
    const money = (value: number, currency: string, locale = 'en-US'): string =>
      formatCurrency(value, locale, getCurrencySymbol(currency, 'wide', locale), currency);

    const applied = (currency: string): PaymentApplication => ({
      paymentId: 'pay-1',
      currency,
      totalAmount: 1234.5,
      appliedAmount: 1000,
    });

    const amounts = (): string[] =>
      Array.from(fixture.nativeElement.querySelectorAll('[data-testid="apply-result"] .amount-field') as NodeListOf<HTMLElement>)
        .map((el) => el.textContent ?? '');

    afterEach(() => TestBed.inject(LocaleService).currentLocale.set('en-US'));

    it('formats the total and applied amounts in the currency of the response (EUR)', () => {
      component.result.set(applied('EUR'));
      fixture.detectChanges();
      const [total, appliedAmount] = amounts();
      expect(total).toContain(money(1234.5, 'EUR'));
      expect(appliedAmount).toContain(money(1000, 'EUR'));
      expect(total).not.toContain(money(1234.5, 'USD'));
    });

    it('formats a USD response as USD', () => {
      component.result.set(applied('USD'));
      fixture.detectChanges();
      const [total, appliedAmount] = amounts();
      expect(total).toContain(money(1234.5, 'USD'));
      expect(appliedAmount).toContain(money(1000, 'USD'));
    });

    for (const locale of ['fr-FR', 'es-MX', 'fr-CA'] as const) {
      it(`formats in the user locale ${locale} and re-renders on switch`, () => {
        const service = TestBed.inject(LocaleService);
        component.result.set(applied('EUR'));
        service.currentLocale.set(locale);
        fixture.detectChanges();
        expect(amounts()[0]).toContain(money(1234.5, 'EUR', locale));

        service.currentLocale.set('en-US');
        fixture.detectChanges();
        expect(amounts()[0]).toContain(money(1234.5, 'EUR'));
      });
    }
  });
});
