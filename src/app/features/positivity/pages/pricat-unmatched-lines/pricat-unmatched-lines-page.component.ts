import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, isPlatformBrowser } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { Subscription, distinctUntilChanged, map } from 'rxjs';
import { SupplierPricatService } from '../../services/supplier-pricat.service';
import {
  PricatUnmatchedFilter,
  PricatUnmatchedLine,
  PricatUnmatchedReason,
} from '../../models/supplier-pricat.models';
import {
  UNMATCHED_CSV_COLUMNS,
  buildUnmatchedLinesCsv,
  unmatchedLinesFileName,
} from '../../utils/pricat-csv.util';
import { mapSupplierError } from '../../utils/supplier-error.util';

type PageState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

const REASONS: readonly PricatUnmatchedReason[] = [
  'NO_EAN_MATCH',
  'NO_UPC_MATCH',
  'NO_MPN_MATCH',
  'AMBIGUOUS_MATCH',
  'MISSING_IDENTIFIERS',
];

/** Translation keys for the CSV header row, in `UNMATCHED_CSV_COLUMNS` order. */
const CSV_HEADER_KEYS: readonly string[] = [
  'POSITIVITY.UNMATCHED.TABLE.EAN',
  'POSITIVITY.UNMATCHED.TABLE.GTIN',
  'POSITIVITY.UNMATCHED.TABLE.MPN',
  'POSITIVITY.UNMATCHED.TABLE.DESCRIPTION',
  'POSITIVITY.UNMATCHED.TABLE.REASON',
  'POSITIVITY.UNMATCHED.TABLE.FIRST_SEEN',
  'POSITIVITY.UNMATCHED.TABLE.LAST_SEEN',
  'POSITIVITY.UNMATCHED.TABLE.OCCURRENCES',
];

/**
 * PRICAT unmatched-lines worklist (issue #189).
 *
 * This is a **worklist, not an inbox**: rows are owned by the backend and clear
 * only when a catalog fix makes them matchable (ADR-0053 §5). There is
 * deliberately no dismiss/ignore/resolve control — offering one would let a user
 * hide a purchasable product that still has no cost data, which is exactly the
 * failure this report exists to prevent. Resolution happens in the catalog; CSV
 * export exists so that work can be done offline.
 *
 * Filter dates are date-only `YYYY-MM-DD` values and are passed through
 * untouched (ADR-0038); no local `new Date(...)` parsing happens here.
 */
@Component({
  selector: 'app-pricat-unmatched-lines-page',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './pricat-unmatched-lines-page.component.html',
  styleUrls: ['../../positivity-shared.css', './pricat-unmatched-lines-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricatUnmatchedLinesPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(SupplierPricatService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly lines = signal<PricatUnmatchedLine[]>([]);
  readonly totalCount = signal(0);
  readonly vendorProfileId = signal<string | null>(null);

  readonly reasons = REASONS;

  readonly filterForm = new FormGroup({
    reason: new FormControl<PricatUnmatchedReason | ''>('', { nonNullable: true }),
    search: new FormControl('', { nonNullable: true }),
    dateFrom: new FormControl('', { nonNullable: true }),
    dateTo: new FormControl('', { nonNullable: true }),
  });

  readonly canExport = computed(() => this.lines().length > 0);

  constructor() {
    effect(onCleanup => {
      const sub: Subscription = this.route.paramMap
        .pipe(
          map(params => params.get('vendorProfileId')),
          distinctUntilChanged(),
        )
        .subscribe(profileId => {
          this.vendorProfileId.set(profileId);
          if (profileId) {
            this.load();
          }
        });

      onCleanup(() => sub.unsubscribe());
    });
  }

  private currentFilter(): PricatUnmatchedFilter {
    const raw = this.filterForm.getRawValue();
    return {
      reason: raw.reason || undefined,
      search: raw.search.trim() || undefined,
      dateFrom: raw.dateFrom || undefined,
      dateTo: raw.dateTo || undefined,
    };
  }

  load(): void {
    const profileId = this.vendorProfileId();
    if (!profileId) {
      return;
    }

    this.state.set('loading');
    this.errorKey.set(null);

    this.service
      .listUnmatchedLines(profileId, this.currentFilter())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: page => {
          this.lines.set(page.items);
          this.totalCount.set(page.totalCount);
          this.state.set(page.items.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.UNMATCHED.ERROR.LOAD');
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }

  applyFilter(): void {
    this.load();
  }

  clearFilter(): void {
    this.filterForm.reset({ reason: '', search: '', dateFrom: '', dateTo: '' });
    this.load();
  }

  /** Serialize the rows currently displayed, with translated headers. */
  buildCsv(): string {
    const headers = CSV_HEADER_KEYS.map(key => this.translate.instant(key) as string);
    return buildUnmatchedLinesCsv(this.lines(), headers);
  }

  exportCsv(): void {
    if (!this.isBrowser || this.lines().length === 0) {
      return;
    }

    const csv = this.buildCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = unmatchedLinesFileName(
      this.vendorProfileId() ?? 'profile',
      new Date().toISOString(),
    );
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /** Column count of the CSV, exposed so the spec can assert header/column parity. */
  readonly csvColumnCount = UNMATCHED_CSV_COLUMNS.length;

  readonly csvHeaderKeys = CSV_HEADER_KEYS;
}
