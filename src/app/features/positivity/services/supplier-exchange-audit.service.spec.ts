/**
 * SupplierExchangeAuditService contract tests.
 *
 * ADR-0035: every public method asserts verb + URL.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 */
import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { environment } from '../../../../environments/environment';
import { SupplierExchangeAuditService } from './supplier-exchange-audit.service';
import {
  ExchangeAuditFilter,
  ExchangeAuditPage,
  ExchangeAuditRecord,
  ExchangePayloadView,
} from '../models/supplier-exchange.models';

const BASE = environment.apiBaseUrl;

const recordFixture: ExchangeAuditRecord = {
  exchangeId: 'exch-1',
  vendorProfileId: 'profile-1',
  vendorDisplayName: 'Michelin EU',
  capability: 'ORDER',
  protocolFamily: 'EDIWHEEL_C1',
  protocolVersion: 'C1_1',
  outcome: 'SUCCESS',
  httpStatus: 200,
  durationMs: 412,
  correlationId: 'corr-1',
  captureLevel: 'REDACTED',
  startedAt: '2026-08-12T09:00:00Z',
  finishedAt: '2026-08-12T09:00:01Z',
};

const pageFixture: ExchangeAuditPage = {
  items: [recordFixture],
  totalCount: 1,
  nextPageToken: null,
};

const payloadFixture: ExchangePayloadView = {
  exchangeId: 'exch-1',
  captureLevel: 'REDACTED',
  requestContentType: 'application/xml',
  requestBody: '<Order/>',
  requestHeaders: [{ name: 'Authorization', value: '***', redacted: true }],
  responseContentType: 'application/xml',
  responseBody: '<OrderResponse/>',
  responseHeaders: [],
  redactedFields: ['Order.BuyerParty'],
};

describe('SupplierExchangeAuditService', () => {
  let service: SupplierExchangeAuditService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SupplierExchangeAuditService, ApiBaseService],
    });
    service = TestBed.inject(SupplierExchangeAuditService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('listExchanges() — GET /supplier/v1/exchanges with no params when unfiltered', () => {
    service.listExchanges().subscribe();
    const req = http.expectOne(`${BASE}/supplier/v1/exchanges`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush(pageFixture);
  });

  it('listExchanges() — forwards vendor, capability, outcome and date-only bounds as query params', () => {
    const filter: ExchangeAuditFilter = {
      vendorProfileId: 'profile-1',
      capability: 'ORDER',
      outcome: 'FAILURE',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-12',
    };
    service.listExchanges(filter, 'token-2').subscribe();

    const req = http.expectOne(r => r.url === `${BASE}/supplier/v1/exchanges`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('vendorProfileId')).toBe('profile-1');
    expect(req.request.params.get('capability')).toBe('ORDER');
    expect(req.request.params.get('outcome')).toBe('FAILURE');
    expect(req.request.params.get('dateFrom')).toBe('2026-08-01');
    expect(req.request.params.get('dateTo')).toBe('2026-08-12');
    expect(req.request.params.get('pageToken')).toBe('token-2');
    req.flush(pageFixture);
  });

  it('listExchanges() — omits blank filter values', () => {
    service.listExchanges({ capability: '', outcome: '', vendorProfileId: '' }).subscribe();
    const req = http.expectOne(`${BASE}/supplier/v1/exchanges`);
    expect(req.request.params.keys()).toEqual([]);
    req.flush(pageFixture);
  });

  it('getExchange() — GET /supplier/v1/exchanges/{exchangeId}', () => {
    service.getExchange('exch-1').subscribe();
    const req = http.expectOne(`${BASE}/supplier/v1/exchanges/exch-1`);
    expect(req.request.method).toBe('GET');
    req.flush(recordFixture);
  });

  it('getExchangePayload() — GET /supplier/v1/exchanges/{exchangeId}/payload', () => {
    service.getExchangePayload('exch-1').subscribe();
    const req = http.expectOne(`${BASE}/supplier/v1/exchanges/exch-1/payload`);
    expect(req.request.method).toBe('GET');
    req.flush(payloadFixture);
  });

  it('getExchangePayload() — surfaces the backend 403 as the authoritative permission signal', () => {
    let status = 0;
    service.getExchangePayload('exch-1').subscribe({
      error: (err: HttpErrorResponse) => {
        status = err.status;
      },
    });
    const req = http.expectOne(`${BASE}/supplier/v1/exchanges/exch-1/payload`);
    req.flush({ message: 'forbidden' }, { status: 403, statusText: 'Forbidden' });
    expect(status).toBe(403);
  });
});
