import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { BILLING_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
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
  readonly refundContextStatus = signal<'idle' | 'PENDING' | 'OK' | 'FAILED'>('idle');
  readonly refundContext = signal<RefundContext | null>(null);
  /** Guards a superseded context read (ADR-0063 §1) — bumped on every request, checked on landing. */
  private refundContextSeq = 0;

  /**
   * Per-control permission gates (durion-positivity-backend#2226, catalog v92), mirroring
   * `INVENTORY_PAGE.pickExecute`'s `canExecute`: a legacy token with no `perm_bits` claim
   * (`permissionsKnown() === false`) is treated as granted, exactly like `AuthService.canAccess()`,
   * so a session the backend still admits is never locked out by this client-side hint. The
   * backend enforces both authorities regardless — see `mapVoidErrorKey`/`mapRefundErrorKey`.
   */
  readonly canVoid = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(BILLING_SECTION.voidExecute),
  );
  readonly canRefund = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(BILLING_SECTION.refundExecute),
  );

  /**
   * Inline validation for the refund amount field (ADR-0029 §8.3): shown only once the field has
   * been touched (blur or a submit attempt), never relying on the native `required` attribute —
   * this is a `type="button"` flow whose `(submit)` is prevented, so native constraint validation
   * never reports. Wired to the input via `aria-describedby`/`aria-invalid` in the template.
   *
   * durion-positivity-backend#2226 added a real per-payment balance (`refundContext().refundableAmount`),
   * so a refund typed above it is now caught client-side too — but the server's own 422 (mapped to
   * `REFUND_AMOUNT_EXCEEDS_BALANCE`) stays authoritative for anything this can't see (a concurrent
   * refund, a stale read).
   */
  readonly refundAmountErrorKey = computed<string | null>(() => {
    if (!this.refundAmountTouched()) {
      return null;
    }
    const amount = this.refundAmount();
    if (amount === null || amount <= 0) {
      return 'BILLING.PAYMENT.ERROR.REFUND_AMOUNT_REQUIRED';
    }
    const refundable = this.refundContext()?.refundableAmount;
    if (refundable !== null && refundable !== undefined && amount > refundable) {
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
      && this.canVoid()
      && this.voidReason().trim().length > 0
      && this.voidAuthorityCode().trim().length > 0;
  }

  canSubmitRefund(): boolean {
    const amount = this.refundAmount();
    return this.state() !== 'submitting'
      && this.canRefund()
      && this.refundReason().trim().length > 0
      && this.refundAuthorityCode().trim().length > 0
      && amount !== null && amount > 0
      && this.refundAmountErrorKey() === null;
  }

  /**
   * durion-positivity-backend#2215 ruling: prefills the full refundable balance for the operator
   * to confirm (or edit down to a partial refund) — never submits on its own. Disabled in the
   * template while `refundableAmount` is `null` (not yet `CAPTURED`, or already fully refunded).
   */
  prefillFullBalance(): void {
    const refundable = this.refundContext()?.refundableAmount;
    if (refundable === null || refundable === undefined) {
      return;
    }
    this.refundAmount.set(refundable);
    this.refundAmountTouched.set(true);
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
        error: (err: unknown) => {
          this.state.set('error');
          this.errorKey.set(this.mapVoidErrorKey(err));
        },
      });
  }

  private mapVoidErrorKey(err: unknown): string {
    if (err instanceof HttpErrorResponse && err.status === 403) {
      if (this.isLocationScopeDenied(err)) {
        return 'BILLING.PAYMENT.ERROR.LOCATION_SCOPE_DENIED';
      }
      return 'BILLING.PAYMENT.ERROR.VOID_PERMISSION_DENIED';
    }
    return 'BILLING.PAYMENT.ERROR.VOID';
  }

  /**
   * durion-positivity-backend#2215 ruling: `amount` is always required and explicit — the operator
   * may reach it via {@link prefillFullBalance} or type a partial amount, but the request itself
   * never implies "refund everything". `BILLING_SECTION.refundExecute` (durion-positivity-backend#2226)
   * gates the button (`canRefund`), and the backend enforces `invoice:payment:refund` regardless —
   * a 403 here still maps to a localized permission (or location-scope) error, and a server 422
   * (amount exceeds the remaining refundable balance) maps to its own error. On success, the
   * refund context is re-read (ADR-0063 §5, request-keyed by `refundContextSeq`) so a second refund
   * against this payment sees the updated balance.
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
        return this.isLocationScopeDenied(err)
          ? 'BILLING.PAYMENT.ERROR.LOCATION_SCOPE_DENIED'
          : 'BILLING.PAYMENT.ERROR.REFUND_PERMISSION_DENIED';
      }
      if (err.status === 422) {
        return 'BILLING.PAYMENT.ERROR.REFUND_AMOUNT_EXCEEDS_BALANCE';
      }
    }
    return 'BILLING.PAYMENT.ERROR.REFUND';
  }

  /**
   * ADR-0061 §3 location scoping (#2225/#2227/#2228): a 403 whose body carries
   * `code: 'LOCATION_SCOPE_DENIED'` means the operator holds the authority but not for this
   * invoice's location, distinct from a bare permission denial — mapped to its own localized
   * message (`estimate-detail-page.component.ts`'s `err.error?.code` pattern).
   */
  private isLocationScopeDenied(err: HttpErrorResponse): boolean {
    return (err.error as { code?: string } | null)?.code === 'LOCATION_SCOPE_DENIED';
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
