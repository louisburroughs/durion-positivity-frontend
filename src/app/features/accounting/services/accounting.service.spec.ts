import { HttpParams } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  AccountingEventsService,
  APPaymentsService,
  CreditMemosService,
  FinancialReportingService,
  InvoicePaymentsService,
  PaymentApplicationsService,
  PostingRulesService,
} from '@durion-sdk/accounting';
import { AccountingService } from './accounting.service';
import {
  AccountingEventDetail,
  AccountingEventListItem,
  EventProcessingLogEntry,
  IngestionListFilters,
  IngestionProcessingStatus,
  InvoicePaymentStatus,
  PagedResponse,
} from '../models/accounting.models';

describe('AccountingService', () => {
  let service: AccountingService;

  const apiBaseServiceStub = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  const accountingEventsStub = {
    getEvent: vi.fn(),
    submitEvent: vi.fn(),
    retryEventProcessing: vi.fn(),
    reprocessSuspendedEvent: vi.fn(),
    getReprocessingHistory: vi.fn(),
  };

  const invoicePaymentsStub = {
    getInvoiceStatus: vi.fn(),
  };

  const authServiceStub = {
    currentUserClaims: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authServiceStub.currentUserClaims.mockReset();
    TestBed.configureTestingModule({
      providers: [
        AccountingService,
        { provide: ApiBaseService, useValue: apiBaseServiceStub },
        { provide: AuthService, useValue: authServiceStub },
        { provide: AccountingEventsService, useValue: accountingEventsStub },
        { provide: APPaymentsService, useValue: {} },
        { provide: CreditMemosService, useValue: { listCreditMemos: vi.fn() } },
        { provide: FinancialReportingService, useValue: {} },
        { provide: InvoicePaymentsService, useValue: invoicePaymentsStub },
        { provide: PaymentApplicationsService, useValue: {} },
        { provide: PostingRulesService, useValue: {} },
      ],
    });
    service = TestBed.inject(AccountingService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('reprocessSuspendedEvent()', () => {
    it('sources the required actor from authenticated claims instead of sending an empty string', () => {
      authServiceStub.currentUserClaims.mockReturnValue({ sub: 'user-123' });
      accountingEventsStub.reprocessSuspendedEvent.mockReturnValueOnce(of({ jobId: 'job-1' }));

      service.reprocessSuspendedEvent('evt-001', { justification: 'retry' }).subscribe();

      expect(accountingEventsStub.reprocessSuspendedEvent).toHaveBeenCalledWith('evt-001', {
        triggeredByUserId: 'user-123',
        reprocessingNotes: 'retry',
      });
    });

    it('falls back to preferred_username when sub is unavailable', () => {
      authServiceStub.currentUserClaims.mockReturnValue({ preferred_username: 'cashier@example.com' });
      accountingEventsStub.reprocessSuspendedEvent.mockReturnValueOnce(of({ jobId: 'job-2' }));

      service.reprocessSuspendedEvent('evt-002', { justification: 'retry' }).subscribe();

      expect(accountingEventsStub.reprocessSuspendedEvent).toHaveBeenCalledWith('evt-002', {
        triggeredByUserId: 'cashier@example.com',
        reprocessingNotes: 'retry',
      });
    });
  });

  describe('listEvents()', () => {
    it('should map both items and content to AccountingEventListItem[]', () => {
      const rawDetail: AccountingEventDetail = {
        eventId: 'e-001',
        eventType: 'InvoiceIssued',
        processingStatus: IngestionProcessingStatus.Processed,
        receivedAt: '2024-01-01T00:00:00Z',
      };

      apiBaseServiceStub.get.mockReturnValueOnce(
        of({ items: [rawDetail], content: [rawDetail], totalCount: 1 }),
      );

      let result: PagedResponse<AccountingEventListItem> | undefined;
      service.listEvents({}, 0, 20).subscribe(r => {
        result = r;
      });

      expect(result?.items).toHaveLength(1);
      expect(result?.items?.[0].eventId).toBe('e-001');
      expect(result?.items?.[0].eventType).toBe('InvoiceIssued');
      expect(result?.items?.[0].processingStatus).toBe(IngestionProcessingStatus.Processed);
      expect(result?.content).toHaveLength(1);
      expect(result?.content?.[0].eventId).toBe('e-001');
      expect(result?.content?.[0].eventType).toBe('InvoiceIssued');
      expect(result?.content?.[0].processingStatus).toBe(IngestionProcessingStatus.Processed);
    });
  });

  describe('getEvent()', () => {
    it('should call accountingEventsService.getEvent(eventId) and return AccountingEventDetail', () => {
      const sdkFixture = {
        eventId: 'evt-001',
        eventType: 'InvoiceIssued',
        status: IngestionProcessingStatus.Received,
        receivedAt: '2025-01-01T10:00:00Z',
      };
      accountingEventsStub.getEvent.mockReturnValueOnce(of(sdkFixture));

      let result: AccountingEventDetail | undefined;
      service.getEvent('evt-001').subscribe(r => (result = r));

      expect(accountingEventsStub.getEvent).toHaveBeenCalledWith('evt-001');
      expect(result).toEqual({
        eventId: 'evt-001',
        eventType: 'InvoiceIssued',
        processingStatus: IngestionProcessingStatus.Received,
        receivedAt: '2025-01-01T10:00:00Z',
        processedAt: undefined,
        journalEntryId: undefined,
        errorMessage: undefined,
        organizationId: undefined,
        sourceSystem: undefined,
        transactionDate: undefined,
        payload: undefined,
      });
    });
  });

  describe('listEvents() — invoiceId filter (Story #69)', () => {
    it('should set invoiceId query param when provided in filters', () => {
      apiBaseServiceStub.get.mockReturnValueOnce(of({ items: [], content: [], totalCount: 0 }));
      const filters: IngestionListFilters = { invoiceId: 'inv-abc-123' };

      service.listEvents(filters, 0, 20).subscribe();

      expect(apiBaseServiceStub.get.mock.calls[0][0]).toBe('/v1/accounting/events');
      const capturedParams = apiBaseServiceStub.get.mock.calls[0][1] as HttpParams;
      expect(capturedParams.get('invoiceId')).toBe('inv-abc-123');
    });
  });

  describe('getEventProcessingLog() [Story #69]', () => {
    it('should call GET /v1/accounting/events/:eventId/processing-log', () => {
      const fixture: EventProcessingLogEntry[] = [
        {
          logId: 'log-1',
          eventId: 'evt-001',
          step: 'VALIDATION',
          status: 'COMPLETED',
          timestamp: '2025-01-01T10:01:00Z',
          message: 'Validation passed',
        },
      ];
      apiBaseServiceStub.get.mockReturnValueOnce(of(fixture));

      let result: EventProcessingLogEntry[] | undefined;
      service.getEventProcessingLog('evt-001').subscribe((r: EventProcessingLogEntry[]) => (result = r));

      expect(apiBaseServiceStub.get.mock.calls[0][0]).toBe(
        '/v1/accounting/events/evt-001/processing-log',
      );
      expect(result).toEqual(fixture);
    });
  });

  describe('getInvoiceStatus() [Story #70]', () => {
    it('should call invoicePaymentsService.getInvoiceStatus(invoiceId) and return InvoicePaymentStatus', () => {
      const sdkFixture = {
        invoiceId: 'inv-001',
        status: 'PAID',
        remainingBalance: 0,
        invoiceTotal: 150,
        totalPaid: 150,
        latestTransactionReference: 'evt-123',
      };
      invoicePaymentsStub.getInvoiceStatus.mockReturnValueOnce(of(sdkFixture));

      let result: InvoicePaymentStatus | undefined;
      service.getInvoiceStatus('inv-001').subscribe((r: InvoicePaymentStatus) => (result = r));

      expect(invoicePaymentsStub.getInvoiceStatus).toHaveBeenCalledWith('inv-001');
      expect(result).toEqual({
        invoiceId: 'inv-001',
        paymentStatus: 'PAID',
        balanceDue: 0,
        totalAmount: 150,
        paidAmount: 150,
        latestEventId: 'evt-123',
      });
    });
  });
});
