import { TestBed } from '@angular/core/testing';
import { HttpParams } from '@angular/common/http';
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

const tusState = vi.hoisted(() => ({
  instances: [] as Array<{ file: File; options: Record<string, unknown> }>,
  start: vi.fn(),
  abort: vi.fn().mockResolvedValue(undefined),
  findPreviousUploads: vi.fn(() => Promise.resolve([] as Array<{ uploadUrl: string }>)),
  resumeFromPreviousUpload: vi.fn(),
}));

vi.mock('tus-js-client', () => ({
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

describe('BulkImportService', () => {
  let service: import('./bulk-import.service').BulkImportService;
  let bulkImportServiceClass: typeof import('./bulk-import.service').BulkImportService;
  let apiBaseServiceToken: typeof import('../../../core/services/api-base.service').ApiBaseService;
  const apiStub = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };

  beforeEach(async () => {
    tusState.instances.length = 0;
    tusState.start.mockReset();
    tusState.abort.mockReset().mockResolvedValue(undefined);
    tusState.findPreviousUploads.mockReset().mockResolvedValue([] as Array<{ uploadUrl: string }>);
    tusState.resumeFromPreviousUpload.mockReset();
    vi.resetModules();

    ({ BulkImportService: bulkImportServiceClass } = await import('./bulk-import.service'));
    ({ ApiBaseService: apiBaseServiceToken } = await import('../../../core/services/api-base.service'));

    TestBed.configureTestingModule({
      providers: [bulkImportServiceClass, { provide: apiBaseServiceToken, useValue: apiStub }],
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
      apiStub.post.mockReturnValue(of({
        id: 'job-001',
        domainType: 'INVENTORY_STOCK_COUNT',
        status: 'CREATED',
        fileName: 'test.csv',
      }));

      let response: CreateUploadSessionResponse | undefined;
      service.createUploadSession(req).subscribe(value => {
        response = value;
      });

      expect(apiStub.post).toHaveBeenCalledWith('/bulk-loader/v1/bulk-jobs', {
        domainType: 'INVENTORY_STOCK_COUNT',
        fileName: 'test.csv',
      });
      expect(response).toEqual({
        jobId: 'job-001',
        uploadUrl: 'http://localhost:8080/api/bulk-loader/v1/bulk-jobs/job-001/tus',
      });
    });
  });

  describe('getJob()', () => {
    it('calls GET /bulk-loader/v1/bulk-jobs/:id and maps the backend job shape', () => {
      apiStub.get.mockReturnValue(of({
        id: 'job-001',
        domainType: 'INVENTORY_STOCK_COUNT',
        status: 'CREATED',
        fileName: 'test.csv',
      }));

      service.getJob('job-001').subscribe();

      expect(apiStub.get).toHaveBeenCalledWith('/bulk-loader/v1/bulk-jobs/job-001');
    });
  });

  describe('getActiveJobForDomain()', () => {
    it('selects the matching active job from the backend jobs page', () => {
      apiStub.get.mockReturnValue(of({
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

      expect(apiStub.get).toHaveBeenCalledWith('/bulk-loader/v1/bulk-jobs', expect.anything());
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

    it('calls GET /bulk-loader/v1/bulk-jobs and maps the backend page shape', () => {
      apiStub.get.mockReturnValue(of(jobPageStub));

      service.listJobs().subscribe();

      expect(apiStub.get).toHaveBeenCalledWith('/bulk-loader/v1/bulk-jobs', expect.anything());
    });

    it('applies domainType filter on the frontend when backend ignores it', () => {
      apiStub.get.mockReturnValue(of(jobPageStub));

      let response: import('../models/bulk-import.models').JobListResponse | undefined;
      service.listJobs({ domainType: 'INVENTORY' }).subscribe();

      const [, params] = apiStub.get.mock.calls[0] as [string, HttpParams];
      expect(params.get('domainType')).toBeNull();

      service.listJobs({ domainType: 'INVENTORY' }).subscribe(value => {
        response = value;
      });
      expect(response?.items).toHaveLength(1);
      expect(response?.items[0]?.domainType).toBe('INVENTORY');
    });

    it('applies status filter on the frontend when backend ignores it', () => {
      apiStub.get.mockReturnValue(of(jobPageStub));

      let response: import('../models/bulk-import.models').JobListResponse | undefined;
      service.listJobs({ status: 'PROCESSING' }).subscribe();

      const [, params] = apiStub.get.mock.calls[0] as [string, HttpParams];
      expect(params.get('status')).toBeNull();

      service.listJobs({ status: 'PROCESSING' }).subscribe(value => {
        response = value;
      });
      expect(response?.items).toHaveLength(0);
    });

    it('passes pageSize as a query param when provided', () => {
      apiStub.get.mockReturnValue(of(jobPageStub));

      service.listJobs({ pageSize: 10 }).subscribe();

      const [, params] = apiStub.get.mock.calls[0] as [string, HttpParams];
      expect(params.get('pageSize')).toBe('10');
    });

    it('applies multiple frontend filters simultaneously', () => {
      apiStub.get.mockReturnValue(of(jobPageStub));

      let response: import('../models/bulk-import.models').JobListResponse | undefined;
      service.listJobs({ domainType: 'INVENTORY', status: 'PROCESSING', pageSize: 10 }).subscribe();

      const [, params] = apiStub.get.mock.calls[0] as [string, HttpParams];
      expect(params.get('domainType')).toBeNull();
      expect(params.get('status')).toBeNull();
      expect(params.get('pageSize')).toBe('10');

      service.listJobs({ domainType: 'INVENTORY', status: 'PROCESSING', pageSize: 10 }).subscribe(value => {
        response = value;
      });
      expect(response?.items).toHaveLength(0);
    });
  });

  describe('getActiveJobDomains()', () => {
    it('returns only domains that currently have active jobs', () => {
      apiStub.get.mockReturnValue(of({
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
    it('calls GET /bulk-loader/v1/bulk-jobs/:id/mappings', () => {
      apiStub.get.mockReturnValue(of([{
        id: 'map-001',
        jobId: 'job-001',
        sourceColumn: 'SKU',
        targetField: 'productSku',
        confidence: 0.95,
        overriddenByUser: false,
      }]));

      service.getColumnMappings('job-001').subscribe();

      expect(apiStub.get).toHaveBeenCalledWith('/bulk-loader/v1/bulk-jobs/job-001/mappings');
    });
  });

  describe('approveColumnMappings()', () => {
    it('calls PUT /bulk-loader/v1/bulk-jobs/:id/mappings with backend mapping payload', () => {
      const req: ApproveColumnMappingsRequest = {
        overrides: [{ mappingId: 'map-001', sourceColumn: 'SKU', targetField: 'sku' }],
      };
      apiStub.put.mockReturnValue(of(undefined));

      service.approveColumnMappings('job-001', req).subscribe();

      expect(apiStub.put).toHaveBeenCalledWith('/bulk-loader/v1/bulk-jobs/job-001/mappings', {
        mappings: [{ mappingId: 'map-001', sourceColumn: 'SKU', targetField: 'sku' }],
      });
    });
  });

  describe('cancelJob()', () => {
    it('calls POST /bulk-loader/v1/bulk-jobs/:id/cancel', () => {
      apiStub.post.mockReturnValue(of(undefined));

      service.cancelJob('job-001').subscribe();

      expect(apiStub.post).toHaveBeenCalledWith('/bulk-loader/v1/bulk-jobs/job-001/cancel', {});
    });
  });

  describe('retryJob()', () => {
    it('calls POST /bulk-loader/v1/bulk-jobs/:id/retry', () => {
      apiStub.post.mockReturnValue(of(undefined));

      service.retryJob('job-001').subscribe();

      expect(apiStub.post).toHaveBeenCalledWith('/bulk-loader/v1/bulk-jobs/job-001/retry', {});
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

    it('calls GET /bulk-loader/v1/bulk-jobs/:id/audit and maps backend audit records', () => {
      apiStub.get.mockReturnValue(of(auditResStub));

      let response: AuditRecordListResponse | undefined;
      service.listAuditRecords('job-001').subscribe(value => {
        response = value;
      });

      expect(apiStub.get).toHaveBeenCalledWith('/bulk-loader/v1/bulk-jobs/job-001/audit', expect.anything());
      expect(response).toEqual({ items: [mockAuditRecord], nextPageToken: null });
    });

    it('passes reviewStatus as a query param when provided', () => {
      apiStub.get.mockReturnValue(of(auditResStub));

      service.listAuditRecords('job-001', { reviewStatus: 'PENDING' }).subscribe();

      const [, params] = apiStub.get.mock.calls[0] as [string, HttpParams];
      expect(params.get('reviewStatus')).toBe('PENDING');
    });

    it('passes pageSize as a query param when provided', () => {
      apiStub.get.mockReturnValue(of(auditResStub));

      service.listAuditRecords('job-001', { pageSize: 5 }).subscribe();

      const [, params] = apiStub.get.mock.calls[0] as [string, HttpParams];
      expect(params.get('pageSize')).toBe('5');
    });

    it('passes both reviewStatus and pageSize as query params when provided', () => {
      apiStub.get.mockReturnValue(of(auditResStub));

      service.listAuditRecords('job-001', { reviewStatus: 'PENDING', pageSize: 5 }).subscribe();

      const [, params] = apiStub.get.mock.calls[0] as [string, HttpParams];
      expect(params.get('reviewStatus')).toBe('PENDING');
      expect(params.get('pageSize')).toBe('5');
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
      expect(instance.options['endpoint']).toBe('https://upload.example');
      expect(instance.options['metadata']).toEqual({ filename: 'test.csv' });
      expect(tusState.start).toHaveBeenCalled();
      expect(progress).toEqual([50, 100]);
      expect(completed).toBe(true);
    });

    it('resumes from a previous tus upload when one exists', async () => {
      tusState.findPreviousUploads.mockResolvedValueOnce([{ uploadUrl: 'https://upload.example/files/abc' }]);
      const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });

      service.uploadFile('https://upload.example', file).subscribe();
      await Promise.resolve();

      expect(tusState.resumeFromPreviousUpload).toHaveBeenCalledWith({ uploadUrl: 'https://upload.example/files/abc' });
      expect(tusState.start).toHaveBeenCalled();
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
      expect(service.getTusUploadUrl('job-123')).toBe('http://localhost:8080/api/bulk-loader/v1/bulk-jobs/job-123/tus');
    });
  });
});
