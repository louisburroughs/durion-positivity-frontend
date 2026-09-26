import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkImportJobDetailPageComponent } from './bulk-import-job-detail-page.component';
import { BulkImportService } from '../../../../shared/bulk-import/services/bulk-import.service';
import { AuditRecordListResponse, BulkLoadJob, BulkLoadRecordAudit, CorrectionRejectedError } from '../../../../shared/bulk-import/models/bulk-import.models';
import { CorrectionSubmitEvent } from '../../../../shared/bulk-import/components/bulk-import-error-records-table/bulk-import-error-records-table.component';

const mockJob: BulkLoadJob = {
  jobId: 'job-001',
  domainType: 'INVENTORY',
  status: 'PROCESSING',
  fileName: 'test.csv',
  totalRows: 100,
  successCount: 80,
  failureCount: 20,
};

const mockAuditRecord: BulkLoadRecordAudit = {
  recordId: 'rec-001',
  jobId: 'job-001',
  entityType: 'INVENTORY',
  rowNumber: 1,
  reviewStatus: 'PENDING',
  reasonCodes: ['INVALID_SKU'],
  originalValues: { sku: 'BAD-SKU' },
};

describe('BulkImportJobDetailPageComponent', () => {
  let component: BulkImportJobDetailPageComponent;
  let fixture: ComponentFixture<BulkImportJobDetailPageComponent>;

  const mockService = {
    getJob: vi.fn(),
    listAuditRecords: vi.fn(),
    cancelJob: vi.fn(),
    retryJob: vi.fn(),
    submitCorrection: vi.fn(),
    downloadErrorReport: vi.fn(),
    createUploadSession: vi.fn(),
    listJobs: vi.fn(),
    getActiveJobForDomain: vi.fn(),
    getColumnMappings: vi.fn(),
    approveColumnMappings: vi.fn(),
    uploadFile: vi.fn(),
  };

  const mockRoute = {
    paramMap: of(convertToParamMap({ jobId: 'job-001' })),
  };

  beforeEach(async () => {
    mockService.getJob.mockReturnValue(of(mockJob));
    mockService.listAuditRecords.mockReturnValue(
      of({ items: [mockAuditRecord], nextPageToken: null } as AuditRecordListResponse),
    );

    await TestBed.configureTestingModule({
      imports: [BulkImportJobDetailPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BulkImportService, useValue: mockService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BulkImportJobDetailPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('loads job and audit records via reactive paramMap subscription', () => {
    expect(mockService.getJob).toHaveBeenCalledWith('job-001');
    expect(mockService.listAuditRecords).toHaveBeenCalledWith('job-001');
  });

  it('sets state to ready and populates job and audit records on success', () => {
    expect(component.state()).toBe('ready');
    expect(component.job()).toEqual(mockJob);
    expect(component.auditRecords().length).toBe(1);
  });

  it('sets state to error and errorKey on getJob failure (ADR-0031)', () => {
    mockService.getJob.mockReturnValue(throwError(() => new Error('fail')));
    component.loadDetail();
    fixture.detectChanges();
    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BULK_IMPORT.JOB_DETAIL.ERROR.LOAD');
  });

  it('sets state to error and errorKey on listAuditRecords failure (ADR-0031)', () => {
    mockService.getJob.mockReturnValue(of(mockJob));
    mockService.listAuditRecords.mockReturnValue(throwError(() => new Error('fail')));
    component.loadDetail();
    fixture.detectChanges();
    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BULK_IMPORT.JOB_DETAIL.ERROR.LOAD_AUDIT');
  });

  it('cancelJob calls service.cancelJob then reloads detail', () => {
    mockService.cancelJob.mockReturnValue(of(undefined));
    component.cancelJob();
    expect(mockService.cancelJob).toHaveBeenCalledWith('job-001');
    expect(mockService.getJob).toHaveBeenCalledTimes(2);
  });

  it('cancelJob on error sets state to error first, then errorKey (ADR-0031)', () => {
    mockService.cancelJob.mockReturnValue(throwError(() => new Error('fail')));
    component.cancelJob();
    fixture.detectChanges();
    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BULK_IMPORT.JOB_DETAIL.ERROR.CANCEL');
  });

  it('retryJob calls service.retryJob then reloads detail', () => {
    mockService.retryJob.mockReturnValue(of(undefined));
    component.retryJob();
    expect(mockService.retryJob).toHaveBeenCalledWith('job-001');
    expect(mockService.getJob).toHaveBeenCalledTimes(2);
  });

  it('retryJob on error sets state to error and correct errorKey (ADR-0031)', () => {
    mockService.retryJob.mockReturnValue(throwError(() => new Error('fail')));
    component.retryJob();
    fixture.detectChanges();
    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BULK_IMPORT.JOB_DETAIL.ERROR.RETRY');
  });

  it('onSubmitCorrection calls service.submitCorrection with correct arguments', () => {
    const event: CorrectionSubmitEvent = {
      record: mockAuditRecord,
      request: { correctedValues: { sku: 'GOOD-SKU' } },
    };
    mockService.submitCorrection.mockReturnValue(of(undefined));

    component.onSubmitCorrection(event);

    expect(mockService.submitCorrection).toHaveBeenCalledWith(
      'job-001',
      'rec-001',
      { correctedValues: { sku: 'GOOD-SKU' } },
    );
  });

  it('onSubmitCorrection removes recordId from correctionPending after success', () => {
    const event: CorrectionSubmitEvent = {
      record: mockAuditRecord,
      request: { correctedValues: { sku: 'GOOD-SKU' } },
    };
    mockService.submitCorrection.mockReturnValue(of(undefined));

    component.onSubmitCorrection(event);

    expect(component.isCorrectionPending('rec-001')).toBe(false);
  });

  it('onSubmitCorrection re-reads the audit record list on success instead of splicing the narrow response (issue #376)', () => {
    const event: CorrectionSubmitEvent = {
      record: mockAuditRecord,
      request: { correctedValues: { sku: 'GOOD-SKU' } },
    };
    mockService.submitCorrection.mockReturnValue(of(undefined));
    const correctedRecord: BulkLoadRecordAudit = { ...mockAuditRecord, reviewStatus: 'APPROVED' };
    mockService.listAuditRecords.mockReturnValue(
      of({ items: [correctedRecord], nextPageToken: null } as AuditRecordListResponse),
    );

    component.onSubmitCorrection(event);

    expect(mockService.listAuditRecords).toHaveBeenCalledWith('job-001');
    expect(component.auditRecords()).toEqual([correctedRecord]);
  });

  it('onSubmitCorrection on error sets state to error first, then errorKey (ADR-0031)', () => {
    const event: CorrectionSubmitEvent = {
      record: mockAuditRecord,
      request: { correctedValues: { sku: 'GOOD-SKU' } },
    };
    mockService.submitCorrection.mockReturnValue(throwError(() => new Error('fail')));

    component.onSubmitCorrection(event);
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BULK_IMPORT.JOB_DETAIL.ERROR.CORRECTION');
  });

  it('keeps the record pending until the re-read it triggered settles (ADR-0063 §4-5)', () => {
    const event: CorrectionSubmitEvent = {
      record: mockAuditRecord,
      request: { correctedValues: { sku: 'GOOD-SKU' } },
    };
    const submit$ = new Subject<void>();
    const reload$ = new Subject<AuditRecordListResponse>();
    mockService.submitCorrection.mockReturnValue(submit$);
    mockService.listAuditRecords.mockReturnValue(reload$);

    component.onSubmitCorrection(event);
    expect(component.isCorrectionPending('rec-001')).toBe(true);

    submit$.next(undefined);
    submit$.complete();
    // The re-read has started but not landed: still pending.
    expect(mockService.listAuditRecords).toHaveBeenCalledWith('job-001');
    expect(component.isCorrectionPending('rec-001')).toBe(true);

    const correctedRecord: BulkLoadRecordAudit = { ...mockAuditRecord, reviewStatus: 'APPROVED' };
    reload$.next({ items: [correctedRecord], nextPageToken: null });
    reload$.complete();

    expect(component.isCorrectionPending('rec-001')).toBe(false);
    expect(component.auditRecords()).toEqual([correctedRecord]);
    expect(component.state()).toBe('ready');
  });

  it('settles the pending flag when the re-read itself fails', () => {
    const event: CorrectionSubmitEvent = {
      record: mockAuditRecord,
      request: { correctedValues: { sku: 'GOOD-SKU' } },
    };
    const submit$ = new Subject<void>();
    const reload$ = new Subject<AuditRecordListResponse>();
    mockService.submitCorrection.mockReturnValue(submit$);
    mockService.listAuditRecords.mockReturnValue(reload$);

    component.onSubmitCorrection(event);
    submit$.next(undefined);
    submit$.complete();
    expect(component.isCorrectionPending('rec-001')).toBe(true);

    reload$.error(new Error('re-read failed'));

    expect(component.isCorrectionPending('rec-001')).toBe(false);
    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BULK_IMPORT.JOB_DETAIL.ERROR.LOAD_AUDIT');

    // Corrections are blocked: the error-records table (and its stale rows) never render
    // while state is 'error' (ADR-0064 §1-2) — the failed re-read never looks like success.
    fixture.detectChanges();
    const table = fixture.nativeElement.querySelector('app-bulk-import-error-records-table');
    expect(table).toBeNull();

    // A retry (re-running the same load the page uses on entry) recovers.
    mockService.getJob.mockReturnValue(of(mockJob));
    mockService.listAuditRecords.mockReturnValue(
      of({ items: [mockAuditRecord], nextPageToken: null } as AuditRecordListResponse),
    );
    component.loadDetail();
    fixture.detectChanges();

    expect(component.state()).toBe('ready');
    expect(component.errorKey()).toBeNull();
    expect(fixture.nativeElement.querySelector('app-bulk-import-error-records-table')).not.toBeNull();
  });

  it('a REJECTED correction surfaces the localized correction error, never the server rejectionReason text, and releases the pending flag (Copilot #4105840870)', () => {
    const event: CorrectionSubmitEvent = {
      record: mockAuditRecord,
      request: { correctedValues: { sku: 'GOOD-SKU' } },
    };
    mockService.submitCorrection.mockReturnValue(
      throwError(() => new CorrectionRejectedError('sku already assigned to another record')),
    );

    component.onSubmitCorrection(event);
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BULK_IMPORT.JOB_DETAIL.ERROR.CORRECTION');
    expect(component.errorKey()).not.toContain('sku already assigned');
    expect(component.isCorrectionPending('rec-001')).toBe(false);
  });

  it('ignores a stale re-read result when a newer correction reload has already landed', () => {
    const record2: BulkLoadRecordAudit = {
      recordId: 'rec-002', jobId: 'job-001', entityType: 'INVENTORY',
      rowNumber: 2, reviewStatus: 'PENDING', reasonCodes: ['INVALID_SKU'],
      originalValues: { sku: 'ALSO-BAD-SKU' },
    };
    const submitA$ = new Subject<void>();
    const submitB$ = new Subject<void>();
    const reloadA$ = new Subject<AuditRecordListResponse>();
    const reloadB$ = new Subject<AuditRecordListResponse>();
    mockService.submitCorrection.mockReturnValueOnce(submitA$).mockReturnValueOnce(submitB$);
    mockService.listAuditRecords.mockReturnValueOnce(reloadA$).mockReturnValueOnce(reloadB$);

    component.onSubmitCorrection({ record: mockAuditRecord, request: { correctedValues: { sku: 'A' } } });
    submitA$.next(undefined);
    submitA$.complete(); // issues reloadA, the soon-to-be-stale reload

    component.onSubmitCorrection({ record: record2, request: { correctedValues: { sku: 'B' } } });
    submitB$.next(undefined);
    submitB$.complete(); // issues reloadB, the current reload

    const afterB: BulkLoadRecordAudit = { ...record2, reviewStatus: 'APPROVED' };
    reloadB$.next({ items: [afterB], nextPageToken: null });
    reloadB$.complete();
    expect(component.auditRecords()).toEqual([afterB]);

    const afterA: BulkLoadRecordAudit = { ...mockAuditRecord, reviewStatus: 'APPROVED' };
    reloadA$.next({ items: [afterA], nextPageToken: null });
    reloadA$.complete();

    expect(component.auditRecords()).toEqual([afterB]);
    expect(component.isCorrectionPending('rec-001')).toBe(false);
    expect(component.isCorrectionPending('rec-002')).toBe(false);
  });

  it('getFieldKeys returns the keys from originalValues', () => {
    const keys = component.getFieldKeys(mockAuditRecord);
    expect(keys).toEqual(['sku']);
  });

  describe('downloadErrorReport() [durion-positivity-backend#2216 precedent, issue #350]', () => {
    it('calls service.downloadErrorReport with the jobId', () => {
      mockService.downloadErrorReport.mockReturnValue(of(undefined));

      component.downloadErrorReport();

      expect(mockService.downloadErrorReport).toHaveBeenCalledWith('job-001');
    });

    it('a failed download surfaces a per-action error and keeps the job (and its controls) on screen', () => {
      mockService.downloadErrorReport.mockReturnValue(throwError(() => new Error('download failed')));
      const stateBefore = component.state();

      component.downloadErrorReport();
      fixture.detectChanges();

      expect(component.state()).toBe(stateBefore);
      expect(component.errorKey()).toBeNull();
      expect(component.downloadErrorKey()).toBe('BULK_IMPORT.JOB_DETAIL.ERROR.DOWNLOAD');
    });

    it('clears a download error when the job detail (re)loads', () => {
      mockService.downloadErrorReport.mockReturnValue(throwError(() => new Error('download failed')));
      component.downloadErrorReport();
      expect(component.downloadErrorKey()).toBe('BULK_IMPORT.JOB_DETAIL.ERROR.DOWNLOAD');

      component.loadDetail();

      expect(component.downloadErrorKey()).toBeNull();
    });

    it('clears the previous download error when a download is retried', () => {
      mockService.downloadErrorReport.mockReturnValueOnce(throwError(() => new Error('download failed')));
      component.downloadErrorReport();
      mockService.downloadErrorReport.mockReturnValueOnce(of(undefined));

      component.downloadErrorReport();

      expect(component.downloadErrorKey()).toBeNull();
    });
  });
});
