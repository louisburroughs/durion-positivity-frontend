import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuditService, AuditExportsService } from '@durion-sdk/security';
import { SecurityAuditService } from './security-audit.service';
import {
  AuditEventDetail,
  AuditEventFilter,
  AuditEventPageResponse,
  AuditExportJob,
} from '../models/security-audit.models';

describe('SecurityAuditService', () => {
  let service: SecurityAuditService;

  const auditSdkStub = {
    getEvent: vi.fn(),
    searchAuditEvents: vi.fn(),
  };

  const auditExportsSdkStub = {
    requestAuditExport: vi.fn(),
    getAuditExportJob: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SecurityAuditService,
        { provide: AuditService, useValue: auditSdkStub },
        { provide: AuditExportsService, useValue: auditExportsSdkStub },
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

    it('calls auditSdk.searchAuditEvents with filter params', () => {
      auditSdkStub.searchAuditEvents.mockReturnValueOnce(of(mockPage));

      const filter: Partial<AuditEventFilter> = { actorId: 'user-01', eventType: 'LOGIN' };
      service.searchAuditEvents(filter).subscribe();

      expect(auditSdkStub.searchAuditEvents).toHaveBeenCalledOnce();
      const args = auditSdkStub.searchAuditEvents.mock.calls[0];
      // actorId is arg index 2, eventType is arg index 7
      expect(args[2]).toBe('user-01');
      expect(args[7]).toBe('LOGIN');
    });

    it('includes date range params when provided', () => {
      auditSdkStub.searchAuditEvents.mockReturnValueOnce(of(mockPage));

      service.searchAuditEvents({ fromDate: '2026-01-01', toDate: '2026-03-31' }).subscribe();

      const args = auditSdkStub.searchAuditEvents.mock.calls[0];
      // fromDate is arg index 0, toDate is arg index 1
      expect(args[0]).toBe('2026-01-01');
      expect(args[1]).toBe('2026-03-31');
    });

    it('passes undefined for filter params that are not provided', () => {
      auditSdkStub.searchAuditEvents.mockReturnValueOnce(of(mockPage));

      service.searchAuditEvents({}).subscribe();

      const args = auditSdkStub.searchAuditEvents.mock.calls[0];
      expect(args[2]).toBeUndefined(); // actorId
      expect(args[7]).toBeUndefined(); // eventType
    });

    it('returns the AuditEventPageResponse emitted by the SDK', () => {
      auditSdkStub.searchAuditEvents.mockReturnValueOnce(of(mockPage));

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

    it('calls auditSdk.getEvent with the eventId', () => {
      auditSdkStub.getEvent.mockReturnValueOnce(of(mockEvent));

      service.getAuditEvent('evt-001').subscribe();

      expect(auditSdkStub.getEvent).toHaveBeenCalledWith('evt-001');
    });

    it('passes eventId as-is to the SDK', () => {
      auditSdkStub.getEvent.mockReturnValueOnce(of(mockEvent));

      service.getAuditEvent('evt/001').subscribe();

      expect(auditSdkStub.getEvent).toHaveBeenCalledWith('evt/001');
    });

    it('returns the AuditEventDetail emitted by the SDK', () => {
      auditSdkStub.getEvent.mockReturnValueOnce(of(mockEvent));

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

    it('calls auditExportsSdk.requestAuditExport with the filter', () => {
      auditExportsSdkStub.requestAuditExport.mockReturnValueOnce(of(mockJob));

      const filter: Partial<AuditEventFilter> = { actorId: 'user-01', fromDate: '2026-01-01', toDate: '2026-03-31' };
      service.requestAuditExport(filter).subscribe();

      expect(auditExportsSdkStub.requestAuditExport).toHaveBeenCalledOnce();
      const [body] = auditExportsSdkStub.requestAuditExport.mock.calls[0];
      expect(body).toEqual(filter);
    });

    it('returns the AuditExportJob emitted by the SDK', () => {
      auditExportsSdkStub.requestAuditExport.mockReturnValueOnce(of(mockJob));

      let result: AuditExportJob | undefined;
      service.requestAuditExport({}).subscribe((r: AuditExportJob) => (result = r));

      expect(result).toEqual(mockJob);
    });

    it('accepts an empty filter and calls the export SDK', () => {
      auditExportsSdkStub.requestAuditExport.mockReturnValueOnce(of(mockJob));

      service.requestAuditExport({}).subscribe();

      expect(auditExportsSdkStub.requestAuditExport).toHaveBeenCalledOnce();
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

    it('calls auditExportsSdk.getAuditExportJob with the jobId', () => {
      auditExportsSdkStub.getAuditExportJob.mockReturnValueOnce(of(mockJob));

      service.getAuditExportStatus('job-001').subscribe();

      expect(auditExportsSdkStub.getAuditExportJob).toHaveBeenCalledWith('job-001');
    });

    it('passes jobId as-is to the SDK', () => {
      auditExportsSdkStub.getAuditExportJob.mockReturnValueOnce(of(mockJob));

      service.getAuditExportStatus('job/001').subscribe();

      expect(auditExportsSdkStub.getAuditExportJob).toHaveBeenCalledWith('job/001');
    });

    it('returns the AuditExportJob emitted by the SDK', () => {
      auditExportsSdkStub.getAuditExportJob.mockReturnValueOnce(of(mockJob));

      let result: AuditExportJob | undefined;
      service.getAuditExportStatus('job-001').subscribe((r: AuditExportJob) => (result = r));

      expect(result).toEqual(mockJob);
    });
  });
});
