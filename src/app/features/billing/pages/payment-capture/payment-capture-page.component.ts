import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { BILLING_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import {
  PaymentMethod,
  PaymentTransactionRef,
} from '../../models/billing.models';
import { BillingTransportService } from '../../services/billing-transport.service';
import { MoneyPipe } from '../../../../shared/money.pipe';

@Component({
  selector: 'app-payment-capture-page',
  standalone: true,
  imports: [MoneyPipe, DatePipe, RouterLink, TranslatePipe],
  templateUrl: './payment-capture-page.component.html',
  styleUrl: './payment-capture-page.component.css',
})
export class PaymentCapturePageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly billingService = inject(BillingTransportService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);

  /** Mirrors `PaymentServiceImpl.PAYMENT_LIMIT_THRESHOLD` (durion-positivity-backend#2393, BILL-DEC-010). */
  readonly paymentLimit = 500;

  readonly invoiceId = signal<string>('');
  readonly state = signal<'idle' | 'loading' | 'ready' | 'submitting' | 'error'>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly transaction = signal<PaymentTransactionRef | null>(null);
  readonly selectedMethod = signal<PaymentMethod>('CARD');
  readonly amount = signal<number | null>(null);

  /**
   * Issue #431: an initiate above {@link paymentLimit} needs `invoice:payment:limit_override`, checked
   * by the backend only once the amount is known. The page pre-warns and blocks the submit rather than
   * let the cashier find out from a 403. A legacy token with no `perm_bits` claim
   * (`permissionsKnown() === false`) is treated as granted, like `PaymentVoidRefundPageComponent.canVoid`;
   * the backend enforces the code regardless, and that 403 still maps to a localized error.
   */
  readonly limitOverrideRequired = computed(() => this.needsLimitOverride(this.amount()));

  /**
   * ADR-0040 §6a: the submit control and {@link initiateAndCapture} re-check
   * `invoice:payment:process` independently of the route gate, so a direct call or a permission
   * change after navigation is refused client-side too. Legacy-token fallback as above.
   */
  readonly canProcessPayment = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(BILLING_SECTION.paymentProcess),
  );

  ngOnInit(): void {
    this.invoiceId.set(this.route.snapshot.paramMap.get('invoiceId') ?? '');
  }

  setSelectedMethod(method: PaymentMethod): void {
    this.selectedMethod.set(method);
  }

  setAmount(value: string): void {
    const parsed = Number(value);
    this.amount.set(Number.isFinite(parsed) ? parsed : null);
  }

  canSubmitCapture(): boolean {
    return this.state() !== 'submitting'
      && (this.amount() ?? 0) > 0
      && this.canProcessPayment()
      && !this.limitOverrideRequired();
  }

  initiateAndCapture(method: PaymentMethod, amount: number): void {
    if (!this.canProcessPayment()) {
      this.state.set('error');
      this.errorKey.set('BILLING.PAYMENT.ERROR.CAPTURE_PERMISSION_DENIED');
      return;
    }

    const invoiceId = this.invoiceId();
    if (!invoiceId) {
      this.state.set('error');
      this.errorKey.set('BILLING.PAYMENT.ERROR.CAPTURE');
      return;
    }

    if (this.needsLimitOverride(amount)) {
      this.state.set('error');
      this.errorKey.set('BILLING.PAYMENT.ERROR.LIMIT_OVERRIDE_REQUIRED');
      return;
    }

    this.state.set('submitting');
    this.errorKey.set(null);

    this.billingService
      .initiateAndCapturePayment(invoiceId, method, amount)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: captured => {
          this.transaction.set(captured);
          this.state.set('ready');
        },
        error: (err: unknown) => {
          this.state.set('error');
          this.errorKey.set(this.mapCaptureErrorKey(err));
        },
      });
  }

  private needsLimitOverride(amount: number | null): boolean {
    return (amount ?? 0) > this.paymentLimit
      && this.auth.permissionsKnown()
      && !this.auth.hasAnyPermission(BILLING_SECTION.paymentLimitOverride);
  }

  private mapCaptureErrorKey(err: unknown): string {
    if (err instanceof HttpErrorResponse && err.status === 403) {
      if ((err.error as { code?: string } | null)?.code === 'LOCATION_SCOPE_DENIED') {
        return 'BILLING.PAYMENT.ERROR.LOCATION_SCOPE_DENIED';
      }
      return 'BILLING.PAYMENT.ERROR.CAPTURE_PERMISSION_DENIED';
    }
    return 'BILLING.PAYMENT.ERROR.CAPTURE';
  }
}
