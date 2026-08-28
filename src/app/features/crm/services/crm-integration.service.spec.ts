import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AccountingEventsService, EventProcessingLogEntry } from '@durion-sdk/accounting';
import { CrmIntegrationService } from './crm-integration.service';
import type {
  AccountingEventListResponse,
  AccountingEventResponse,
  ReprocessingAttemptHistoryResponse,
} from '../models/crm-integration.models';

describe('CrmIntegrationService', () => {
  let service: CrmIntegrationService;

  const accountingEventsStub = {
    listAccountingEvents: vi.fn(),
    getAccountingEvent: vi.fn(),
    getEventReprocessingHistory: vi.fn(),
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
    it('calls eventsApi.listAccountingEvents when called with no arguments', () => {
      const sdkPage = { content: [], totalElements: 0 };
      accountingEventsStub.listAccountingEvents.mockReturnValueOnce(of(sdkPage));

      let result!: AccountingEventListResponse;
      service.listEvents().subscribe(r => { result = r; });

      expect(accountingEventsStub.listAccountingEvents).toHaveBeenCalledOnce();
      // arg 0 is organizationId; page/size are positional args 10 and 11
      const args = accountingEventsStub.listAccountingEvents.mock.calls[0];
      expect(args[0]).toBeUndefined();
      expect(args[10]).toBe(0);
      expect(args[11]).toBe(20);
      expect(result).toBeDefined();
      expect(result.items).toHaveLength(0);
    });

    it('calls eventsApi.listAccountingEvents with organizationId and status params', () => {
      const sdkPage = {
        content: [
          {
            eventId: 'ev-001',
            eventType: 'InvoiceIssued',
            processingStatus: 'PENDING',
            receivedAt: '2026-01-01T00:00:00Z',
            organizationId: 'org-abc',
          },
        ],
        totalElements: 1,
      };
      accountingEventsStub.listAccountingEvents.mockReturnValueOnce(of(sdkPage));

      let result!: AccountingEventListResponse;
      service
        .listEvents({ organizationId: 'org-abc', status: 'PENDING', page: 0, size: 20 })
        .subscribe(r => { result = r; });

      expect(accountingEventsStub.listAccountingEvents).toHaveBeenCalledOnce();
      const args = accountingEventsStub.listAccountingEvents.mock.calls[0];
      expect(args[0]).toBe('org-abc'); // organizationId
      expect(args[9]).toBe('PENDING'); // status
      expect(args[10]).toBe(0); // page
      expect(args[11]).toBe(20); // size
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
      accountingEventsStub.getAccountingEvent.mockReturnValueOnce(of(response));

      let result!: AccountingEventResponse;
      service.getEvent('ev-002').subscribe(r => { result = r; });

      expect(accountingEventsStub.getAccountingEvent).toHaveBeenCalledWith('ev-002');
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
      accountingEventsStub.getEventReprocessingHistory.mockReturnValueOnce(of(response));

      let result!: ReprocessingAttemptHistoryResponse[];
      service.getReprocessingHistory('ev-003').subscribe(r => { result = r; });

      expect(accountingEventsStub.getEventReprocessingHistory).toHaveBeenCalledWith('ev-003');
      expect(result).toHaveLength(1);
      expect(result[0].attemptId).toBe('att-1');
    });

    it('returns an empty array when the event has no reprocessing history', () => {
      accountingEventsStub.getEventReprocessingHistory.mockReturnValueOnce(of([]));

      let result!: ReprocessingAttemptHistoryResponse[];
      service.getReprocessingHistory('ev-no-history').subscribe(r => { result = r; });

      expect(result).toHaveLength(0);
    });
  });

  // ── getEventProcessingLog() ──────────────────────────────────────────────────

  describe('getEventProcessingLog()', () => {
    it('calls eventsApi.getEventProcessingLog with the given eventId', () => {
      const logEntries = [{ timestamp: '2026-01-04T00:00:00Z', message: 'Processed successfully.' }];
      accountingEventsStub.getEventProcessingLog.mockReturnValueOnce(of(logEntries));

      let result!: EventProcessingLogEntry[];
      service.getEventProcessingLog('ev-004').subscribe(r => { result = r; });

      expect(accountingEventsStub.getEventProcessingLog).toHaveBeenCalledWith('ev-004');
      expect(result).toHaveLength(1);
    });
  });
});
