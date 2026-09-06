import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { SupplierStockSnapshotService } from '../../services/supplier-stock-snapshot.service';
import { StockSnapshotLine, StockSnapshotSummary } from '../../models/supplier-stock-snapshot.models';
import { mapSupplierError } from '../../utils/supplier-error.util';

type SummaryState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';
type LinesState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

/**
 * Latest stock-snapshot tab of the vendor-profile detail screen (issue #217;
 * backend PR #1644, closing #1638 row 6).
 *
 * ── Two reads, strictly sequenced ───────────────────────────────────────────
 * The metadata read (`getLatestSupplierStockSnapshot`) resolves the
 * **immutable** `snapshotId`; only once that is known does this panel page
 * the lines read (`listSupplierStockSnapshotLines`) by that exact id. Lines
 * are never paged against "latest" directly and the id is never re-derived —
 * a snapshot is append-only, so every page of one browse must describe the
 * same document even if a newer report arrives mid-browse.
 *
 * ── Two clocks, kept apart ───────────────────────────────────────────────────
 * `snapshotAsOf` (vendor time) and `fetchedAt` (platform time) are rendered
 * as two distinct facts, never collapsed into one timestamp.
 *
 * ── No scopeCode filter ──────────────────────────────────────────────────────
 * Lines are filterable by `search` only — there is no `scopeCode` column on
 * this contract, and none is offered here (out of scope per the restoration
 * plan).
 */
@Component({
  selector: 'app-supplier-stock-snapshot-panel',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, TranslatePipe],
  templateUrl: './supplier-stock-snapshot-panel.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-stock-snapshot-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierStockSnapshotPanelComponent {
  private readonly service = inject(SupplierStockSnapshotService);

  /** In-flight lines request, if any — cancelled before every re-subscribe (ADR-0033). */
  private linesSub: Subscription | undefined;

  readonly vendorProfileId = input.required<string>();

  readonly summaryState = signal<SummaryState>('idle');
  readonly summaryErrorKey = signal<string | null>(null);
  readonly summary = signal<StockSnapshotSummary | null>(null);
  private readonly summaryReloadToken = signal(0);

  readonly linesState = signal<LinesState>('idle');
  readonly linesErrorKey = signal<string | null>(null);
  readonly lines = signal<StockSnapshotLine[]>([]);
  readonly linesPage = signal(0);
  readonly linesTotalPages = signal(0);
  readonly linesTotalCount = signal(0);

  readonly searchForm = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
  });

  /** The immutable snapshot id lines are paged by, once metadata has resolved. */
  readonly snapshotId = computed(() => this.summary()?.snapshotId ?? null);

  constructor() {
    effect(onCleanup => {
      const vendorProfileId = this.vendorProfileId();
      this.summaryReloadToken();
      if (!vendorProfileId) {
        return;
      }

      this.summaryState.set('loading');
      this.summaryErrorKey.set(null);
      this.summary.set(null);

      const sub: Subscription = this.service.getLatestSnapshot(vendorProfileId).subscribe({
        next: result => {
          this.summary.set(result);
          this.summaryState.set('ready');
        },
        error: (err: unknown) => {
          if (err instanceof HttpErrorResponse && err.status === 404) {
            // The profile has no snapshot yet — a normal state, not an error.
            this.summaryState.set('empty');
            this.summaryErrorKey.set(null);
            return;
          }
          const outcome = mapSupplierError(err, 'POSITIVITY.STOCK_SNAPSHOT.ERROR.LOAD_SUMMARY');
          this.summaryState.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.summaryErrorKey.set(outcome.errorKey);
        },
      });

      onCleanup(() => sub.unsubscribe());
    });

    // Lines page only once the metadata call has resolved a snapshotId —
    // never against a re-derived or guessed one.
    effect(onCleanup => {
      const vendorProfileId = this.vendorProfileId();
      const snapshotId = this.snapshotId();
      if (vendorProfileId && snapshotId) {
        this.loadLines(vendorProfileId, snapshotId, 0);
      } else {
        this.linesSub?.unsubscribe();
        this.linesState.set('idle');
        this.lines.set([]);
      }

      // Cancels the in-flight request on every re-run (e.g. vendorProfileId
      // changing twice in quick succession) so a stale response can never
      // overwrite a newer one (ADR-0033).
      onCleanup(() => this.linesSub?.unsubscribe());
    });
  }

  reloadSummary(): void {
    this.summaryReloadToken.update(value => value + 1);
  }

  private loadLines(vendorProfileId: string, snapshotId: string, page: number): void {
    // Cancel any request already in flight before starting a new one — this
    // method is invoked both from the lines-trigger effect above and from
    // the pagination/search handlers below, and both paths must cancel a
    // stale in-flight request rather than let it race the new one (ADR-0033).
    this.linesSub?.unsubscribe();

    this.linesState.set('loading');
    this.linesErrorKey.set(null);

    this.linesSub = this.service
      .listLines(vendorProfileId, snapshotId, this.searchForm.getRawValue().search.trim(), page)
      .subscribe({
        next: result => {
          this.lines.set(result.items);
          this.linesPage.set(result.page);
          this.linesTotalPages.set(result.totalPages);
          this.linesTotalCount.set(result.totalCount);
          this.linesState.set(result.items.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.STOCK_SNAPSHOT.ERROR.LOAD_LINES');
          this.linesState.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.linesErrorKey.set(outcome.errorKey);
        },
      });
  }

  applySearch(): void {
    const vendorProfileId = this.vendorProfileId();
    const snapshotId = this.snapshotId();
    if (vendorProfileId && snapshotId) {
      this.loadLines(vendorProfileId, snapshotId, 0);
    }
  }

  clearSearch(): void {
    this.searchForm.reset({ search: '' });
    this.applySearch();
  }

  retryLines(): void {
    const vendorProfileId = this.vendorProfileId();
    const snapshotId = this.snapshotId();
    if (vendorProfileId && snapshotId) {
      this.loadLines(vendorProfileId, snapshotId, this.linesPage());
    }
  }

  hasPreviousPage(): boolean {
    return this.linesPage() > 0;
  }

  hasNextPage(): boolean {
    return this.linesPage() + 1 < this.linesTotalPages();
  }

  pageNumber(): number {
    return this.linesPage() + 1;
  }

  previousPage(): void {
    const vendorProfileId = this.vendorProfileId();
    const snapshotId = this.snapshotId();
    if (vendorProfileId && snapshotId && this.hasPreviousPage()) {
      this.loadLines(vendorProfileId, snapshotId, this.linesPage() - 1);
    }
  }

  nextPage(): void {
    const vendorProfileId = this.vendorProfileId();
    const snapshotId = this.snapshotId();
    if (vendorProfileId && snapshotId && this.hasNextPage()) {
      this.loadLines(vendorProfileId, snapshotId, this.linesPage() + 1);
    }
  }
}
