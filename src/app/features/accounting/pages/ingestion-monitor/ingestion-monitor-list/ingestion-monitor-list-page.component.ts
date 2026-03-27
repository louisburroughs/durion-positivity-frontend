import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  AccountingEventListItem,
  IngestionListFilters,
} from '../../../models/accounting.models';
import { AccountingService } from '../../../services/accounting.service';

type PageState = 'loading' | 'ready' | 'error' | 'forbidden' | 'not-found';

@Component({
  selector: 'app-ingestion-monitor-list-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './ingestion-monitor-list-page.component.html',
  styleUrl: './ingestion-monitor-list-page.component.css',
})
export class IngestionMonitorListPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly accountingService = inject(AccountingService);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageState = signal<PageState>('loading');
  readonly events = signal<AccountingEventListItem[]>([]);
  readonly totalCount = signal(0);
  readonly page = signal(0);
  readonly size = signal(20);
  readonly filters = signal<IngestionListFilters>({});
  readonly activeEventType = computed(() => this.filters().eventType ?? null);

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(map => {
      const rawPage = map.get('page');
      const rawSize = map.get('size');
      let page = rawPage === null ? 0 : Number.parseInt(rawPage, 10);
      if (Number.isNaN(page) || page < 0) {
        page = 0;
      }
      let size = rawSize === null ? 20 : Number.parseInt(rawSize, 10);
      if (Number.isNaN(size) || size < 1) {
        size = 20;
      }
      if (size > 100) {
        size = 100;
      }
      this.page.set(page);
      this.size.set(size);

      this.filters.set({
        eventType: map.get('eventType') ?? undefined,
        processingStatus: map.get('processingStatus') ?? undefined,
      });
      this.load();
    });
  }

  load(): void {
    this.pageState.set('loading');
    this.accountingService
      .listEvents(this.filters(), this.page(), this.size())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: resp => {
          this.events.set(resp.items ?? resp.content ?? []);
          this.totalCount.set(resp.totalCount ?? resp.totalElements ?? 0);
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

  goToDetail(row: AccountingEventListItem): void {
    this.router.navigate(['/app/accounting/events', row.eventId]);
  }
}
