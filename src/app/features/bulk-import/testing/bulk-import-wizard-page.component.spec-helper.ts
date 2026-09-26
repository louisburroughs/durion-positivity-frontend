import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkImportService } from '../../../shared/bulk-import/services/bulk-import.service';
import { AuditRecordListResponse, BulkLoadJob, BulkLoadRecordAudit, CorrectionRejectedError, DomainType } from '../../../shared/bulk-import/models/bulk-import.models';
import { CorrectionSubmitEvent } from '../../../shared/bulk-import/components/bulk-import-error-records-table/bulk-import-error-records-table.component';

type WizardComponentHarness = {
  state: () => string;
  errorKey: () => string | null;
  conflictJob: () => BulkLoadJob | null;
  job: () => BulkLoadJob | null;
  auditRecords: () => BulkLoadRecordAudit[];
  auditReadFailed: () => boolean;
  auditErrorKey: () => string | null;
  correctionErrorKey: () => string | null;
  correctionPendingIds: () => Set<string>;
  onFileSelected: (file: File) => void;
  onSubmitCorrection: (event: CorrectionSubmitEvent) => void;
  retryAuditLoad: () => void;
  downloadErrorReport: () => void;
};

interface WizardPageSpecOptions<TComponent> {
  component: Type<TComponent>;
  componentName: string;
  domainType: DomainType;
}

function buildActiveJob(domainType: DomainType): BulkLoadJob {
  return {
    jobId: 'job-001',
    domainType,
    status: 'PROCESSING',
    fileName: 'test.csv',
  };
}

function buildResumableJob(domainType: DomainType, status: 'CREATED' | 'UPLOADING'): BulkLoadJob {
  return {
    jobId: 'job-001',
    domainType,
    status,
    fileName: 'test.csv',
  };
}

function buildConflictJob(domainType: DomainType): BulkLoadJob {
  const conflictDomainType = domainType === 'LOCATION' ? 'INVENTORY' : 'LOCATION';
  return {
    jobId: 'job-conflict',
    domainType: conflictDomainType,
    status: 'PROCESSING',
    fileName: 'conflict.csv',
  };
}

