import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkImportService } from '../services/bulk-import.service';
import { BulkLoadJob, DomainType } from '../models/bulk-import.models';

type WizardComponentHarness = {
  state: () => string;
  errorKey: () => string | null;
  conflictJob: () => BulkLoadJob | null;
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

    it('resumes to upload state when active job is in UPLOADING status', () => {
      const activeJob = buildResumableJob(options.domainType, 'UPLOADING');
      mockBulkImportService.getActiveJobForDomain.mockReturnValue(of(activeJob));

      fixture.detectChanges();

      expect(component.state()).toBe('upload');
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
  });
}
