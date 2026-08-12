/**
 * SupplierOrderTransmissionService contract tests.
 *
 * ADR-0035: every public method asserts verb + URL.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 */
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { environment } from '../../../../environments/environment';
import { SupplierOrderTransmissionService } from './supplier-order-transmission.service';
import {
  SupplierManualReviewItem,
  SupplierManualReviewPage,
  SupplierOrderStatusHistory,
  SupplierOrderTransmission,
} from '../models/supplier-order-transmission.models';

const BASE = environment.apiBaseUrl;
const PO_ID = 'ffc9a4c2-0000-7000-8000-000000000001';
const TRANSMISSION_URL = `${BASE}/supplier/v1/purchase-orders/${PO_ID}/transmission`;
const HISTORY_URL = `${TRANSMISSION_URL}/history`;
const QUEUE_URL = `${BASE}/supplier/v1/order-transmissions/manual-review`;

const transmissionFixture: SupplierOrderTransmission = {
  purchaseOrderId: PO_ID,
  vendorProfileId: 'vp-1',
  vendorDisplayName: 'Michelin EU',
  state: 'PARTIALLY_CONFIRMED',
  vendorOrderNumber: 'MX-ORD-99182',
  vendorDocumentId: 'DOC-4411',
  lines: [
    {
      poLineId: 'ffc9a4c2-0000-7000-8000-0000000000a1',
      sku: 'MX-2255',
      productName: 'Primacy 4 225/55R17',
      orderedQuantity: 8,
      confirmedQuantity: 6,
      outcome: 'BACKORDERED',
      vendorReason: '2 units on backorder until week 34',
      expectedShipDate: '2026-08-20',
    },
  ],
  resolutionActions: [],
  asOf: '2026-08-12T11:40:00Z',
  fetchedAt: '2026-08-12T12:00:00Z',
  stalenessThresholdMinutes: 120,
};

const historyFixture: SupplierOrderStatusHistory = {
  purchaseOrderId: PO_ID,
  events: [
    {
      statusEventId: 'ev-1',
      occurredAt: '2026-08-12T09:00:00Z',
      state: 'SENT',
      vendorStatus: 'RECEIVED',
      note: null,
    },
  ],
  fetchedAt: '2026-08-12T12:00:00Z',
};

const queueItemFixture: SupplierManualReviewItem = {
  purchaseOrderId: PO_ID,
  poNumber: 'PO-1042',
  vendorProfileId: 'vp-1',
  vendorDisplayName: 'Michelin EU',
  vendorOrderNumber: null,
  state: 'MANUAL_REVIEW',
  reason: 'NO_VENDOR_ACK',
  detectedAt: '2026-08-12T10:15:00Z',
  resolutionActions: [{ action: 'CONFIRM_MATCHED' }, { action: 'MARK_REJECTED' }],
  resolved: false,
};

const queuePageFixture: SupplierManualReviewPage = {
  items: [queueItemFixture],
  totalCount: 1,
  nextPageToken: null,
};

