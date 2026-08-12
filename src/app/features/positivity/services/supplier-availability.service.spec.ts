/**
 * SupplierAvailabilityService contract tests.
 *
 * ADR-0035: every public method asserts verb + URL.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 */
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { environment } from '../../../../environments/environment';
import { SupplierAvailabilityService } from './supplier-availability.service';
import { SupplierAvailability } from '../models/supplier-availability.models';

const BASE = environment.apiBaseUrl;
const URL = `${BASE}/supplier/v1/availability`;
const PRODUCT_ID = 'ffc9a4c2-0000-7000-8000-000000000010';
const LOCATION_ID = 'ffc9a4c2-0000-7000-8000-0000000000aa';

const availabilityFixture: SupplierAvailability = {
  productId: PRODUCT_ID,
  sku: null,
  deliveryLocationId: LOCATION_ID,
  fetchedAt: '2026-08-12T12:00:00Z',
  stalenessThresholdMinutes: 60,
  vendors: [
    {
      vendorProfileId: 'vp-1',
      vendorDisplayName: 'Michelin EU',
      warehouseName: 'Lyon DC',
      status: 'OK',
      availableQuantity: 24,
      unitOfMeasure: 'EA',
      deliveryEstimate: { earliestDeliveryDate: '2026-08-14', leadTimeDays: 2, cutoffAt: null },
      asOf: '2026-08-12T11:45:00Z',
    },
  ],
};

describe('SupplierAvailabilityService', () => {
  let service: SupplierAvailabilityService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SupplierAvailabilityService, ApiBaseService],
    });
    service = TestBed.inject(SupplierAvailabilityService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getAvailabilityByProductId() — GET /supplier/v1/availability with productId + location', () => {
    service.getAvailabilityByProductId(PRODUCT_ID, LOCATION_ID).subscribe();

    const req = http.expectOne(r => r.url === URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('productId')).toBe(PRODUCT_ID);
    expect(req.request.params.get('deliveryLocationId')).toBe(LOCATION_ID);
    expect(req.request.params.has('quantity')).toBe(false);
    req.flush(availabilityFixture);
  });

  it('getAvailabilityByProductId() — forwards a positive quantity hint', () => {
    service.getAvailabilityByProductId(PRODUCT_ID, LOCATION_ID, 4).subscribe();

    const req = http.expectOne(r => r.url === URL);
    expect(req.request.params.get('quantity')).toBe('4');
    req.flush(availabilityFixture);
  });

  it('getAvailabilityByProductId() — omits a non-positive or non-finite quantity', () => {
    service.getAvailabilityByProductId(PRODUCT_ID, LOCATION_ID, 0).subscribe();
    const zero = http.expectOne(r => r.url === URL);
    expect(zero.request.params.has('quantity')).toBe(false);
    zero.flush(availabilityFixture);

    service.getAvailabilityByProductId(PRODUCT_ID, LOCATION_ID, Number.NaN).subscribe();
    const nan = http.expectOne(r => r.url === URL);
    expect(nan.request.params.has('quantity')).toBe(false);
    nan.flush(availabilityFixture);
  });

  it('getAvailabilityBySku() — GET /supplier/v1/availability keyed by sku, not productId', () => {
    service.getAvailabilityBySku('MX-2255', LOCATION_ID, 8).subscribe();

    const req = http.expectOne(r => r.url === URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('sku')).toBe('MX-2255');
    expect(req.request.params.has('productId')).toBe(false);
    expect(req.request.params.get('deliveryLocationId')).toBe(LOCATION_ID);
    expect(req.request.params.get('quantity')).toBe('8');
    req.flush({ ...availabilityFixture, productId: null, sku: 'MX-2255' });
  });

  it('returns non-OK vendor results untouched — null quantities are never coalesced', () => {
    const degraded: SupplierAvailability = {
      productId: PRODUCT_ID,
      deliveryLocationId: LOCATION_ID,
      fetchedAt: '2026-08-12T12:00:00Z',
      stalenessThresholdMinutes: 60,
      vendors: [
        {
          vendorProfileId: 'vp-1',
          vendorDisplayName: 'Michelin EU',
          status: 'SUPPLIER_UNAVAILABLE',
          availableQuantity: null,
          unitOfMeasure: null,
          asOf: null,
          errorCode: 'VENDOR_TIMEOUT',
        },
      ],
    };

    let received: SupplierAvailability | undefined;
    service.getAvailabilityByProductId(PRODUCT_ID, LOCATION_ID).subscribe(v => (received = v));
    http.expectOne(r => r.url === URL).flush(degraded);

    expect(received?.vendors[0].availableQuantity).toBeNull();
    expect(received?.vendors[0].unitOfMeasure).toBeNull();
  });

  it('propagates a 5xx so the caller can render a degraded, retryable state', () => {
    let status = 0;
    service.getAvailabilityByProductId(PRODUCT_ID, LOCATION_ID).subscribe({
      error: (err: { status: number }) => (status = err.status),
    });

    http
      .expectOne(r => r.url === URL)
      .flush({ message: 'upstream' }, { status: 503, statusText: 'Service Unavailable' });

    expect(status).toBe(503);
  });

  it('exposes no mutating operation — availability is a read-only inquiry', () => {
    const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
    expect(methodNames.some(name => /create|update|delete|reserve|order/i.test(name))).toBe(false);
  });
});
