import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { BulkImportService } from './bulk-import.service';
import {
  ApproveColumnMappingsRequest,
  AuditRecordListResponse,
  BulkLoadColumnMapping,
  BulkLoadJob,
  BulkLoadRecordAudit,
  CreateUploadSessionRequest,
  CreateUploadSessionResponse,
  JobListResponse,
  SubmitCorrectionRequest,
} from '../models/bulk-import.models';

describe('BulkImportService', () => {
  let service: BulkImportService;
  const apiStub = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [BulkImportService, { provide: ApiBaseService, useValue: apiStub }],
    });
    service = TestBed.inject(BulkImportService);
  });

  afterEach(() => vi.clearAllMocks());

  const mockJob: BulkLoadJob = {
    jobId: 'job-001', domainType: 'INVENTORY', status: 'CREATED',
    fileName: 'test.csv',
  };

  const mockMapping: BulkLoadColumnMapping = {
    mappingId: 'map-001', jobId: 'job-001', sourceColumn: 'SKU',
    targetField: 'productSku', confidence: 0.95, overriddenByUser: false,
  };

  const mockAuditRecord: BulkLoadRecordAudit = {
    recordId: 'rec-001', jobId: 'job-001', entityType: 'INVENTORY',
    rowNumber: 1, reviewStatus: 'PENDING', reasonCodes: ['INVALID_SKU'],
    originalValues: { sku: 'BAD-SKU' },
  };

  describe('createUploadSession()', () => {
    it('calls POST /bulk-loader/v1/jobs with request body', () => {
      const req: CreateUploadSessionRequest = {
        domainType: 'INVENTORY',
        fileName: 'test.csv',
        fileSize: 1024,
      };
      const res: CreateUploadSessionResponse = {
        jobId: 'job-001',
        uploadUrl: 'http://upload/url',
      };
      apiStub.post.mockReturnValue(of(res));

      service.createUploadSession(req).subscribe();

      expect(apiStub.post).toHaveBeenCalledWith('/bulk-loader/v1/jobs', req);
    });
  });

  describe('getJob()', () => {
    it('calls GET /bulk-loader/v1/jobs/:id', () => {
      apiStub.get.mockReturnValue(of(mockJob));

      service.getJob('job-001').subscribe();

      expect(apiStub.get).toHaveBeenCalledWith('/bulk-loader/v1/jobs/job-001');
    });
  });

  describe('getActiveJobForDomain()', () => {
    it('calls GET /bulk-loader/v1/jobs/active with domainType param', () => {
      apiStub.get.mockReturnValue(of(mockJob));

      service.getActiveJobForDomain('INVENTORY').subscribe();

      expect(apiStub.get).toHaveBeenCalledWith('/bulk-loader/v1/jobs/active', expect.anything());
    });
  });

  describe('listJobs()', () => {
    it('calls GET /bulk-loader/v1/jobs', () => {
      const res: JobListResponse = { items: [mockJob], nextPageToken: null };
      apiStub.get.mockReturnValue(of(res));

      service.listJobs().subscribe();

      expect(apiStub.get).toHaveBeenCalledWith('/bulk-loader/v1/jobs', expect.anything());
    });
  });

  describe('getColumnMappings()', () => {
    it('calls GET /bulk-loader/v1/jobs/:id/mappings', () => {
      apiStub.get.mockReturnValue(of([mockMapping]));

      service.getColumnMappings('job-001').subscribe();

      expect(apiStub.get).toHaveBeenCalledWith('/bulk-loader/v1/jobs/job-001/mappings');
    });
  });

  describe('approveColumnMappings()', () => {
    it('calls PUT /bulk-loader/v1/jobs/:id/mappings/approve', () => {
      const req: ApproveColumnMappingsRequest = { overrides: [] };
      apiStub.put.mockReturnValue(of(undefined));

      service.approveColumnMappings('job-001', req).subscribe();

      expect(apiStub.put).toHaveBeenCalledWith('/bulk-loader/v1/jobs/job-001/mappings/approve', req);
    });
  });

  describe('cancelJob()', () => {
    it('calls POST /bulk-loader/v1/jobs/:id/cancel', () => {
      apiStub.post.mockReturnValue(of(undefined));

      service.cancelJob('job-001').subscribe();

      expect(apiStub.post).toHaveBeenCalledWith('/bulk-loader/v1/jobs/job-001/cancel', {});
    });
  });

  describe('retryJob()', () => {
    it('calls POST /bulk-loader/v1/jobs/:id/retry', () => {
      apiStub.post.mockReturnValue(of(undefined));

      service.retryJob('job-001').subscribe();

      expect(apiStub.post).toHaveBeenCalledWith('/bulk-loader/v1/jobs/job-001/retry', {});
    });
  });

  describe('listAuditRecords()', () => {
    it('calls GET /bulk-loader/v1/jobs/:id/audit', () => {
      const res: AuditRecordListResponse = { items: [mockAuditRecord], nextPageToken: null };
      apiStub.get.mockReturnValue(of(res));

      service.listAuditRecords('job-001').subscribe();

      expect(apiStub.get).toHaveBeenCalledWith('/bulk-loader/v1/jobs/job-001/audit', expect.anything());
    });
  });

  describe('submitCorrection()', () => {
    it('calls PUT /bulk-loader/v1/jobs/:id/audit/:recordId/correction', () => {
      const req: SubmitCorrectionRequest = { correctedValues: { sku: 'FIXED-SKU' } };
      apiStub.put.mockReturnValue(of(mockAuditRecord));

      service.submitCorrection('job-001', 'rec-001', req).subscribe();

      expect(apiStub.put).toHaveBeenCalledWith(
        '/bulk-loader/v1/jobs/job-001/audit/rec-001/correction',
        req,
      );
    });
  });

  describe('getErrorReportUrl()', () => {
    it('returns the correct URL for a given jobId', () => {
      expect(service.getErrorReportUrl('job-001')).toBe('/api/bulk-loader/v1/jobs/job-001/error-report');
    });
  });

  describe('uploadFile()', () => {
    class MockXhrUpload {
      onprogress: ((event: ProgressEvent<XMLHttpRequestEventTarget>) => void) | null = null;
    }

    class MockXhr {
      readonly upload = new MockXhrUpload();
      status = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      open = vi.fn();
      send = vi.fn();
      abort = vi.fn();
    }

    it('posts file and emits progress through completion', () => {
      const originalXhr = globalThis.XMLHttpRequest;
      const mockXhr = new MockXhr();
      vi.stubGlobal('XMLHttpRequest', vi.fn(function() { return mockXhr; }));

      const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
      const progress: number[] = [];
      let completed = false;

      service.uploadFile('https://upload.example', file).subscribe({
        next: value => progress.push(value),
        complete: () => {
          completed = true;
        },
      });

      mockXhr.upload.onprogress?.({ loaded: 50, total: 100, lengthComputable: true } as ProgressEvent<XMLHttpRequestEventTarget>);
      mockXhr.status = 201;
      mockXhr.onload?.();

      expect(mockXhr.open).toHaveBeenCalledWith('POST', 'https://upload.example');
      expect(mockXhr.send).toHaveBeenCalledWith(expect.any(FormData));
      expect(progress).toEqual([50, 100]);
      expect(completed).toBe(true);

      vi.stubGlobal('XMLHttpRequest', originalXhr);
    });

    it('aborts upload on unsubscribe', () => {
      const originalXhr = globalThis.XMLHttpRequest;
      const mockXhr = new MockXhr();
      vi.stubGlobal('XMLHttpRequest', vi.fn(function() { return mockXhr; }));

      const file = new File(['a,b'], 'test.csv', { type: 'text/csv' });
      const sub = service.uploadFile('https://upload.example', file).subscribe();
      sub.unsubscribe();

      expect(mockXhr.abort).toHaveBeenCalled();

      vi.stubGlobal('XMLHttpRequest', originalXhr);
    });
  });
});
