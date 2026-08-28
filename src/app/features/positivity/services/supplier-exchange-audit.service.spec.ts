/**
 * SupplierExchangeAuditService contract tests.
 *
 * The load-bearing cases here are the half-open window conversion (ADR-0038 +
 * the contract's `from` inclusive / `to` exclusive rule) and the refusal to turn
 * a null `httpStatus` into `0`.
 */
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExchangeAuditPayloadView,
  ExchangeAuditPayloadViewCaptureLevelEnum,
  ExchangeAuditSummary,
  ExchangeAuditSummaryCaptureLevelEnum,
  PagedResponseExchangeAuditSummary,
  SupplierExchangeAuditService as SupplierExchangeAuditSdkService,
} from '@durion-sdk/supplier';
import {
  EXCHANGE_AUDIT_PAGE_SIZE,
  SupplierExchangeAuditService,
  startOfLocalDayIso,
  startOfNextLocalDayIso,
} from './supplier-exchange-audit.service';
import { ExchangeAuditFilter } from '../models/supplier-exchange.models';

const PROFILE_ID = 'ffc9a4c2-0000-7000-8000-000000000001';
const EXCHANGE_ID = 'ffc9a4c2-0000-7000-8000-0000000000e1';

const summary: ExchangeAuditSummary = {
  exchangeAuditId: EXCHANGE_ID,
  vendorProfileId: PROFILE_ID,
  supplierRef: 'michelin-eu',
  bindingId: 'bind-1',
  capability: 'PRICE_CATALOG',
  protocolFamily: 'EDIWHEEL_B',
  protocolVersion: 'B4_0',
  httpMethod: 'POST',
  endpointUri: 'https://edi.example.com/pricat',
  attempt: 1,
  correlationId: 'corr-1',
  outcome: 'SUCCESS',
  httpStatus: 200,
  startedAt: '2026-08-12T09:00:00Z',
  durationMs: 412,
  captureLevel: ExchangeAuditSummaryCaptureLevelEnum.Redacted,
  requestPayloadPresent: true,
  responsePayloadPresent: true,
  createdBy: 'system',
};

const pagedResponse: PagedResponseExchangeAuditSummary = {
  items: [summary],
  page: 0,
  size: EXCHANGE_AUDIT_PAGE_SIZE,
  totalElements: 1,
  totalPages: 1,
};

const filter: ExchangeAuditFilter = {
  vendorProfileId: PROFILE_ID,
  dateFrom: '2026-08-01',
  dateTo: '2026-08-07',
};

describe('startOfLocalDayIso / startOfNextLocalDayIso', () => {
  it('anchors the window start at local midnight, not UTC midnight', () => {
    const expected = new Date(2026, 7, 1).toISOString();

    expect(startOfLocalDayIso('2026-08-01')).toBe(expected);
  });

  it('makes the exclusive end the start of the day AFTER the selected last day', () => {
    // Selecting "to 7 Aug" must include the whole of 7 Aug.
    const expected = new Date(2026, 7, 8).toISOString();

    expect(startOfNextLocalDayIso('2026-08-07')).toBe(expected);
  });

  it('rolls over a month boundary', () => {
    expect(startOfNextLocalDayIso('2026-08-31')).toBe(new Date(2026, 8, 1).toISOString());
  });

  it('rolls over a year boundary', () => {
    expect(startOfNextLocalDayIso('2026-12-31')).toBe(new Date(2027, 0, 1).toISOString());
  });

  it('produces windows that tile without overlapping', () => {
    // Adjacent windows must meet exactly, so a boundary attempt is listed once.
    expect(startOfNextLocalDayIso('2026-08-07')).toBe(startOfLocalDayIso('2026-08-08'));
  });
});

