import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { PRODUCT_PAGE_SIZE, ProductListComponent } from './product-list.component';
import { ProductCatalogService } from '../../../services/product-catalog.service';
import {
  ProductSearchCriteria,
  ProductSearchPage,
  ProductSummary,
} from '../../../models/product.models';

describe('ProductListComponent', () => {
  let fixture: ComponentFixture<ProductListComponent>;
  let component: ProductListComponent;

  const mockCatalog = {
    searchProductsDetailed: vi.fn<
      (criteria: ProductSearchCriteria, cursor?: string, limit?: number) => Observable<ProductSearchPage>
    >(),
  };

  const NO_FILTERS: Required<ProductSearchCriteria> = { query: '', sku: '', brand: '', category: '' };

  const pageOne: ProductSummary[] = [
    { id: 'p1', sku: 'SKU-001', name: 'Widget A', category: 'Parts', lifecycleState: 'ACTIVE', msrp: null, msrpCurrency: 'USD', effectiveAt: '' },
    { id: 'p2', sku: 'SKU-002', name: 'Widget B', category: 'Parts', lifecycleState: 'ACTIVE', msrp: 9.99, msrpCurrency: 'USD', effectiveAt: '2026-01-01T00:00:00Z' },
  ];
  const pageTwo: ProductSummary[] = [
    { id: 'p3', sku: 'SKU-003', name: 'Widget C', category: 'Parts', lifecycleState: 'INACTIVE', msrp: null, msrpCurrency: 'USD', effectiveAt: '' },
  ];

  function page(items: ProductSummary[], nextCursor: string | null = null): ProductSearchPage {
    return { items, nextCursor };
  }

  /** The cursor argument of the most recent read. */
  function lastCursor(): string | undefined {
    return mockCatalog.searchProductsDetailed.mock.lastCall?.[1];
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Opens the page on page one of a two-page catalog. */
  function openOnFirstOfTwoPages(): void {
    mockCatalog.searchProductsDetailed.mockReturnValue(of(page(pageOne, 'c1')));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    mockCatalog.searchProductsDetailed.mockReturnValue(of(page([])));

    await TestBed.configureTestingModule({
      imports: [ProductListComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ProductCatalogService, useValue: mockCatalog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductListComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── First page with no filter ─────────────────────────────────────────────────

  it('reads the first page of the whole catalog on open, with no search term', () => {
    mockCatalog.searchProductsDetailed.mockReturnValue(of(page(pageOne)));

    fixture.detectChanges();

    expect(mockCatalog.searchProductsDetailed).toHaveBeenCalledTimes(1);
    expect(mockCatalog.searchProductsDetailed).toHaveBeenCalledWith(NO_FILTERS, undefined, PRODUCT_PAGE_SIZE);
    expect(component.state()).toBe('ready');
    expect(component.products()).toEqual(pageOne);
    expect(host().querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('shows the loading panel while the first page is read', () => {
    const pending$ = new Subject<ProductSearchPage>();
    mockCatalog.searchProductsDetailed.mockReturnValue(pending$);

    fixture.detectChanges();

    expect(component.state()).toBe('loading');
    expect(component.reading()).toBe(true);
    pending$.complete();
  });

  it('shows the empty state when the catalog has no products', () => {
    fixture.detectChanges();

    expect(component.state()).toBe('empty');
    expect(component.products()).toHaveLength(0);
  });

  it('routes a failed read to the error state', () => {
    mockCatalog.searchProductsDetailed.mockReturnValue(throwError(() => new Error('network error')));

    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PRODUCT.LIST.ERROR.LOAD');
  });

  // ── Filtering ─────────────────────────────────────────────────────────────────

  it('re-reads from the first page once typing pauses, with trimmed filters', fakeAsync(() => {
    fixture.detectChanges();
    mockCatalog.searchProductsDetailed.mockClear();

    component.setFilter('query', ' widget ');
    component.setFilter('brand', 'Acme');
    tick(299);
    fixture.detectChanges();
    expect(mockCatalog.searchProductsDetailed).not.toHaveBeenCalled();

    tick(1);
    fixture.detectChanges();

    expect(mockCatalog.searchProductsDetailed).toHaveBeenCalledTimes(1);
    expect(mockCatalog.searchProductsDetailed).toHaveBeenCalledWith(
      { query: 'widget', sku: '', brand: 'Acme', category: '' },
      undefined,
      PRODUCT_PAGE_SIZE,
    );
  }));

  it('starts a changed filter at the first page, not the page being read', fakeAsync(() => {
    openOnFirstOfTwoPages();
    component.nextPage();
    fixture.detectChanges();
    expect(lastCursor()).toBe('c1');

    component.setFilter('sku', 'SKU-003');
    tick(300);
    fixture.detectChanges();

    expect(lastCursor()).toBeUndefined();
    expect(component.pageIndex()).toBe(0);
  }));

  it('keeps the current page when typing settles back on the filters already shown', fakeAsync(() => {
    openOnFirstOfTwoPages();
    component.nextPage();
    fixture.detectChanges();
    mockCatalog.searchProductsDetailed.mockClear();

    component.setFilter('query', 'w');
    component.setFilter('query', '');
    tick(300);
    fixture.detectChanges();

    expect(mockCatalog.searchProductsDetailed).not.toHaveBeenCalled();
    expect(component.pageIndex()).toBe(1);
  }));

  it('re-reads unchanged filters from the first page when Search is pressed', () => {
    openOnFirstOfTwoPages();
    component.nextPage();
    fixture.detectChanges();
    mockCatalog.searchProductsDetailed.mockClear();

    component.search();
    fixture.detectChanges();

    expect(mockCatalog.searchProductsDetailed).toHaveBeenCalledWith(NO_FILTERS, undefined, PRODUCT_PAGE_SIZE);
    expect(component.pageIndex()).toBe(0);
  });

  it('submits the search form on Enter instead of navigating', () => {
    fixture.detectChanges();
    mockCatalog.searchProductsDetailed.mockClear();
    const form = host().querySelector('form[role="search"]') as HTMLFormElement;
    const submit = new Event('submit', { cancelable: true });

    form.dispatchEvent(submit);
    fixture.detectChanges();

    expect(submit.defaultPrevented).toBe(true);
    expect(mockCatalog.searchProductsDetailed).toHaveBeenCalledTimes(1);
  });

  it('clears every filter, re-reads the whole catalog and moves focus to the search field', fakeAsync(() => {
    fixture.detectChanges();
    component.setFilter('category', 'Tires');
    tick(300);
    fixture.detectChanges();
    expect(component.filtersApplied()).toBe(true);
    mockCatalog.searchProductsDetailed.mockClear();

    component.clearFilters();
    fixture.detectChanges();

    expect(component.filters()).toEqual(NO_FILTERS);
    expect(mockCatalog.searchProductsDetailed).toHaveBeenCalledWith(NO_FILTERS, undefined, PRODUCT_PAGE_SIZE);
    expect(document.activeElement).toBe(host().querySelector('#product-query'));
  }));

  it('offers Clear filters in the empty state only when a filter narrowed the result', fakeAsync(() => {
    fixture.detectChanges();
    const clearInEmptyState = (): Element | null => host().querySelector('.state-card .btn-secondary');
    expect(clearInEmptyState()).toBeNull();

    component.setFilter('query', 'nothing');
    tick(300);
    fixture.detectChanges();

    expect(component.state()).toBe('empty');
    expect(clearInEmptyState()).not.toBeNull();
  }));

  // ── Paging ────────────────────────────────────────────────────────────────────

  it('reads the next page with the cursor the current page returned', () => {
    openOnFirstOfTwoPages();
    expect(component.canGoNext()).toBe(true);
    mockCatalog.searchProductsDetailed.mockReturnValue(of(page(pageTwo)));

    component.nextPage();
    fixture.detectChanges();

    expect(mockCatalog.searchProductsDetailed).toHaveBeenLastCalledWith(NO_FILTERS, 'c1', PRODUCT_PAGE_SIZE);
    expect(component.pageIndex()).toBe(1);
    expect(component.products()).toEqual(pageTwo);
    expect(component.canGoNext()).toBe(false);
    expect(component.canGoPrevious()).toBe(true);
  });

  it('keeps the current rows on screen, and both pager buttons inert, while the next page loads', () => {
    openOnFirstOfTwoPages();
    const pending$ = new Subject<ProductSearchPage>();
    mockCatalog.searchProductsDetailed.mockReturnValue(pending$);

    component.nextPage();
    fixture.detectChanges();

    expect(component.state()).toBe('ready');
    expect(component.reading()).toBe(true);
    expect(host().querySelectorAll('tbody tr')).toHaveLength(2);
    expect(component.canGoNext()).toBe(false);
    expect(component.canGoPrevious()).toBe(false);

    // A second press while the page is in flight must not skip a page.
    component.nextPage();
    fixture.detectChanges();
    expect(mockCatalog.searchProductsDetailed).toHaveBeenCalledTimes(2);

    pending$.next(page(pageTwo));
    fixture.detectChanges();
    expect(component.products()).toEqual(pageTwo);
    expect(component.reading()).toBe(false);
  });

  it('returns to the previous page with the cursor that read it, and keeps Next while it loads', () => {
    openOnFirstOfTwoPages();
    mockCatalog.searchProductsDetailed.mockReturnValue(of(page(pageTwo)));
    component.nextPage();
    fixture.detectChanges();

    const pending$ = new Subject<ProductSearchPage>();
    mockCatalog.searchProductsDetailed.mockReturnValue(pending$);
    component.previousPage();
    fixture.detectChanges();

    expect(lastCursor()).toBeUndefined();
    expect(component.pageIndex()).toBe(0);
    expect(component.nextCursor()).toBe('c1');
    expect(component.showPager()).toBe(true);

    pending$.next(page(pageOne, 'c1'));
    fixture.detectChanges();
    expect(component.products()).toEqual(pageOne);
    expect(component.canGoNext()).toBe(true);
  });

  it('ignores Previous on the first page and Next on the last', () => {
    mockCatalog.searchProductsDetailed.mockReturnValue(of(page(pageOne)));
    fixture.detectChanges();
    mockCatalog.searchProductsDetailed.mockClear();

    component.previousPage();
    component.nextPage();
    fixture.detectChanges();

    expect(mockCatalog.searchProductsDetailed).not.toHaveBeenCalled();
  });

  it('shows the pager only when there is more than one page', () => {
    mockCatalog.searchProductsDetailed.mockReturnValue(of(page(pageOne)));
    fixture.detectChanges();
    expect(host().querySelector('nav.pager')).toBeNull();

    mockCatalog.searchProductsDetailed.mockReturnValue(of(page(pageOne, 'c1')));
    component.search();
    fixture.detectChanges();

    const buttons = host().querySelectorAll('nav.pager button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('aria-disabled')).toBe('true');
    expect(buttons[1].getAttribute('aria-disabled')).toBe('false');
    expect(buttons[0].hasAttribute('disabled')).toBe(false);
  });

  // ── Async ownership ───────────────────────────────────────────────────────────

  it('drops a superseded read, so a slow page never overwrites a newer filter', fakeAsync(() => {
    openOnFirstOfTwoPages();
    const slowPage$ = new Subject<ProductSearchPage>();
    const filtered$ = new Subject<ProductSearchPage>();
    mockCatalog.searchProductsDetailed.mockReturnValueOnce(slowPage$).mockReturnValueOnce(filtered$);

    component.nextPage();
    fixture.detectChanges();
    component.setFilter('query', 'widget c');
    tick(300);
    fixture.detectChanges();

    filtered$.next(page(pageTwo));
    slowPage$.next(page(pageOne, 'c9'));
    fixture.detectChanges();

    expect(slowPage$.observed).toBe(false);
    expect(component.products()).toEqual(pageTwo);
    expect(component.nextCursor()).toBeNull();
  }));

  // ── Retry and focus ───────────────────────────────────────────────────────────

  it('retries the page that failed, not the first page', () => {
    openOnFirstOfTwoPages();
    mockCatalog.searchProductsDetailed.mockReturnValue(throwError(() => new Error('network error')));
    component.nextPage();
    fixture.detectChanges();
    expect(component.state()).toBe('error');

    mockCatalog.searchProductsDetailed.mockReturnValue(of(page(pageTwo)));
    component.retry();
    fixture.detectChanges();

    expect(lastCursor()).toBe('c1');
    expect(component.state()).toBe('ready');
    expect(component.errorKey()).toBeNull();
    expect(component.products()).toEqual(pageTwo);
  });

  it('moves focus to the results region when Retry is removed by the read it starts', async () => {
    mockCatalog.searchProductsDetailed.mockReturnValue(throwError(() => new Error('network error')));
    fixture.detectChanges();
    const retry = host().querySelector('.error-banner button') as HTMLButtonElement;
    retry.focus();
    expect(document.activeElement).toBe(retry);

    mockCatalog.searchProductsDetailed.mockReturnValue(new Subject<ProductSearchPage>());
    retry.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host().querySelector('.error-banner')).toBeNull();
    expect(document.activeElement).toBe(host().querySelector('section.results'));
  });

  it('leaves focus on a pager button while its page loads', async () => {
    openOnFirstOfTwoPages();
    mockCatalog.searchProductsDetailed.mockReturnValue(new Subject<ProductSearchPage>());
    const next = host().querySelectorAll<HTMLButtonElement>('nav.pager button')[1];
    next.focus();

    next.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(next);
    expect(next.getAttribute('aria-disabled')).toBe('true');
  });
});
