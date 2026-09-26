import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { switchMap, tap } from 'rxjs/operators';
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

  /**
   * Guards a superseded receipt read (ADR-0063 §1) — bumped on the deep-link load and on the
   * post-reprint re-read below, checked on landing.
   */
  private receiptReadSeq = 0;
  /**
   * True once a reprint has succeeded but its authoritative re-read has not (yet) landed: the
   * displayed detail's `reprintCount` is then stale, so no further reprint may be based on it
   * (ADR-0064 — actionability is gated on a successful read outcome).
   */
  private readonly receiptStale = signal(false);

  /**
   * durion-positivity-backend#2226's receipt status enum has one member (`GENERATED`) today
   * (`ReceiptViewResponseStatusEnum`, verified against `@durion-sdk/invoice` types); this allowlist
   * mirrors `payment-capture-page.component.html`'s `'STATUS.' + status` pattern rather than
   * rendering `r.status` raw, and falls back to `COMMON.NOT_AVAILABLE` for anything the SDK adds
   * later that this page doesn't recognize yet.
   */
  receiptStatusKey(status: string | null | undefined): string {
    switch (status) {
      case 'GENERATED':
        return 'BILLING.RECEIPT.STATUS.GENERATED';
      default:
        return 'COMMON.NOT_AVAILABLE';
    }
  }

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

    const seq = ++this.receiptReadSeq;

    this.billingService
      .loadReceipt(invoiceId, receiptId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: receipt => {
          if (seq !== this.receiptReadSeq) return; // superseded read (ADR-0063 §1)
          this.receipt.set(receipt);
          this.receiptStale.set(false);
          this.state.set('ready');
        },
        error: (err: unknown) => {
          if (seq !== this.receiptReadSeq) return;
          this.state.set('error');
          this.errorKey.set(
            err instanceof HttpErrorResponse && err.status === 404
              ? 'BILLING.RECEIPT.ERROR.NOT_FOUND'
              : this.mapPermissionErrorKey(
                  err,
                  'BILLING.RECEIPT.ERROR.LOAD_PERMISSION_DENIED',
                  'BILLING.RECEIPT.ERROR.LOAD',
                ),
          );
        },
      });
  }

  generateAndShow(delivery?: GenerateReceiptRequest): void {
    // Re-checked here, not only at the control (ADR-0040 §6a.2).
    if (!this.canGeneratePermission()) {
      return;
    }
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
          this.receiptStale.set(false);
          this.state.set('ready');
        },
        error: (err: unknown) => {
          this.state.set('error');
          this.errorKey.set(
            this.mapPermissionErrorKey(
              err,
              'BILLING.RECEIPT.ERROR.GENERATE_PERMISSION_DENIED',
              'BILLING.RECEIPT.ERROR.GENERATE',
            ),
          );
        },
      });
  }

  /**
   * Shared 403/location-scope mapping for both the deep-link `getReceipt` load and
   * `generateReceipt` — `deniedKey` distinguishes a read denial (`LOAD_PERMISSION_DENIED`) from a
   * write denial (`GENERATE_PERMISSION_DENIED`), since the two are different backend authorities.
   */
  private mapPermissionErrorKey(err: unknown, deniedKey: string, genericKey: string): string {
    if (err instanceof HttpErrorResponse && err.status === 403) {
      return this.isLocationScopeDenied(err) ? 'BILLING.RECEIPT.ERROR.LOCATION_SCOPE_DENIED' : deniedKey;
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
    if (this.state() === 'submitting' || this.receiptStale()) {
      return false;
    }
    return !this.reprintOverrideNeeded() || this.canReprintPastCap();
  }

  reprint(): void {
    // Re-checked here, not only at the control (ADR-0040 §6a.2) — includes the over-cap override
    // authority via `canReprintPastCap`.
    if (!this.canReprint()) {
      return;
    }
    const receiptId = this.receiptId() ?? this.receipt()?.receiptId;
    if (!receiptId) {
      this.state.set('error');
      this.errorKey.set('BILLING.RECEIPT.ERROR.REPRINT');
      return;
    }

    this.state.set('submitting');
    this.errorKey.set(null);

    const invoiceId = this.invoiceId();
    const seq = ++this.receiptReadSeq;

    this.billingService
      .reprintReceipt(invoiceId, receiptId)
      .pipe(
        // Copilot PR review: `reprintReceipt`'s `ReceiptResponse` has no `reprintCount` (verified
        // against `@durion-sdk/invoice` types), unlike `getReceipt`'s `ReceiptViewResponse` —
        // replacing `receipt()` with the bare reprint response silently dropped `reprintCount` and
        // disarmed `reprintOverrideNeeded()`. Re-read the authoritative detail via the same
        // `getReceipt` path the deep-link load uses instead of guessing `count + 1` (request-keyed
        // by `receiptReadSeq`, ADR-0063 §1).
        tap(() => this.receiptStale.set(true)),
        switchMap(() => this.billingService.loadReceipt(invoiceId, receiptId)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: receipt => {
          if (seq !== this.receiptReadSeq) return; // superseded read (ADR-0063 §1)
          this.receipt.set(receipt);
          this.receiptStale.set(false);
          this.state.set('ready');
        },
        error: (err: unknown) => {
          if (seq !== this.receiptReadSeq) return;
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
