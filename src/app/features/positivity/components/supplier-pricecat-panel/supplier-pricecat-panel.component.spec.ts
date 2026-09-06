/**
 * SupplierPriceCatalogPanelComponent tests (#213).
 *
 * The service is mocked at the adapter boundary: this panel's contract is
 * three independent reads, and the adapter has its own suite.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierPriceCatalogPanelComponent } from './supplier-pricecat-panel.component';
import { SupplierPriceCatalogService } from '../../services/supplier-price-catalog.service';
import {
  PriceCatalogFreshness,
  PriceCatalogImportPage,
  UnmatchedLinePage,
} from '../../models/supplier-pricecatalog.models';

const VENDOR_ID = 'vp-0000-0001';

const freshFreshness: PriceCatalogFreshness = {
  vendorProfileId: VENDOR_ID,
  latestEffectiveDate: '2026-08-01',
  lastFetchedAt: '2026-08-12T09:00:00Z',
  lastCompletedAt: '2026-08-12T09:00:05Z',
  unresolvedUnmatchedCount: 2,
  stalenessThreshold: 'P1D',
  stale: false,
  bindings: [],
};

const importsPageFixture: PriceCatalogImportPage = {
  items: [
    {
      importManifestId: 'import-1',
      vendorProfileId: VENDOR_ID,
      supplierRef: 'michelin-eu',
      bindingId: 'bind-1',
      status: 'COMPLETED',
      fetchedAt: '2026-08-12T09:00:00Z',
      completedAt: '2026-08-12T09:00:05Z',
      sourceDocumentId: 'DOC-1',
      sourceDocumentDate: '2026-08-01',
      countryCode: 'FR',
      currency: 'EUR',
      linesFetched: 100,
      linesMatched: 96,
      linesUnmatched: 4,
      linesDuplicate: 0,
      chunkCount: 2,
      errorCode: null,
      failureDetail: null,
      windowFrom: null,
      windowTo: null,
    },
  ],
  page: 0,
  size: 25,
  totalCount: 1,
  totalPages: 1,
};

const unmatchedPageFixture: UnmatchedLinePage = {
  items: [
    {
      unmatchedLineId: 'unmatched-1',
      importManifestId: 'import-1',
      vendorProfileId: VENDOR_ID,
      positionNumber: 417,
      articleEan: '3528709999083',
      supplierArticleCode: '999908',
      xReferenceCode: '0123456789012',
      reason: 'NO_CATALOG_MATCH',
      reasonDetail: 'No matching SKU.',
      netPrice: 512.4,
      grossPrice: 640.5,
      effectiveFrom: '2026-01-01',
      currency: 'SEK',
      fetchedAt: '2026-08-12T09:00:00Z',
      resolvedAt: null,
    },
  ],
  page: 0,
  size: 25,
  totalCount: 1,
  totalPages: 1,
};

describe('SupplierPriceCatalogPanelComponent', () => {
  let fixture: ComponentFixture<SupplierPriceCatalogPanelComponent>;
  let component: SupplierPriceCatalogPanelComponent;
  let service: {
    getFreshness: ReturnType<typeof vi.fn>;
    listImports: ReturnType<typeof vi.fn>;
    listUnmatchedLines: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      getFreshness: vi.fn().mockReturnValue(of(freshFreshness)),
      listImports: vi.fn().mockReturnValue(of(importsPageFixture)),
      listUnmatchedLines: vi.fn().mockReturnValue(of(unmatchedPageFixture)),
    };
    await TestBed.configureTestingModule({
      imports: [SupplierPriceCatalogPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: SupplierPriceCatalogService, useValue: service }],
    }).compileComponents();
    fixture = TestBed.createComponent(SupplierPriceCatalogPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => vi.clearAllMocks());

  function render(vendorProfileId = VENDOR_ID): HTMLElement {
    fixture.componentRef.setInput('vendorProfileId', vendorProfileId);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  // ── Freshness ──────────────────────────────────────────────────────────

  it('loads freshness, imports and unmatched lines once each on init', () => {
    render();

    expect(service.getFreshness).toHaveBeenCalledTimes(1);
    expect(service.getFreshness).toHaveBeenCalledWith(VENDOR_ID);
    expect(service.listImports).toHaveBeenCalledTimes(1);
    expect(service.listUnmatchedLines).toHaveBeenCalledTimes(1);
  });

  it('keeps latestEffectiveDate and lastFetchedAt as two distinct displayed facts', () => {
    const el = render();

    expect(el.textContent).toContain('POSITIVITY.PRICAT.FRESHNESS.LATEST_EFFECTIVE_DATE');
    expect(el.textContent).toContain('POSITIVITY.PRICAT.FRESHNESS.LAST_FETCHED_AT');
    expect(component.freshness()?.latestEffectiveDate).not.toBe(component.freshness()?.lastFetchedAt);
  });

  it('renders the fresh banner when the backend reports stale=false', () => {
    const el = render();

    expect(el.textContent).toContain('POSITIVITY.PRICAT.FRESHNESS.FRESH');
    expect(el.querySelector('.pos-banner--warning')).toBeNull();
  });

  it('renders the stale banner using the backend-computed flag, not a client recomputation', () => {
    service.getFreshness.mockReturnValue(of({ ...freshFreshness, stale: true }));
    const el = render();

    expect(el.textContent).toContain('POSITIVITY.PRICAT.FRESHNESS.STALE');
  });

  it('renders the backend-echoed staleness threshold verbatim', () => {
    const el = render();

    expect(el.textContent).toContain('P1D');
  });

  it('renders a 403 on freshness as forbidden without dropping the other sections', () => {
    service.getFreshness.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'x' })),
    );
    render();

    expect(component.freshnessState()).toBe('forbidden');
    expect(component.importsState()).toBe('ready');
    expect(component.unmatchedState()).toBe('ready');
  });

  // ── Imports ────────────────────────────────────────────────────────────

  it('sends import filters as real query parameters, offset-paged', () => {
    render();
    component.importFilterForm.setValue({
      bindingId: 'bind-1',
      status: 'FAILED',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-07',
    });
    component.applyImportFilter();

    expect(service.listImports).toHaveBeenLastCalledWith(
      VENDOR_ID,
      { bindingId: 'bind-1', status: 'FAILED', dateFrom: '2026-08-01', dateTo: '2026-08-07' },
      0,
    );
  });

  it('reports an empty imports page distinctly from an error', () => {
    service.listImports.mockReturnValue(
      of({ items: [], page: 0, size: 25, totalCount: 0, totalPages: 0 }),
    );
    render();

    expect(component.importsState()).toBe('empty');
  });

  it('paginates imports without affecting the unmatched-lines page', () => {
    service.listImports.mockReturnValue(of({ ...importsPageFixture, totalPages: 2 }));
    render();
    component.importsNextPage();

    expect(service.listImports).toHaveBeenLastCalledWith(VENDOR_ID, expect.any(Object), 1);
    expect(service.listUnmatchedLines).toHaveBeenCalledTimes(1);
  });

  it('cancels a stale in-flight imports request when vendorProfileId changes twice before it resolves (ADR-0033)', () => {
    const first = new Subject<PriceCatalogImportPage>();
    const second = new Subject<PriceCatalogImportPage>();
    service.listImports.mockReturnValueOnce(first.asObservable()).mockReturnValue(second.asObservable());

    render(VENDOR_ID);
    fixture.componentRef.setInput('vendorProfileId', 'vp-0000-0002');
    fixture.detectChanges();
    fixture.componentRef.setInput('vendorProfileId', 'vp-0000-0003');
    fixture.detectChanges();

    // Three subscribe attempts (initial + two vendorProfileId changes); only
    // the last one is still live.
    expect(service.listImports).toHaveBeenCalledTimes(3);
    expect(first.observed).toBe(false);

    // The first (now-stale) request resolving must never land.
    first.next({
      items: [{ ...importsPageFixture.items[0], importManifestId: 'stale-import' }],
      page: 0,
      size: 25,
      totalCount: 1,
      totalPages: 1,
    });
    expect(component.imports()).toEqual([]);
    expect(component.importsState()).toBe('loading');

    // The latest in-flight request resolving lands normally.
    second.next({
      items: [{ ...importsPageFixture.items[0], importManifestId: 'fresh-import' }],
      page: 0,
      size: 25,
      totalCount: 1,
      totalPages: 1,
    });
    expect(component.imports().map(item => item.importManifestId)).toEqual(['fresh-import']);
    expect(component.importsState()).toBe('ready');
  });

  // ── Unmatched lines ────────────────────────────────────────────────────

  it('sends unmatched-line filters (reason/search/dates/resolved) as real query parameters', () => {
    render();
    component.unmatchedFilterForm.setValue({
      reason: 'NO_CATALOG_MATCH',
      search: '3528709999083',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-07',
      resolved: true,
    });
    component.applyUnmatchedFilter();

    expect(service.listUnmatchedLines).toHaveBeenLastCalledWith(
      VENDOR_ID,
      {
        reason: 'NO_CATALOG_MATCH',
        search: '3528709999083',
        dateFrom: '2026-08-01',
        dateTo: '2026-08-07',
        resolved: true,
      },
      0,
    );
  });

  it('keeps net and gross price as distinct fields, never merged', () => {
    render();

    expect(component.unmatchedLines()[0].netPrice).toBe(512.4);
    expect(component.unmatchedLines()[0].grossPrice).toBe(640.5);
  });

  it('renders an open line as still open, not resolved', () => {
    const el = render();

    expect(el.textContent).toContain('POSITIVITY.PRICAT.UNMATCHED.STILL_OPEN');
  });

  it('reports empty when the quarantine is clear', () => {
    service.listUnmatchedLines.mockReturnValue(
      of({ items: [], page: 0, size: 25, totalCount: 0, totalPages: 0 }),
    );
    render();

    expect(component.unmatchedState()).toBe('empty');
  });

  it('renders a 403 on the unmatched worklist as forbidden without dropping the other sections', () => {
    service.listUnmatchedLines.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'x' })),
    );
    render();

    expect(component.unmatchedState()).toBe('forbidden');
    expect(component.freshnessState()).toBe('ready');
    expect(component.importsState()).toBe('ready');
  });

  it('cancels a stale in-flight unmatched-lines request when vendorProfileId changes twice before it resolves (ADR-0033)', () => {
    const first = new Subject<UnmatchedLinePage>();
    const second = new Subject<UnmatchedLinePage>();
    service.listUnmatchedLines
      .mockReturnValueOnce(first.asObservable())
      .mockReturnValue(second.asObservable());

    render(VENDOR_ID);
    fixture.componentRef.setInput('vendorProfileId', 'vp-0000-0002');
    fixture.detectChanges();
    fixture.componentRef.setInput('vendorProfileId', 'vp-0000-0003');
    fixture.detectChanges();

    // Three subscribe attempts (initial + two vendorProfileId changes); only
    // the last one is still live.
    expect(service.listUnmatchedLines).toHaveBeenCalledTimes(3);
    expect(first.observed).toBe(false);

    // The first (now-stale) request resolving must never land.
    first.next({
      items: [{ ...unmatchedPageFixture.items[0], unmatchedLineId: 'stale-line' }],
      page: 0,
      size: 25,
      totalCount: 1,
      totalPages: 1,
    });
    expect(component.unmatchedLines()).toEqual([]);
    expect(component.unmatchedState()).toBe('loading');

    // The latest in-flight request resolving lands normally.
    second.next({
      items: [{ ...unmatchedPageFixture.items[0], unmatchedLineId: 'fresh-line' }],
      page: 0,
      size: 25,
      totalCount: 1,
      totalPages: 1,
    });
    expect(component.unmatchedLines().map(line => line.unmatchedLineId)).toEqual(['fresh-line']);
    expect(component.unmatchedState()).toBe('ready');
  });

  it('labels every filter control (ADR-0029)', () => {
    const el = render();

    for (const control of Array.from(el.querySelectorAll('.pricat__filters input, .pricat__filters select'))) {
      const id = control.getAttribute('id');
      expect(id).toBeTruthy();
      expect(el.querySelector(`label[for="${id}"]`), `no label for #${id}`).not.toBeNull();
    }
  });
});