describe('SupplierOrderTransmissionService', () => {
  let service: SupplierOrderTransmissionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SupplierOrderTransmissionService, ApiBaseService],
    });
    service = TestBed.inject(SupplierOrderTransmissionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getTransmission() — GET /supplier/v1/purchase-orders/{id}/transmission', () => {
    let received: SupplierOrderTransmission | undefined;
    service.getTransmission(PO_ID).subscribe(v => (received = v));

    const req = http.expectOne(r => r.url === TRANSMISSION_URL);
    expect(req.request.method).toBe('GET');
    req.flush(transmissionFixture);

    expect(received?.state).toBe('PARTIALLY_CONFIRMED');
    expect(received?.vendorOrderNumber).toBe('MX-ORD-99182');
  });

  it('getTransmission() — returns per-line vendor answers untouched', () => {
    let received: SupplierOrderTransmission | undefined;
    service.getTransmission(PO_ID).subscribe(v => (received = v));
    http.expectOne(r => r.url === TRANSMISSION_URL).flush(transmissionFixture);

    expect(received?.lines[0].outcome).toBe('BACKORDERED');
    expect(received?.lines[0].confirmedQuantity).toBe(6);
    expect(received?.lines[0].vendorReason).toBe('2 units on backorder until week 34');
  });

  it('getStatusHistory() — GET /supplier/v1/purchase-orders/{id}/transmission/history', () => {
    let received: SupplierOrderStatusHistory | undefined;
    service.getStatusHistory(PO_ID).subscribe(v => (received = v));

    const req = http.expectOne(r => r.url === HISTORY_URL);
    expect(req.request.method).toBe('GET');
    req.flush(historyFixture);

    expect(received?.events).toHaveLength(1);
  });

  it('listManualReview() — GET the queue with no params by default', () => {
    service.listManualReview().subscribe();

    const req = http.expectOne(r => r.url === QUEUE_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toHaveLength(0);
    req.flush(queuePageFixture);
  });

  it('listManualReview() — forwards vendor, search, date and page filters', () => {
    service
      .listManualReview(
        {
          vendorProfileId: 'vp-1',
          search: 'PO-1042',
          dateFrom: '2026-08-01',
          dateTo: '2026-08-12',
        },
        'tok-2',
      )
      .subscribe();

    const req = http.expectOne(r => r.url === QUEUE_URL);
    expect(req.request.params.get('vendorProfileId')).toBe('vp-1');
    expect(req.request.params.get('search')).toBe('PO-1042');
    expect(req.request.params.get('dateFrom')).toBe('2026-08-01');
    expect(req.request.params.get('dateTo')).toBe('2026-08-12');
    expect(req.request.params.get('pageToken')).toBe('tok-2');
    req.flush(queuePageFixture);
  });

  it('getManualReviewItem() — GET one queue row for a post-409 refresh', () => {
    let received: SupplierManualReviewItem | undefined;
    service.getManualReviewItem(PO_ID).subscribe(v => (received = v));

    const req = http.expectOne(r => r.url === `${QUEUE_URL}/${PO_ID}`);
    expect(req.request.method).toBe('GET');
    req.flush(queueItemFixture);

    expect(received?.reason).toBe('NO_VENDOR_ACK');
  });

  it('resolveManualReview() — POST the backend action token verbatim', () => {
    service.resolveManualReview(PO_ID, 'CONFIRM_MATCHED').subscribe();

    const req = http.expectOne(r => r.url === `${QUEUE_URL}/${PO_ID}/resolution`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ action: 'CONFIRM_MATCHED' });
    req.flush({ ...queueItemFixture, resolved: true, resolutionActions: [] });
  });

  it('resolveManualReview() — propagates a 409 so the caller can refresh the row', () => {
    let status = 0;
    service.resolveManualReview(PO_ID, 'MARK_REJECTED').subscribe({
      error: (err: { status: number }) => (status = err.status),
    });

    http
      .expectOne(r => r.url === `${QUEUE_URL}/${PO_ID}/resolution`)
      .flush({ message: 'vendor updated' }, { status: 409, statusText: 'Conflict' });

    expect(status).toBe(409);
  });

  it('propagates a 403 rather than masking it as an empty queue', () => {
    let status = 0;
    service.listManualReview().subscribe({
      error: (err: { status: number }) => (status = err.status),
    });

    http
      .expectOne(r => r.url === QUEUE_URL)
      .flush({ message: 'nope' }, { status: 403, statusText: 'Forbidden' });

    expect(status).toBe(403);
  });

  it('exposes no re-send / retry / re-transmit operation — the absence is the safety property', () => {
    const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
    expect(
      methodNames.some(name => /resend|re_?send|retransmit|retry|transmit|send/i.test(name)),
    ).toBe(false);
  });

  it('exposes no write path other than the backend-offered resolution', () => {
    const mutators = Object.getOwnPropertyNames(Object.getPrototypeOf(service)).filter(name =>
      /create|update|delete|cancel|resolve|post/i.test(name),
    );
    expect(mutators).toEqual(['resolveManualReview']);
  });
});
