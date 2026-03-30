import { HttpParams } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
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

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AccountingService,
        { provide: ApiBaseService, useValue: apiBaseServiceStub },
      ],
    });
    service = TestBed.inject(AccountingService);
  });

  afterEach(() => {
    vi.clearAllMocks();
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
    it('should call GET /v1/accounting/events/:eventId and return AccountingEventDetail', () => {
      const fixture: AccountingEventDetail = {
        eventId: 'evt-001',
        eventType: 'InvoiceIssued',
        processingStatus: IngestionProcessingStatus.Processed,
        receivedAt: '2025-01-01T10:00:00Z',
      };
      apiBaseServiceStub.get.mockReturnValueOnce(of(fixture));

      let result: AccountingEventDetail | undefined;
      service.getEvent('evt-001').subscribe(r => (result = r));

      expect(apiBaseServiceStub.get.mock.calls[0][0]).toBe('/v1/accounting/events/evt-001');
      expect(result).toEqual(fixture);
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
    it('should call GET /v1/accounting/invoices/:invoiceId/status and return InvoicePaymentStatus', () => {
      const fixture: InvoicePaymentStatus = {
        invoiceId: 'inv-001',
        paymentStatus: 'PAID',
        balanceDue: 0,
        currency: 'USD',
        totalAmount: 150,
        paidAmount: 150,
      };
      apiBaseServiceStub.get.mockReturnValueOnce(of(fixture));

      let result: InvoicePaymentStatus | undefined;
      service.getInvoiceStatus('inv-001').subscribe((r: InvoicePaymentStatus) => (result = r));

      expect(apiBaseServiceStub.get.mock.calls[0][0]).toBe(
        '/v1/accounting/invoices/inv-001/status',
      );
      expect(result).toEqual(fixture);
    });
  });
});