export function describeBulkImportWizardPage<TComponent>(options: WizardPageSpecOptions<TComponent>): void {
  describe(options.componentName, () => {
    let component: TComponent & WizardComponentHarness;
    let fixture: ComponentFixture<TComponent>;

    const mockBulkImportService = {
      getActiveJobForDomain: vi.fn(),
      getJob: vi.fn(),
      createUploadSession: vi.fn(),
      getTusUploadUrl: vi.fn(),
      uploadFile: vi.fn(),
      getColumnMappings: vi.fn(),
      approveColumnMappings: vi.fn(),
      cancelJob: vi.fn(),
      retryJob: vi.fn(),
      listAuditRecords: vi.fn(),
      submitCorrection: vi.fn(),
      downloadErrorReport: vi.fn(),
      listJobs: vi.fn(),
    };

    beforeEach(async () => {
      vi.clearAllMocks();
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(null));
      mockBulkImportService.getTusUploadUrl.mockImplementation((jobId: string) => `/tus/${jobId}`);
      mockBulkImportService.uploadFile.mockReturnValue(of(100));

      await TestBed.configureTestingModule({
        imports: [options.component, TranslateModule.forRoot()],
        providers: [
          provideRouter([]),
          { provide: BulkImportService, useValue: mockBulkImportService },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(options.component);
      component = fixture.componentInstance as TComponent & WizardComponentHarness;
    });

    afterEach(() => {
      fixture.destroy();
      vi.clearAllMocks();
      vi.useRealTimers();
    });

    it('creates the component', () => {
      fixture.detectChanges();
      expect(component).toBeTruthy();
    });

    it('starts in idle state', () => {
      expect(component.state()).toBe('idle');
    });

    it('calls getActiveJobForDomain on init and transitions to upload when no active job', () => {
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(null));

      fixture.detectChanges();

      expect(mockBulkImportService.getActiveJobForDomain).toHaveBeenCalledWith(options.domainType);
      expect(component.state()).toBe('upload');
    });

    it('transitions to conflict state when an active job for a different domain exists', () => {
      const conflictJob = buildConflictJob(options.domainType);
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(conflictJob));

      fixture.detectChanges();

      expect(component.state()).toBe('conflict');
      expect(component.conflictJob()).toEqual(conflictJob);
    });

    it('resumes to progress state when active job is in PROCESSING status', () => {
      const activeJob = buildActiveJob(options.domainType);
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(activeJob));
      mockBulkImportService.getJob.mockReturnValue(of(activeJob));

      fixture.detectChanges();

      expect(component.state()).toBe('progress');
    });

    it('resumes to upload state when active job is in CREATED status', () => {
      const activeJob = buildResumableJob(options.domainType, 'CREATED');
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(activeJob));

      fixture.detectChanges();

      expect(component.state()).toBe('upload');
    });

    it('resumes to uploading state when active job is in UPLOADING status', () => {
      const activeJob = buildResumableJob(options.domainType, 'UPLOADING');
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(activeJob));

      fixture.detectChanges();

      expect(component.state()).toBe('uploading');
    });

    it('automatically recovers an UPLOADING job by polling without file reselection', async () => {
      vi.useFakeTimers();
      const uploadingJob = buildResumableJob(options.domainType, 'UPLOADING');
      const processingJob: BulkLoadJob = {
        ...uploadingJob,
        status: 'PROCESSING',
      };
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(uploadingJob));
      mockBulkImportService.getJob.mockReturnValue(of(processingJob));

      fixture.detectChanges();

      expect(component.job()).toEqual(uploadingJob);
      expect(component.state()).toBe('uploading');
      expect(mockBulkImportService.createUploadSession).not.toHaveBeenCalled();
      expect(mockBulkImportService.getTusUploadUrl).not.toHaveBeenCalled();
      expect(mockBulkImportService.uploadFile).not.toHaveBeenCalled();
      expect(mockBulkImportService.getJob).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(3100);
      fixture.detectChanges();

      expect(mockBulkImportService.getJob).toHaveBeenCalledWith(uploadingJob.jobId);
      expect(component.job()).toEqual(processingJob);
      expect(component.state()).toBe('progress');
    });

    it('reuses the existing upload session when a file is re-selected for a CREATED job', () => {
      const activeJob = buildResumableJob(options.domainType, 'CREATED');
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(activeJob));

      fixture.detectChanges();

      const file = new File(['sku\n123'], 'resume-created.csv', { type: 'text/csv' });
      component.onFileSelected(file);

      expect(mockBulkImportService.createUploadSession).not.toHaveBeenCalled();
      expect(mockBulkImportService.getTusUploadUrl).toHaveBeenCalledWith(activeJob.jobId);
      expect(mockBulkImportService.uploadFile).toHaveBeenCalledWith(`/tus/${activeJob.jobId}`, file);
      expect(component.job()).toMatchObject({
        jobId: activeJob.jobId,
        status: 'UPLOADING',
        fileName: 'resume-created.csv',
      });
    });

    it('reuses the existing upload session when a file is re-selected for an UPLOADING job', () => {
      const activeJob = buildResumableJob(options.domainType, 'UPLOADING');
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(activeJob));

      fixture.detectChanges();

      const file = new File(['sku\n456'], 'resume-uploading.csv', { type: 'text/csv' });
      component.onFileSelected(file);

      expect(mockBulkImportService.createUploadSession).not.toHaveBeenCalled();
      expect(mockBulkImportService.getTusUploadUrl).toHaveBeenCalledWith(activeJob.jobId);
      expect(mockBulkImportService.uploadFile).toHaveBeenCalledWith(`/tus/${activeJob.jobId}`, file);
      expect(component.job()).toMatchObject({
        jobId: activeJob.jobId,
        status: 'UPLOADING',
        fileName: 'resume-uploading.csv',
      });
    });

    it('transitions to error state when getActiveJobForDomain fails (ADR-0031)', () => {
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(
        throwError(() => new Error('fail')),
      );

      fixture.detectChanges();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('BULK_IMPORT.WIZARD.ERROR.LOAD');
    });

    it('sets state to error when polling fails', async () => {
      vi.useFakeTimers();
      const activeJob = buildActiveJob(options.domainType);
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(activeJob));
      mockBulkImportService.getJob.mockReturnValue(throwError(() => new Error('poll fail')));

      fixture.detectChanges();
      expect(component.state()).toBe('progress');

      await vi.advanceTimersByTimeAsync(3100);
      fixture.detectChanges();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('BULK_IMPORT.WIZARD.ERROR.POLL');
    });

    describe('onSubmitCorrection (issue #376, ADR-0063 §4-5)', () => {
      const mockAuditRecord: BulkLoadRecordAudit = {
        recordId: 'rec-001', jobId: 'job-001', entityType: 'RECORD',
        rowNumber: 1, reviewStatus: 'PENDING', reasonCodes: ['INVALID'],
        originalValues: { field: 'bad' },
      };
      const mockAuditRecord2: BulkLoadRecordAudit = {
        recordId: 'rec-002', jobId: 'job-001', entityType: 'RECORD',
        rowNumber: 2, reviewStatus: 'PENDING', reasonCodes: ['INVALID'],
        originalValues: { field: 'also bad' },
      };

      beforeEach(() => {
        const failedJob = buildActiveJob(options.domainType);
        failedJob.status = 'FAILED';
        mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(failedJob));
        mockBulkImportService.listAuditRecords.mockReturnValue(
          of({ items: [mockAuditRecord], nextPageToken: null } as AuditRecordListResponse),
        );
        fixture.detectChanges();
      });

      it('re-reads the audit record list on success instead of splicing the narrow SDK response', () => {
        mockBulkImportService.submitCorrection.mockReturnValue(of(undefined));
        const correctedRecord: BulkLoadRecordAudit = { ...mockAuditRecord, reviewStatus: 'APPROVED' };
        mockBulkImportService.listAuditRecords.mockReturnValue(
          of({ items: [correctedRecord], nextPageToken: null } as AuditRecordListResponse),
        );

        component.onSubmitCorrection({ record: mockAuditRecord, request: { correctedValues: { field: 'good' } } });

        expect(mockBulkImportService.submitCorrection).toHaveBeenCalledWith(
          'job-001', 'rec-001', { correctedValues: { field: 'good' } },
        );
        expect(mockBulkImportService.listAuditRecords).toHaveBeenCalledWith('job-001', { reviewStatus: 'PENDING' });
        expect(component.auditRecords()).toEqual([correctedRecord]);
      });

      it('keeps the record pending until the re-read it triggered settles, not merely until the reload starts', () => {
        const submit$ = new Subject<void>();
        const reload$ = new Subject<AuditRecordListResponse>();
        mockBulkImportService.submitCorrection.mockReturnValue(submit$);
        mockBulkImportService.listAuditRecords.mockReturnValue(reload$);

        component.onSubmitCorrection({ record: mockAuditRecord, request: { correctedValues: { field: 'good' } } });
        expect(component.correctionPendingIds().has('rec-001')).toBe(true);

        submit$.next(undefined);
        submit$.complete();
        // The reload has started but not landed yet: still pending, so the row
        // cannot be resubmitted and stays out of the "corrected" set.
        expect(mockBulkImportService.listAuditRecords).toHaveBeenCalledWith('job-001', { reviewStatus: 'PENDING' });
        expect(component.correctionPendingIds().has('rec-001')).toBe(true);

        const correctedRecord: BulkLoadRecordAudit = { ...mockAuditRecord, reviewStatus: 'APPROVED' };
        reload$.next({ items: [correctedRecord], nextPageToken: null });
        reload$.complete();

        expect(component.correctionPendingIds().has('rec-001')).toBe(false);
        expect(component.auditRecords()).toEqual([correctedRecord]);
      });

      it('settles the pending flag when the re-read itself fails', () => {
        const submit$ = new Subject<void>();
        const reload$ = new Subject<AuditRecordListResponse>();
        mockBulkImportService.submitCorrection.mockReturnValue(submit$);
        mockBulkImportService.listAuditRecords.mockReturnValue(reload$);

        component.onSubmitCorrection({ record: mockAuditRecord, request: { correctedValues: { field: 'good' } } });
        submit$.next(undefined);
        submit$.complete();
        expect(component.correctionPendingIds().has('rec-001')).toBe(true);

        reload$.error(new Error('re-read failed'));

        expect(component.correctionPendingIds().has('rec-001')).toBe(false);
      });

      it('ignores a stale re-read result when a newer correction reload has already landed', () => {
        const submitA$ = new Subject<void>();
        const submitB$ = new Subject<void>();
        const reloadA$ = new Subject<AuditRecordListResponse>();
        const reloadB$ = new Subject<AuditRecordListResponse>();
        mockBulkImportService.submitCorrection
          .mockReturnValueOnce(submitA$)
          .mockReturnValueOnce(submitB$);
        mockBulkImportService.listAuditRecords
          .mockReturnValueOnce(reloadA$)
          .mockReturnValueOnce(reloadB$);

        component.onSubmitCorrection({ record: mockAuditRecord, request: { correctedValues: { field: 'a' } } });
        submitA$.next(undefined);
        submitA$.complete(); // issues reloadA — the first, soon-to-be-stale reload

        component.onSubmitCorrection({ record: mockAuditRecord2, request: { correctedValues: { field: 'b' } } });
        submitB$.next(undefined);
        submitB$.complete(); // issues reloadB — the current reload

        expect(component.correctionPendingIds()).toEqual(new Set(['rec-001', 'rec-002']));

        // The newer reload lands first...
        const afterB: BulkLoadRecordAudit = { ...mockAuditRecord2, reviewStatus: 'APPROVED' };
        reloadB$.next({ items: [afterB], nextPageToken: null });
        reloadB$.complete();
        expect(component.auditRecords()).toEqual([afterB]);
        expect(component.correctionPendingIds().has('rec-002')).toBe(false);

        // ...then the stale reload lands late and must not overwrite the current data.
        const afterA: BulkLoadRecordAudit = { ...mockAuditRecord, reviewStatus: 'APPROVED' };
        reloadA$.next({ items: [afterA], nextPageToken: null });
        reloadA$.complete();
        expect(component.auditRecords()).toEqual([afterB]);
        // The stale reload still releases its own record's pending flag so it never gets stuck.
        expect(component.correctionPendingIds().has('rec-001')).toBe(false);
      });

      it('a failed re-read after a correction sets a failed-read state, keeps the stale rows visible but read-only, and a retry recovers (ADR-0064 §1-2, Copilot #4105840637 and siblings)', () => {
        const submit$ = new Subject<void>();
        const reload$ = new Subject<AuditRecordListResponse>();
        mockBulkImportService.submitCorrection.mockReturnValue(submit$);
        mockBulkImportService.listAuditRecords.mockReturnValue(reload$);

        component.onSubmitCorrection({ record: mockAuditRecord, request: { correctedValues: { field: 'good' } } });
        submit$.next(undefined);
        submit$.complete();

        reload$.error(new Error('re-read failed'));

        // The read never "succeeds" with an empty/stale-as-valid result: the failure is signalled explicitly...
        expect(component.auditReadFailed()).toBe(true);
        expect(component.auditErrorKey()).toBe('BULK_IMPORT.WIZARD.ERROR.LOAD_RESULTS');
        expect(component.state()).toBe('results');
        // ...while the stale row stays visible instead of vanishing...
        expect(component.auditRecords()).toEqual([mockAuditRecord]);
        // ...and its pending guard is released so it isn't stuck forever.
        expect(component.correctionPendingIds().has('rec-001')).toBe(false);

        // Retry re-issues the read; a successful landing clears the failed-read state.
        const recovered: BulkLoadRecordAudit = { ...mockAuditRecord, reviewStatus: 'APPROVED' };
        mockBulkImportService.listAuditRecords.mockReturnValue(
          of({ items: [recovered], nextPageToken: null } as AuditRecordListResponse),
        );
        component.retryAuditLoad();

        expect(component.auditReadFailed()).toBe(false);
        expect(component.auditErrorKey()).toBeNull();
        expect(component.auditRecords()).toEqual([recovered]);
      });

      it('a REJECTED correction surfaces a localized error, never the server rejectionReason text, and releases the pending flag (Copilot #4105840870)', () => {
        mockBulkImportService.submitCorrection.mockReturnValue(
          throwError(() => new CorrectionRejectedError('sku already assigned to another record')),
        );

        component.onSubmitCorrection({ record: mockAuditRecord, request: { correctedValues: { field: 'good' } } });

        expect(component.correctionErrorKey()).toBe('BULK_IMPORT.WIZARD.ERROR.CORRECTION');
        expect(component.correctionErrorKey()).not.toContain('sku already assigned');
        expect(component.correctionPendingIds().has('rec-001')).toBe(false);
        // A rejection is a per-action error, not a page-level one: the results view stays up.
        expect(component.state()).toBe('results');
      });
    });

    describe('downloadErrorReport() [durion-positivity-backend#2216 precedent, issue #350]', () => {
      beforeEach(() => {
        const failedJob = buildActiveJob(options.domainType);
        failedJob.status = 'FAILED';
        mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(failedJob));
        mockBulkImportService.listAuditRecords.mockReturnValue(
          of({ items: [], nextPageToken: null } as AuditRecordListResponse),
        );
        fixture.detectChanges();
      });

      it('calls service.downloadErrorReport with the jobId', () => {
        mockBulkImportService.downloadErrorReport.mockReturnValue(of(undefined));

        component.downloadErrorReport();

        expect(mockBulkImportService.downloadErrorReport).toHaveBeenCalledWith('job-001');
      });

      it('surfaces a localized per-action error, never a page-level one, when the download fails', () => {
        mockBulkImportService.downloadErrorReport.mockReturnValue(throwError(() => new Error('download failed')));

        component.downloadErrorReport();

        expect(component.correctionErrorKey()).toBe('BULK_IMPORT.WIZARD.ERROR.DOWNLOAD');
        expect(component.state()).toBe('results');
      });
    });

    describe('audit list load failure (ADR-0064 §1-2)', () => {
      it('sets a failed-read state with a localized error and offers a retry when the initial audit load fails', () => {
        const failedJob = buildActiveJob(options.domainType);
        failedJob.status = 'FAILED';
        mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(failedJob));
        mockBulkImportService.listAuditRecords.mockReturnValue(throwError(() => new Error('load failed')));

        fixture.detectChanges();

        expect(component.state()).toBe('results');
        expect(component.auditReadFailed()).toBe(true);
        expect(component.auditErrorKey()).toBe('BULK_IMPORT.WIZARD.ERROR.LOAD_RESULTS');

        mockBulkImportService.listAuditRecords.mockReturnValue(
          of({ items: [], nextPageToken: null } as AuditRecordListResponse),
        );
        component.retryAuditLoad();

        expect(component.auditReadFailed()).toBe(false);
        expect(component.auditErrorKey()).toBeNull();
      });
    });
  });
}
