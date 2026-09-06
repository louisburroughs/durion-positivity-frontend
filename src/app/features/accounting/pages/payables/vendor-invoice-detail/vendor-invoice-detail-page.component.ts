import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ExceptionResolutionAction, PayableBillDetail } from '../../../models/payables.models';
import { PayablesService } from '../../../services/payables.service';
import { toDatePipeInput } from '../../../utils/date-only.util';

type PageState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Payables — vendor invoice detail (#214).
 *
 * Reads a single vendor bill via `getVendorBillById`. When the bill is in
 * `MATCH_EXCEPTION`, offers the same inline resolve action as the
 * exceptions worklist (`resolveVendorBillMatchException`).
 */
@Component({
  selector: 'app-vendor-invoice-detail-page',
  standalone: true,
  imports: [TranslatePipe, DatePipe, CurrencyPipe],
  templateUrl: './vendor-invoice-detail-page.component.html',
  styleUrl: './vendor-invoice-detail-page.component.css',
})
export class VendorInvoiceDetailPageComponent {
  private readonly payablesService = inject(PayablesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly bill = signal<PayableBillDetail | null>(null);

  readonly resolving = signal(false);
  readonly resolveErrorKey = signal<string | null>(null);

  private readonly billId: string;

  constructor() {
    this.billId = this.route.snapshot.paramMap.get('billId') ?? '';
    if (!this.billId) {
      this.state.set('error');
      this.errorKey.set('ACCOUNTING.PAYABLES.DETAIL.ERROR.MISSING_BILL_ID');
      return;
    }
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.payablesService
      .getBillById(this.billId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: bill => {
          this.bill.set(bill);
          this.state.set('ready');
        },
        error: () => {
          // ADR-0031: state first, then the key.
          this.state.set('error');
          this.errorKey.set('ACCOUNTING.PAYABLES.DETAIL.ERROR.LOAD');
        },
      });
  }

  resolveException(resolutionAction: ExceptionResolutionAction, reason: string): void {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      this.resolveErrorKey.set('ACCOUNTING.PAYABLES.EXCEPTIONS.RESOLVE.ERROR.REASON_REQUIRED');
      return;
    }

    this.resolving.set(true);
    this.resolveErrorKey.set(null);

    this.payablesService
      .resolveException(this.billId, { resolutionAction, reason: trimmedReason })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.resolving.set(false);
          this.bill.set(updated);
        },
        error: () => {
          this.resolving.set(false);
          this.resolveErrorKey.set('ACCOUNTING.PAYABLES.EXCEPTIONS.RESOLVE.ERROR.SUBMIT');
        },
      });
  }

  goBack(): void {
    this.router.navigate(['/app/accounting/payables/vendor-invoices']);
  }

  /** Date-only `billDate`/`dueDate` prepared for `DatePipe` (ADR-0038). */
  dateOnlyFor(value: string | null): string | null {
    return toDatePipeInput(value);
  }
}
