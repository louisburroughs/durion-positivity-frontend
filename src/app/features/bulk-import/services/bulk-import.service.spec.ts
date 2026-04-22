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

const tusState = vi.hoisted(() => ({
  instances: [] as Array<{ file: File; options: Record<string, unknown> }>,
  start: vi.fn(),
  abort: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('tus-js-client', () => ({
  Upload: function MockUpload(this: { start: typeof tusState.start; abort: typeof tusState.abort }, file: File, options: Record<string, unknown>) {
    tusState.instances.push({ file, options });
    this.start = tusState.start;
    this.abort = tusState.abort;
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
    it('calls GET /bulk-loader/v1/bulk-jobs and maps the backend page shape', () => {
      const res = {
        content: [{
          id: 'job-001',
          domainType: 'INVENTORY_STOCK_COUNT',
          status: 'CREATED',
          fileName: 'test.csv',
        }],
      };
      apiStub.get.mockReturnValue(of(res));

      service.listJobs().subscribe();

      expect(apiStub.get).toHaveBeenCalledWith('/bulk-loader/v1/bulk-jobs', expect.anything());
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
    it('calls GET /bulk-loader/v1/bulk-jobs/:id/audit and maps backend audit records', () => {
      const res = [{
        id: 'rec-001',
        jobId: 'job-001',
        entityType: 'INVENTORY',
        rowNumber: 1,
        reviewStatus: 'PENDING',
        reasonCodes: 'INVALID_SKU',
        originalValues: '{"sku":"BAD-SKU"}',
      }];
      apiStub.get.mockReturnValue(of(res));

      let response: AuditRecordListResponse | undefined;
      service.listAuditRecords('job-001').subscribe(value => {
        response = value;
      });

      expect(apiStub.get).toHaveBeenCalledWith('/bulk-loader/v1/bulk-jobs/job-001/audit');
      expect(response).toEqual({ items: [mockAuditRecord], nextPageToken: null });
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
    it('creates a tus upload and emits progress through completion', () => {
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

      onProgress(50, 100);
      onSuccess();

      expect(instance.file).toBe(file);
      expect(instance.options['endpoint']).toBe('https://upload.example');
      expect(instance.options['metadata']).toEqual({ filename: 'test.csv' });
      expect(tusState.start).toHaveBeenCalled();
      expect(progress).toEqual([50, 100]);
      expect(completed).toBe(true);
    });

    it('aborts upload on unsubscribe', () => {
      const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
      const sub = service.uploadFile('https://upload.example', file).subscribe();
      sub.unsubscribe();

      expect(tusState.abort).toHaveBeenCalledWith(true);
    });
  });
});
