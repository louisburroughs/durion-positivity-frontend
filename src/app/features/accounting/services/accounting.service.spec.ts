import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, of, throwError } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  AccountingEventsService,
  AccountingExportsService,
  APPaymentsService,
  Configuration as AccountingConfiguration,
  CreditMemosService,
  FinancialReportingService,
  LocationCostReportingService,
  InvoicePaymentsService,
  PaymentApplicationsService,
  PostingRulesService,
  VendorDirectoryAPIService,
} from '@durion-sdk/accounting';
import { AccountingService } from './accounting.service';
import {
  AccountingEventDetail,
  AccountingEventListItem,
  EventEnvelopeContract,
  EventProcessingLogEntry,
  IngestionListFilters,
  IngestionProcessingStatus,
  InvoicePaymentStatus,
  PagedResponse,
  VendorBill,
  VendorDirectoryEntry,
} from '../models/accounting.models';

describe('AccountingService', () => {
  let service: AccountingService;

  const apiBaseServiceStub = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    getBlob: vi.fn(),
  };

  const accountingEventsStub = {
    getAccountingEvent: vi.fn(),
    submitAccountingEvent: vi.fn(),
    retryAccountingEvent: vi.fn(),
    reprocessSuspendedEvent: vi.fn(),
    getEventReprocessingHistory: vi.fn(),
    listAccountingEvents: vi.fn(),
    getEventProcessingLog: vi.fn(),
    getEventContract: vi.fn(),
  };

  const apPaymentsStub = {
    listApBills: vi.fn(),
  };

  const accountingExportsStub = {
    requestExport: vi.fn(),
    getExportStatus: vi.fn(),
    listExportHistory: vi.fn(),
  };

  const financialReportingStub = {
    downloadReportExport: vi.fn(),
  };

  const invoicePaymentsStub = {
    getInvoiceStatus: vi.fn(),
  };

  const locationCostReportingStub = {
    generateLaborOverheadReport: vi.fn(),
  };

  const authServiceStub = {
    currentUserClaims: vi.fn(),
  };

  const vendorDirectoryStub = {
    searchVendors: vi.fn(),
    getVendorById: vi.fn(),
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
        { provide: FinancialReportingService, useValue: financialReportingStub },
        { provide: LocationCostReportingService, useValue: locationCostReportingStub },
        { provide: InvoicePaymentsService, useValue: invoicePaymentsStub },
        { provide: PaymentApplicationsService, useValue: {} },
        { provide: PostingRulesService, useValue: {} },
        { provide: VendorDirectoryAPIService, useValue: vendorDirectoryStub },
        { provide: AccountingConfiguration, useValue: { basePath: '/api/accounting' } },
      ],
    });
    service = TestBed.inject(AccountingService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('getLaborOverheadReport()', () => {
    it('passes params through and maps the SDK report to the local model', () => {
      locationCostReportingStub.generateLaborOverheadReport.mockReturnValueOnce(
        of({
          locationId: 'LOC-1',
          locationLabel: 'Wooster',
          fiscalYear: 2026,
          asOfMonth: 6,
          currency: 'USD',
          localCurrencyPerUsd: 1.0,
          averageRate: 1.0,
          lines: [
            {
              code: '2.14',
              label: 'Income from rubber dust sales',
              level: 2,
              costType: 'VARIABLE',
              isSubtotal: false,
              usdOnly: false,
              monthly: [0, -250, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
              ytd: -250,
            },
          ],
        }),
      );

      let result: import('../models/accounting.models').LaborOverheadReport | undefined;
      service.getLaborOverheadReport('LOC-1', 2026, 6).subscribe(r => (result = r));

      expect(locationCostReportingStub.generateLaborOverheadReport).toHaveBeenCalledWith('LOC-1', 2026, 6);
      expect(result?.currency).toBe('USD');
      expect(result?.lines).toHaveLength(1);
      expect(result?.lines[0].code).toBe('2.14');
      expect(result?.lines[0].ytd).toBe(-250);
      expect(result?.lines[0].costType).toBe('VARIABLE');
    });
  });

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
        eventReference: 'AE-202609-15',
        eventType: 'InvoiceIssued',
        status: IngestionProcessingStatus.Received,
        receivedAt: '2025-01-01T10:00:00Z',
        payload: { invoiceId: 'inv-001' },
      };
      accountingEventsStub.getAccountingEvent.mockReturnValueOnce(of(sdkFixture));

      let result: AccountingEventDetail | undefined;
      service.getEvent('evt-001').subscribe(r => (result = r));

      expect(accountingEventsStub.getAccountingEvent).toHaveBeenCalledWith('evt-001');
      expect(result).toEqual({
        eventId: 'evt-001',
        eventReference: 'AE-202609-15',
        eventType: 'InvoiceIssued',
        processingStatus: IngestionProcessingStatus.Received,
        receivedAt: '2025-01-01T10:00:00Z',
        processedAt: undefined,
        journalEntryId: undefined,
        errorMessage: undefined,
        sourceSystem: undefined,
        transactionDate: undefined,
        payload: { invoiceId: 'inv-001' },
        payloadReferences: [],
      });
    });

    it('should map payloadReferences so the UI can render names instead of ids', () => {
      accountingEventsStub.getAccountingEvent.mockReturnValueOnce(
        of({
          eventId: 'evt-002',
          eventType: 'INVOICE_PAYMENT',
          status: IngestionProcessingStatus.Received,
          payload: { invoiceId: '01a04a72-d08a-72ff-8483-cdcdb7ad894a' },
          payloadReferences: [
            {
              path: 'payload.invoiceId',
              rawValue: '01a04a72-d08a-72ff-8483-cdcdb7ad894a',
              id: '01a04a72-d08a-72ff-8483-cdcdb7ad894a',
              referenceType: 'INVOICE',
              displayReference: 'INV-1787955433643-01a04a72',
            },
            {
              path: 'payload.customerId',
              rawValue: '01a029d2-2004-7b37-a47b-de23679c2d36',
              id: '01a029d2-2004-7b37-a47b-de23679c2d36',
              referenceType: 'CUSTOMER',
            },
          ],
        }),
      );

      let result: AccountingEventDetail | undefined;
      service.getEvent('evt-002').subscribe(r => (result = r));

      expect(result?.payloadReferences).toEqual([
        {
          path: 'payload.invoiceId',
          rawValue: '01a04a72-d08a-72ff-8483-cdcdb7ad894a',
          id: '01a04a72-d08a-72ff-8483-cdcdb7ad894a',
          referenceType: 'INVOICE',
          displayReference: 'INV-1787955433643-01a04a72',
          displayName: null,
        },
        {
          // Unresolved by accounting — the UI shows a placeholder, never the id.
          path: 'payload.customerId',
          rawValue: '01a029d2-2004-7b37-a47b-de23679c2d36',
          id: '01a029d2-2004-7b37-a47b-de23679c2d36',
          referenceType: 'CUSTOMER',
          displayReference: null,
          displayName: null,
        },
      ]);
    });

    it('should normalize an unrecognized referenceType to UNKNOWN', () => {
      accountingEventsStub.getAccountingEvent.mockReturnValueOnce(
        of({
          eventId: 'evt-003',
          eventType: 'INVOICE_PAYMENT',
          status: IngestionProcessingStatus.Received,
          payload: {},
          payloadReferences: [
            // A type this build does not know about yet: rendering it straight
            // through would put a raw i18n key on screen (ADR-0030).
            { path: 'payload.thingId', rawValue: 'x-1', referenceType: 'SOMETHING_NEW' },
            { path: 'payload.otherId', rawValue: 'x-2' },
          ],
        }),
      );

      let result: AccountingEventDetail | undefined;
      service.getEvent('evt-003').subscribe(r => (result = r));

      expect(result?.payloadReferences?.map(r => r.referenceType)).toEqual(['UNKNOWN', 'UNKNOWN']);
    });
  });

  describe('listEvents() — invoiceId filter (Story #69)', () => {
    it('should pass invoiceId to listAccountingEvents when provided in filters', () => {
      accountingEventsStub.listAccountingEvents.mockReturnValueOnce(
        of({ content: [], totalElements: 0, number: 0, size: 20, totalPages: 0 }),
      );
      const filters: IngestionListFilters = { invoiceId: 'inv-abc-123' };

      service.listEvents(filters, 0, 20).subscribe();

      // Assert the whole argument tuple, not just the invoiceId slot. The generated signature is
      // (eventType, idempotencyOutcome, receivedAtFrom, receivedAtTo, eventId, ingestionId,
      //  domainKeyId, invoiceId, status, page, size) — note there is no leading orgId, since
      // organizationId is a remnant and not part of the contract (ADR-0062). Checking one index
      // would let a signature change after invoiceId pass unnoticed, and would report a change
      // before it as a bare value mismatch; comparing the tuple makes any positional shift visible.
      expect(accountingEventsStub.listAccountingEvents.mock.calls[0]).toEqual([
        undefined, // eventType
        undefined, // idempotencyOutcome
        undefined, // receivedAtFrom
        undefined, // receivedAtTo
        undefined, // eventId
        undefined, // ingestionId
        undefined, // domainKeyId
        'inv-abc-123', // invoiceId
        undefined, // status
        0, // page
        20, // size
      ]);
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

  describe('getEventEnvelopeContract() [issue #380]', () => {
    it('should call accountingEventsService.getEventContract() and map fields, dropping unsupported traceability/processing/idempotency/identifier data', () => {
      accountingEventsStub.getEventContract.mockReturnValueOnce(
        of({
          version: 'v1',
          fields: [
            { jsonPath: '$.eventId', name: 'eventId', type: 'string', required: true, description: 'Event id', enumValues: null },
          ],
          examples: [{ eventId: 'evt-1' }],
        }),
      );

      let result: EventEnvelopeContract | undefined;
      service.getEventEnvelopeContract().subscribe((r: EventEnvelopeContract) => (result = r));

      expect(accountingEventsStub.getEventContract).toHaveBeenCalledWith();
      expect(result).toEqual({
        version: 'v1',
        fields: [{ name: 'eventId', type: 'string', required: true, description: 'Event id' }],
        examples: [{ eventId: 'evt-1' }],
      });
      expect((result as { traceabilityIds?: unknown })?.traceabilityIds).toBeUndefined();
    });

    it('should never call ApiBaseService for the event envelope contract (fully migrated to the SDK)', () => {
      accountingEventsStub.getEventContract.mockReturnValueOnce(of({ version: 'v1', fields: [] }));

      service.getEventEnvelopeContract().subscribe();

      expect(apiBaseServiceStub.get).not.toHaveBeenCalled();
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

      expect(apPaymentsStub.listApBills).toHaveBeenCalledWith(undefined, 0, 10);
      expect(result?.items).toHaveLength(1);
      expect((result?.items as { vendorBillId: string }[])[0].vendorBillId).toBe('bill-1');
      expect(result?.totalCount).toBe(1);
    });
  });

  describe('listBillsByVendor()', () => {
    it('should call apPaymentsService.listApBills with default pageable and vendorId and map VendorBill[]', () => {
      const vendorBillFixture: VendorBill = {
        vendorBillId: 'bill-1',
        vendorId: 'v-001',
        status: 'OPEN',
      };

      apPaymentsStub.listApBills.mockReturnValueOnce(
        of({ content: [{ vendorBillId: 'bill-1', vendorId: 'v-001', status: 'OPEN' }] }),
      );

      let result: VendorBill[] | undefined;
      service.listBillsByVendor('v-001').subscribe(r => (result = r));

      expect(apPaymentsStub.listApBills).toHaveBeenCalledWith('v-001', 0, 100);
      expect(result).toEqual([vendorBillFixture]);
      expect(result?.[0].vendorBillId).toBe('bill-1');
    });
  });

  describe('searchVendors() [issue #816]', () => {
    it('should call VendorDirectoryAPIService.searchVendors with name and limit params', () => {
      vendorDirectoryStub.searchVendors.mockReturnValueOnce(
        of([{ vendorId: 'v-001', name: 'Acme Auto Parts', status: 'ACTIVE' }]),
      );

      let result: VendorDirectoryEntry[] | undefined;
      service.searchVendors('acme').subscribe(r => (result = r));

      expect(vendorDirectoryStub.searchVendors).toHaveBeenCalledWith('acme', 20);
      expect(result?.[0].vendorId).toBe('v-001');
      expect(result?.[0].name).toBe('Acme Auto Parts');
      expect(result?.[0].status).toBe('ACTIVE');
    });

    it('should omit the name param for a blank term (list-all)', () => {
      vendorDirectoryStub.searchVendors.mockReturnValueOnce(of([]));

      service.searchVendors('   ').subscribe();

      expect(vendorDirectoryStub.searchVendors).toHaveBeenCalledWith(undefined, 20);
    });
  });

  describe('getVendor() [issue #816]', () => {
    it('should call VendorDirectoryAPIService.getVendorById(vendorId)', () => {
      vendorDirectoryStub.getVendorById.mockReturnValueOnce(
        of({ vendorId: 'v-001', name: 'Acme Auto Parts' }),
      );

      let result: VendorDirectoryEntry | undefined;
      service.getVendor('v-001').subscribe(r => (result = r));

      expect(vendorDirectoryStub.getVendorById).toHaveBeenCalledWith('v-001');
      expect(result?.name).toBe('Acme Auto Parts');
    });
  });

  describe('downloadExport() [issue #350, #373, backend #2216]', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls FinancialReportingService.downloadReportExport with the exact exportId (ADR-0041) and triggers the download from an object URL', async () => {
      const blob = new Blob(['csv bytes']);
      financialReportingStub.downloadReportExport.mockReturnValueOnce(of(blob));
      const clickSpy = vi.fn();
      const anchor = { href: '', download: '', click: clickSpy, remove: vi.fn() } as unknown as HTMLAnchorElement;
      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(anchor);
      const appendSpy = vi.spyOn(document.body, 'append').mockImplementation(() => {});
      const objectUrl = 'blob:mock-url';
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue(objectUrl);
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      vi.useFakeTimers();

      let completed = false;
      service.downloadExport('exp-1').subscribe(() => (completed = true));

      // A plain `<a href>` navigation bypasses HttpClient's auth interceptor and
      // 401s; the download must go through the authenticated, generated SDK
      // operation instead (ADR-0041), asking for the artifact's declared
      // content type rather than the SDK's default Accept: application/json
      // (backend #2216 closing comment: the server ignores this on success and
      // always serves the artifact's real content type).
      expect(financialReportingStub.downloadReportExport).toHaveBeenCalledWith(
        'exp-1',
        'body',
        undefined,
        { httpHeaderAccept: 'application/octet-stream' },
      );
      expect(createObjectURLSpy).toHaveBeenCalledWith(blob);
      expect(anchor.href).toBe(objectUrl);
      expect(anchor.download).toBe('time-export-exp-1.csv');
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(completed).toBe(true);

      // The revoke is deferred past the click, not synchronous with it (ADR-0065 §3 / SEC-08).
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith(objectUrl);

      createElementSpy.mockRestore();
      appendSpy.mockRestore();
    });

    it('propagates a non-blob transport failure through the observable unchanged, instead of triggering a download', async () => {
      const failure = new Error('network down');
      financialReportingStub.downloadReportExport.mockReturnValueOnce(throwError(() => failure));
      const createElementSpy = vi.spyOn(document, 'createElement');

      await expect(firstValueFrom(service.downloadExport('exp-1'))).rejects.toBe(failure);
      expect(createElementSpy).not.toHaveBeenCalled();

      createElementSpy.mockRestore();
    });

    it('reads and parses a Blob ApiError body from a 404/409 response instead of leaking it as-is', async () => {
      const apiErrorBlob = new Blob([JSON.stringify({ code: 'EXPORT_JOB_NOT_FOUND', message: 'Export job exp-1 was not found for tenant t-9' })], {
        type: 'application/json',
      });
      const httpError = new HttpErrorResponse({ status: 404, error: apiErrorBlob });
      financialReportingStub.downloadReportExport.mockReturnValueOnce(throwError(() => httpError));

      const error = await firstValueFrom(service.downloadExport('exp-1')).catch((e: unknown) => e as Error);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('EXPORT_DOWNLOAD_FAILED:EXPORT_JOB_NOT_FOUND');
      // The server-authored message must never reach the thrown error.
      expect((error as Error).message).not.toContain('tenant t-9');
    });

    it('degrades a malformed/non-JSON Blob error body to the generic download-failed error', async () => {
      const brokenBlob = new Blob(['<html>not json</html>'], { type: 'text/html' });
      const httpError = new HttpErrorResponse({ status: 500, error: brokenBlob });
      financialReportingStub.downloadReportExport.mockReturnValueOnce(throwError(() => httpError));

      const error = await firstValueFrom(service.downloadExport('exp-1')).catch((e: unknown) => e as Error);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('EXPORT_DOWNLOAD_FAILED');
    });
  });

  describe('requestExport()', () => {
    it('should call accountingExportsService.requestExport1 with an ExportJobRequest and map the response', () => {
      accountingExportsStub.requestExport.mockReturnValueOnce(of({ jobId: 'job-1', status: 'PENDING' }));

      let result: { exportId: string; status: string } | undefined;
      service
        .requestExport({ startDate: '2025-01-01', endDate: '2025-01-31', locationIds: ['loc-1'], format: 'CSV' })
        .subscribe(r => (result = r));

      expect(accountingExportsStub.requestExport).toHaveBeenCalledWith({
        exportType: 'TIMEKEEPING',
        format: 'CSV',
        filters: { startDate: '2025-01-01', endDate: '2025-01-31', locationIds: ['loc-1'] },
      });
      expect(result).toEqual({ exportId: 'job-1', status: 'PENDING' });
    });
  });

  describe('getExportStatus()', () => {
    it('should call accountingExportsService.getExportStatus1(exportId) and map the response', () => {
      accountingExportsStub.getExportStatus.mockReturnValueOnce(
        of({ jobId: 'job-1', status: 'COMPLETE', requestedAt: '2025-01-01T10:00:00Z', completedAt: '2025-01-01T10:05:00Z' }),
      );

      let result: { exportId: string; status: string; completedAt?: string } | undefined;
      service.getExportStatus('job-1').subscribe(r => (result = r));

      expect(accountingExportsStub.getExportStatus).toHaveBeenCalledWith('job-1');
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

      expect(accountingExportsStub.listExportHistory).toHaveBeenCalledWith(1, 5);
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
