import { CommonModule, DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ProductSearchCriteria, ProductSummary } from '../../../models/product.models';
import { ProductCatalogService } from '../../../services/product-catalog.service';
import { MoneyPipe } from '../../../../../shared/money.pipe';

type PageState = 'loading' | 'empty' | 'ready' | 'error';
type ProductFilters = Required<ProductSearchCriteria>;
type FilterField = keyof ProductFilters;

/** Rows per server page. The search endpoint clamps `limit` to 1–100. */
export const PRODUCT_PAGE_SIZE = 25;

const NO_FILTERS: ProductFilters = { query: '', sku: '', brand: '', category: '' };

/**
 * One catalog read. `cursors` is the trail of cursors that reached the current page —
 * `cursors[i]` reads page `i`, and page 0 needs none — so Previous re-reads a known cursor
 * instead of searching again. `keepContent` leaves the current panel on screen while the
 * read runs, so a pager button is not unmounted from under the keyboard user who pressed it.
 */
interface SearchRequest {
  readonly criteria: ProductFilters;
  readonly cursors: readonly (string | undefined)[];
  readonly keepContent: boolean;
}

function trimFilters(filters: ProductFilters): ProductFilters {
  return {
    query: filters.query.trim(),
    sku: filters.sku.trim(),
    brand: filters.brand.trim(),
    category: filters.category.trim(),
  };
}

function sameFilters(a: ProductFilters, b: ProductFilters): boolean {
  return a.query === b.query && a.sku === b.sku && a.brand === b.brand && a.category === b.category;
}

function hasAnyFilter(filters: ProductFilters): boolean {
  return !sameFilters(trimFilters(filters), NO_FILTERS);
}

/**
 * Product catalog list. Opens on the first page of the whole catalog; the search and
 * filter fields narrow it, and Previous/Next walk the backend's cursor pages. Every
 * filter, page or retry change is a new `request`, read by one effect whose `onCleanup`
 * drops the superseded read (ADR-0033), so a slow response can never overwrite a newer one.
 */
