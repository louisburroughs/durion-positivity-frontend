import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { VendorLookupComponent } from '../../../components/vendor-lookup/vendor-lookup.component';
import { VendorBill, VendorPaymentRequest, VendorPaymentResult } from '../../../models/accounting.models';
import { AccountingService } from '../../../services/accounting.service';
import { MoneyPipe } from '../../../../../shared/money.pipe';

// Human-readable payment reference (PAY-YYYYMMDD-XXXXXXXXXXXX) — shown in a
// visible input, so no raw UUIDs; but it is also the payment's idempotency /
// lookup key (getPaymentByRef), so the suffix keeps 48 bits of entropy to make
// same-day collisions negligible. crypto.getRandomValues exists in every
// supported runtime (evergreen browsers + the Node SSR server).
function generatePaymentRef(): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const suffix = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `PAY-${stamp}-${suffix}`;
}

/** The field each bill number rides on in a 403 `AP_PAYMENT_SELF_APPROVED_BILL` (CAP:550 S13). */
const SELF_APPROVED_FIELD = 'selfApprovedBillNumbers';

/**
 * The bill numbers of a 403 `AP_PAYMENT_SELF_APPROVED_BILL` — the payer
 * approved them, so another person must pay them (AW6.2) — or null for any
 * other refusal. Classified by code, never by status alone (ADR-0017).
 */
export function selfApprovedBills(error: unknown): readonly string[] | null {
  const body = (error as { error?: unknown } | null)?.error;
  if (!body || typeof body !== 'object') return null;
  const { code, fieldErrors } = body as { code?: unknown; fieldErrors?: unknown };
  if (code !== 'AP_PAYMENT_SELF_APPROVED_BILL') return null;
  const numbers = Array.isArray(fieldErrors)
    ? fieldErrors
        .filter(entry => entry && typeof entry === 'object' && (entry as { field?: unknown }).field === SELF_APPROVED_FIELD)
        .map(entry => String((entry as { message?: unknown }).message ?? '').trim())
        .filter(number => number.length > 0)
    : [];
  return numbers;
}

