import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe } from '@ngx-translate/core';
import { BILLING_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import {
  GenerateReceiptRequest,
  RECEIPT_REPRINT_OVERRIDE_THRESHOLD,
  ReceiptRef,
} from '../../models/billing.models';
import { BillingTransportService } from '../../services/billing-transport.service';

@Component({
  selector: 'app-receipt-page',
  standalone: true,
  imports: [DatePipe, DecimalPipe, TranslatePipe],
  templateUrl: './receipt-page.component.html',
  styleUrl: './receipt-page.component.css',
})
export class ReceiptPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly billingService = inject(BillingTransportService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);

  readonly invoiceId = signal<string>('');
  readonly receiptId = signal<string | null>(null);
  readonly state = signal<'idle' | 'loading' | 'ready' | 'submitting' | 'error'>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly receipt = signal<ReceiptRef | null>(null);
  readonly deliveryMethod = signal<'PRINT' | 'EMAIL' | 'NONE'>('PRINT');
  readonly emailAddress = signal<string>('');

  /**
   * `BILLING_SECTION.receiptGenerate` (durion-positivity-backend#2226) gates the generate button,
   * mirroring `INVENTORY_PAGE.pickExecute`'s `canExecute`: a legacy token with no `perm_bits` claim
   * is treated as granted, and the backend enforces `invoice:receipt:generate` regardless of this
   * client-side hint (see `generateAndShow`'s error mapping).
   */
  readonly canGeneratePermission = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(BILLING_SECTION.receiptGenerate),
  );

  /**
   * Past `RECEIPT_REPRINT_OVERRIDE_THRESHOLD` reprints, `ReceiptServiceImpl.reprintReceipt`
   * requires `invoice:receipt:reprint_override` in addition to the plain (ungated) reprint
   * authority — a distinction the page can only make now that `getReceipt` (#2214) reports
   * `reprintCount`.
   */
  readonly reprintOverrideNeeded = computed(
    () => (this.receipt()?.reprintCount ?? 0) >= RECEIPT_REPRINT_OVERRIDE_THRESHOLD,
  );
  readonly canReprintPastCap = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(BILLING_SECTION.receiptReprintOverride),
  );

  /** The payment to document, when the page is reached from the capture page (query param). */
  private paymentId: string | undefined;

  ngOnInit(): void {
    const invoiceId = this.route.snapshot.paramMap.get('invoiceId') ?? '';
    const receiptId = this.route.snapshot.paramMap.get('receiptId');
    this.paymentId = this.route.snapshot.queryParamMap?.get('paymentId') ?? undefined;

    this.invoiceId.set(invoiceId);
    this.receiptId.set(receiptId);

    if (!receiptId) {
      this.state.set('idle');
      return;
    }

    if (!invoiceId) {
      this.state.set('error');
      this.errorKey.set('BILLING.RECEIPT.ERROR.MISSING_INVOICE');
      return;
    }

    // durion-positivity-backend#2214: `ReceiptService.getReceipt` is a real read-only GET now, so
    // a receiptId already in the route (a deep link or a reload) loads the receipt directly
    // instead of showing a not-available state that only offered a reprint.
    this.state.set('loading');
    this.errorKey.set(null);

    this.billingService
      .loadReceipt(invoiceId, receiptId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: receipt => {
          this.receipt.set(receipt);
          this.state.set('ready');
        },
        error: (err: unknown) => {
          this.state.set('error');
          this.errorKey.set(
            err instanceof HttpErrorResponse && err.status === 404
              ? 'BILLING.RECEIPT.ERROR.NOT_FOUND'
              : this.mapGenerateOrLoadErrorKey(err, 'BILLING.RECEIPT.ERROR.LOAD'),
          );
        },
      });
  }

  generateAndShow(delivery?: GenerateReceiptRequest): void {
    if (!this.invoiceId()) {
      this.state.set('error');
      this.errorKey.set('BILLING.RECEIPT.ERROR.MISSING_INVOICE');
      return;
    }
    this.state.set('submitting');
    this.errorKey.set(null);

    this.billingService
      .generateReceipt(this.invoiceId(), delivery ?? {}, this.paymentId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: receipt => {
          this.receiptId.set(receipt.receiptId);
          this.receipt.set(receipt);
          this.state.set('ready');
        },
        error: (err: unknown) => {
          this.state.set('error');
          this.errorKey.set(
            this.mapGenerateOrLoadErrorKey(err, 'BILLING.RECEIPT.ERROR.GENERATE'),
          );
        },
      });
  }

  private mapGenerateOrLoadErrorKey(err: unknown, genericKey: string): string {
    if (err instanceof HttpErrorResponse && err.status === 403) {
      return this.isLocationScopeDenied(err)
        ? 'BILLING.RECEIPT.ERROR.LOCATION_SCOPE_DENIED'
        : 'BILLING.RECEIPT.ERROR.GENERATE_PERMISSION_DENIED';
    }
    return genericKey;
  }

  /**
   * ADR-0061 §3 location scoping (#2225/#2227/#2228): distinguishes "wrong location" from a bare
   * permission denial, matching the pattern in `payment-void-refund-page.component.ts` and
   * `estimate-detail-page.component.ts`'s `err.error?.code` read.
   */
  private isLocationScopeDenied(err: HttpErrorResponse): boolean {
    return (err.error as { code?: string } | null)?.code === 'LOCATION_SCOPE_DENIED';
  }

  setDeliveryMethod(method: 'PRINT' | 'EMAIL' | 'NONE'): void {
    this.deliveryMethod.set(method);
    if (method !== 'EMAIL') {
      this.emailAddress.set('');
    }
  }

  canGenerate(): boolean {
    if (this.state() === 'submitting' || !this.canGeneratePermission()) {
      return false;
    }
    if (this.deliveryMethod() === 'EMAIL') {
      return this.emailAddress().trim().length > 0;
    }
    return true;
  }

  generateFromForm(): void {
    const method = this.deliveryMethod();
    const email = method === 'EMAIL' ? this.emailAddress().trim() : undefined;
    this.generateAndShow({
      deliveryMethod: method,
      emailAddress: email || undefined,
    });
  }

  /**
   * Below `RECEIPT_REPRINT_OVERRIDE_THRESHOLD`, `reprintReceipt` needs only an authenticated
   * caller — no frontend gate, matching the backend (`ReceiptServiceImpl`, verified against
   * origin/main). Past it, `invoice:receipt:reprint_override` is required, which this gates via
   * `canReprintPastCap` once `reprintOverrideNeeded` is known (durion-positivity-backend#2214's
   * `reprintCount`). A 403 always maps to a localized permission (or location-scope) error.
   */
  canReprint(): boolean {
    if (this.state() === 'submitting') {
      return false;
    }
    return !this.reprintOverrideNeeded() || this.canReprintPastCap();
  }

  reprint(): void {
    const receiptId = this.receiptId() ?? this.receipt()?.receiptId;
    if (!receiptId) {
      this.state.set('error');
      this.errorKey.set('BILLING.RECEIPT.ERROR.REPRINT');
      return;
    }

    this.state.set('submitting');
    this.errorKey.set(null);

    this.billingService
      .reprintReceipt(this.invoiceId(), receiptId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: receipt => {
          this.receipt.set(receipt);
          this.state.set('ready');
        },
        error: (err: unknown) => {
          this.state.set('error');
          this.errorKey.set(this.mapReprintErrorKey(err));
        },
      });
  }

  private mapReprintErrorKey(err: unknown): string {
    if (err instanceof HttpErrorResponse && err.status === 403) {
      if (this.isLocationScopeDenied(err)) {
        return 'BILLING.RECEIPT.ERROR.LOCATION_SCOPE_DENIED';
      }
      return this.reprintOverrideNeeded()
        ? 'BILLING.RECEIPT.ERROR.REPRINT_OVERRIDE_REQUIRED'
        : 'BILLING.RECEIPT.ERROR.REPRINT_PERMISSION_DENIED';
    }
    return 'BILLING.RECEIPT.ERROR.REPRINT';
  }
}
