/**
 * SupplierShipmentService contract tests.
 *
 * ADR-0035: every public method asserts verb + URL.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 */
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { environment } from '../../../../environments/environment';
import { SupplierShipmentService } from './supplier-shipment.service';
import {
  SupplierShipmentTimeline,
  SupplierUnlinkedShipmentEventPage,
} from '../models/supplier-shipment.models';

const BASE = environment.apiBaseUrl;
const PO_ID = 'ffc9a4c2-0000-7000-8000-000000000001';
const TIMELINE_URL = `${BASE}/supplier/v1/purchase-orders/${PO_ID}/shipment-events`;
const UNLINKED_URL = `${BASE}/supplier/v1/shipment-events/unlinked`;

const timelineFixture: SupplierShipmentTimeline = {
  purchaseOrderId: PO_ID,
  events: [
    {
      shipmentEventId: 'se-1',
      purchaseOrderId: PO_ID,
      eventCode: 'SHIPPED',
      eventDescription: 'Collected by carrier',
      carrierCode: 'DHL',
      trackingReference: 'JD0002',
      vendorOrderNumber: 'MX-ORD-99182',
      packageCount: 2,
      occurredAt: '2026-08-11T08:00:00Z',
      receivedAt: '2026-08-11T08:05:00Z',
    },
  ],
  fetchedAt: '2026-08-12T12:00:00Z',
};

const unlinkedFixture: SupplierUnlinkedShipmentEventPage = {
  items: [
    {
      shipmentEventId: 'se-9',
      purchaseOrderId: null,
      eventCode: 'IN_TRANSIT',
      eventDescription: null,
      carrierCode: 'DHL',
      trackingReference: 'JD0009',
      vendorOrderNumber: 'MX-ORD-00000',
      packageCount: null,
      occurredAt: '2026-08-11T09:00:00Z',
      receivedAt: '2026-08-11T09:02:00Z',
      vendorProfileId: 'vp-1',
      vendorDisplayName: 'Michelin EU',
      unlinkedReason: 'NO_MATCHING_ORDER',
    },
  ],
  totalCount: 1,
  nextPageToken: null,
};

describe('SupplierShipmentService', () => {
  let service: SupplierShipmentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SupplierShipmentService, ApiBaseService],
    });
    service = TestBed.inject(SupplierShipmentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getShipmentTimeline() — GET /supplier/v1/purchase-orders/{id}/shipment-events', () => {
    let received: SupplierShipmentTimeline | undefined;
    service.getShipmentTimeline(PO_ID).subscribe(v => (received = v));

    const req = http.expectOne(r => r.url === TIMELINE_URL);
    expect(req.request.method).toBe('GET');
    req.flush(timelineFixture);

    expect(received?.events[0].eventCode).toBe('SHIPPED');
    expect(received?.events[0].occurredAt).toBe('2026-08-11T08:00:00Z');
    expect(received?.events[0].receivedAt).toBe('2026-08-11T08:05:00Z');
  });

  it('listUnlinkedEvents() — GET the flagged list with no params by default', () => {
    service.listUnlinkedEvents().subscribe();

    const req = http.expectOne(r => r.url === UNLINKED_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toHaveLength(0);
    req.flush(unlinkedFixture);
  });

  it('listUnlinkedEvents() — forwards vendor, search, date and page filters', () => {
    service
      .listUnlinkedEvents(
        { vendorProfileId: 'vp-1', search: 'JD0009', dateFrom: '2026-08-01', dateTo: '2026-08-12' },
        'tok-3',
      )
      .subscribe();

    const req = http.expectOne(r => r.url === UNLINKED_URL);
    expect(req.request.params.get('vendorProfileId')).toBe('vp-1');
    expect(req.request.params.get('search')).toBe('JD0009');
    expect(req.request.params.get('dateFrom')).toBe('2026-08-01');
    expect(req.request.params.get('dateTo')).toBe('2026-08-12');
    expect(req.request.params.get('pageToken')).toBe('tok-3');
    req.flush(unlinkedFixture);
  });

  it('returns an unlinked event with its null purchaseOrderId intact', () => {
    let received: SupplierUnlinkedShipmentEventPage | undefined;
    service.listUnlinkedEvents().subscribe(v => (received = v));
    http.expectOne(r => r.url === UNLINKED_URL).flush(unlinkedFixture);

    expect(received?.items[0].purchaseOrderId).toBeNull();
    expect(received?.items[0].unlinkedReason).toBe('NO_MATCHING_ORDER');
  });

  it('propagates a 5xx so the caller can render a retryable state', () => {
    let status = 0;
    service.getShipmentTimeline(PO_ID).subscribe({
      error: (err: { status: number }) => (status = err.status),
    });

    http
      .expectOne(r => r.url === TIMELINE_URL)
      .flush({ message: 'upstream' }, { status: 503, statusText: 'Service Unavailable' });

    expect(status).toBe(503);
  });

  it('exposes no mutating operation — shipment events are append-only', () => {
    const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(service)).filter(
      name => name !== 'constructor',
    );
    expect(methodNames.sort()).toEqual(['getShipmentTimeline', 'listUnlinkedEvents']);
    expect(
      methodNames.some(name => /create|update|delete|dismiss|acknowledge|resolve|save/i.test(name)),
    ).toBe(false);
  });
});
