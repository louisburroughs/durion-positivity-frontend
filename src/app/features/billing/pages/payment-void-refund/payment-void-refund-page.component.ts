import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { RefundContext } from '../../models/billing.models';
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
  readonly refundContextStatus = signal<'idle' | 'PENDING' | 'OK' | 'FAILED'>('idle');
  readonly refundContext = signal<RefundContext | null>(null);
  /** Guards a superseded context read (ADR-0063 §1) — bumped on every request, checked on landing. */
  private refundContextSeq = 0;

  /**
   * Inline validation for the refund amount field (ADR-0029 §8.3): shown only once the field has
   * been touched (blur or a submit attempt), never relying on the native `required` attribute —
   * this is a `type="button"` flow whose `(submit)` is prevented, so native constraint validation
   * never reports. Wired to the input via `aria-describedby`/`aria-invalid` in the template.
   *
   * No client-side balance check here: Copilot #4106106128 removed the `invoice.total`-derived
   * "refundable balance", so there is no safe local figure to validate against. The server's own
   * 422 (mapped to `REFUND_AMOUNT_EXCEEDS_BALANCE`) is authoritative.
   */
  readonly refundAmountErrorKey = computed<string | null>(() => {
    if (!this.refundAmountTouched()) {
      return null;
    }
    const amount = this.refundAmount();
    if (amount === null || amount <= 0) {
      return 'BILLING.PAYMENT.ERROR.REFUND_AMOUNT_REQUIRED';
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
    if (mode === 'refund' && this.refundContextStatus() === 'idle') {
      this.loadRefundContext();
    }
  }

  /** Re-issues the prior-refunds context read after a failed load; also reachable from the template's retry action. */
  retryLoadRefundContext(): void {
    this.loadRefundContext();
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
   * durion-positivity-backend#2215 ruling: `amount` is always required and explicit — never an
   * implicit full refund, and never prefilled (Copilot #4106106128 removed the `invoice.total`
   * proxy). The backend enforces `REFUND_PAYMENT` in the service body; no frontend gate is possible
   * today because that authority has no catalog entry (`route-permissions.ts` — no more
   * `BILLING_SECTION.refundExecute` — durion-positivity-backend#2226 has the full verification), so
   * a 403 here maps to a localized permission error instead. A server 422 (amount exceeds the
   * remaining refundable balance) maps to a localized error too. On success, the prior-refunds
   * context is re-read (ADR-0063 §5) so a second refund against this payment sees the updated total.
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
        next: () => {
          this.state.set('ready');
          this.loadRefundContext();
        },
        error: (err: unknown) => {
          this.state.set('error');
          this.errorKey.set(this.mapRefundErrorKey(err));
        },
      });
  }

  private mapRefundErrorKey(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 403) {
        return 'BILLING.PAYMENT.ERROR.REFUND_PERMISSION_DENIED';
      }
      if (err.status === 422) {
        return 'BILLING.PAYMENT.ERROR.REFUND_AMOUNT_EXCEEDS_BALANCE';
      }
    }
    return 'BILLING.PAYMENT.ERROR.REFUND';
  }

  private loadRefundContext(): void {
    const invoiceId = this.invoiceId();
    const paymentId = this.paymentId();
    if (!invoiceId || !paymentId) {
      this.refundContextStatus.set('FAILED');
      return;
    }

    const seq = ++this.refundContextSeq;
    this.refundContextStatus.set('PENDING');

    this.billingService
      .loadRefundContext(invoiceId, paymentId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: context => {
          if (seq !== this.refundContextSeq) return; // superseded read (ADR-0063 §1)
          this.refundContext.set(context);
          this.refundContextStatus.set('OK');
        },
        error: () => {
          if (seq !== this.refundContextSeq) return;
          this.refundContextStatus.set('FAILED');
        },
      });
  }
}
