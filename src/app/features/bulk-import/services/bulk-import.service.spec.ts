import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
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

const tusState = {
  instances: [] as Array<{ file: File; options: Record<string, unknown> }>,
  start: vi.fn(),
  abort: vi.fn().mockResolvedValue(undefined),
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
  let authServiceClass: typeof import('../../../core/services/auth.service').AuthService;
  const apiStub = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  const authStub = { accessToken: vi.fn<() => string | null>(() => 'test-jwt') };
  const bulkLoadJobsStub = { createJob: vi.fn(), getJob: vi.fn(), listJobs: vi.fn(), cancelJob: vi.fn(), retryJob: vi.fn() };
  const columnMappingStub = { getMappings: vi.fn(), approveMappings: vi.fn() };
  const reviewQueueStub = { getAuditRecords: vi.fn(), downloadErrorReport: vi.fn(), submitCorrections: vi.fn() };

  beforeEach(async () => {
    tusState.instances.length = 0;
    tusState.start.mockReset();
    tusState.abort.mockReset().mockResolvedValue(undefined);
    tusState.findPreviousUploads.mockReset().mockResolvedValue([] as Array<{ uploadUrl: string }>);
    tusState.resumeFromPreviousUpload.mockReset();
    vi.resetModules();
    vi.doMock('tus-js-client', () => ({
      Upload: function MockUpload(this: {
        start: typeof tusState.start;
        abort: typeof tusState.abort;
        findPreviousUploads: typeof tusState.findPreviousUploads;
        resumeFromPreviousUpload: typeof tusState.resumeFromPreviousUpload;
      }, file: File, options: Record<string, unknown>) {
        tusState.instances.push({ file, options });
        this.start = tusState.start;
        this.abort = tusState.abort;
        this.findPreviousUploads = tusState.findPreviousUploads;
        this.resumeFromPreviousUpload = tusState.resumeFromPreviousUpload;
      },
    }));

    authStub.accessToken.mockReset().mockReturnValue('test-jwt');

    ({ BulkImportService: bulkImportServiceClass } = await import('./bulk-import.service'));
    ({ ApiBaseService: apiBaseServiceToken } = await import('../../../core/services/api-base.service'));
    ({ AuthService: authServiceClass } = await import('../../../core/services/auth.service'));
    ({
      BulkLoadJobsAPIService: bulkLoadJobsServiceClass,
      ColumnMappingAPIService: columnMappingServiceClass,
      ReviewQueueAPIService: reviewQueueServiceClass,
    } = await import('@durion-sdk/bulk-loader'));

    TestBed.configureTestingModule({
      providers: [
        bulkImportServiceClass,
        { provide: apiBaseServiceToken, useValue: apiStub },
        { provide: authServiceClass, useValue: authStub },
        { provide: bulkLoadJobsServiceClass, useValue: bulkLoadJobsStub },
        { provide: columnMappingServiceClass, useValue: columnMappingStub },
        { provide: reviewQueueServiceClass, useValue: reviewQueueStub },
      ],
    });
    service = TestBed.inject(bulkImportServiceClass);
  });

  afterEach(() => {
    tusState.instances.length = 0;
    vi.doUnmock('tus-js-client');
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
      bulkLoadJobsStub.createJob.mockReturnValue(of({
        id: 'job-001',
        domainType: 'INVENTORY_STOCK_COUNT',
        status: 'CREATED',
        fileName: 'test.csv',
      }));

      let response: CreateUploadSessionResponse | undefined;
      service.createUploadSession(req).subscribe(value => {
        response = value;
      });

      expect(bulkLoadJobsStub.createJob).toHaveBeenCalledWith({
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
      bulkLoadJobsStub.getJob.mockReturnValue(of({
        id: 'job-001',
        domainType: 'INVENTORY_STOCK_COUNT',
        status: 'CREATED',
        fileName: 'test.csv',
      }));

      service.getJob('job-001').subscribe();

      expect(bulkLoadJobsStub.getJob).toHaveBeenCalledWith('job-001');
    });
  });

  describe('getActiveJobForDomain()', () => {
    it('selects the matching active job from the backend jobs page', () => {
      bulkLoadJobsStub.listJobs.mockReturnValue(of({
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

      expect(bulkLoadJobsStub.listJobs).toHaveBeenCalled();
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
      bulkLoadJobsStub.listJobs.mockReturnValue(of(jobPageStub));

      service.listJobs().subscribe();

      expect(bulkLoadJobsStub.listJobs).toHaveBeenCalledWith({ size: 20 });
    });

    it('applies domainType filter on the frontend when backend ignores it', () => {
      bulkLoadJobsStub.listJobs.mockReturnValue(of(jobPageStub));

      let response: import('../models/bulk-import.models').JobListResponse | undefined;
      service.listJobs({ domainType: 'INVENTORY' }).subscribe();

      // SDK only receives size, domainType is not passed to backend
      expect(bulkLoadJobsStub.listJobs).toHaveBeenCalledWith({ size: 20 });

      service.listJobs({ domainType: 'INVENTORY' }).subscribe(value => {
        response = value;
      });
      expect(response?.items).toHaveLength(1);
      expect(response?.items[0]?.domainType).toBe('INVENTORY');
    });

    it('applies status filter on the frontend when backend ignores it', () => {
      bulkLoadJobsStub.listJobs.mockReturnValue(of(jobPageStub));

      let response: import('../models/bulk-import.models').JobListResponse | undefined;
      service.listJobs({ status: 'PROCESSING' }).subscribe();

      // SDK only receives size, status is not passed to backend
      expect(bulkLoadJobsStub.listJobs).toHaveBeenCalledWith({ size: 20 });

      service.listJobs({ status: 'PROCESSING' }).subscribe(value => {
        response = value;
      });
      expect(response?.items).toHaveLength(0);
    });

    it('passes pageSize as the size parameter to the SDK', () => {
      bulkLoadJobsStub.listJobs.mockReturnValue(of(jobPageStub));

      service.listJobs({ pageSize: 10 }).subscribe();

      expect(bulkLoadJobsStub.listJobs).toHaveBeenCalledWith({ size: 10 });
    });

    it('applies multiple frontend filters simultaneously', () => {
      bulkLoadJobsStub.listJobs.mockReturnValue(of(jobPageStub));

      let response: import('../models/bulk-import.models').JobListResponse | undefined;
      service.listJobs({ domainType: 'INVENTORY', status: 'PROCESSING', pageSize: 10 }).subscribe();

      // SDK only receives size; domainType and status are not passed to backend
      expect(bulkLoadJobsStub.listJobs).toHaveBeenCalledWith({ size: 10 });

      service.listJobs({ domainType: 'INVENTORY', status: 'PROCESSING', pageSize: 10 }).subscribe(value => {
        response = value;
      });
      expect(response?.items).toHaveLength(0);
    });
  });

  describe('getActiveJobDomains()', () => {
    it('returns only domains that currently have active jobs', () => {
      bulkLoadJobsStub.listJobs.mockReturnValue(of({
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
      columnMappingStub.getMappings.mockReturnValue(of([{
        id: 'map-001',
        jobId: 'job-001',
        sourceColumn: 'SKU',
        targetField: 'productSku',
        confidence: 0.95,
        overriddenByUser: false,
      }]));

      service.getColumnMappings('job-001').subscribe();

      expect(columnMappingStub.getMappings).toHaveBeenCalledWith('job-001');
    });
  });

  describe('approveColumnMappings()', () => {
    it('calls columnMappingService.approveMappings with jobId and mapped payload', () => {
      const req: ApproveColumnMappingsRequest = {
        overrides: [{ mappingId: 'map-001', sourceColumn: 'SKU', targetField: 'sku' }],
      };
      columnMappingStub.approveMappings.mockReturnValue(of(undefined));

      service.approveColumnMappings('job-001', req).subscribe();

      expect(columnMappingStub.approveMappings).toHaveBeenCalledWith('job-001', {
        mappings: [{ mappingId: 'map-001', sourceColumn: 'SKU', targetField: 'sku' }],
      });
    });
  });

  describe('cancelJob()', () => {
    it('calls bulkLoadJobsService.cancelJob with the jobId', () => {
      bulkLoadJobsStub.cancelJob.mockReturnValue(of(undefined));

      service.cancelJob('job-001').subscribe();

      expect(bulkLoadJobsStub.cancelJob).toHaveBeenCalledWith('job-001');
    });
  });

  describe('retryJob()', () => {
    it('delegates to BulkLoadJobsAPIService.retryJob and returns void', () => {
      bulkLoadJobsStub.retryJob.mockReturnValue(of({ id: 'job-001', status: 'PENDING' }));

      let completed = false;
      service.retryJob('job-001').subscribe({ complete: () => { completed = true; } });

      expect(bulkLoadJobsStub.retryJob).toHaveBeenCalledWith('job-001');
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
      reviewQueueStub.getAuditRecords.mockReturnValue(of(auditResStub));

      let response: AuditRecordListResponse | undefined;
      service.listAuditRecords('job-001').subscribe(value => {
        response = value;
      });

      expect(reviewQueueStub.getAuditRecords).toHaveBeenCalledWith('job-001');
      expect(response).toEqual({ items: [mockAuditRecord], nextPageToken: null });
    });

    it('ignores filters (SDK does not support server-side filtering)', () => {
      reviewQueueStub.getAuditRecords.mockReturnValue(of(auditResStub));

      service.listAuditRecords('job-001', { reviewStatus: 'PENDING', pageSize: 5 }).subscribe();

      expect(reviewQueueStub.getAuditRecords).toHaveBeenCalledWith('job-001');
    });
  });

  describe('submitCorrection()', () => {
    it('calls PUT /bulk-loader/v1/bulk-jobs/:id/audit/:recordId/correction and maps ApiAuditRecord', () => {
      const req: SubmitCorrectionRequest = { correctedValues: { sku: 'FIXED-SKU' } };
      const rawApiAuditRecord = {
        id: 'rec-001',
        jobId: 'job-001',
        entityType: 'PRODUCT',
        rowNumber: 1,
        reviewStatus: 'PENDING',
        reasonCodes: 'INVALID_SKU,MISSING_FIELD',
        originalValues: '{"sku":"OLD"}',
      };
      apiStub.put.mockReturnValue(of(rawApiAuditRecord));

      let result: BulkLoadRecordAudit | undefined;
      service.submitCorrection('job-001', 'rec-001', req).subscribe(value => {
        result = value;
      });

      expect(apiStub.put).toHaveBeenCalledWith(
        '/bulk-loader/v1/bulk-jobs/job-001/audit/rec-001/correction',
        req,
      );
      expect(result?.reasonCodes).toEqual(['INVALID_SKU', 'MISSING_FIELD']);
      expect(result?.originalValues).toEqual({ sku: 'OLD' });
    });
  });

  describe('getErrorReportUrl()', () => {
    it('returns the correct URL for a given jobId', () => {
      expect(service.getErrorReportUrl('job-001')).toBe('/api/bulk-loader/v1/bulk-jobs/job-001/error-report');
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
