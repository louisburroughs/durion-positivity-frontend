import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { switchMap } from 'rxjs';
import { GenerateReceiptRequest, ReceiptRef } from '../../models/billing.models';
import { BillingService } from '../../services/billing.service';

@Component({
  selector: 'app-receipt-page',
  standalone: true,
  imports: [DatePipe, TranslatePipe],
  templateUrl: './receipt-page.component.html',
  styleUrl: './receipt-page.component.css',
})
export class ReceiptPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly billing = inject(BillingService);
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

    if (receiptId) {
      this.loadReceipt(receiptId);
    } else {
      this.state.set('idle');
    }
  }

  generateAndShow(delivery?: GenerateReceiptRequest): void {
    this.state.set('submitting');
    this.errorKey.set(null);

    this.billing
      .generateReceipt(this.invoiceId(), delivery)
      .pipe(
        switchMap(result => {
          this.receiptId.set(result.receiptId);
          return this.billing.getReceipt(this.invoiceId(), result.receiptId);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: receipt => {
          this.receipt.set(receipt);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('BILLING.RECEIPT.ERROR.GENERATE');
        },
      });
  }

  setDeliveryMethod(method: string): void {
    this.deliveryMethod.set(method as 'PRINT' | 'EMAIL' | 'NONE');
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
    const receiptId = this.receiptId() ?? this.receipt()?.receiptId;
    if (!receiptId) {
      this.state.set('error');
      this.errorKey.set('BILLING.RECEIPT.ERROR.REPRINT');
      return;
    }

    this.state.set('submitting');
    this.errorKey.set(null);

    this.billing
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

  private loadReceipt(receiptId: string): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.billing
      .getReceipt(this.invoiceId(), receiptId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: receipt => {
          this.receipt.set(receipt);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('BILLING.RECEIPT.ERROR.LOAD');
        },
      });
  }
}
