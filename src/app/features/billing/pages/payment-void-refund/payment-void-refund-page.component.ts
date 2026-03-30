import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { BillingService } from '../../services/billing.service';

@Component({
  selector: 'app-payment-void-refund-page',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './payment-void-refund-page.component.html',
  styleUrl: './payment-void-refund-page.component.css',
})
export class PaymentVoidRefundPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly billing = inject(BillingService);
  private readonly destroyRef = inject(DestroyRef);

  readonly invoiceId = signal<string>('');
  readonly paymentId = signal<string>('');
  readonly mode = signal<'void' | 'refund'>('void');
  readonly state = signal<'idle' | 'loading' | 'ready' | 'submitting' | 'error'>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly voidReason = signal<string>('');
  readonly voidAuthorityCode = signal<string>('');
  readonly refundReason = signal<string>('');
  readonly refundAuthorityCode = signal<string>('');
  readonly refundAmount = signal<number | null>(null);

  ngOnInit(): void {
    this.invoiceId.set(this.route.snapshot.paramMap.get('invoiceId') ?? '');
    this.paymentId.set(this.route.snapshot.paramMap.get('paymentId') ?? '');
    this.state.set('ready');
  }

  setMode(mode: 'void' | 'refund'): void {
    this.mode.set(mode);
    this.errorKey.set(null);
    if (this.state() !== 'submitting') {
      this.state.set('ready');
    }
  }

  setRefundAmount(value: string): void {
    const parsed = Number(value);
    this.refundAmount.set(Number.isFinite(parsed) ? parsed : null);
  }

  canSubmitVoid(): boolean {
    return this.state() !== 'submitting'
      && this.voidReason().trim().length > 0
      && this.voidAuthorityCode().trim().length > 0;
  }

  canSubmitRefund(): boolean {
    const amount = this.refundAmount();
    const amountValid = amount === null || amount > 0;
    return this.state() !== 'submitting'
      && this.refundReason().trim().length > 0
      && this.refundAuthorityCode().trim().length > 0
      && amountValid;
  }

  executeVoid(reason: string, authorityCode: string): void {
    this.mode.set('void');
    this.state.set('submitting');
    this.errorKey.set(null);

    this.billing
      .voidPayment(this.invoiceId(), this.paymentId(), { reason, authorityCode })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.state.set('ready'),
        error: () => {
          this.state.set('error');
          this.errorKey.set('BILLING.PAYMENT.ERROR.VOID');
        },
      });
  }

  executeRefund(reason: string, authorityCode: string, amount?: number): void {
    this.mode.set('refund');
    this.state.set('submitting');
    this.errorKey.set(null);

    this.billing
      .refundPayment(this.invoiceId(), this.paymentId(), {
        reason,
        authorityCode,
        amount,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.state.set('ready'),
        error: () => {
          this.state.set('error');
          this.errorKey.set('BILLING.PAYMENT.ERROR.REFUND');
        },
      });
  }
}
