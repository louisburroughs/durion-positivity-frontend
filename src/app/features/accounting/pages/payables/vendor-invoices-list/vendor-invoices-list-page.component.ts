import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PayableBillListRow, PayableBillStatus } from '../../../models/payables.models';
import { PayablesService } from '../../../services/payables.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

const PAGE_SIZE = 25;

/**
 * Local-calendar `YYYY-MM-DD`, built from local getters rather than
 * `toISOString().slice(0, 10)` (ADR-0038 rejects that pattern by name):
 * `toISOString()` is UTC, so in a UTC-N zone it rolls into tomorrow's date
 * for the evening hours of today, which would silently shift this due-date
 * filter's window for operators west of UTC.
 */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Payables — vendor invoices list (#214).
 *
 * A move, not a restoration: PR #202 retired a supplier-backed vendor-
 * invoice list that called an assumed raw-invoice read pos-supplier never
 * had. This list reads pos-accounting's vendor-bills API end to end
 * (`listVendorBills`) — no supplier SDK, no `/supplier/v1/**` path.
 */
@Component({
  selector: 'app-vendor-invoices-list-page',
  standalone: true,
  imports: [TranslatePipe, DatePipe, CurrencyPipe, FormsModule],
  templateUrl: './vendor-invoices-list-page.component.html',
  styleUrl: './vendor-invoices-list-page.component.css',
})
export class VendorInvoicesListPageComponent {
  private readonly payablesService = inject(PayablesService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly items = signal<readonly PayableBillListRow[]>([]);
  readonly page = signal(0);
  readonly totalPages = signal(0);
  readonly totalElements = signal(0);

  readonly dueFrom = signal(toIsoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  readonly dueTo = signal(toIsoDate(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)));
  readonly statusFilter = signal<PayableBillStatus | ''>('');

  constructor() {
    this.load(0);
  }

  applyFilters(): void {
    this.load(0);
  }

  load(page: number): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.payablesService
      .listBills(this.dueFrom(), this.dueTo(), this.statusFilter() || undefined, page, PAGE_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.items.set(result.items);
          this.page.set(result.page);
          this.totalPages.set(result.totalPages);
          this.totalElements.set(result.totalElements);
          this.state.set(result.items.length === 0 ? 'empty' : 'ready');
        },
        error: () => {
          // ADR-0031: state first, then the key.
          this.state.set('error');
          this.errorKey.set('ACCOUNTING.PAYABLES.LIST.ERROR.LOAD');
        },
      });
  }

  nextPage(): void {
    if (this.page() + 1 < this.totalPages()) {
      this.load(this.page() + 1);
    }
  }

  previousPage(): void {
    if (this.page() > 0) {
      this.load(this.page() - 1);
    }
  }

  openBill(row: PayableBillListRow): void {
    this.router.navigate(['/app/accounting/payables/vendor-invoices', row.billId]);
  }
}
