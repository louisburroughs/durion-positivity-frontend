/**
 * SupplierPriceCatalogService — generated-client adapter tests (#213).
 */
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PagedResponse,
  PriceCatalogFreshnessView,
  SupplierPriceCatalogService as SupplierPriceCatalogApi,
} from '@durion-sdk/supplier';
import { SupplierPriceCatalogService } from './supplier-price-catalog.service';
import {
  PriceCatalogFreshness,
  PriceCatalogImportPage,
  UnmatchedLinePage,
} from '../models/supplier-pricecatalog.models';

const VENDOR_ID = 'vp-0000-0001';

const freshnessDto: PriceCatalogFreshnessView = {
  vendorProfileId: VENDOR_ID,
  latestEffectiveDate: '2026-08-01',
  lastFetchedAt: '2026-08-12T09:00:00Z',
  lastCompletedAt: '2026-08-12T09:00:05Z',
  unresolvedUnmatchedCount: 4,
  stalenessThreshold: 'P1D',
  stale: true,
  bindings: [
    {
      bindingId: 'bind-1',
      enabled: true,
      scheduleCron: '0 0 * * *',
      checkpointAt: undefined,
      lastRunOutcome: 'SUCCESS',
      lastRunStartedAt: '2026-08-12T08:00:00Z',
    },
  ],
};

const importDto = {
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
  errorCode: undefined,
  failureDetail: undefined,
  windowFrom: undefined,
  windowTo: undefined,
};

const unmatchedDto = {
  unmatchedLineId: 'unmatched-1',
  importManifestId: 'import-1',
  vendorProfileId: VENDOR_ID,
  positionNumber: 417,
  articleEan: '3528709999083',
  supplierArticleCode: '999908',
  xReferenceCode: '0123456789012',
  reason: 'NO_CATALOG_MATCH',
  reasonDetail: 'No matching SKU in the replica.',
  netPrice: 512.4,
  grossPrice: 640.5,
  effectiveFrom: '2026-01-01',
  currency: 'SEK',
  fetchedAt: '2026-08-12T09:00:00Z',
  resolvedAt: undefined,
};

describe('SupplierPriceCatalogService', () => {
  let service: SupplierPriceCatalogService;
  let api: {
    getSupplierPriceCatalogFreshness: ReturnType<typeof vi.fn>;
    listSupplierPriceCatalogImports: ReturnType<typeof vi.fn>;
    listSupplierPriceCatalogUnmatchedLines: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      getSupplierPriceCatalogFreshness: vi.fn().mockReturnValue(of(freshnessDto)),
      listSupplierPriceCatalogImports: vi.fn().mockReturnValue(
        of({ items: [importDto], page: 0, size: 25, totalElements: 1, totalPages: 1 } as PagedResponse),
      ),
      listSupplierPriceCatalogUnmatchedLines: vi.fn().mockReturnValue(
        of({ items: [unmatchedDto], page: 0, size: 25, totalElements: 1, totalPages: 1 } as PagedResponse),
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        SupplierPriceCatalogService,
        { provide: SupplierPriceCatalogApi, useValue: api },
      ],
    });
    service = TestBed.inject(SupplierPriceCatalogService);
  });

  it('getFreshness() — maps latestEffectiveDate and lastFetchedAt as separate fields', () => {
    let result: PriceCatalogFreshness | undefined;
    service.getFreshness(VENDOR_ID).subscribe(value => (result = value));

    expect(api.getSupplierPriceCatalogFreshness).toHaveBeenCalledWith(VENDOR_ID);
    expect(result?.latestEffectiveDate).toBe('2026-08-01');
    expect(result?.lastFetchedAt).toBe('2026-08-12T09:00:00Z');
    expect(result?.latestEffectiveDate).not.toBe(result?.lastFetchedAt);
  });

  it('getFreshness() — echoes the backend staleness threshold rather than a client constant', () => {
    let result: PriceCatalogFreshness | undefined;
    service.getFreshness(VENDOR_ID).subscribe(value => (result = value));

    expect(result?.stalenessThreshold).toBe('P1D');
    expect(result?.stale).toBe(true);
    expect(result?.unresolvedUnmatchedCount).toBe(4);
  });

  it('getFreshness() — maps every binding freshness field', () => {
    let result: PriceCatalogFreshness | undefined;
    service.getFreshness(VENDOR_ID).subscribe(value => (result = value));

    expect(result?.bindings).toEqual([
      {
        bindingId: 'bind-1',
        enabled: true,
        scheduleCron: '0 0 * * *',
        checkpointAt: null,
        lastRunOutcome: 'SUCCESS',
        lastRunStartedAt: '2026-08-12T08:00:00Z',
      },
    ]);
  });

  it('listImports() — sends bindingId/status/dateFrom/dateTo/page/size as real server-side filters', () => {
    service
      .listImports(VENDOR_ID, { bindingId: 'bind-1', status: 'FAILED', dateFrom: 'a', dateTo: 'b' }, 1, 10)
      .subscribe();

    expect(api.listSupplierPriceCatalogImports).toHaveBeenCalledWith(
      VENDOR_ID,
      'bind-1',
      'FAILED',
      'a',
      'b',
      1,
      10,
    );
  });

  it('listImports() — maps every import field', () => {
    let result: PriceCatalogImportPage | undefined;
    service.listImports(VENDOR_ID).subscribe(value => (result = value));

    expect(result?.items[0]).toEqual({
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
    });
  });

  it('listUnmatchedLines() — sends reason/search/dateFrom/dateTo/resolved/page/size', () => {
    service
      .listUnmatchedLines(
        VENDOR_ID,
        { reason: 'NO_CATALOG_MATCH', search: '3528709999083', dateFrom: 'a', dateTo: 'b', resolved: true },
        2,
        20,
      )
      .subscribe();

    expect(api.listSupplierPriceCatalogUnmatchedLines).toHaveBeenCalledWith(
      VENDOR_ID,
      'NO_CATALOG_MATCH',
      '3528709999083',
      'a',
      'b',
      true,
      2,
      20,
    );
  });

  it('listUnmatchedLines() — maps every line field, keeping net and gross price distinct', () => {
    let result: UnmatchedLinePage | undefined;
    service.listUnmatchedLines(VENDOR_ID).subscribe(value => (result = value));

    expect(result?.items[0]).toEqual({
      unmatchedLineId: 'unmatched-1',
      importManifestId: 'import-1',
      vendorProfileId: VENDOR_ID,
      positionNumber: 417,
      articleEan: '3528709999083',
      supplierArticleCode: '999908',
      xReferenceCode: '0123456789012',
      reason: 'NO_CATALOG_MATCH',
      reasonDetail: 'No matching SKU in the replica.',
      netPrice: 512.4,
      grossPrice: 640.5,
      effectiveFrom: '2026-01-01',
      currency: 'SEK',
      fetchedAt: '2026-08-12T09:00:00Z',
      resolvedAt: null,
    });
  });

  it('listImports() — defaults to page 0 and the default page size when omitted', () => {
    service.listImports(VENDOR_ID).subscribe();

    expect(api.listSupplierPriceCatalogImports).toHaveBeenCalledWith(
      VENDOR_ID,
      undefined,
      undefined,
      undefined,
      undefined,
      0,
      25,
    );
  });
});
