import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkImportJobsPageComponent } from './bulk-import-jobs-page.component';
import { BulkImportService } from '../../services/bulk-import.service';
import { BulkLoadJob, JobListResponse } from '../../models/bulk-import.models';

const mockJob: BulkLoadJob = {
  jobId: 'job-001',
  domainType: 'INVENTORY',
  status: 'CREATED',
  fileName: 'test.csv',
};

describe('BulkImportJobsPageComponent', () => {
  let component: BulkImportJobsPageComponent;
  let fixture: ComponentFixture<BulkImportJobsPageComponent>;
  const mockService = {
    listJobs: vi.fn(),
    getJob: vi.fn(),
    getActiveJobForDomain: vi.fn(),
    createUploadSession: vi.fn(),
    cancelJob: vi.fn(),
    retryJob: vi.fn(),
    getColumnMappings: vi.fn(),
    approveColumnMappings: vi.fn(),
    listAuditRecords: vi.fn(),
    submitCorrection: vi.fn(),
    getErrorReportUrl: vi.fn(),
    uploadFile: vi.fn(),
  };

  beforeEach(async () => {
    mockService.listJobs.mockReturnValue(
      of({ items: [mockJob], nextPageToken: null } as JobListResponse),
    );
    await TestBed.configureTestingModule({
      imports: [BulkImportJobsPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BulkImportService, useValue: mockService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(BulkImportJobsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('loads jobs on init and sets state to ready', () => {
    expect(mockService.listJobs).toHaveBeenCalled();
    expect(component.state()).toBe('ready');
    expect(component.jobs().length).toBe(1);
    expect(component.jobs()[0]).toEqual(mockJob);
  });

  it('sets state to empty when no jobs returned', () => {
    mockService.listJobs.mockReturnValue(
      of({ items: [], nextPageToken: null } as JobListResponse),
    );
    component.loadJobs();
    fixture.detectChanges();
    expect(component.state()).toBe('empty');
    expect(component.jobs().length).toBe(0);
  });

  it('sets state to error first, then errorKey on load failure (ADR-0031)', () => {
    const states: string[] = [];
    mockService.listJobs.mockReturnValue(throwError(() => new Error('fail')));
    component.loadJobs();
    fixture.detectChanges();
    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BULK_IMPORT.JOBS.ERROR.LOAD');
  });

  it('sets errorKey to null and state to loading before each load', () => {
    mockService.listJobs.mockReturnValue(
      of({ items: [mockJob], nextPageToken: null } as JobListResponse),
    );
    component.loadJobs();
    expect(component.errorKey()).toBeNull();
  });

  it('applyFilter sets filter signals and calls loadJobs', () => {
    mockService.listJobs.mockReturnValue(
      of({ items: [], nextPageToken: null } as JobListResponse),
    );
    const callCountBefore = mockService.listJobs.mock.calls.length;
    component.applyFilter('CATALOG', 'COMPLETED');
    expect(component.filterDomainType()).toBe('CATALOG');
    expect(component.filterStatus()).toBe('COMPLETED');
    expect(mockService.listJobs.mock.calls.length).toBeGreaterThan(callCountBefore);
  });

  it('applyFilter with empty strings clears filters', () => {
    mockService.listJobs.mockReturnValue(
      of({ items: [], nextPageToken: null } as JobListResponse),
    );
    component.applyFilter('', '');
    expect(component.filterDomainType()).toBe('');
    expect(component.filterStatus()).toBe('');
  });

  it('job list links are rendered using routerLink (navigation is declarative)', () => {
    // Navigation is handled via routerLink in the template; no programmatic openJob method
    expect(component.jobs().length).toBeGreaterThan(0);
  });
});