@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, TranslatePipe, MoneyPipe],
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.css',
})
export class ProductListComponent {
  private readonly productCatalog = inject(ProductCatalogService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly filterChanges$ = new Subject<void>();

  private readonly queryInput = viewChild<ElementRef<HTMLInputElement>>('queryInput');
  private readonly resultsRegion = viewChild<ElementRef<HTMLElement>>('resultsRegion');

  /** The filter fields as typed; a read picks them up once typing pauses or on Search. */
  readonly filters = signal<ProductFilters>(NO_FILTERS);
  private readonly request = signal<SearchRequest>({
    criteria: NO_FILTERS,
    cursors: [undefined],
    keepContent: false,
  });

  readonly state = signal<PageState>('loading');
  readonly errorKey = signal<string | null>(null);
  readonly products = signal<ProductSummary[]>([]);
  /** Cursor for the page after the one shown; null on the last page. */
  readonly nextCursor = signal<string | null>(null);
  /** A read is in flight. Paging keeps the current rows on screen until it lands. */
  readonly reading = signal(false);

  /** Zero-based index of the page shown, or being read. */
  readonly pageIndex = computed(() => this.request().cursors.length - 1);
  readonly canGoPrevious = computed(() => !this.reading() && this.pageIndex() > 0);
  readonly canGoNext = computed(() => !this.reading() && this.nextCursor() !== null);
  readonly showPager = computed(
    () =>
      (this.state() === 'ready' || this.state() === 'empty') &&
      (this.pageIndex() > 0 || this.nextCursor() !== null),
  );
  /** Something is typed in a filter field, applied or not. */
  readonly hasFilters = computed(() => hasAnyFilter(this.filters()));
  /** The rows on screen were narrowed by a filter. */
  readonly filtersApplied = computed(() => hasAnyFilter(this.request().criteria));

  constructor() {
    this.filterChanges$
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyFilters(false));

    effect(onCleanup => {
      const request = this.request();
      // Untracked: the read and its callbacks (synchronous for a cached response) touch
      // signals that must not become dependencies of this effect.
      const sub = untracked(() => {
        this.startRead(request);
        return this.productCatalog
          .searchProductsDetailed(request.criteria, request.cursors.at(-1), PRODUCT_PAGE_SIZE)
          .subscribe({
            next: page =>
              this.swapPanel(() => {
                this.reading.set(false);
                this.products.set(page.items);
                this.nextCursor.set(page.nextCursor);
                this.state.set(page.items.length > 0 ? 'ready' : 'empty');
                this.errorKey.set(null);
              }),
            error: () =>
              this.swapPanel(() => {
                this.reading.set(false);
                this.products.set([]);
                this.nextCursor.set(null);
                this.state.set('error'); // ADR-0031 §1 — state always before errorKey
                this.errorKey.set('PRODUCT.LIST.ERROR.LOAD');
              }),
          });
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  setFilter(field: FilterField, value: string): void {
    this.filters.update(filters => ({ ...filters, [field]: value }));
    this.filterChanges$.next();
  }

  /** Search button or Enter: read the first page now, even when the filters are unchanged. */
  search(event?: Event): void {
    event?.preventDefault();
    this.applyFilters(true);
  }

  clearFilters(): void {
    this.filters.set(NO_FILTERS);
    // Both Clear buttons can disappear with the filters; the search field is where the
    // next step starts (ADR-0029 §8.7).
    this.queryInput()?.nativeElement.focus();
    this.applyFilters(false);
  }

  retry(): void {
    this.request.update(request => ({ ...request, keepContent: false }));
  }

  previousPage(): void {
    if (!this.canGoPrevious()) {
      return;
    }
    const current = this.request();
    // The cursor that reached this page is the previous page's nextCursor, so Next stays
    // available — and the pager stays put — while that page is re-read.
    this.nextCursor.set(current.cursors.at(-1) ?? null);
    this.request.set({ ...current, cursors: current.cursors.slice(0, -1), keepContent: true });
  }

  nextPage(): void {
    const cursor = this.nextCursor();
    if (!this.canGoNext() || cursor === null) {
      return;
    }
    this.request.update(request => ({
      ...request,
      cursors: [...request.cursors, cursor],
      keepContent: true,
    }));
  }

  createProduct(): void {
    this.router.navigate(['/app/product/catalog'], { queryParams: { mode: 'new' } });
  }

  selectProduct(id: string): void {
    this.router.navigate(['/app/product/catalog', id]);
  }

  /**
   * A new filter set always starts again at the first page. `force` re-reads unchanged
   * filters; otherwise a debounce that settles on what is already shown is a no-op and
   * keeps the user on the page they are reading.
   */
  private applyFilters(force: boolean): void {
    const criteria = trimFilters(this.filters());
    if (!force && sameFilters(criteria, this.request().criteria)) {
      return;
    }
    this.request.set({ criteria, cursors: [undefined], keepContent: false });
  }

  private startRead(request: SearchRequest): void {
    this.reading.set(true);
    const showing = this.state() === 'ready' || this.state() === 'empty';
    if (request.keepContent && showing) {
      return;
    }
    this.swapPanel(() => {
      this.state.set('loading');
      this.errorKey.set(null);
    });
  }

  /**
   * Applies a change to the results panel. When that removes the focused control — Retry,
   * a pager button, the empty state's actions — focus moves to the results region instead
   * of dropping to <body> (ADR-0029 §8.7).
   */
  private swapPanel(apply: () => void): void {
    const region = this.resultsRegion()?.nativeElement;
    const active = this.document.activeElement;
    const focusInResults = !!region && !!active && region.contains(active);
    apply();
    if (focusInResults) {
      afterNextRender(() => this.focusResultsIfLost(), { injector: this.injector });
    }
  }

  private focusResultsIfLost(): void {
    const active = this.document.activeElement;
    if (!active || active === this.document.body) {
      this.resultsRegion()?.nativeElement.focus();
    }
  }
}
