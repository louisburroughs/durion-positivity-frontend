import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  AccountingEventsService,
  AccountingExportsService,
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
    listAccountingEvents: vi.fn(),
    getEventProcessingLog: vi.fn(),
  };

  const apPaymentsStub = {
    listApBills: vi.fn(),
  };

  const accountingExportsStub = {
    requestExport1: vi.fn(),
    getExportStatus1: vi.fn(),
    listExportHistory: vi.fn(),
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
        { provide: AccountingExportsService, useValue: accountingExportsStub },
        { provide: APPaymentsService, useValue: apPaymentsStub },
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
    it('should map content to AccountingEventListItem[]', () => {
      const sdkEvent = {
        eventId: 'e-001',
        eventType: 'InvoiceIssued',
        status: 'PROCESSED',
        receivedAt: '2024-01-01T00:00:00Z',
      };
      accountingEventsStub.listAccountingEvents.mockReturnValueOnce(
        of({ content: [sdkEvent], totalElements: 1, number: 0, size: 20, totalPages: 1 }),
      );

      let result: PagedResponse<AccountingEventListItem> | undefined;
      service.listEvents({}, 0, 20).subscribe(r => {
        result = r;
      });

      expect(accountingEventsStub.listAccountingEvents).toHaveBeenCalled();
      expect(result?.items).toHaveLength(1);
      expect(result?.items?.[0].eventId).toBe('e-001');
      expect(result?.items?.[0].eventType).toBe('InvoiceIssued');
      expect(result?.items?.[0].processingStatus).toBe(IngestionProcessingStatus.Processed);
      expect(result?.content).toHaveLength(1);
      expect(result?.totalCount).toBe(1);
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
    it('should pass invoiceId to listAccountingEvents when provided in filters', () => {
      accountingEventsStub.listAccountingEvents.mockReturnValueOnce(
        of({ content: [], totalElements: 0, number: 0, size: 20, totalPages: 0 }),
      );
      const filters: IngestionListFilters = { invoiceId: 'inv-abc-123' };

      service.listEvents(filters, 0, 20).subscribe();

      const args = accountingEventsStub.listAccountingEvents.mock.calls[0];
      // invoiceId is positional arg index 9 (pageable,orgId,eventType,idempotencyOutcome,receivedAtFrom,receivedAtTo,eventId,ingestionId,domainKeyId,invoiceId,status)
      expect(args[9]).toBe('inv-abc-123');
    });
  });

  describe('getEventProcessingLog() [Story #69]', () => {
    it('should call accountingEventsService.getEventProcessingLog(eventId) and return the log entries', () => {
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
      accountingEventsStub.getEventProcessingLog.mockReturnValueOnce(of(fixture));

      let result: EventProcessingLogEntry[] | undefined;
      service.getEventProcessingLog('evt-001').subscribe((r: EventProcessingLogEntry[]) => (result = r));

      expect(accountingEventsStub.getEventProcessingLog).toHaveBeenCalledWith('evt-001');
      expect(result).toEqual(fixture);
    });
  });

  describe('listBills()', () => {
    it('should call apPaymentsService.listApBills with page/size pageable and map to PagedResponse<VendorBill>', () => {
      const sdkBill = {
        vendorBillId: 'bill-1',
        vendorId: 'v-1',
        status: 'OPEN',
      };
      apPaymentsStub.listApBills.mockReturnValueOnce(
        of({ content: [sdkBill], totalElements: 1, number: 0, size: 10, totalPages: 1 }),
      );

      let result: PagedResponse<unknown> | undefined;
      service.listBills(0, 10).subscribe(r => (result = r));

      expect(apPaymentsStub.listApBills).toHaveBeenCalledWith({ page: 0, size: 10 });
      expect(result?.items).toHaveLength(1);
      expect((result?.items as { vendorBillId: string }[])[0].vendorBillId).toBe('bill-1');
      expect(result?.totalCount).toBe(1);
    });
  });

  describe('requestExport()', () => {
    it('should call accountingExportsService.requestExport1 with an ExportJobRequest and map the response', () => {
      accountingExportsStub.requestExport1.mockReturnValueOnce(of({ jobId: 'job-1', status: 'PENDING' }));

      let result: { exportId: string; status: string } | undefined;
      service
        .requestExport({ startDate: '2025-01-01', endDate: '2025-01-31', locationIds: ['loc-1'], format: 'CSV' })
        .subscribe(r => (result = r));

      expect(accountingExportsStub.requestExport1).toHaveBeenCalledWith({
        exportType: 'TIMEKEEPING',
        format: 'CSV',
        filters: { startDate: '2025-01-01', endDate: '2025-01-31', locationIds: ['loc-1'] },
      });
      expect(result).toEqual({ exportId: 'job-1', status: 'PENDING' });
    });
  });

  describe('getExportStatus()', () => {
    it('should call accountingExportsService.getExportStatus1(exportId) and map the response', () => {
      accountingExportsStub.getExportStatus1.mockReturnValueOnce(
        of({ jobId: 'job-1', status: 'COMPLETE', requestedAt: '2025-01-01T10:00:00Z', completedAt: '2025-01-01T10:05:00Z' }),
      );

      let result: { exportId: string; status: string; completedAt?: string } | undefined;
      service.getExportStatus('job-1').subscribe(r => (result = r));

      expect(accountingExportsStub.getExportStatus1).toHaveBeenCalledWith('job-1');
      expect(result?.exportId).toBe('job-1');
      expect(result?.status).toBe('COMPLETE');
      expect(result?.completedAt).toBe('2025-01-01T10:05:00Z');
    });
  });

  describe('getExportHistory()', () => {
    it('should call accountingExportsService.listExportHistory with pageable and return content array', () => {
      const historyItem = { jobId: 'job-1', status: 'COMPLETE' };
      accountingExportsStub.listExportHistory.mockReturnValueOnce(of({ content: [historyItem] }));

      let result: unknown[] | undefined;
      service.getExportHistory({ pageIndex: 1, pageSize: 5 }).subscribe(r => (result = r));

      expect(accountingExportsStub.listExportHistory).toHaveBeenCalledWith({ page: 1, size: 5 });
      expect(result).toEqual([historyItem]);
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
