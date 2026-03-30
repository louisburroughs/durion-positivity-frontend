import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription, forkJoin } from 'rxjs';
import {
  AccountingEventDetail,
  AccountingEventListItem,
  InvoicePaymentStatus,
} from '../../models/accounting.models';
import { AccountingService } from '../../services/accounting.service';

@Component({
  selector: 'app-invoice-payment-status-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './invoice-payment-status-page.component.html',
  styleUrl: './invoice-payment-status-page.component.css',
})
export class InvoicePaymentStatusPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly accountingService = inject(AccountingService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly invoiceStatus = signal<InvoicePaymentStatus | null>(null);
  readonly events = signal<AccountingEventListItem[]>([]);
  readonly selectedEvent = signal<AccountingEventDetail | null>(null);
  readonly showHistory = signal(false);

  readonly invoiceId = computed(() => this.route.snapshot.paramMap.get('invoiceId') ?? '');
  readonly paymentStatus = computed<'PAID' | 'PARTIALLY_PAID' | 'UNPAID' | 'UNKNOWN'>(() => {
    const status = this.invoiceStatus();
    if (!status) {
      return 'UNKNOWN';
    }
    if (status.paymentStatus) {
      return status.paymentStatus;
    }
    if (status.balanceDue <= 0) {
      return 'PAID';
    }
    const totalAmount = status.totalAmount ?? 0;
    const paidAmount = status.paidAmount ?? 0;
    if (totalAmount > 0 && paidAmount > 0 && paidAmount < totalAmount) {
      return 'PARTIALLY_PAID';
    }
    return 'UNPAID';
  });
  readonly canViewEvents = computed(() => {
    const status = this.invoiceStatus();
    if (!status) {
      return this.events().length > 0;
    }

    return Boolean(
      status.latestIngestionStatus ||
      status.latestEventId ||
      status.journalEntryId ||
      status.ledgerTransactionId ||
      status.errorCode ||
      status.errorMessage ||
      this.events().length > 0,
    );
  });

  constructor() {
    effect(
      onCleanup => {
        const id = this.invoiceId();
        if (!id) {
          this.state.set('error');
          this.errorKey.set('ACCOUNTING.INVOICE_PAYMENT_STATUS.ERROR.MISSING_ID');
          return;
        }

        this.prepareInvoicePaymentStatusLoad();

        const sub: Subscription = this.createInvoicePaymentStatusLoadRequest(id).subscribe({
          next: ({ status, events }) => {
            this.handleInvoicePaymentStatusSuccess(status, events.items ?? events.content ?? []);
          },
          error: () => {
            this.handleInvoicePaymentStatusError();
          },
        });

        onCleanup(() => sub.unsubscribe());
      },
      { allowSignalWrites: true },
    );
  }

  refresh(): void {
    const id = this.invoiceId();
    if (!id) {
      return;
    }

    this.prepareInvoicePaymentStatusLoad();

    this.createInvoicePaymentStatusLoadRequest(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ status, events }) => {
          this.handleInvoicePaymentStatusSuccess(status, events.items ?? events.content ?? []);
        },
        error: () => {
          this.handleInvoicePaymentStatusError();
        },
      });
  }

  toggleHistory(): void {
    this.showHistory.update(current => !current);
  }

  loadEventDetail(eventId: string): void {
    this.accountingService
      .getEvent(eventId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: detail => {
          this.selectedEvent.set(detail);
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('ACCOUNTING.INVOICE_PAYMENT_STATUS.ERROR.LOAD');
        },
      });
  }

  private createInvoicePaymentStatusLoadRequest(invoiceId: string) {
    return forkJoin({
      status: this.accountingService.getInvoiceStatus(invoiceId),
      events: this.accountingService.listEvents({ invoiceId }),
    });
  }

  private prepareInvoicePaymentStatusLoad(): void {
    this.state.set('loading');
    this.errorKey.set(null);
    this.selectedEvent.set(null);
  }

  private handleInvoicePaymentStatusSuccess(
    status: InvoicePaymentStatus,
    items: AccountingEventListItem[],
  ): void {
    this.invoiceStatus.set(status);
    this.events.set(items);
    this.state.set(items.length === 0 ? 'empty' : 'ready');
  }

  private handleInvoicePaymentStatusError(): void {
    this.state.set('error');
    this.errorKey.set('ACCOUNTING.INVOICE_PAYMENT_STATUS.ERROR.LOAD');
  }
}
