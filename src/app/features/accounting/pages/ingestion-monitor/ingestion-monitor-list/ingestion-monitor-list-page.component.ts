import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import {
  AccountingEventListItem,
  IngestionListFilters,
  IngestionProcessingStatus,
} from '../../../models/accounting.models';
import { AccountingService } from '../../../services/accounting.service';

type PageState = 'loading' | 'ready' | 'error' | 'forbidden' | 'not-found';

/**
 * The statuses `GET /v1/accounting/events?status=` accepts (backend `AccountingEventStatus`).
 * The backend takes one status and silently ignores any value it cannot parse, returning every
 * event, so the filter offers only these and drops anything else read from the URL rather than
 * showing a filter the results do not honour.
 */
export const FILTERABLE_PROCESSING_STATUSES: readonly IngestionProcessingStatus[] = [
  IngestionProcessingStatus.Received,
  IngestionProcessingStatus.Processing,
  IngestionProcessingStatus.Processed,
  IngestionProcessingStatus.Failed,
  IngestionProcessingStatus.Suspended,
  IngestionProcessingStatus.Skipped,
];

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Ingestion event list. The URL query (`eventType`, `processingStatus`, `page`, `size`) is the
 * source of truth: the filter form and the pager only navigate, and every query change reloads.
 * Once the first read answers, the pager stays mounted for the life of the page, so focus on
 * Previous/Next is never dropped to the page body (ADR-0029 §8.7).
 */
