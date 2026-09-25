import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../../core/services/auth.service';
import { BILLING_SECTION } from '../../../../core/security/route-permissions';
import { RefundBalance } from '../../models/billing.models';
import { BillingTransportService } from '../../services/billing-transport.service';

@Component({
  selector: 'app-payment-void-refund-page',
  standalone: true,
  imports: [DecimalPipe, TranslatePipe],
  templateUrl: './payment-void-refund-page.component.html',
  styleUrl: './payment-void-refund-page.component.css',
})
export class PaymentVoidRefundPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly billingService = inject(BillingTransportService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);

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
  readonly refundAmountTouched = signal(false);

  /** Per-source read status (AGENTS.md §"placement vs. authorization" pattern), never a bare flag. */
  readonly refundBalanceStatus = signal<'idle' | 'PENDING' | 'OK' | 'FAILED'>('idle');
  readonly refundBalance = signal<RefundBalance | null>(null);
  /** Guards a superseded balance read (ADR-0063 §1) — bumped on every request, checked on landing. */
  private refundBalanceSeq = 0;

  /**
   * `refundPayment` enforces `REFUND_PAYMENT` in the service body, not via `@PreAuthorize`
   * (`route-permissions.ts` `BILLING_SECTION.refundExecute` docblock has the full verification).
   * Unknown-permission fallback per ADR-0040 §6a.3: a legacy token with no `perm_bits` claim stays
   * open, matching `canAccess()`.
   */
  readonly canRefund = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(BILLING_SECTION.refundExecute),
  );

  /**
   * Inline validation for the refund amount field (ADR-0029 §8.3): shown only once the field has
   * been touched (blur or a submit attempt), never relying on the native `required` attribute —
   * this is a `type="button"` flow whose `(submit)` is prevented, so native constraint validation
   * never reports. Wired to the input via `aria-describedby`/`aria-invalid` in the template.
   */
  readonly refundAmountErrorKey = computed<string | null>(() => {
    if (!this.refundAmountTouched()) {
      return null;
    }
    const amount = this.refundAmount();
    if (amount === null || amount <= 0) {
      return 'BILLING.PAYMENT.ERROR.REFUND_AMOUNT_REQUIRED';
    }
    const balance = this.refundBalance();
    if (balance && amount > balance.refundableBalance) {
      return 'BILLING.PAYMENT.ERROR.REFUND_AMOUNT_EXCEEDS_BALANCE';
    }
    return null;
  });

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
    if (mode === 'refund' && this.refundBalanceStatus() === 'idle') {
      this.loadRefundBalance();
    }
  }

  /** Re-issues the balance read after a failed load; also reachable from the template's retry action. */
  retryLoadRefundBalance(): void {
    this.loadRefundBalance();
  }

  /**
   * Prefills the amount field with the computed refundable balance for the operator to review and
   * confirm — never submits on its own (durion-positivity-backend#2215 ruling: "the operator must
   * see/confirm the figure").
   */
  useFullRefundBalance(): void {
    const balance = this.refundBalance();
    if (!balance) {
      return;
    }
    this.refundAmount.set(balance.refundableBalance);
    this.refundAmountTouched.set(true);
  }

  markRefundAmountTouched(): void {
    this.refundAmountTouched.set(true);
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
    const balance = this.refundBalance();
    return this.state() !== 'submitting'
      && this.canRefund()
      && this.refundReason().trim().length > 0
      && this.refundAuthorityCode().trim().length > 0
      && amount !== null && amount > 0
      && (!balance || amount <= balance.refundableBalance);
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
   * durion-positivity-backend#2215 ruling: `amount` is always required and explicit — never an
   * implicit full refund — whether typed for a partial refund or prefilled by
   * {@link useFullRefundBalance}. The write itself is gated independently on {@link canRefund}
   * (ADR-0040 §6a.1–2), re-checked here rather than trusted from the disabled control alone. A
   * server 422 (amount exceeds the remaining refundable balance) maps to a localized error instead
   * of the generic one.
   */
  executeRefund(reason: string, authorityCode: string, amount: number | null): void {
    if (!this.canRefund()) {
      return;
    }
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
    const balance = this.refundBalance();
    if (balance && amount > balance.refundableBalance) {
      this.state.set('error');
      this.errorKey.set('BILLING.PAYMENT.ERROR.REFUND_AMOUNT_EXCEEDS_BALANCE');
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
        error: (err: unknown) => {
          this.state.set('error');
          this.errorKey.set(
            err instanceof HttpErrorResponse && err.status === 422
              ? 'BILLING.PAYMENT.ERROR.REFUND_AMOUNT_EXCEEDS_BALANCE'
              : 'BILLING.PAYMENT.ERROR.REFUND',
          );
        },
      });
  }

  private loadRefundBalance(): void {
    const invoiceId = this.invoiceId();
    const paymentId = this.paymentId();
    if (!invoiceId || !paymentId) {
      this.refundBalanceStatus.set('FAILED');
      return;
    }

    const seq = ++this.refundBalanceSeq;
    this.refundBalanceStatus.set('PENDING');

    this.billingService
      .loadRefundBalance(invoiceId, paymentId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: balance => {
          if (seq !== this.refundBalanceSeq) return; // superseded read (ADR-0063 §1)
          this.refundBalance.set(balance);
          this.refundBalanceStatus.set('OK');
        },
        error: () => {
          if (seq !== this.refundBalanceSeq) return;
          this.refundBalanceStatus.set('FAILED');
        },
      });
  }
}
