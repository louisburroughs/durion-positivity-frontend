import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { LocaleService } from '../../../../../core/services/locale.service';
import { VendorPaymentDetail } from '../../../models/accounting.models';
import { AccountingService } from '../../../services/accounting.service';
import { toDatePipeInput } from '../../../utils/date-only.util';

type PageState = 'loading' | 'ready' | 'error' | 'forbidden' | 'not-found';

@Component({
  selector: 'app-vendor-payment-detail-page',
  standalone: true,
  imports: [TranslatePipe, DatePipe],
  templateUrl: './vendor-payment-detail-page.component.html',
  styleUrl: './vendor-payment-detail-page.component.css',
})
export class VendorPaymentDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly accountingService = inject(AccountingService);
  private readonly destroyRef = inject(DestroyRef);

  /** The user's runtime-selected locale; a bare DatePipe would use the bootstrap LOCALE_ID (ADR-0030). */
  readonly locale = inject(LocaleService).currentLocale;

  readonly pageState = signal<PageState>('loading');
  readonly payment = signal<VendorPaymentDetail | null>(null);

  ngOnInit(): void {
    const paymentId = this.route.snapshot.paramMap.get('paymentId') ?? '';
    this.accountingService
      .getPayment(paymentId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.payment.set(data);
          this.pageState.set('ready');
        },
        error: (err) => {
          if (err?.status === 403) this.pageState.set('forbidden');
          else if (err?.status === 404) this.pageState.set('not-found');
          else this.pageState.set('error');
        },
      });
  }

  /** Date-only `paymentDate` prepared for `DatePipe` without a UTC day shift (ADR-0038). */
  dateOnlyFor(value: string | null | undefined): string | null {
    return toDatePipeInput(value);
  }
}
