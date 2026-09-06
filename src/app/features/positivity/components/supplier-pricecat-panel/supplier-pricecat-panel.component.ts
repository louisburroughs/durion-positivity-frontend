import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { SupplierPriceCatalogService } from '../../services/supplier-price-catalog.service';
import {
  PriceCatalogFreshness,
  PriceCatalogImport,
  PriceCatalogImportFilter,
  PriceCatalogImportStatus,
  UnmatchedLineFilter,
  UnmatchedLineReason,
  UnmatchedPriceCatalogLine,
} from '../../models/supplier-pricecatalog.models';
import { mapSupplierError } from '../../utils/supplier-error.util';
import { toDatePipeInput } from '../../utils/supplier-freshness.util';

type SectionState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

/** Closed set per the contract's `PriceCatalogImportSummaryStatusEnum`. */
const IMPORT_STATUSES: readonly PriceCatalogImportStatus[] = [
  'IN_PROGRESS',
  'COMPLETED',
  'EMPTY',
  'FAILED',
];

/** Closed set per the contract's `UnmatchedLineReason` enum. */
const UNMATCHED_LINE_REASONS: readonly UnmatchedLineReason[] = [
  'NO_IDENTIFIER',
  'NO_CATALOG_MATCH',
  'AMBIGUOUS_CATALOG_MATCH',
  'CATALOG_UNAVAILABLE',
  'DUPLICATE_LINE',
  'MALFORMED_LINE',
];

/**
 * PRICAT (price-catalog) tab of the vendor-profile detail screen (issue
 * #213; backend PR #1644, closing #1637/#1638 row 1).
 *
 * Three independently-loaded sections, each with its own `state`/`errorKey`
 * (ADR-0031) so a failure in one — say the unmatched-lines worklist — never
 * hides the freshness summary or the import history:
 *   - freshness: `getSupplierPriceCatalogFreshness`
 *   - imports: `listSupplierPriceCatalogImports`, filtered, offset-paged
 *   - unmatched lines: `listSupplierPriceCatalogUnmatchedLines`, filtered, offset-paged
 *
 * `latestEffectiveDate` (vendor-stated) and `lastFetchedAt` (platform-retrieved)
 * are rendered as two distinct facts, never merged. The staleness threshold is
 * always the value the backend echoes, never a client-side constant.
 */
