import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { VendorPaymentDetail } from '../../../models/accounting.models';
import { AccountingService } from '../../../services/accounting.service';

type PageState = 'loading' | 'ready' | 'error' | 'forbidden' | 'not-found';

@Component({
  selector: 'app-vendor-payment-detail-page',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './vendor-payment-detail-page.component.html',
  styleUrl: './vendor-payment-detail-page.component.css',
})
export class VendorPaymentDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly accountingService = inject(AccountingService);
  private readonly destroyRef = inject(DestroyRef);

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
}
