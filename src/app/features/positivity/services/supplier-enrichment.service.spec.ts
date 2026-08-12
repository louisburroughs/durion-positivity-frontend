/**
 * SupplierEnrichmentService contract tests.
 *
 * ADR-0035: every public method asserts verb + URL.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 */
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { environment } from '../../../../environments/environment';
import { SupplierEnrichmentService } from './supplier-enrichment.service';
import {
  SupplierProductEnrichment,
  SupplierUnmatchedEnrichmentPage,
} from '../models/supplier-enrichment.models';

const BASE = environment.apiBaseUrl;
const PRODUCT_ID = 'ffc9a4c2-0000-7000-8000-000000000010';
const PRODUCT_URL = `${BASE}/supplier/v1/enrichment/products/${PRODUCT_ID}`;
const UNMATCHED_URL = `${BASE}/supplier/v1/enrichment/unmatched`;

const enrichmentFixture: SupplierProductEnrichment = {
  productId: PRODUCT_ID,
  vendorProfileId: 'vp-1',
  vendorDisplayName: 'Michelin EU',
  manufacturerName: 'Michelin',
  descriptions: [{ locale: 'en-US', value: 'All-season touring tread' }],
  images: [
    {
      imageId: 'img-1',
      url: 'https://cdn.example.test/tread.webp',
      altText: [{ locale: 'en-US', value: 'Tread pattern close-up' }],
      role: 'TREAD',
      widthPx: 800,
      heightPx: 600,
    },
  ],
  attributes: [
    {
      code: 'TREAD_PATTERN',
      label: [{ locale: 'en-US', value: 'Tread pattern' }],
      value: [{ locale: 'en-US', value: 'Asymmetric' }],
    },
  ],
  asOf: '2026-08-10T00:00:00Z',
  fetchedAt: '2026-08-12T12:00:00Z',
  stalenessThresholdMinutes: 1440,
};

const unmatchedPageFixture: SupplierUnmatchedEnrichmentPage = {
  items: [
    {
      unmatchedEnrichmentId: 'ue-1',
      vendorProfileId: 'vp-1',
      vendorDisplayName: 'Michelin EU',
      manufacturerName: 'Michelin',
      ean: '3528700123456',
      gtin: null,
      manufacturerPartNumber: 'MX-2255',
      descriptionPreview: [{ locale: 'en-US', value: 'Pilot Sport 4 225/55R17' }],
      imageCount: 3,
      reason: 'NO_EAN_MATCH',
      firstSeenAt: '2026-08-01T03:04:00Z',
      lastSeenAt: '2026-08-12T03:04:00Z',
      occurrences: 7,
    },
  ],
  totalCount: 1,
  nextPageToken: null,
};

describe('SupplierEnrichmentService', () => {
  let service: SupplierEnrichmentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SupplierEnrichmentService, ApiBaseService],
    });
    service = TestBed.inject(SupplierEnrichmentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getProductEnrichment() — GET /supplier/v1/enrichment/products/{productId}', () => {
    let received: SupplierProductEnrichment | null | undefined;
    service.getProductEnrichment(PRODUCT_ID).subscribe(value => (received = value));

    const req = http.expectOne(PRODUCT_URL);
    expect(req.request.method).toBe('GET');
    req.flush(enrichmentFixture);

    expect(received?.vendorDisplayName).toBe('Michelin EU');
  });

  it('getProductEnrichment() — sends no locale param; every published locale is returned', () => {
    service.getProductEnrichment(PRODUCT_ID).subscribe();

    const req = http.expectOne(r => r.url === PRODUCT_URL);
    expect(req.request.params.keys()).toEqual([]);
    req.flush(enrichmentFixture);
  });

  it('getProductEnrichment() — maps 404 to null so an unenriched product renders nothing', () => {
    let received: SupplierProductEnrichment | null | undefined = enrichmentFixture;
    let errored = false;
    service.getProductEnrichment(PRODUCT_ID).subscribe({
      next: value => (received = value),
      error: () => (errored = true),
    });

    http.expectOne(PRODUCT_URL).flush(null, { status: 404, statusText: 'Not Found' });

    expect(received).toBeNull();
    expect(errored).toBe(false);
  });

  it('getProductEnrichment() — maps an empty 200 body to null', () => {
    let received: SupplierProductEnrichment | null | undefined = enrichmentFixture;
    service.getProductEnrichment(PRODUCT_ID).subscribe(value => (received = value));

    http.expectOne(PRODUCT_URL).flush(null);

    expect(received).toBeNull();
  });

  it('getProductEnrichment() — propagates 403; "not permitted" is not "not enriched"', () => {
    let status = 0;
    service.getProductEnrichment(PRODUCT_ID).subscribe({
      error: (err: { status: number }) => (status = err.status),
    });

    http.expectOne(PRODUCT_URL).flush({}, { status: 403, statusText: 'Forbidden' });

    expect(status).toBe(403);
  });

  it('getProductEnrichment() — propagates 5xx rather than claiming absent content', () => {
    let status = 0;
    service.getProductEnrichment(PRODUCT_ID).subscribe({
      error: (err: { status: number }) => (status = err.status),
    });

    http.expectOne(PRODUCT_URL).flush({}, { status: 500, statusText: 'Server Error' });

    expect(status).toBe(500);
  });

  it('listUnmatchedEnrichment() — GET /supplier/v1/enrichment/unmatched', () => {
    service.listUnmatchedEnrichment().subscribe();

    const req = http.expectOne(UNMATCHED_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush(unmatchedPageFixture);
  });

  it('listUnmatchedEnrichment() — forwards every filter and the page token', () => {
    service
      .listUnmatchedEnrichment(
        {
          vendorProfileId: 'vp-1',
          reason: 'NO_EAN_MATCH',
          search: 'MX-2255',
          dateFrom: '2026-08-01',
          dateTo: '2026-08-12',
        },
        'tok-2',
      )
      .subscribe();

    const req = http.expectOne(r => r.url === UNMATCHED_URL);
    expect(req.request.params.get('vendorProfileId')).toBe('vp-1');
    expect(req.request.params.get('reason')).toBe('NO_EAN_MATCH');
    expect(req.request.params.get('search')).toBe('MX-2255');
    expect(req.request.params.get('dateFrom')).toBe('2026-08-01');
    expect(req.request.params.get('dateTo')).toBe('2026-08-12');
    expect(req.request.params.get('pageToken')).toBe('tok-2');
    req.flush(unmatchedPageFixture);
  });

  it('exposes no edit or match-resolution operation — v1 is read-only', () => {
    const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
    expect(
      methodNames.some(name => /^(match|resolve|dismiss|update|create|delete|save)/i.test(name)),
    ).toBe(false);
  });
});