@Component({
  selector: 'app-supplier-pricecat-panel',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, TranslatePipe],
  templateUrl: './supplier-pricecat-panel.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-pricecat-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierPriceCatalogPanelComponent {
  private readonly service = inject(SupplierPriceCatalogService);
  private readonly destroyRef = inject(DestroyRef);

  readonly vendorProfileId = input.required<string>();

  readonly importStatuses = IMPORT_STATUSES;
  readonly unmatchedLineReasons = UNMATCHED_LINE_REASONS;

  // ── Freshness ────────────────────────────────────────────────────────────
  readonly freshnessState = signal<SectionState>('idle');
  readonly freshnessErrorKey = signal<string | null>(null);
  readonly freshness = signal<PriceCatalogFreshness | null>(null);
  private readonly freshnessReloadToken = signal(0);

  // ── Imports ──────────────────────────────────────────────────────────────
  readonly importsState = signal<SectionState>('idle');
  readonly importsErrorKey = signal<string | null>(null);
  readonly imports = signal<PriceCatalogImport[]>([]);
  readonly importsPage = signal(0);
  readonly importsTotalPages = signal(0);
  readonly importsTotalCount = signal(0);

  readonly importFilterForm = new FormGroup({
    bindingId: new FormControl('', { nonNullable: true }),
    status: new FormControl<PriceCatalogImportStatus | ''>('', { nonNullable: true }),
    dateFrom: new FormControl('', { nonNullable: true }),
    dateTo: new FormControl('', { nonNullable: true }),
  });

  // ── Unmatched lines ──────────────────────────────────────────────────────
  readonly unmatchedState = signal<SectionState>('idle');
  readonly unmatchedErrorKey = signal<string | null>(null);
  readonly unmatchedLines = signal<UnmatchedPriceCatalogLine[]>([]);
  readonly unmatchedPage = signal(0);
  readonly unmatchedTotalPages = signal(0);
  readonly unmatchedTotalCount = signal(0);

  readonly unmatchedFilterForm = new FormGroup({
    reason: new FormControl<UnmatchedLineReason | ''>('', { nonNullable: true }),
    search: new FormControl('', { nonNullable: true }),
    dateFrom: new FormControl('', { nonNullable: true }),
    dateTo: new FormControl('', { nonNullable: true }),
    resolved: new FormControl(false, { nonNullable: true }),
  });

  constructor() {
    effect(onCleanup => {
      const vendorProfileId = this.vendorProfileId();
      this.freshnessReloadToken();
      if (!vendorProfileId) {
        return;
      }

      this.freshnessState.set('loading');
      this.freshnessErrorKey.set(null);

      const sub: Subscription = this.service.getFreshness(vendorProfileId).subscribe({
        next: result => {
          this.freshness.set(result);
          this.freshnessState.set('ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.PRICAT.ERROR.LOAD_FRESHNESS');
          this.freshnessState.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.freshnessErrorKey.set(outcome.errorKey);
        },
      });

      onCleanup(() => sub.unsubscribe());
    });

    effect(() => {
      if (this.vendorProfileId()) {
        this.loadImports(0);
      }
    });

    effect(() => {
      if (this.vendorProfileId()) {
        this.loadUnmatchedLines(0);
      }
    });
  }

  reloadFreshness(): void {
    this.freshnessReloadToken.update(value => value + 1);
  }

  /** Date-only vendor dates prepared for `DatePipe` (ADR-0038). */
  dateOnlyFor(value: string | null): string | null {
    return toDatePipeInput(value);
  }

  private currentImportFilter(): PriceCatalogImportFilter {
    const raw = this.importFilterForm.getRawValue();
    return {
      bindingId: raw.bindingId.trim() || undefined,
      status: raw.status || undefined,
      dateFrom: raw.dateFrom || undefined,
      dateTo: raw.dateTo || undefined,
    };
  }

  loadImports(page = this.importsPage()): void {
    const vendorProfileId = this.vendorProfileId();
    if (!vendorProfileId) {
      return;
    }

    this.importsState.set('loading');
    this.importsErrorKey.set(null);

    this.service
      .listImports(vendorProfileId, this.currentImportFilter(), page)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.imports.set(result.items);
          this.importsPage.set(result.page);
          this.importsTotalPages.set(result.totalPages);
          this.importsTotalCount.set(result.totalCount);
          this.importsState.set(result.items.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.PRICAT.ERROR.LOAD_IMPORTS');
          this.importsState.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.importsErrorKey.set(outcome.errorKey);
        },
      });
  }

  applyImportFilter(): void {
    this.loadImports(0);
  }

  clearImportFilter(): void {
    this.importFilterForm.reset({ bindingId: '', status: '', dateFrom: '', dateTo: '' });
    this.loadImports(0);
  }

  importsHasPreviousPage(): boolean {
    return this.importsPage() > 0;
  }

  importsHasNextPage(): boolean {
    return this.importsPage() + 1 < this.importsTotalPages();
  }

  importsPageNumber(): number {
    return this.importsPage() + 1;
  }

  importsPreviousPage(): void {
    if (this.importsHasPreviousPage()) {
      this.loadImports(this.importsPage() - 1);
    }
  }

  importsNextPage(): void {
    if (this.importsHasNextPage()) {
      this.loadImports(this.importsPage() + 1);
    }
  }

  private currentUnmatchedFilter(): UnmatchedLineFilter {
    const raw = this.unmatchedFilterForm.getRawValue();
    return {
      reason: raw.reason || undefined,
      search: raw.search.trim() || undefined,
      dateFrom: raw.dateFrom || undefined,
      dateTo: raw.dateTo || undefined,
      resolved: raw.resolved,
    };
  }

  loadUnmatchedLines(page = this.unmatchedPage()): void {
    const vendorProfileId = this.vendorProfileId();
    if (!vendorProfileId) {
      return;
    }

    this.unmatchedState.set('loading');
    this.unmatchedErrorKey.set(null);

    this.service
      .listUnmatchedLines(vendorProfileId, this.currentUnmatchedFilter(), page)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.unmatchedLines.set(result.items);
          this.unmatchedPage.set(result.page);
          this.unmatchedTotalPages.set(result.totalPages);
          this.unmatchedTotalCount.set(result.totalCount);
          this.unmatchedState.set(result.items.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.PRICAT.ERROR.LOAD_UNMATCHED');
          this.unmatchedState.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.unmatchedErrorKey.set(outcome.errorKey);
        },
      });
  }

  applyUnmatchedFilter(): void {
    this.loadUnmatchedLines(0);
  }

  clearUnmatchedFilter(): void {
    this.unmatchedFilterForm.reset({
      reason: '',
      search: '',
      dateFrom: '',
      dateTo: '',
      resolved: false,
    });
    this.loadUnmatchedLines(0);
  }

  unmatchedHasPreviousPage(): boolean {
    return this.unmatchedPage() > 0;
  }

  unmatchedHasNextPage(): boolean {
    return this.unmatchedPage() + 1 < this.unmatchedTotalPages();
  }

  unmatchedPageNumber(): number {
    return this.unmatchedPage() + 1;
  }

  unmatchedPreviousPage(): void {
    if (this.unmatchedHasPreviousPage()) {
      this.loadUnmatchedLines(this.unmatchedPage() - 1);
    }
  }

  unmatchedNextPage(): void {
    if (this.unmatchedHasNextPage()) {
      this.loadUnmatchedLines(this.unmatchedPage() + 1);
    }
  }
}
