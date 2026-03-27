import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { VendorBill } from '../../../models/accounting.models';
import { AccountingService } from '../../../services/accounting.service';

type PageState = 'loading' | 'ready' | 'error' | 'forbidden' | 'not-found';

@Component({
  selector: 'app-vendor-payment-list-page',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './vendor-payment-list-page.component.html',
  styleUrl: './vendor-payment-list-page.component.css',
})
export class VendorPaymentListPageComponent implements OnInit {
  private readonly accountingService = inject(AccountingService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageState = signal<PageState>('loading');
  readonly bills = signal<VendorBill[]>([]);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.pageState.set('loading');
    this.accountingService
      .listBills(0, 50)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          const items = page.items ?? page.content ?? [];
          this.bills.set(items);
          this.pageState.set(items.length === 0 ? 'not-found' : 'ready');
        },
        error: (err) => {
          this.pageState.set(err?.status === 403 ? 'forbidden' : 'error');
        },
      });
  }

  newPayment(): void {
    this.router.navigate(['/app/accounting/vendor-payments/new']);
  }

  openPayment(bill: VendorBill): void {
    this.router.navigate(['/app/accounting/vendor-payments/new'], {
      queryParams: { vendorId: bill.vendorId },
    });
  }
}
