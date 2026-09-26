import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkImportWizardPageBase } from './bulk-import-wizard-page.base';
import { BulkImportService } from '../../services/bulk-import.service';
import {
  BulkLoadColumnMapping,
  BulkLoadJob,
  ColumnMappingOverride,
  CreateUploadSessionResponse,
  DomainType,
} from '../../models/bulk-import.models';

@Component({
  selector: 'app-test-wizard',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestWizardPage extends BulkImportWizardPageBase {
  readonly domainType: DomainType = 'CATALOG';
}

function buildJob(status: BulkLoadJob['status'], overrides: Partial<BulkLoadJob> = {}): BulkLoadJob {
  return {
    jobId: 'job-001',
    domainType: 'CATALOG',
    status,
    fileName: 'test.csv',
    ...overrides,
  };
}

describe('BulkImportWizardPageBase', () => {
  let component: TestWizardPage;
  let fixture: ComponentFixture<TestWizardPage>;

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
    mockBulkImportService.cancelJob.mockReturnValue(of(undefined));
    mockBulkImportService.listAuditRecords.mockReturnValue(of({ items: [], nextPageToken: null }));

    await TestBed.configureTestingModule({
      imports: [TestWizardPage],
      providers: [
        { provide: BulkImportService, useValue: mockBulkImportService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TestWizardPage);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('resuming an active job', () => {
    it('resumes a MAPPING_REVIEW job by loading its column mappings', () => {
      const job = buildJob('MAPPING_REVIEW');
      const mappings: BulkLoadColumnMapping[] = [
        { mappingId: 'm1', jobId: job.jobId, sourceColumn: 'sku', targetField: 'sku', confidence: 1, overriddenByUser: false },
      ];
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(job));
      mockBulkImportService.getColumnMappings.mockReturnValue(of(mappings));

      fixture.detectChanges();

      expect(mockBulkImportService.getColumnMappings).toHaveBeenCalledWith(job.jobId);
      expect(component.mappings()).toEqual(mappings);
      expect(component.state()).toBe('mapping');
    });
  });

  describe('onFileSelected -> new upload session', () => {
    it('creates a fresh tracked job when none is tracked yet (job() is null)', () => {
      const file = new File(['a'], 'new.csv', { type: 'text/csv' });
      mockBulkImportService.createUploadSession.mockReturnValue(
        of({ jobId: 'job-new', uploadUrl: '/upload/job-new' } as CreateUploadSessionResponse),
      );
      mockBulkImportService.uploadFile.mockReturnValue(new Subject());

      fixture.detectChanges(); // ngOnInit -> upload state; job() stays null
      component.onFileSelected(file);

      expect(mockBulkImportService.createUploadSession).toHaveBeenCalledWith({
        domainType: 'CATALOG', fileName: 'new.csv', fileSize: file.size,
      });
      expect(component.job()).toMatchObject({ jobId: 'job-new', status: 'UPLOADING', fileName: 'new.csv' });
      expect(component.state()).toBe('uploading');
    });

    it('merges the new session into the already-tracked job when job() is non-null', () => {
      const file = new File(['b'], 'new2.csv', { type: 'text/csv' });
      component.job.set(buildJob('PROCESSING', { fileName: 'old.csv' }));
      mockBulkImportService.createUploadSession.mockReturnValue(
        of({ jobId: 'job-new2', uploadUrl: '/upload/job-new2' } as CreateUploadSessionResponse),
      );

      component.onFileSelected(file);

      expect(component.job()).toMatchObject({
        jobId: 'job-new2', domainType: 'CATALOG', status: 'UPLOADING', fileName: 'new2.csv',
      });
    });

    it('sets a page-level error when creating the upload session fails (ADR-0031: state before errorKey)', () => {
      const file = new File(['c'], 'fail.csv', { type: 'text/csv' });
      mockBulkImportService.createUploadSession.mockReturnValue(throwError(() => new Error('boom')));

      const callOrder: string[] = [];
      const originalStateSet = component.state.set.bind(component.state);
      vi.spyOn(component.state, 'set').mockImplementation(value => {
        callOrder.push('state');
        originalStateSet(value);
      });
      const originalErrorKeySet = component.errorKey.set.bind(component.errorKey);
      vi.spyOn(component.errorKey, 'set').mockImplementation(value => {
        callOrder.push('errorKey');
        originalErrorKeySet(value);
      });

      component.onFileSelected(file);

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('BULK_IMPORT.WIZARD.ERROR.CREATE_SESSION');
      // 'loading' (startUpload) then 'error' (subscribe error handler) — state always precedes errorKey.
      expect(callOrder).toEqual(['state', 'state', 'errorKey']);
    });
  });

  describe('uploadToSession progress/error', () => {
    it('updates progress on next emissions from the upload stream', () => {
      const file = new File(['d'], 'progress.csv', { type: 'text/csv' });
      const upload$ = new Subject<number>();
      mockBulkImportService.createUploadSession.mockReturnValue(
        of({ jobId: 'job-p', uploadUrl: '/upload/job-p' } as CreateUploadSessionResponse),
      );
      mockBulkImportService.uploadFile.mockReturnValue(upload$);

      fixture.detectChanges();
      component.onFileSelected(file);
      upload$.next(42);

      expect(component.uploadProgress()).toBe(42);
      expect(component.state()).toBe('uploading');
    });

    it('sets a page-level error when the upload stream errors', () => {
      const file = new File(['e'], 'upload-fail.csv', { type: 'text/csv' });
      mockBulkImportService.createUploadSession.mockReturnValue(
        of({ jobId: 'job-e', uploadUrl: '/upload/job-e' } as CreateUploadSessionResponse),
      );
      mockBulkImportService.uploadFile.mockReturnValue(throwError(() => new Error('upload boom')));

      fixture.detectChanges();
      component.onFileSelected(file);

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('BULK_IMPORT.WIZARD.ERROR.UPLOAD');
    });
  });

  describe('cancelUpload', () => {
    it('aborts the in-flight upload subscription so late progress emissions are ignored', () => {
      const file = new File(['f'], 'abort.csv', { type: 'text/csv' });
      const upload$ = new Subject<number>();
      mockBulkImportService.createUploadSession.mockReturnValue(
        of({ jobId: 'job-f', uploadUrl: '/upload/job-f' } as CreateUploadSessionResponse),
      );
      mockBulkImportService.uploadFile.mockReturnValue(upload$);

      fixture.detectChanges();
      component.onFileSelected(file);
      component.cancelUpload();
      upload$.next(99);

      expect(component.uploadProgress()).toBe(0);
    });

    it('cancels the tracked job on the backend when a jobId exists', () => {
      component.job.set(buildJob('UPLOADING'));
      mockBulkImportService.cancelJob.mockReturnValue(of(undefined));

      component.cancelUpload();

      expect(mockBulkImportService.cancelJob).toHaveBeenCalledWith('job-001');
    });

    it('resets local upload state without calling the backend when there is no tracked job', () => {
      component.selectedFile.set(new File(['g'], 'x.csv'));
      component.uploadProgress.set(55);

      component.cancelUpload();

      expect(mockBulkImportService.cancelJob).not.toHaveBeenCalled();
      expect(component.state()).toBe('upload');
      expect(component.selectedFile()).toBeNull();
      expect(component.uploadProgress()).toBe(0);
    });
  });

  describe('polling (interval(3000))', () => {
    it('polls back into uploading state when the job status regresses to UPLOADING', () => {
      vi.useFakeTimers();
      const activeJob = buildJob('PROCESSING');
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(activeJob));
      mockBulkImportService.getJob.mockReturnValue(of(buildJob('UPLOADING')));

      fixture.detectChanges();
      vi.advanceTimersByTime(3000);

      expect(component.state()).toBe('uploading');
    });

    it('stops polling and loads mappings when the job reaches MAPPING_REVIEW', () => {
      vi.useFakeTimers();
      const activeJob = buildJob('PROCESSING');
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(activeJob));
      mockBulkImportService.getJob.mockReturnValue(of(buildJob('MAPPING_REVIEW')));
      mockBulkImportService.getColumnMappings.mockReturnValue(of([]));

      fixture.detectChanges();
      vi.advanceTimersByTime(3000);

      expect(mockBulkImportService.getColumnMappings).toHaveBeenCalledWith(activeJob.jobId);
      expect(component.state()).toBe('mapping');

      mockBulkImportService.getJob.mockClear();
      vi.advanceTimersByTime(3000);
      expect(mockBulkImportService.getJob).not.toHaveBeenCalled();
    });

    it('stops polling, clears progress, and returns to upload when the job resets to CREATED', () => {
      vi.useFakeTimers();
      const activeJob = buildJob('PROCESSING');
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(activeJob));
      mockBulkImportService.getJob.mockReturnValue(of(buildJob('CREATED')));

      fixture.detectChanges();
      component.uploadProgress.set(50);
      vi.advanceTimersByTime(3000);

      expect(component.state()).toBe('upload');
      expect(component.uploadProgress()).toBe(0);

      mockBulkImportService.getJob.mockClear();
      vi.advanceTimersByTime(3000);
      expect(mockBulkImportService.getJob).not.toHaveBeenCalled();
    });

    it('stops polling and loads audit records when the job reaches a terminal status', () => {
      vi.useFakeTimers();
      const activeJob = buildJob('PROCESSING');
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(activeJob));
      mockBulkImportService.getJob.mockReturnValue(of(buildJob('COMPLETED')));
      mockBulkImportService.listAuditRecords.mockReturnValue(of({ items: [], nextPageToken: null }));

      fixture.detectChanges();
      vi.advanceTimersByTime(3000);

      expect(mockBulkImportService.listAuditRecords).toHaveBeenCalledWith(activeJob.jobId, { reviewStatus: 'PENDING' });
      expect(component.state()).toBe('results');
    });

    it('sets a page-level error and stops polling when the poll request fails', () => {
      vi.useFakeTimers();
      const activeJob = buildJob('PROCESSING');
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(activeJob));
      mockBulkImportService.getJob.mockReturnValue(throwError(() => new Error('poll boom')));

      fixture.detectChanges();
      vi.advanceTimersByTime(3000);

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('BULK_IMPORT.WIZARD.ERROR.POLL');
    });
  });

  describe('loadMappings', () => {
    it('does not call the mappings service when the resumed job has no jobId (defensive guard)', () => {
      const job = buildJob('MAPPING_REVIEW', { jobId: '' });
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(job));

      fixture.detectChanges();

      expect(mockBulkImportService.getColumnMappings).not.toHaveBeenCalled();
    });

    it('sets a page-level error when loading mappings fails', () => {
      const job = buildJob('MAPPING_REVIEW');
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(job));
      mockBulkImportService.getColumnMappings.mockReturnValue(throwError(() => new Error('boom')));

      fixture.detectChanges();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('BULK_IMPORT.WIZARD.ERROR.LOAD_MAPPINGS');
    });
  });

  describe('onMappingApprove', () => {
    it('does nothing when there is no tracked job', () => {
      component.onMappingApprove([]);

      expect(mockBulkImportService.approveColumnMappings).not.toHaveBeenCalled();
    });

    it('polls for status after mappings are approved', () => {
      vi.useFakeTimers();
      component.job.set(buildJob('MAPPING_REVIEW'));
      mockBulkImportService.approveColumnMappings.mockReturnValue(of(undefined));
      mockBulkImportService.getJob.mockReturnValue(of(buildJob('PROCESSING')));

      const overrides: ColumnMappingOverride[] = [{ mappingId: 'm1', sourceColumn: 'sku', targetField: 'sku' }];
      component.onMappingApprove(overrides);

      expect(mockBulkImportService.approveColumnMappings).toHaveBeenCalledWith('job-001', { overrides });
      expect(component.state()).toBe('progress');

      vi.advanceTimersByTime(3000);
      expect(mockBulkImportService.getJob).toHaveBeenCalledWith('job-001');
    });

    it('sets a page-level error when approving mappings fails', () => {
      component.job.set(buildJob('MAPPING_REVIEW'));
      mockBulkImportService.approveColumnMappings.mockReturnValue(throwError(() => new Error('boom')));

      component.onMappingApprove([]);

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('BULK_IMPORT.WIZARD.ERROR.APPROVE_MAPPINGS');
    });
  });

  describe('retryJob', () => {
    it('does nothing when there is no tracked job', () => {
      component.retryJob();

      expect(mockBulkImportService.retryJob).not.toHaveBeenCalled();
    });

    it('re-checks the active job on success', () => {
      component.job.set(buildJob('FAILED'));
      mockBulkImportService.retryJob.mockReturnValue(of(undefined));
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(null));

      component.retryJob();

      expect(mockBulkImportService.retryJob).toHaveBeenCalledWith('job-001');
      expect(mockBulkImportService.getActiveJobForDomain).toHaveBeenCalledWith('CATALOG');
      expect(component.state()).toBe('upload');
    });

    it('sets a page-level error when retrying fails (ADR-0031: state before errorKey)', () => {
      component.job.set(buildJob('FAILED'));
      mockBulkImportService.retryJob.mockReturnValue(throwError(() => new Error('boom')));

      const callOrder: string[] = [];
      const originalStateSet = component.state.set.bind(component.state);
      vi.spyOn(component.state, 'set').mockImplementation(value => {
        callOrder.push('state');
        originalStateSet(value);
      });
      const originalErrorKeySet = component.errorKey.set.bind(component.errorKey);
      vi.spyOn(component.errorKey, 'set').mockImplementation(value => {
        callOrder.push('errorKey');
        originalErrorKeySet(value);
      });

      component.retryJob();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('BULK_IMPORT.WIZARD.ERROR.RETRY');
      expect(callOrder).toEqual(['state', 'errorKey']);
    });
  });
});