describe('SupplierExchangeAuditService', () => {
  let service: SupplierExchangeAuditService;

  const auditSdk = {
    listSupplierExchanges: vi.fn(),
    getSupplierExchange: vi.fn(),
    readSupplierExchangePayload: vi.fn(),
    traceSupplierCorrelation: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SupplierExchangeAuditService,
        { provide: SupplierExchangeAuditSdkService, useValue: auditSdk },
      ],
    });
    service = TestBed.inject(SupplierExchangeAuditService);
  });

  afterEach(() => vi.clearAllMocks());

  it('listExchanges() sends the required vendor and half-open instant window', () => {
    auditSdk.listSupplierExchanges.mockReturnValue(of(pagedResponse));

    service.listExchanges(filter).subscribe();

    expect(auditSdk.listSupplierExchanges).toHaveBeenCalledWith(
      PROFILE_ID,
      new Date(2026, 7, 1).toISOString(),
      new Date(2026, 7, 8).toISOString(),
      undefined,
      0,
      EXCHANGE_AUDIT_PAGE_SIZE,
    );
  });

  it('listExchanges() includes the whole of the selected end day', () => {
    auditSdk.listSupplierExchanges.mockReturnValue(of(pagedResponse));

    service.listExchanges({ ...filter, dateFrom: '2026-08-07', dateTo: '2026-08-07' }).subscribe();

    const [, from, to] = auditSdk.listSupplierExchanges.mock.calls[0] as [string, string, string];
    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('listExchanges() passes the capability filter through when set', () => {
    auditSdk.listSupplierExchanges.mockReturnValue(of(pagedResponse));

    service.listExchanges({ ...filter, capability: 'ORDER' }).subscribe();

    expect(auditSdk.listSupplierExchanges.mock.calls[0][3]).toBe('ORDER');
  });

  it('listExchanges() sends no outcome argument — the contract has no such parameter', () => {
    auditSdk.listSupplierExchanges.mockReturnValue(of(pagedResponse));

    service.listExchanges(filter).subscribe();

    const args = auditSdk.listSupplierExchanges.mock.calls[0] as unknown[];
    expect(args).toHaveLength(6);
    expect(args.some(arg => arg === 'SUCCESS' || arg === 'FAILURE')).toBe(false);
  });

  it('listExchanges() requests the given page', () => {
    auditSdk.listSupplierExchanges.mockReturnValue(of({ ...pagedResponse, page: 2 }));

    service.listExchanges(filter, 2).subscribe();

    expect(auditSdk.listSupplierExchanges.mock.calls[0][4]).toBe(2);
  });

  it('listExchanges() maps the paged envelope onto the domain page', () => {
    auditSdk.listSupplierExchanges.mockReturnValue(
      of({ items: [summary], page: 1, size: 25, totalElements: 43, totalPages: 2 }),
    );

    let result!: { page: number; size: number; totalCount: number; totalPages: number };
    service.listExchanges(filter, 1).subscribe(value => (result = value));

    expect(result).toMatchObject({ page: 1, size: 25, totalCount: 43, totalPages: 2 });
  });

  it('listExchanges() tolerates an empty paged envelope', () => {
    auditSdk.listSupplierExchanges.mockReturnValue(of({} as PagedResponseExchangeAuditSummary));

    let result!: { items: unknown[]; totalCount: number };
    service.listExchanges(filter).subscribe(value => (result = value));

    expect(result.items).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it('getExchange() maps a summary row', () => {
    auditSdk.getSupplierExchange.mockReturnValue(of(summary));

    let result!: { supplierRef: string; attempt: number; captureLevel: string };
    service.getExchange(EXCHANGE_ID).subscribe(value => (result = value));

    expect(auditSdk.getSupplierExchange).toHaveBeenCalledWith(EXCHANGE_ID);
    expect(result.supplierRef).toBe('michelin-eu');
    expect(result.attempt).toBe(1);
    expect(result.captureLevel).toBe('REDACTED');
  });

  it('keeps a missing httpStatus as null — never 0', () => {
    // No response at all: connect failure, pre-header timeout, or breaker-suppressed.
    auditSdk.getSupplierExchange.mockReturnValue(
      of({ ...summary, httpStatus: undefined, durationMs: undefined, outcome: 'TIMEOUT' }),
    );

    let result!: { httpStatus: number | null; durationMs: number | null };
    service.getExchange(EXCHANGE_ID).subscribe(value => (result = value));

    expect(result.httpStatus).toBeNull();
    expect(result.httpStatus).not.toBe(0);
    expect(result.durationMs).toBeNull();
  });

  it('preserves a genuine zero-ish status distinctly from absence', () => {
    auditSdk.getSupplierExchange.mockReturnValue(of({ ...summary, httpStatus: 204 }));

    let result!: { httpStatus: number | null };
    service.getExchange(EXCHANGE_ID).subscribe(value => (result = value));

    expect(result.httpStatus).toBe(204);
  });

  it('surfaces the payload-presence and purge flags from the summary', () => {
    auditSdk.getSupplierExchange.mockReturnValue(
      of({
        ...summary,
        requestPayloadPresent: false,
        responsePayloadPresent: false,
        payloadsPurgedAt: '2027-09-15T00:00:00Z',
      }),
    );

    let result!: {
      requestPayloadPresent: boolean;
      responsePayloadPresent: boolean;
      payloadsPurgedAt?: string | null;
    };
    service.getExchange(EXCHANGE_ID).subscribe(value => (result = value));

    expect(result.requestPayloadPresent).toBe(false);
    expect(result.payloadsPurgedAt).toBe('2027-09-15T00:00:00Z');
  });

  it('getExchangePayload() maps the stored content view', () => {
    const payload: ExchangeAuditPayloadView = {
      exchangeAuditId: EXCHANGE_ID,
      captureLevel: ExchangeAuditPayloadViewCaptureLevelEnum.Redacted,
      redacted: true,
      requestPayload: '<Order/>',
      responsePayload: '<Ack/>',
    };
    auditSdk.readSupplierExchangePayload.mockReturnValue(of(payload));

    let result!: { redacted: boolean; requestPayload: string | null };
    service.getExchangePayload(EXCHANGE_ID).subscribe(value => (result = value));

    expect(auditSdk.readSupplierExchangePayload).toHaveBeenCalledWith(EXCHANGE_ID);
    expect(result.redacted).toBe(true);
    expect(result.requestPayload).toBe('<Order/>');
  });

  it('normalises absent payload documents to null, which is a normal state', () => {
    auditSdk.readSupplierExchangePayload.mockReturnValue(
      of({
        exchangeAuditId: EXCHANGE_ID,
        captureLevel: ExchangeAuditPayloadViewCaptureLevelEnum.MetadataOnly,
        redacted: false,
      } as ExchangeAuditPayloadView),
    );

    let result!: { requestPayload: string | null; responsePayload: string | null };
    service.getExchangePayload(EXCHANGE_ID).subscribe(value => (result = value));

    expect(result.requestPayload).toBeNull();
    expect(result.responsePayload).toBeNull();
  });

  it('traceCorrelation() asks for every attempt of one logical call', () => {
    auditSdk.traceSupplierCorrelation.mockReturnValue(of(pagedResponse));

    service.traceCorrelation('corr-1').subscribe();

    expect(auditSdk.traceSupplierCorrelation).toHaveBeenCalledWith('corr-1', 0, EXCHANGE_AUDIT_PAGE_SIZE);
  });

  it('traceCorrelation() maps the attempts through the same row mapping', () => {
    auditSdk.traceSupplierCorrelation.mockReturnValue(
      of({
        items: [summary, { ...summary, exchangeAuditId: 'e2', attempt: 2, httpStatus: undefined }],
        page: 0,
        size: 25,
        totalElements: 2,
        totalPages: 1,
      }),
    );

    let items: { attempt: number; httpStatus: number | null }[] = [];
    service.traceCorrelation('corr-1').subscribe(value => (items = value.items));

    expect(items.map(i => i.attempt)).toEqual([1, 2]);
    expect(items[1].httpStatus).toBeNull();
  });
});