/** A classified payment refusal: its sentence, never "may have landed" when nothing was written. */
export interface PaymentRefusal {
  readonly key: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/**
 * Payment refusals classified by code (Accounting ruling rows 10–13 on #464;
 * ADR-0017): the method, the vendor's state, a busy lock, and the pay-from
 * account this page cannot choose yet (S14b). Null for anything else, which
 * keeps today's handling.
 */
export function paymentRefusal(error: unknown): PaymentRefusal | null {
  const response = error as { error?: unknown; status?: number; headers?: { get?: (name: string) => string | null } } | null;
  const body = response?.error && typeof response.error === 'object' ? (response.error as { code?: unknown; fieldErrors?: unknown }) : {};
  const fieldErrors = Array.isArray(body.fieldErrors)
    ? body.fieldErrors.filter((entry): entry is { field?: unknown; message?: unknown } => !!entry && typeof entry === 'object')
    : [];
  const retryAfter = response?.headers?.get?.('Retry-After')?.trim() ?? null;
  const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null;
  switch (body.code) {
    case 'AP_PAYMENT_METHOD_NOT_SUPPORTED':
      return { key: 'ACCOUNTING.VENDOR_PAYMENT_NEW.REFUSAL.METHOD', params: {} };
    case 'VENDOR_INACTIVE':
      return { key: 'ACCOUNTING.VENDOR_PAYMENT_NEW.REFUSAL.VENDOR_INACTIVE', params: {} };
    case 'VENDOR_ON_AP_HOLD':
      return { key: 'ACCOUNTING.VENDOR_PAYMENT_NEW.REFUSAL.VENDOR_ON_AP_HOLD', params: {} };
    case 'VENDOR_PAYMENT_DETAILS_CHANGED': {
      const bills = fieldErrors.map(entry => String(entry.message ?? '').trim()).filter(Boolean).join(', ');
      return bills
        ? { key: 'ACCOUNTING.VENDOR_PAYMENT_NEW.REFUSAL.DETAILS_CHANGED', params: { bills } }
        : { key: 'ACCOUNTING.VENDOR_PAYMENT_NEW.REFUSAL.DETAILS_CHANGED_UNNAMED', params: {} };
    }
    case 'VENDOR_REPLICATION_PENDING':
      // Nothing was written: try again later, never "may have landed".
      return seconds !== null
        ? { key: 'ACCOUNTING.VENDOR_PAYMENT_NEW.REFUSAL.REPLICATION_PENDING_AFTER', params: { seconds } }
        : { key: 'ACCOUNTING.VENDOR_PAYMENT_NEW.REFUSAL.REPLICATION_PENDING', params: {} };
    case 'LOCK_TIMEOUT':
      return { key: 'ACCOUNTING.VENDOR_PAYMENT_NEW.REFUSAL.LOCK_TIMEOUT', params: {} };
  }
  if (fieldErrors.some(entry => entry.field === 'bankAccountId')) {
    return { key: 'ACCOUNTING.VENDOR_PAYMENT_NEW.REFUSAL.PAY_FROM', params: {} };
  }
  return null;
}

type VendorPaymentState =
  | 'idle'
  | 'loading-bills'
  | 'submitting'
  | 'success'
  | 'replayed'
  | 'conflict'
  | 'error'
  | 'forbidden'
  | 'self-approved'
  | 'refused';

@Component({
  selector: 'app-vendor-payment-new-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, VendorLookupComponent, MoneyPipe],
  templateUrl: './vendor-payment-new-page.component.html',
  styleUrl: './vendor-payment-new-page.component.css',
})
export class VendorPaymentNewPageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly accountingService = inject(AccountingService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<VendorPaymentState>('idle');
  readonly bills = signal<VendorBill[]>([]);
  readonly result = signal<VendorPaymentResult | null>(null);
  /** The bills a 403 `AP_PAYMENT_SELF_APPROVED_BILL` named, joined for the alert. */
  readonly selfApproved = signal<string | null>(null);
  /** A refusal classified by code (`paymentRefusal`). */
  readonly refusal = signal<PaymentRefusal | null>(null);

  readonly form = this.fb.group({
    vendorId: ['', [Validators.required]],
    grossAmount: [0, [Validators.required, Validators.min(0.01)]],
    currency: ['USD', [Validators.required]],
    paymentMethod: ['ACH', [Validators.required]],
    paymentRef: [generatePaymentRef(), [Validators.required]],
    paymentSource: [''],
    memo: [''],
    allocationsJson: ['[]'],
  });

  ngOnInit(): void {
    const vendorId = this.route.snapshot.queryParamMap.get('vendorId');
    if (vendorId) {
      this.form.controls.vendorId.setValue(vendorId);
    }
  }

  loadBills(): void {
    const vendorId = this.form.controls.vendorId.value;
    if (!vendorId) {
      return;
    }

    this.state.set('loading-bills');
    this.accountingService
      .listBillsByVendor(vendorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: bills => {
          this.bills.set(bills);
          this.state.set('idle');
        },
        error: err => {
          this.state.set((err?.status ?? 0) === 403 ? 'forbidden' : 'error');
        },
      });
  }

  submit(): void {
    if (this.form.invalid) {
      return;
    }

    const value = this.form.getRawValue();
    const vendorId = value.vendorId ?? '';
    const currency = value.currency ?? '';
    const paymentRef = value.paymentRef ?? '';
    if (!vendorId || !currency || !paymentRef) {
      return;
    }

    let allocations: Array<{ vendorBillId: string; amount: number }>;
    try {
      allocations = JSON.parse(value.allocationsJson || '[]') as Array<{
        vendorBillId: string;
        amount: number;
      }>;
    } catch {
      this.state.set('error');
      return;
    }

    this.state.set('submitting');
    this.selfApproved.set(null);
    this.refusal.set(null);
    this.accountingService
      .executePayment({
        vendorId,
        grossAmount: Number(value.grossAmount),
        currency,
        paymentMethod: value.paymentMethod as VendorPaymentRequest['paymentMethod'],
        paymentRef,
        paymentSource: value.paymentSource || undefined,
        memo: value.memo || undefined,
        allocations,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: payment => {
          this.result.set(payment);
          this.state.set('success');
        },
        error: err => {
          const status = err?.status ?? 0;
          const refusal = paymentRefusal(err);
          if (refusal) {
            this.refusal.set(refusal);
            this.state.set('refused');
            return;
          }
          if (status === 409) {
            this.state.set('conflict');
            return;
          }
          const bills = status === 403 ? selfApprovedBills(err) : null;
          if (bills) {
            // Nothing was paid; the form stays so the payment can leave these bills out.
            this.selfApproved.set(bills.length ? bills.join(', ') : null);
            this.state.set('self-approved');
            return;
          }
          this.state.set(status === 403 ? 'forbidden' : 'error');
        },
      });
  }
}
