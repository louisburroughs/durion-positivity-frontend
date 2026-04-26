import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AccountingEventsService } from '@durion-sdk/accounting';
import { CrmIntegrationService } from './crm-integration.service';
import type {
  AccountingEventListResponse,
  AccountingEventResponse,
  ReprocessingAttemptHistoryResponse,
} from '../models/crm-integration.models';

describe('CrmIntegrationService', () => {
  let service: CrmIntegrationService;

  const accountingEventsStub = {
    listEvents: vi.fn(),
    getEvent: vi.fn(),
    getReprocessingHistory: vi.fn(),
    getEventProcessingLog: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CrmIntegrationService,
        { provide: AccountingEventsService, useValue: accountingEventsStub },
      ],
    });
    service = TestBed.inject(CrmIntegrationService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── listEvents() ────────────────────────────────────────────────────────────

  describe('listEvents()', () => {
    it('calls eventsApi.listEvents with empty organizationId when called with no arguments', () => {
      const response: AccountingEventListResponse = { items: [], totalCount: 0 };
      accountingEventsStub.listEvents.mockReturnValueOnce(of(response));

      let result: any;
      service.listEvents().subscribe((r: any) => { result = r; });

      expect(accountingEventsStub.listEvents).toHaveBeenCalledOnce();
      expect(accountingEventsStub.listEvents).toHaveBeenCalledWith('', undefined, undefined, undefined);
      expect(result).toBeDefined();
      expect(result.items).toHaveLength(0);
    });

    it('calls eventsApi.listEvents with organizationId, page, size and status params', () => {
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
      accountingEventsStub.listEvents.mockReturnValueOnce(of(response));

      let result: any;
      service
        .listEvents({ organizationId: 'org-abc', status: 'PENDING', page: 0, size: 20 })
        .subscribe((r: any) => { result = r; });

      expect(accountingEventsStub.listEvents).toHaveBeenCalledOnce();
      expect(accountingEventsStub.listEvents).toHaveBeenCalledWith('org-abc', 0, 20, 'PENDING');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].eventId).toBe('ev-001');
    });
  });

  // ── getEvent() ──────────────────────────────────────────────────────────────

  describe('getEvent()', () => {
    it('calls eventsApi.getEvent with the given eventId', () => {
      const response: AccountingEventResponse = {
        eventId: 'ev-002',
        eventType: 'PaymentReceived',
        processingStatus: 'PROCESSED',
        receivedAt: '2026-01-02T00:00:00Z',
      };
      accountingEventsStub.getEvent.mockReturnValueOnce(of(response));

      let result: any;
      service.getEvent('ev-002').subscribe((r: any) => { result = r; });

      expect(accountingEventsStub.getEvent).toHaveBeenCalledWith('ev-002');
      expect(result.eventId).toBe('ev-002');
      expect(result.processingStatus).toBe('PROCESSED');
    });
  });

  // ── getReprocessingHistory() ─────────────────────────────────────────────────

  describe('getReprocessingHistory()', () => {
    it('calls eventsApi.getReprocessingHistory with the given eventId', () => {
      const response: ReprocessingAttemptHistoryResponse[] = [
        {
          attemptId: 'att-1',
          eventId: 'ev-003',
          attemptedAt: '2026-01-03T00:00:00Z',
          outcome: 'FAILED',
          errorMessage: 'downstream timeout',
        },
      ];
      accountingEventsStub.getReprocessingHistory.mockReturnValueOnce(of(response));

      let result: any;
      service.getReprocessingHistory('ev-003').subscribe((r: any) => { result = r; });

      expect(accountingEventsStub.getReprocessingHistory).toHaveBeenCalledWith('ev-003');
      expect(result).toHaveLength(1);
      expect(result[0].attemptId).toBe('att-1');
    });

    it('returns an empty array when the event has no reprocessing history', () => {
      accountingEventsStub.getReprocessingHistory.mockReturnValueOnce(of([]));

      let result: any;
      service.getReprocessingHistory('ev-no-history').subscribe((r: any) => { result = r; });

      expect(result).toHaveLength(0);
    });
  });

  // ── getEventProcessingLog() ──────────────────────────────────────────────────

  describe('getEventProcessingLog()', () => {
    it('calls eventsApi.getEventProcessingLog with the given eventId', () => {
      const logText = 'Event received at 2026-01-04T00:00:00Z\nProcessed successfully.';
      accountingEventsStub.getEventProcessingLog.mockReturnValueOnce(of(logText));

      let result: any;
      service.getEventProcessingLog('ev-004').subscribe((r: any) => { result = r; });

      expect(accountingEventsStub.getEventProcessingLog).toHaveBeenCalledWith('ev-004');
      expect(result).toContain('2026-01-04T00:00:00Z');
    });
  });
});
