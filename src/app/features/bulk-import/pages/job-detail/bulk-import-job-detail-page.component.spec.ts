import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkImportJobDetailPageComponent } from './bulk-import-job-detail-page.component';
import { BulkImportService } from '../../services/bulk-import.service';
import { AuditRecordListResponse, BulkLoadJob, BulkLoadRecordAudit } from '../../models/bulk-import.models';
import { CorrectionSubmitEvent } from '../../components/bulk-import-error-records-table/bulk-import-error-records-table.component';

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
    getErrorReportUrl: vi.fn(),
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
    const updatedRecord: BulkLoadRecordAudit = { ...mockAuditRecord, reviewStatus: 'APPROVED' };
    mockService.submitCorrection.mockReturnValue(of(updatedRecord));

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
    const updatedRecord: BulkLoadRecordAudit = { ...mockAuditRecord, reviewStatus: 'APPROVED' };
    mockService.submitCorrection.mockReturnValue(of(updatedRecord));

    component.onSubmitCorrection(event);

    expect(component.isCorrectionPending('rec-001')).toBe(false);
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

  it('getFieldKeys returns the keys from originalValues', () => {
    const keys = component.getFieldKeys(mockAuditRecord);
    expect(keys).toEqual(['sku']);
  });
});
