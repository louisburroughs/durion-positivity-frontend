import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryBulkImportPageComponent } from './inventory-bulk-import-page.component';
import { BulkImportService } from '../../../bulk-import/services/bulk-import.service';
import { BulkLoadJob } from '../../../bulk-import/models/bulk-import.models';

const mockActiveJob: BulkLoadJob = {
  jobId: 'job-001',
  domainType: 'INVENTORY',
  status: 'PROCESSING',
  fileName: 'test.csv',
};

const mockConflictJob: BulkLoadJob = {
  jobId: 'job-conflict',
  domainType: 'LOCATION',
  status: 'PROCESSING',
  fileName: 'locations.csv',
};

describe('InventoryBulkImportPageComponent', () => {
  let component: InventoryBulkImportPageComponent;
  let fixture: ComponentFixture<InventoryBulkImportPageComponent>;

  const mockBulkImportService = {
    getActiveJobForDomain: vi.fn(),
    getJob: vi.fn(),
    createUploadSession: vi.fn(),
    uploadFile: vi.fn(),
    getColumnMappings: vi.fn(),
    approveColumnMappings: vi.fn(),
    cancelJob: vi.fn(),
    retryJob: vi.fn(),
    listAuditRecords: vi.fn(),
    submitCorrection: vi.fn(),
    getErrorReportUrl: vi.fn(),
    listJobs: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(null));

    await TestBed.configureTestingModule({
      imports: [InventoryBulkImportPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BulkImportService, useValue: mockBulkImportService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InventoryBulkImportPageComponent);
    component = fixture.componentInstance;
    // detectChanges is intentionally NOT called here — each test sets mocks then calls it
  });

  afterEach(() => {
    vi.clearAllMocks();
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
    expect(mockBulkImportService.getActiveJobForDomain).toHaveBeenCalledWith('INVENTORY');
    expect(component.state()).toBe('upload');
  });

  it('transitions to conflict state when an active job for a different domain exists', () => {
    mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(mockConflictJob));
    fixture.detectChanges();
    expect(component.state()).toBe('conflict');
    expect(component.conflictJob()).toEqual(mockConflictJob);
  });

  it('resumes to progress state when active job is in PROCESSING status', () => {
    mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(mockActiveJob));
    mockBulkImportService.getJob.mockReturnValue(of(mockActiveJob));
    fixture.detectChanges();
    expect(component.state()).toBe('progress');
  });

  it('transitions to error state when getActiveJobForDomain fails (ADR-0031)', () => {
    mockBulkImportService.getActiveJobForDomain.mockReturnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();
    expect(component.state()).toBe('error');
    expect(component.errorKey()).not.toBeNull();
    expect(component.errorKey()).toBe('BULK_IMPORT.WIZARD.ERROR.LOAD');
  });

  it('sets state to error when polling fails', async () => {
    vi.useFakeTimers();
    try {
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(mockActiveJob));
      mockBulkImportService.getJob.mockReturnValue(throwError(() => new Error('poll fail')));

      fixture.detectChanges();
      expect(component.state()).toBe('progress');

      await vi.advanceTimersByTimeAsync(3100);
      fixture.detectChanges();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('BULK_IMPORT.WIZARD.ERROR.POLL');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe.skip('F-09 remaining wizard page specs (pending)', () => {
  it('CatalogBulkImportPageComponent — same pattern as InventoryBulkImportPageComponent');
  it('LocationBulkImportPageComponent — same pattern as InventoryBulkImportPageComponent');
  it('CustomerBulkImportPageComponent — same pattern as InventoryBulkImportPageComponent');
  it('PeopleBulkImportPageComponent — same pattern as InventoryBulkImportPageComponent');
  it('PriceBulkImportPageComponent — same pattern as InventoryBulkImportPageComponent');
  it('VehicleInventoryBulkImportPageComponent — same pattern as InventoryBulkImportPageComponent');
  it('VehicleFitmentBulkImportPageComponent — same pattern as InventoryBulkImportPageComponent');
});
