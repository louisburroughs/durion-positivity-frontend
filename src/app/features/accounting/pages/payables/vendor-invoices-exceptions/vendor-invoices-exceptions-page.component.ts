import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ExceptionResolutionAction,
  PayableBillListRow,
  PayableMatchCandidate,
} from '../../../models/payables.models';
import { PayablesService } from '../../../services/payables.service';
import { toDatePipeInput } from '../../../utils/date-only.util';
import { addCalendarDays, toIsoDate } from '../../../utils/date-window.util';

/** Re-exported for existing callers/specs of this module's `toIsoDate`. */
export { toIsoDate };

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';
type CandidatesState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

const PAGE_SIZE = 25;

/**
 * Payables — vendor invoice exceptions worklist (#214).
 *
 * Bills parked in `MATCH_EXCEPTION` by `matchVendorInvoice`'s three-way
 * match: a discrepancy, a medium-confidence score, or an ambiguous match.
 * Two distinct resolution paths exist on the generated contract and are
 * both offered here:
 *
 *  - `resolveVendorBillMatchException` — a single identified bill's
 *    discrepancy (ACCEPT/VOID/CORRECT), resolved inline per row below.
 *  - `selectVendorBillMatchCandidate` — an ambiguous match with several
 *    scored candidate bills, looked up by the triggering invoice event id
 *    (there is no field on the bill list/detail views that carries that id
 *    back, so the operator supplies it directly).
 */
@Component({
  selector: 'app-vendor-invoices-exceptions-page',
  standalone: true,
  imports: [TranslatePipe, DatePipe, CurrencyPipe, FormsModule],
  templateUrl: './vendor-invoices-exceptions-page.component.html',
  styleUrl: './vendor-invoices-exceptions-page.component.css',
})
export class VendorInvoicesExceptionsPageComponent {
  private readonly payablesService = inject(PayablesService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly items = signal<readonly PayableBillListRow[]>([]);
  readonly page = signal(0);
  readonly totalPages = signal(0);
  readonly totalElements = signal(0);

  readonly dueFrom = signal(toIsoDate(addCalendarDays(new Date(), -90)));
  readonly dueTo = signal(toIsoDate(addCalendarDays(new Date(), 90)));

  readonly resolvingBillId = signal<string | null>(null);
  readonly resolveErrorKey = signal<string | null>(null);

  // Ambiguous-match candidate lookup, by invoiceEventId (#214).
  readonly candidatesState = signal<CandidatesState>('idle');
  readonly candidatesErrorKey = signal<string | null>(null);
  readonly candidates = signal<readonly PayableMatchCandidate[]>([]);
  readonly selectingCandidateId = signal<string | null>(null);
  readonly selectErrorKey = signal<string | null>(null);

  constructor() {
    this.load(0);
  }

  load(page: number): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.payablesService
      .listBills(this.dueFrom(), this.dueTo(), 'MATCH_EXCEPTION', page, PAGE_SIZE)
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
          this.errorKey.set('ACCOUNTING.PAYABLES.EXCEPTIONS.ERROR.LOAD');
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

  /** Date-only `dueDate` prepared for `DatePipe` (ADR-0038). */
  dateOnlyFor(value: string | null): string | null {
    return toDatePipeInput(value);
  }

  resolveException(billId: string, resolutionAction: ExceptionResolutionAction, reason: string): void {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      this.resolveErrorKey.set('ACCOUNTING.PAYABLES.EXCEPTIONS.RESOLVE.ERROR.REASON_REQUIRED');
      return;
    }

    this.resolvingBillId.set(billId);
    this.resolveErrorKey.set(null);

    this.payablesService
      .resolveException(billId, { resolutionAction, reason: trimmedReason })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.resolvingBillId.set(null);
          // Resolved bills leave MATCH_EXCEPTION — drop them from this worklist.
          this.items.update(current => current.filter(row => row.billId !== billId));
          if (this.items().length === 0) {
            this.state.set('empty');
          }
        },
        error: () => {
          this.resolvingBillId.set(null);
          this.resolveErrorKey.set('ACCOUNTING.PAYABLES.EXCEPTIONS.RESOLVE.ERROR.SUBMIT');
        },
      });
  }

  lookupCandidates(invoiceEventId: string): void {
    const trimmed = invoiceEventId.trim();
    if (!trimmed) {
      return;
    }

    this.candidatesState.set('loading');
    this.candidatesErrorKey.set(null);

    this.payablesService
      .listMatchCandidates(trimmed)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.candidates.set(result);
          this.candidatesState.set(result.length === 0 ? 'empty' : 'ready');
        },
        error: () => {
          // ADR-0031: state first, then the key.
          this.candidatesState.set('error');
          this.candidatesErrorKey.set('ACCOUNTING.PAYABLES.EXCEPTIONS.CANDIDATES.ERROR.LOAD');
        },
      });
  }

  selectCandidate(candidateId: string): void {
    this.selectingCandidateId.set(candidateId);
    this.selectErrorKey.set(null);

    this.payablesService
      .selectMatchCandidate(candidateId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.selectingCandidateId.set(null);
          this.candidates.update(current =>
            current.map(c => (c.candidateId === candidateId ? { ...c, resolved: true, selected: true } : c)),
          );
        },
        error: () => {
          this.selectingCandidateId.set(null);
          this.selectErrorKey.set('ACCOUNTING.PAYABLES.EXCEPTIONS.CANDIDATES.ERROR.SELECT');
        },
      });
  }
}