@Component({
  selector: 'app-ingestion-monitor-list-page',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './ingestion-monitor-list-page.component.html',
  styleUrl: './ingestion-monitor-list-page.component.css',
})
export class IngestionMonitorListPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly accountingService = inject(AccountingService);
  private readonly destroyRef = inject(DestroyRef);
  private loadSubscription: Subscription | null = null;

  readonly statuses = FILTERABLE_PROCESSING_STATUSES;

  readonly pageState = signal<PageState>('loading');
  readonly events = signal<AccountingEventListItem[]>([]);
  readonly totalCount = signal(0);
  readonly totalPages = signal(0);
  readonly page = signal(0);
  readonly size = signal(DEFAULT_PAGE_SIZE);
  readonly filters = signal<IngestionListFilters>({});
  readonly activeEventType = computed(() => this.filters().eventType ?? null);
  /**
   * The filters and page size `totalCount`/`totalPages` answer, captured when their read was issued
   * (ADR-0063 §1). Null until the first read answers; never cleared after.
   */
  private readonly totalsScope = signal<string | null>(null);
  private readonly scope = computed(() => scopeKey(this.filters(), this.size()));

  /** Form drafts; applied to the URL by {@link applyFilters}. */
  readonly eventTypeInput = signal('');
  readonly statusInput = signal('');

  /** The totals on screen answer the active filters; false from a filter change until its read answers. */
  readonly hasCurrentTotals = computed(() => this.totalsScope() === this.scope());
  readonly hasPreviousPage = computed(() => this.page() > 0);
  /** Only totals for the active filters can enable Next; another scope's totals never do. */
  readonly hasNextPage = computed(() => this.hasCurrentTotals() && this.page() + 1 < this.totalPages());
  /**
   * Latched by the first answered read, so the pager is never unmounted under a focused
   * Previous/Next — not by loading, a failed read, a result that shrank to one page, or an
   * out-of-range correction (ADR-0029 §8.7). A single page shows "Page 1 of 1" with both refused.
   */
  readonly hasLoaded = computed(() => this.totalsScope() !== null);
  readonly displayTotalPages = computed(() => Math.max(this.totalPages(), 1));
  /**
   * "Page X of Y (N total)" is shown only for totals that answer the active filters and a page that
   * exists; between a filter change and its answer, or for a page past the end, it claims nothing.
   */
  readonly showPageStatus = computed(() => this.hasCurrentTotals() && this.page() < this.displayTotalPages());

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(map => {
      const rawPage = map.get('page');
      const rawSize = map.get('size');
      let page = rawPage === null ? 0 : Number.parseInt(rawPage, 10);
      if (Number.isNaN(page) || page < 0) {
        page = 0;
      }
      let size = rawSize === null ? DEFAULT_PAGE_SIZE : Number.parseInt(rawSize, 10);
      if (Number.isNaN(size) || size < 1) {
        size = DEFAULT_PAGE_SIZE;
      }
      if (size > MAX_PAGE_SIZE) {
        size = MAX_PAGE_SIZE;
      }
      this.page.set(page);
      this.size.set(size);

      const eventType = map.get('eventType')?.trim() || undefined;
      const processingStatus = parseStatus(map.get('processingStatus'));
      this.filters.set({ eventType, processingStatus });
      this.eventTypeInput.set(eventType ?? '');
      this.statusInput.set(processingStatus ?? '');
      this.load();
    });
  }

  load(): void {
    // A newer query supersedes any read still in flight, so a slow earlier page or filter
    // can never land over the one on screen.
    this.loadSubscription?.unsubscribe();
    this.pageState.set('loading');
    const page = this.page();
    const size = this.size();
    const scope = this.scope();
    this.loadSubscription = this.accountingService
      .listEvents(this.filters(), page, size)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: resp => {
          const total = resp.totalCount ?? resp.totalElements ?? 0;
          const totalPages = resp.totalPages ?? Math.ceil(total / size);
          this.totalCount.set(total);
          this.totalPages.set(totalPages);
          this.totalsScope.set(scope);
          if (page > 0 && page >= totalPages) {
            // A deep link or a shrunken result set put the page past the end: land on the last
            // page that exists (the first when nothing matches). The pager takes the corrected page
            // at once, so it never claims "Page 1000 of 3" while the correction loads.
            const lastPage = Math.max(totalPages - 1, 0);
            this.page.set(lastPage);
            this.navigate({ page: lastPage > 0 ? lastPage : null }, true);
            return;
          }
          this.events.set(resp.items ?? resp.content ?? []);
          this.pageState.set('ready');
        },
        error: err => {
          const status = err?.status ?? 0;
          if (status === 403) {
            this.pageState.set('forbidden');
            return;
          }
          if (status === 404) {
            this.pageState.set('not-found');
            return;
          }
          this.pageState.set('error');
        },
      });
  }

  applyFilters(): void {
    const eventType = this.eventTypeInput().trim();
    this.navigate({
      eventType: eventType || null,
      processingStatus: parseStatus(this.statusInput()) ?? null,
      page: null,
    });
  }

  clearFilters(): void {
    this.eventTypeInput.set('');
    this.statusInput.set('');
    this.navigate({ eventType: null, processingStatus: null, page: null });
  }

  previousPage(): void {
    if (this.pageState() === 'loading' || !this.hasPreviousPage()) {
      return;
    }
    this.goToPage(this.page() - 1);
  }

  nextPage(): void {
    if (this.pageState() === 'loading' || !this.hasNextPage()) {
      return;
    }
    this.goToPage(this.page() + 1);
  }

  goToDetail(row: AccountingEventListItem): void {
    this.router.navigate(['/app/accounting/events', row.eventId]);
  }

  private goToPage(page: number): void {
    this.navigate({ page: page === 0 ? null : page });
  }

  private navigate(queryParams: Params, replaceUrl = false): void {
    this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl });
  }
}

function scopeKey(filters: IngestionListFilters, size: number): string {
  return JSON.stringify([filters.eventType ?? null, filters.processingStatus ?? null, size]);
}

function parseStatus(raw: string | null | undefined): IngestionProcessingStatus | undefined {
  const normalized = raw?.trim().toUpperCase();
  return FILTERABLE_PROCESSING_STATUSES.find(status => status === normalized);
}
