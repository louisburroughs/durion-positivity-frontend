import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { switchMap } from 'rxjs';
import {
  PaymentMethod,
  PaymentTransactionRef,
} from '../../models/billing.models';
import { BillingService } from '../../services/billing.service';

@Component({
  selector: 'app-payment-capture-page',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, RouterLink, TranslatePipe],
  templateUrl: './payment-capture-page.component.html',
  styleUrl: './payment-capture-page.component.css',
})
export class PaymentCapturePageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly billing = inject(BillingService);
  private readonly destroyRef = inject(DestroyRef);

  readonly invoiceId = signal<string>('');
  readonly state = signal<'idle' | 'loading' | 'ready' | 'submitting' | 'error'>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly transaction = signal<PaymentTransactionRef | null>(null);
  readonly selectedMethod = signal<PaymentMethod>('CARD');
  readonly amount = signal<number | null>(null);

  ngOnInit(): void {
    this.invoiceId.set(this.route.snapshot.paramMap.get('invoiceId') ?? '');
  }

  setSelectedMethod(method: string): void {
    this.selectedMethod.set(method as PaymentMethod);
  }

  setAmount(value: string): void {
    const parsed = Number(value);
    this.amount.set(Number.isFinite(parsed) ? parsed : null);
  }

  canSubmitCapture(): boolean {
    return this.state() !== 'submitting' && (this.amount() ?? 0) > 0;
  }

  initiateAndCapture(method: PaymentMethod, amount: number): void {
    const invoiceId = this.invoiceId();
    if (!invoiceId) {
      this.state.set('error');
      this.errorKey.set('BILLING.PAYMENT.ERROR.CAPTURE');
      return;
    }

    this.state.set('submitting');
    this.errorKey.set(null);

    this.billing
      .initiatePayment(invoiceId, {
        paymentMethod: method,
        amount,
        currency: 'USD',
      })
      .pipe(
        switchMap(result => this.billing.capturePayment(invoiceId, result.paymentId)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: captured => {
          this.transaction.set(captured);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('BILLING.PAYMENT.ERROR.CAPTURE');
        },
      });
  }
}
