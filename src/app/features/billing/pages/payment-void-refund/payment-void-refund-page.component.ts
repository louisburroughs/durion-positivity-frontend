import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { BillingTransportService } from '../../services/billing-transport.service';

@Component({
  selector: 'app-payment-void-refund-page',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './payment-void-refund-page.component.html',
  styleUrl: './payment-void-refund-page.component.css',
})
export class PaymentVoidRefundPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly billingService = inject(BillingTransportService);
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
    if (value.trim() === '') {
      this.refundAmount.set(null);
      return;
    }
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
    return this.state() !== 'submitting'
      && this.refundReason().trim().length > 0
      && this.refundAuthorityCode().trim().length > 0
      && amount !== null && amount > 0;
  }

  executeVoid(reason: string, authorityCode: string): void {
    if (!this.invoiceId() || !this.paymentId()) {
      this.state.set('error');
      this.errorKey.set('BILLING.PAYMENT.ERROR.MISSING_IDS');
      return;
    }
    this.mode.set('void');
    this.state.set('submitting');
    this.errorKey.set(null);

    this.billingService
      .executeVoid(this.invoiceId(), this.paymentId(), reason, authorityCode)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.state.set('ready'),
        error: () => {
          this.state.set('error');
          this.errorKey.set('BILLING.PAYMENT.ERROR.VOID');
        },
      });
  }

  /**
   * Issue #381: the refund SDK contract (`PaymentReversalService.refundPayment`) always requires
   * `amount` — this page loads no invoice/payment data it could derive a refundable balance from,
   * so `amount` is required here too rather than defaulting to an implicit full refund.
   */
  executeRefund(reason: string, authorityCode: string, amount: number | null): void {
    if (!this.invoiceId() || !this.paymentId()) {
      this.state.set('error');
      this.errorKey.set('BILLING.PAYMENT.ERROR.MISSING_IDS');
      return;
    }
    if (amount === null || amount <= 0) {
      this.state.set('error');
      this.errorKey.set('BILLING.PAYMENT.ERROR.REFUND_AMOUNT_REQUIRED');
      return;
    }
    this.mode.set('refund');
    this.state.set('submitting');
    this.errorKey.set(null);

    this.billingService
      .executeRefund(this.invoiceId(), this.paymentId(), reason, authorityCode, amount)
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
