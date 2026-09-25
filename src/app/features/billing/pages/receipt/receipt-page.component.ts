import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../../core/services/auth.service';
import { BILLING_SECTION } from '../../../../core/security/route-permissions';
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
  private readonly auth = inject(AuthService);

  readonly invoiceId = signal<string>('');
  readonly receiptId = signal<string | null>(null);
  readonly state = signal<'idle' | 'loading' | 'ready' | 'submitting' | 'error'>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly receipt = signal<ReceiptRef | null>(null);
  readonly deliveryMethod = signal<'PRINT' | 'EMAIL' | 'NONE'>('PRINT');
  readonly emailAddress = signal<string>('');

  /**
   * `reprintReceipt` — the code the backend enforces (`route-permissions.ts`
   * `BILLING_SECTION.receiptReprint` docblock has the full verification) and the
   * ADR-0040 §6a.3 unknown-permission fallback, matching `canAccess()`.
   */
  readonly canReprint = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(BILLING_SECTION.receiptReprint),
  );

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
        error: () => {
          this.state.set('error');
          this.errorKey.set('BILLING.RECEIPT.ERROR.GENERATE');
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

  reprint(): void {
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

    this.billingService
      .reprintReceipt(this.invoiceId(), receiptId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: receipt => {
          this.receipt.set(receipt);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('BILLING.RECEIPT.ERROR.REPRINT');
        },
      });
  }
}
