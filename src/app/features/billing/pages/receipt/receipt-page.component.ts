import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe } from '@ngx-translate/core';
import { GenerateReceiptRequest, ReceiptRef } from '../../models/billing.models';
import { BillingTransportService } from '../../services/billing-transport.service';

@Component({
  selector: 'app-receipt-page',
  standalone: true,
  imports: [DatePipe, TranslatePipe],
  templateUrl: './receipt-page.component.html',
  styleUrl: './receipt-page.component.css',
})
export class ReceiptPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly billingService = inject(BillingTransportService);
  private readonly destroyRef = inject(DestroyRef);

  readonly invoiceId = signal<string>('');
  readonly receiptId = signal<string | null>(null);
  readonly state = signal<'idle' | 'loading' | 'ready' | 'submitting' | 'error'>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly receipt = signal<ReceiptRef | null>(null);
  readonly deliveryMethod = signal<'PRINT' | 'EMAIL' | 'NONE'>('PRINT');
  readonly emailAddress = signal<string>('');


  ngOnInit(): void {
    const invoiceId = this.route.snapshot.paramMap.get('invoiceId') ?? '';
    const receiptId = this.route.snapshot.paramMap.get('receiptId');

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

    // Issue #381: there is no backend GET for an existing receipt's detail
    // (durion-positivity-backend#2214) — only generateReceipt/reprintReceipt (POST, both
    // side-effecting) return one. Arriving here with a receiptId already in the route (a deep
    // link or reload) can't safely re-trigger either of those, so this shows a localized
    // not-available state instead of calling a route that does not exist.
    this.state.set('error');
    this.errorKey.set('BILLING.RECEIPT.ERROR.NOT_AVAILABLE');
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
      .generateReceipt(this.invoiceId(), delivery ?? {})
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
            err instanceof HttpErrorResponse && err.status === 403
              ? 'BILLING.RECEIPT.ERROR.GENERATE_PERMISSION_DENIED'
              : 'BILLING.RECEIPT.ERROR.GENERATE',
          );
        },
      });
  }

  setDeliveryMethod(method: 'PRINT' | 'EMAIL' | 'NONE'): void {
    this.deliveryMethod.set(method);
    if (method !== 'EMAIL') {
      this.emailAddress.set('');
    }
  }

  canGenerate(): boolean {
    if (this.state() === 'submitting') {
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
   * No frontend permission gate: `GENERATE_RECEIPT` (which also covers reprint) has no catalog
   * entry, so no `perm_bits` token can decode to a grant for it — a frontend gate would permanently
   * deny every real session (`route-permissions.ts`, durion-positivity-backend#2226). Below its
   * 5-reprint cap the backend's `reprintReceipt` needs only an authenticated caller, and past the
   * cap `SUPERVISOR_OVERRIDE`. A 403 maps to a localized permission error instead of the generic one.
   */
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
          this.errorKey.set(
            err instanceof HttpErrorResponse && err.status === 403
              ? 'BILLING.RECEIPT.ERROR.REPRINT_PERMISSION_DENIED'
              : 'BILLING.RECEIPT.ERROR.REPRINT',
          );
        },
      });
  }
}
