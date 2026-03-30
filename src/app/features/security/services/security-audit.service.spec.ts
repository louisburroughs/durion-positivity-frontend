import { TestBed } from '@angular/core/testing';
import { HttpParams } from '@angular/common/http';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { SecurityAuditService } from './security-audit.service';
import {
  AuditEventDetail,
  AuditEventFilter,
  AuditEventPageResponse,
  AuditExportJob,
} from '../models/security-audit.models';

describe('SecurityAuditService', () => {
  let service: SecurityAuditService;

  const apiStub = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SecurityAuditService,
        { provide: ApiBaseService, useValue: apiStub },
      ],
    });
    service = TestBed.inject(SecurityAuditService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── searchAuditEvents() ────────────────────────────────────────────────

  describe('searchAuditEvents()', () => {
    const mockPage: AuditEventPageResponse = {
      items: [],
      nextPageToken: null,
    };

    it('calls GET /v1/audit/events with filter params', () => {
      apiStub.get.mockReturnValueOnce(of(mockPage));

      const filter: Partial<AuditEventFilter> = { actorId: 'user-01', eventType: 'LOGIN' };
      service.searchAuditEvents(filter).subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path, params] = apiStub.get.mock.calls[0];
      expect(path).toBe('/v1/audit/events');
      expect((params as HttpParams).get('actorId')).toBe('user-01');
      expect((params as HttpParams).get('eventType')).toBe('LOGIN');
    });

    it('includes date range params when provided', () => {
      apiStub.get.mockReturnValueOnce(of(mockPage));

      service.searchAuditEvents({ fromDate: '2026-01-01', toDate: '2026-03-31' }).subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect((params as HttpParams).get('fromDate')).toBe('2026-01-01');
      expect((params as HttpParams).get('toDate')).toBe('2026-03-31');
    });

    it('omits filter params that are not provided', () => {
      apiStub.get.mockReturnValueOnce(of(mockPage));

      service.searchAuditEvents({}).subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect((params as HttpParams).has('actorId')).toBe(false);
      expect((params as HttpParams).has('eventType')).toBe(false);
    });

    it('returns the AuditEventPageResponse emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockPage));

      let result: AuditEventPageResponse | undefined;
      service.searchAuditEvents({}).subscribe((r: AuditEventPageResponse) => (result = r));

      expect(result).toEqual(mockPage);
    });
  });

  // ── getAuditEvent() ────────────────────────────────────────────────────

  describe('getAuditEvent()', () => {
    const mockEvent: AuditEventDetail = {
      eventId: 'evt-001',
      eventType: 'ROLE_ASSIGNED',
      aggregateId: 'user-02',
      actorId: 'user-01',
      timestamp: '2026-03-01T09:00:00Z',
    };

    it('calls GET /v1/audit/events/{eventId}', () => {
      apiStub.get.mockReturnValueOnce(of(mockEvent));

      service.getAuditEvent('evt-001').subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/v1/audit/events/evt-001');
    });

    it('URL-encodes the eventId', () => {
      apiStub.get.mockReturnValueOnce(of(mockEvent));

      service.getAuditEvent('evt/001').subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/v1/audit/events/evt%2F001');
    });

    it('returns the AuditEventDetail emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockEvent));

      let result: AuditEventDetail | undefined;
      service.getAuditEvent('evt-001').subscribe((r: AuditEventDetail) => (result = r));

      expect(result).toEqual(mockEvent);
    });
  });

  // ── requestAuditExport() ───────────────────────────────────────────────

  describe('requestAuditExport()', () => {
    const mockJob: AuditExportJob = {
      jobId: 'job-001',
      status: 'PENDING',
    };

    it('calls POST /v1/audit/exports with the filter as body', () => {
      apiStub.post.mockReturnValueOnce(of(mockJob));

      const filter: Partial<AuditEventFilter> = { actorId: 'user-01', fromDate: '2026-01-01', toDate: '2026-03-31' };
      service.requestAuditExport(filter).subscribe();

      expect(apiStub.post).toHaveBeenCalledOnce();
      const [path, body] = apiStub.post.mock.calls[0];
      expect(path).toBe('/v1/audit/exports');
      expect(body).toEqual(filter);
    });

    it('returns the AuditExportJob emitted by the API', () => {
      apiStub.post.mockReturnValueOnce(of(mockJob));

      let result: AuditExportJob | undefined;
      service.requestAuditExport({}).subscribe((r: AuditExportJob) => (result = r));

      expect(result).toEqual(mockJob);
    });

    it('accepts an empty filter and posts to the export endpoint', () => {
      apiStub.post.mockReturnValueOnce(of(mockJob));

      service.requestAuditExport({}).subscribe();

      const [path] = apiStub.post.mock.calls[0];
      expect(path).toBe('/v1/audit/exports');
    });
  });

  // ── getAuditExportStatus() ─────────────────────────────────────────────

  describe('getAuditExportStatus()', () => {
    const mockJob: AuditExportJob = {
      jobId: 'job-001',
      status: 'COMPLETE',
      downloadUrl: 'https://storage.example.com/exports/job-001.csv',
      completedAt: '2026-03-01T09:05:00Z',
    };

    it('calls GET /v1/audit/exports/{jobId}', () => {
      apiStub.get.mockReturnValueOnce(of(mockJob));

      service.getAuditExportStatus('job-001').subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/v1/audit/exports/job-001');
    });

    it('URL-encodes the jobId', () => {
      apiStub.get.mockReturnValueOnce(of(mockJob));

      service.getAuditExportStatus('job/001').subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/v1/audit/exports/job%2F001');
    });

    it('returns the AuditExportJob emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockJob));

      let result: AuditExportJob | undefined;
      service.getAuditExportStatus('job-001').subscribe((r: AuditExportJob) => (result = r));

      expect(result).toEqual(mockJob);
    });
  });
});
