import { TestBed } from '@angular/core/testing';
import { HttpParams } from '@angular/common/http';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { CrmIntegrationService } from './crm-integration.service';
import type {
  AccountingEventListResponse,
  AccountingEventResponse,
  ReprocessingAttemptHistoryResponse,
} from '../models/crm-integration.models';

describe('CrmIntegrationService', () => {
  let service: CrmIntegrationService;

  const apiBaseServiceStub = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CrmIntegrationService,
        { provide: ApiBaseService, useValue: apiBaseServiceStub },
      ],
    });
    service = TestBed.inject(CrmIntegrationService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── listEvents() ────────────────────────────────────────────────────────────

  describe('listEvents()', () => {
    it('calls GET /v1/accounting/events with no params when called with no arguments', () => {
      const response: AccountingEventListResponse = { items: [], totalCount: 0 };
      apiBaseServiceStub.get.mockReturnValueOnce(of(response));

      let result: any;
      service.listEvents().subscribe((r: any) => { result = r; });

      expect(apiBaseServiceStub.get).toHaveBeenCalledOnce();
      const [path, params] = apiBaseServiceStub.get.mock.calls[0];
      expect(path).toBe('/v1/accounting/events');
      // params should exist and have no keys set for the mandatory organizationId
      expect(params instanceof HttpParams).toBe(true);
      expect((params as HttpParams).has('organizationId')).toBe(false);
      expect(result).toBeDefined();
      expect(result.items).toHaveLength(0);
    });

    it('calls GET /v1/accounting/events with organizationId and status params', () => {
      const response: AccountingEventListResponse = {
        items: [
          {
            eventId: 'ev-001',
            eventType: 'InvoiceIssued',
            processingStatus: 'PENDING',
            receivedAt: '2026-01-01T00:00:00Z',
            organizationId: 'org-abc',
          },
        ],
        totalCount: 1,
      };
      apiBaseServiceStub.get.mockReturnValueOnce(of(response));

      let result: any;
      service
        .listEvents({ organizationId: 'org-abc', status: 'PENDING', page: 0, size: 20 })
        .subscribe((r: any) => { result = r; });

      expect(apiBaseServiceStub.get).toHaveBeenCalledOnce();
      const [path, params] = apiBaseServiceStub.get.mock.calls[0];
      expect(path).toBe('/v1/accounting/events');
      expect((params as HttpParams).get('organizationId')).toBe('org-abc');
      expect((params as HttpParams).get('status')).toBe('PENDING');
      expect((params as HttpParams).get('page')).toBe('0');
      expect((params as HttpParams).get('size')).toBe('20');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].eventId).toBe('ev-001');
    });
  });

  // ── getEvent() ──────────────────────────────────────────────────────────────

  describe('getEvent()', () => {
    it('calls GET /v1/accounting/events/{eventId} with the given eventId', () => {
      const response: AccountingEventResponse = {
        eventId: 'ev-002',
        eventType: 'PaymentReceived',
        processingStatus: 'PROCESSED',
        receivedAt: '2026-01-02T00:00:00Z',
      };
      apiBaseServiceStub.get.mockReturnValueOnce(of(response));

      let result: any;
      service.getEvent('ev-002').subscribe((r: any) => { result = r; });

      expect(apiBaseServiceStub.get).toHaveBeenCalledOnce();
      const [path] = apiBaseServiceStub.get.mock.calls[0];
      expect(path).toBe('/v1/accounting/events/ev-002');
      expect(result.eventId).toBe('ev-002');
      expect(result.processingStatus).toBe('PROCESSED');
    });
  });

  // ── getReprocessingHistory() ─────────────────────────────────────────────────

  describe('getReprocessingHistory()', () => {
    it('calls GET /v1/accounting/events/{eventId}/reprocessing-history', () => {
      const response: ReprocessingAttemptHistoryResponse[] = [
        {
          attemptId: 'att-1',
          eventId: 'ev-003',
          attemptedAt: '2026-01-03T00:00:00Z',
          outcome: 'FAILED',
          errorMessage: 'downstream timeout',
        },
      ];
      apiBaseServiceStub.get.mockReturnValueOnce(of(response));

      let result: any;
      service.getReprocessingHistory('ev-003').subscribe((r: any) => { result = r; });

      expect(apiBaseServiceStub.get).toHaveBeenCalledOnce();
      const [path] = apiBaseServiceStub.get.mock.calls[0];
      expect(path).toBe('/v1/accounting/events/ev-003/reprocessing-history');
      expect(result).toHaveLength(1);
      expect(result[0].attemptId).toBe('att-1');
    });

    it('returns an empty array when the event has no reprocessing history', () => {
      apiBaseServiceStub.get.mockReturnValueOnce(of([]));

      let result: any;
      service.getReprocessingHistory('ev-no-history').subscribe((r: any) => { result = r; });

      expect(result).toHaveLength(0);
    });
  });

  // ── getEventProcessingLog() ──────────────────────────────────────────────────

  describe('getEventProcessingLog()', () => {
    it('calls GET /v1/accounting/events/{eventId}/processing-log', () => {
      const logText = 'Event received at 2026-01-04T00:00:00Z\nProcessed successfully.';
      apiBaseServiceStub.get.mockReturnValueOnce(of(logText));

      let result: any;
      service.getEventProcessingLog('ev-004').subscribe((r: any) => { result = r; });

      expect(apiBaseServiceStub.get).toHaveBeenCalledOnce();
      const [path] = apiBaseServiceStub.get.mock.calls[0];
      expect(path).toBe('/v1/accounting/events/ev-004/processing-log');
      expect(result).toContain('2026-01-04T00:00:00Z');
    });
  });
});
