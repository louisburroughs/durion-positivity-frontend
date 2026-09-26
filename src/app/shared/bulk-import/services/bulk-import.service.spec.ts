import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApproveColumnMappingsRequest,
  AuditRecordListResponse,
  BulkLoadJob,
  BulkLoadRecordAudit,
  CreateUploadSessionRequest,
  CreateUploadSessionResponse,
  SubmitCorrectionRequest,
} from '../models/bulk-import.models';

// `vitest.config.ts` aliases `tus-js-client` to `src/test-shims/tus-js-client`,
// so `vi.doMock('tus-js-client')` would never be reached: the alias rewrites the
// specifier before the mock registry is consulted. The shim's `tusTestState` is
// the seam instead. It has to be re-imported after `vi.resetModules()` below so
// the spec and the service share one instance.
const tusState = {
  instances: [] as Array<import('tus-js-client').TusUploadRecord>,
  start: vi.fn(),
  abort: vi.fn<(retry?: boolean) => Promise<void>>().mockResolvedValue(undefined),
  findPreviousUploads: vi.fn(() => Promise.resolve([] as Array<{ uploadUrl: string }>)),
  resumeFromPreviousUpload: vi.fn(),
};

describe('BulkImportService', () => {
  let service: import('./bulk-import.service').BulkImportService;
  let bulkImportServiceClass: typeof import('./bulk-import.service').BulkImportService;
  let apiBaseServiceToken: typeof import('../../../core/services/api-base.service').ApiBaseService;
  let bulkLoadJobsServiceClass: typeof import('@durion-sdk/bulk-loader').BulkLoadJobsAPIService;
  let columnMappingServiceClass: typeof import('@durion-sdk/bulk-loader').ColumnMappingAPIService;
  let reviewQueueServiceClass: typeof import('@durion-sdk/bulk-loader').ReviewQueueAPIService;
  let bulkLoaderConfigurationClass: typeof import('@durion-sdk/bulk-loader').Configuration;
  let authServiceClass: typeof import('../../../core/services/auth.service').AuthService;
  const apiStub = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  const authStub = { accessToken: vi.fn<() => string | null>(() => 'test-jwt') };
  const bulkLoadJobsStub = { createBulkLoadJob: vi.fn(), getBulkLoadJob: vi.fn(), listBulkLoadJobs: vi.fn(), cancelBulkLoadJob: vi.fn(), retryBulkLoadJob: vi.fn() };
  const columnMappingStub = { getColumnMappings: vi.fn(), approveColumnMappings: vi.fn() };
  const reviewQueueStub = { listAuditRecords: vi.fn(), downloadErrorReport: vi.fn(), submitCorrections: vi.fn(), submitSingleCorrection: vi.fn() };

  beforeEach(async () => {
    tusState.instances.length = 0;
    tusState.start.mockReset();
    tusState.abort.mockReset().mockResolvedValue(undefined);
    tusState.findPreviousUploads.mockReset().mockResolvedValue([] as Array<{ uploadUrl: string }>);
    tusState.resumeFromPreviousUpload.mockReset();
    vi.resetModules();

    // Imported by the same specifier the service uses, after resetModules, so
    // this is the one module instance both sides share. A relative path to the
    // shim would resolve to a second, separate instance.
    const tusShim = await import('tus-js-client');
    tusShim.tusTestState.reset();
    tusShim.tusTestState.instances = tusState.instances;
    tusShim.tusTestState.start = tusState.start;
    tusShim.tusTestState.abort = tusState.abort;
    tusShim.tusTestState.findPreviousUploads = tusState.findPreviousUploads;
    tusShim.tusTestState.resumeFromPreviousUpload = tusState.resumeFromPreviousUpload;

    authStub.accessToken.mockReset().mockReturnValue('test-jwt');

    ({ BulkImportService: bulkImportServiceClass } = await import('./bulk-import.service'));
    ({ ApiBaseService: apiBaseServiceToken } = await import('../../../core/services/api-base.service'));
    ({ AuthService: authServiceClass } = await import('../../../core/services/auth.service'));
    ({
      BulkLoadJobsAPIService: bulkLoadJobsServiceClass,
      ColumnMappingAPIService: columnMappingServiceClass,
      ReviewQueueAPIService: reviewQueueServiceClass,
      Configuration: bulkLoaderConfigurationClass,
    } = await import('@durion-sdk/bulk-loader'));

    TestBed.configureTestingModule({
      providers: [
        bulkImportServiceClass,
        { provide: apiBaseServiceToken, useValue: apiStub },
        { provide: authServiceClass, useValue: authStub },
        { provide: bulkLoadJobsServiceClass, useValue: bulkLoadJobsStub },
        { provide: columnMappingServiceClass, useValue: columnMappingStub },
        { provide: reviewQueueServiceClass, useValue: reviewQueueStub },
        { provide: bulkLoaderConfigurationClass, useValue: { basePath: '/api/bulk-loader' } },
      ],
    });
    service = TestBed.inject(bulkImportServiceClass);
  });

  afterEach(() => {
    tusState.instances.length = 0;
    vi.clearAllMocks();
  });

  const mockJob: BulkLoadJob = {
    jobId: 'job-001', domainType: 'INVENTORY', status: 'CREATED',
    fileName: 'test.csv',
  };

  const mockAuditRecord: BulkLoadRecordAudit = {
    recordId: 'rec-001', jobId: 'job-001', entityType: 'INVENTORY',
    rowNumber: 1, reviewStatus: 'PENDING', reasonCodes: ['INVALID_SKU'],
    originalValues: { sku: 'BAD-SKU' },
  };

  describe('createUploadSession()', () => {
    it('creates a backend bulk job and returns the tus creation endpoint', () => {
      const req: CreateUploadSessionRequest = {
        domainType: 'INVENTORY',
        fileName: 'test.csv',
        fileSize: 1024,
      };
      bulkLoadJobsStub.createBulkLoadJob.mockReturnValue(of({
        id: 'job-001',
        domainType: 'INVENTORY_STOCK_COUNT',
        status: 'CREATED',
        fileName: 'test.csv',
      }));

      let response: CreateUploadSessionResponse | undefined;
      service.createUploadSession(req).subscribe(value => {
        response = value;
      });

      expect(bulkLoadJobsStub.createBulkLoadJob).toHaveBeenCalledWith({
        domainType: 'INVENTORY_STOCK_COUNT',
        fileName: 'test.csv',
      });
      expect(response).toEqual({
        jobId: 'job-001',
        uploadUrl: '/api/bulk-loader/v1/bulk-jobs/job-001/tus',
      });
    });
  });

  describe('getJob()', () => {
    it('calls bulkLoadJobsService.getJob with the jobId', () => {
      bulkLoadJobsStub.getBulkLoadJob.mockReturnValue(of({
        id: 'job-001',
        domainType: 'INVENTORY_STOCK_COUNT',
        status: 'CREATED',
        fileName: 'test.csv',
      }));

      service.getJob('job-001').subscribe();

      expect(bulkLoadJobsStub.getBulkLoadJob).toHaveBeenCalledWith('job-001');
    });
  });

  describe('getActiveJobForDomain()', () => {
    it('selects the matching active job from the backend jobs page', () => {
      bulkLoadJobsStub.listBulkLoadJobs.mockReturnValue(of({
        content: [{
          id: 'job-001',
          domainType: 'INVENTORY_STOCK_COUNT',
          status: 'CREATED',
          fileName: 'test.csv',
        }],
      }));

      let response: BulkLoadJob | null | undefined;
      service.getActiveJobForDomain('INVENTORY').subscribe(value => {
        response = value;
      });

      expect(bulkLoadJobsStub.listBulkLoadJobs).toHaveBeenCalled();
      expect(response).toEqual(mockJob);
    });
  });

  describe('listJobs()', () => {
    const jobPageStub = {
      content: [{
        id: 'job-001',
        domainType: 'INVENTORY_STOCK_COUNT',
        status: 'CREATED',
        fileName: 'test.csv',
      }],
    };

    it('calls bulkLoadJobsService.listJobs and maps the backend page shape', () => {
      bulkLoadJobsStub.listBulkLoadJobs.mockReturnValue(of(jobPageStub));

      service.listJobs().subscribe();

      expect(bulkLoadJobsStub.listBulkLoadJobs).toHaveBeenCalledWith(0, 20);
    });

    it('applies domainType filter on the frontend when backend ignores it', () => {
      bulkLoadJobsStub.listBulkLoadJobs.mockReturnValue(of(jobPageStub));

      let response: import('../models/bulk-import.models').JobListResponse | undefined;
      service.listJobs({ domainType: 'INVENTORY' }).subscribe();

      // SDK only receives size, domainType is not passed to backend
      expect(bulkLoadJobsStub.listBulkLoadJobs).toHaveBeenCalledWith(0, 20);

      service.listJobs({ domainType: 'INVENTORY' }).subscribe(value => {
        response = value;
      });
      expect(response?.items).toHaveLength(1);
      expect(response?.items[0]?.domainType).toBe('INVENTORY');
    });

    it('applies status filter on the frontend when backend ignores it', () => {
      bulkLoadJobsStub.listBulkLoadJobs.mockReturnValue(of(jobPageStub));

      let response: import('../models/bulk-import.models').JobListResponse | undefined;
      service.listJobs({ status: 'PROCESSING' }).subscribe();

      // SDK only receives size, status is not passed to backend
      expect(bulkLoadJobsStub.listBulkLoadJobs).toHaveBeenCalledWith(0, 20);

      service.listJobs({ status: 'PROCESSING' }).subscribe(value => {
        response = value;
      });
      expect(response?.items).toHaveLength(0);
    });

    it('passes pageSize as the size parameter to the SDK', () => {
      bulkLoadJobsStub.listBulkLoadJobs.mockReturnValue(of(jobPageStub));

      service.listJobs({ pageSize: 10 }).subscribe();

      expect(bulkLoadJobsStub.listBulkLoadJobs).toHaveBeenCalledWith(0, 10);
    });

    it('applies multiple frontend filters simultaneously', () => {
      bulkLoadJobsStub.listBulkLoadJobs.mockReturnValue(of(jobPageStub));

      let response: import('../models/bulk-import.models').JobListResponse | undefined;
      service.listJobs({ domainType: 'INVENTORY', status: 'PROCESSING', pageSize: 10 }).subscribe();

      // SDK only receives size; domainType and status are not passed to backend
      expect(bulkLoadJobsStub.listBulkLoadJobs).toHaveBeenCalledWith(0, 10);

      service.listJobs({ domainType: 'INVENTORY', status: 'PROCESSING', pageSize: 10 }).subscribe(value => {
        response = value;
      });
      expect(response?.items).toHaveLength(0);
    });
  });

  describe('getActiveJobDomains()', () => {
    it('returns only domains that currently have active jobs', () => {
      bulkLoadJobsStub.listBulkLoadJobs.mockReturnValue(of({
        content: [
          {
            id: 'job-001',
            domainType: 'INVENTORY_STOCK_COUNT',
            status: 'PROCESSING',
            fileName: 'inventory.csv',
          },
          {
            id: 'job-002',
            domainType: 'CATALOG_PRODUCT',
            status: 'COMPLETED',
            fileName: 'catalog.csv',
          },
        ],
      }));

      let response: Set<import('../models/bulk-import.models').DomainType> | undefined;
      service.getActiveJobDomains().subscribe(value => {
        response = value;
      });

      expect(response?.has('INVENTORY')).toBe(true);
      expect(response?.has('CATALOG')).toBe(false);
    });
  });

  describe('getColumnMappings()', () => {
    it('calls columnMappingService.getMappings with the jobId', () => {
      columnMappingStub.getColumnMappings.mockReturnValue(of([{
        id: 'map-001',
        jobId: 'job-001',
        sourceColumn: 'SKU',
        targetField: 'productSku',
        confidence: 0.95,
        overriddenByUser: false,
      }]));

      service.getColumnMappings('job-001').subscribe();

      expect(columnMappingStub.getColumnMappings).toHaveBeenCalledWith('job-001');
    });
  });

  describe('approveColumnMappings()', () => {
    it('calls columnMappingService.approveMappings with jobId and mapped payload', () => {
      const req: ApproveColumnMappingsRequest = {
        overrides: [{ mappingId: 'map-001', sourceColumn: 'SKU', targetField: 'sku' }],
      };
      columnMappingStub.approveColumnMappings.mockReturnValue(of(undefined));

      service.approveColumnMappings('job-001', req).subscribe();

      expect(columnMappingStub.approveColumnMappings).toHaveBeenCalledWith('job-001', {
        mappings: [{ mappingId: 'map-001', sourceColumn: 'SKU', targetField: 'sku' }],
      });
    });
  });

  describe('cancelJob()', () => {
    it('calls bulkLoadJobsService.cancelJob with the jobId', () => {
      bulkLoadJobsStub.cancelBulkLoadJob.mockReturnValue(of(undefined));

      service.cancelJob('job-001').subscribe();

      expect(bulkLoadJobsStub.cancelBulkLoadJob).toHaveBeenCalledWith('job-001');
    });
  });

  describe('retryJob()', () => {
    it('delegates to BulkLoadJobsAPIService.retryJob and returns void', () => {
      bulkLoadJobsStub.retryBulkLoadJob.mockReturnValue(of({ id: 'job-001', status: 'PENDING' }));

      let completed = false;
      service.retryJob('job-001').subscribe({ complete: () => { completed = true; } });

      expect(bulkLoadJobsStub.retryBulkLoadJob).toHaveBeenCalledWith('job-001');
      expect(completed).toBe(true);
    });
  });

  describe('listAuditRecords()', () => {
    const auditResStub = [{
      id: 'rec-001',
      jobId: 'job-001',
      entityType: 'INVENTORY',
      rowNumber: 1,
      reviewStatus: 'PENDING',
      reasonCodes: 'INVALID_SKU',
      originalValues: '{"sku":"BAD-SKU"}',
    }];

    it('delegates to ReviewQueueAPIService.getAuditRecords and maps SDK audit records', () => {
      reviewQueueStub.listAuditRecords.mockReturnValue(of(auditResStub));

      let response: AuditRecordListResponse | undefined;
      service.listAuditRecords('job-001').subscribe(value => {
        response = value;
      });

      expect(reviewQueueStub.listAuditRecords).toHaveBeenCalledWith('job-001');
      expect(response).toEqual({ items: [mockAuditRecord], nextPageToken: null });
    });

    it('ignores filters (SDK does not support server-side filtering)', () => {
      reviewQueueStub.listAuditRecords.mockReturnValue(of(auditResStub));

      service.listAuditRecords('job-001', { reviewStatus: 'PENDING', pageSize: 5 }).subscribe();

      expect(reviewQueueStub.listAuditRecords).toHaveBeenCalledWith('job-001');
    });
  });

  describe('submitCorrection()', () => {
    it('calls ReviewQueueAPIService.submitSingleCorrection with auditRecordId and correctedData', () => {
      const req: SubmitCorrectionRequest = { correctedValues: { sku: 'FIXED-SKU' } };
      reviewQueueStub.submitSingleCorrection.mockReturnValue(of({
        auditRecordId: 'rec-001',
        status: 'ACCEPTED',
      }));

      let completed = false;
      service.submitCorrection('job-001', 'rec-001', req).subscribe(() => {
        completed = true;
      });

      expect(reviewQueueStub.submitSingleCorrection).toHaveBeenCalledWith('job-001', {
        auditRecordId: 'rec-001',
        correctedData: { sku: 'FIXED-SKU' },
      });
      expect(completed).toBe(true);
    });

    it('stringifies non-string corrected values before sending correctedData', () => {
      const req: SubmitCorrectionRequest = { correctedValues: { quantity: 42 } };
      reviewQueueStub.submitSingleCorrection.mockReturnValue(of({
        auditRecordId: 'rec-001',
        status: 'ACCEPTED',
      }));

      service.submitCorrection('job-001', 'rec-001', req).subscribe();

      expect(reviewQueueStub.submitSingleCorrection).toHaveBeenCalledWith('job-001', {
        auditRecordId: 'rec-001',
        correctedData: { quantity: '42' },
      });
    });

    it('routes a REJECTED result through the error channel instead of resolving as success (Copilot #4105525794)', async () => {
      const { CorrectionRejectedError } = await import('../models/bulk-import.models');
      const req: SubmitCorrectionRequest = { correctedValues: { sku: 'BAD-SKU' } };
      reviewQueueStub.submitSingleCorrection.mockReturnValue(of({
        auditRecordId: 'rec-001',
        status: 'REJECTED',
        rejectionReason: 'sku already assigned',
      }));

      let completed = false;
      let caught: unknown;
      service.submitCorrection('job-001', 'rec-001', req).subscribe({
        next: () => { completed = true; },
        error: err => { caught = err; },
      });

      expect(completed).toBe(false);
      expect(caught).toBeInstanceOf(CorrectionRejectedError);
      expect((caught as InstanceType<typeof CorrectionRejectedError>).rejectionReason).toBe('sku already assigned');
    });
  });

  describe('downloadErrorReport() [durion-positivity-backend#2216 precedent, issue #350]', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls ReviewQueueAPIService.downloadErrorReport(jobId) (ADR-0041) and triggers the download from an object URL', () => {
      const blob = new Blob(['sku,reason\nBAD-SKU,INVALID']);
      reviewQueueStub.downloadErrorReport.mockReturnValueOnce(of(blob));
      const clickSpy = vi.fn();
      const anchor = { href: '', download: '', click: clickSpy, remove: vi.fn() } as unknown as HTMLAnchorElement;
      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(anchor);
      const appendSpy = vi.spyOn(document.body, 'append').mockImplementation(() => {});
      const objectUrl = 'blob:mock-url';
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue(objectUrl);
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      vi.useFakeTimers();

      let completed = false;
      service.downloadErrorReport('job-001').subscribe(() => (completed = true));

      // A plain `window.open()` of a bare path bypasses HttpClient's auth
      // interceptor and sends no bearer token; the download must go through
      // the authenticated, generated SDK operation instead (ADR-0041).
      expect(reviewQueueStub.downloadErrorReport).toHaveBeenCalledWith('job-001');
      expect(createObjectURLSpy).toHaveBeenCalledWith(blob);
      expect(anchor.href).toBe(objectUrl);
      expect(anchor.download).toBe('bulk-import-error-report-job-001.csv');
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
      reviewQueueStub.downloadErrorReport.mockReturnValueOnce(throwError(() => failure));
      const createElementSpy = vi.spyOn(document, 'createElement');

      await expect(firstValueFrom(service.downloadErrorReport('job-001'))).rejects.toBe(failure);
      expect(createElementSpy).not.toHaveBeenCalled();

      createElementSpy.mockRestore();
    });

    it('reads and parses a Blob ApiError body from a 404 response instead of leaking the server message (ADR-0064)', async () => {
      const apiErrorBlob = new Blob([JSON.stringify({ code: 'JOB_NOT_FOUND', message: 'Job job-001 was not found for tenant t-9' })], {
        type: 'application/json',
      });
      const httpError = new HttpErrorResponse({ status: 404, error: apiErrorBlob });
      reviewQueueStub.downloadErrorReport.mockReturnValueOnce(throwError(() => httpError));

      const error = await firstValueFrom(service.downloadErrorReport('job-001')).catch((e: unknown) => e as Error);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('ERROR_REPORT_DOWNLOAD_FAILED:JOB_NOT_FOUND');
      expect((error as Error).message).not.toContain('tenant t-9');
    });

    it('degrades a malformed/non-JSON Blob error body to the generic download-failed error', async () => {
      const brokenBlob = new Blob(['<html>not json</html>'], { type: 'text/html' });
      const httpError = new HttpErrorResponse({ status: 500, error: brokenBlob });
      reviewQueueStub.downloadErrorReport.mockReturnValueOnce(throwError(() => httpError));

      const error = await firstValueFrom(service.downloadErrorReport('job-001')).catch((e: unknown) => e as Error);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('ERROR_REPORT_DOWNLOAD_FAILED');
    });
  });

  describe('uploadFile()', () => {
    it('creates a tus upload and emits progress through completion', async () => {
      const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
      const progress: number[] = [];
      let completed = false;

      service.uploadFile('https://upload.example', file).subscribe({
        next: value => progress.push(value),
        complete: () => {
          completed = true;
        },
      });

      const instance = tusState.instances[0];
      const onProgress = instance.options['onProgress'] as ((bytesSent: number, bytesTotal: number) => void);
      const onSuccess = instance.options['onSuccess'] as (() => void);

      await Promise.resolve();
      onProgress(50, 100);
      onSuccess();

      expect(instance.file).toBe(file);
      expect(instance.options['endpoint']).toBe('https://upload.example/');
      expect(instance.options['metadata']).toEqual({ filename: 'test.csv' });
      expect(tusState.start).toHaveBeenCalled();
      expect(progress).toEqual([50, 100]);
      expect(completed).toBe(true);
    });

    it('absolutizes a path-only endpoint against the page origin', () => {
      const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
      service.uploadFile('/api/bulk-loader/v1/bulk-jobs/job-001/tus', file).subscribe();

      expect(tusState.instances[0].options['endpoint'])
        .toBe(`${window.location.origin}/api/bulk-loader/v1/bulk-jobs/job-001/tus`);
    });

    it('does not terminate the upload when it completes or errors', () => {
      const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });

      service.uploadFile('https://upload.example', file).subscribe();
      (tusState.instances[0].options['onSuccess'] as () => void)();

      service.uploadFile('https://upload.example', file).subscribe({ error: () => undefined });
      (tusState.instances[1].options['onError'] as (error: Error) => void)(new Error('boom'));

      expect(tusState.abort).not.toHaveBeenCalled();
    });

    it('resumes from a previous tus upload stored under the API base', async () => {
      const storedUrl = `${window.location.origin}/api/bulk-loader/v1/tus/abc`;
      tusState.findPreviousUploads.mockResolvedValueOnce([{ uploadUrl: storedUrl }]);
      const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });

      service.uploadFile('/api/bulk-loader/v1/bulk-jobs/job-001/tus', file).subscribe();
      await Promise.resolve();

      expect(tusState.resumeFromPreviousUpload).toHaveBeenCalledWith({ uploadUrl: storedUrl });
      expect(tusState.start).toHaveBeenCalled();
    });

    it('ignores previous uploads whose stored URL is relative, foreign, or outside the API base', async () => {
      const trustedUrl = `${window.location.origin}/api/bulk-loader/v1/tus/abc`;
      tusState.findPreviousUploads.mockResolvedValueOnce([
        { uploadUrl: '../../tus/019f4010' },
        { uploadUrl: 'https://evil.example/api/bulk-loader/v1/tus/abc' },
        { uploadUrl: `${window.location.origin}/tus/abc` },
        { uploadUrl: trustedUrl },
      ]);
      const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });

      service.uploadFile('/api/bulk-loader/v1/bulk-jobs/job-001/tus', file).subscribe();
      await Promise.resolve();

      expect(tusState.resumeFromPreviousUpload).toHaveBeenCalledWith({ uploadUrl: trustedUrl });
      expect(tusState.start).toHaveBeenCalled();
    });

    it('scopes trust to the bulk-loader module base, not the whole API base (issue #350)', async () => {
      const trustedUrl = `${window.location.origin}/api/bulk-loader/v1/tus/abc`;
      tusState.findPreviousUploads.mockResolvedValueOnce([
        // Under the general /api/ prefix but a different module's route — must
        // not be resumed now that the check is scoped to the injected
        // BulkLoaderConfiguration.basePath rather than environment.apiBaseUrl.
        { uploadUrl: `${window.location.origin}/api/other-module/v1/tus/abc` },
        { uploadUrl: trustedUrl },
      ]);
      const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });

      service.uploadFile('/api/bulk-loader/v1/bulk-jobs/job-001/tus', file).subscribe();
      await Promise.resolve();

      expect(tusState.resumeFromPreviousUpload).toHaveBeenCalledWith({ uploadUrl: trustedUrl });
      expect(tusState.start).toHaveBeenCalled();
    });

    it('attaches the current JWT to every tus request via onBeforeRequest', () => {
      const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
      service.uploadFile('https://upload.example', file).subscribe();

      const onBeforeRequest = tusState.instances[0].options['onBeforeRequest'] as
        ((req: { setHeader(name: string, value: string): void }) => void);
      const setHeader = vi.fn();
      onBeforeRequest({ setHeader });

      expect(setHeader).toHaveBeenCalledWith('Authorization', 'Bearer test-jwt');

      // A refreshed token is picked up on the next request.
      authStub.accessToken.mockReturnValue('refreshed-jwt');
      onBeforeRequest({ setHeader });
      expect(setHeader).toHaveBeenLastCalledWith('Authorization', 'Bearer refreshed-jwt');
    });

    it('sends no Authorization header when there is no token', () => {
      authStub.accessToken.mockReturnValue(null);
      const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
      service.uploadFile('https://upload.example', file).subscribe();

      const onBeforeRequest = tusState.instances[0].options['onBeforeRequest'] as
        ((req: { setHeader(name: string, value: string): void }) => void);
      const setHeader = vi.fn();
      onBeforeRequest({ setHeader });

      expect(setHeader).not.toHaveBeenCalled();
    });

    it('aborts upload on unsubscribe', () => {
      const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
      const sub = service.uploadFile('https://upload.example', file).subscribe();
      sub.unsubscribe();

      expect(tusState.abort).toHaveBeenCalledWith(true);
    });
  });

  describe('getTusUploadUrl()', () => {
    it('returns a resumable upload endpoint for an existing job', () => {
      expect(service.getTusUploadUrl('job-123')).toBe('/api/bulk-loader/v1/bulk-jobs/job-123/tus');
    });
  });
});
