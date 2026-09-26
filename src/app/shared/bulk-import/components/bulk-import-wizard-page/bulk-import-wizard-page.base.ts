import { DestroyRef, Directive, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, Subscription, switchMap } from 'rxjs';
import { BulkImportService } from '../../services/bulk-import.service';
import { BulkImportCorrectionReloader } from '../../services/bulk-import-correction-reloader';
import {
  ACTIVE_JOB_STATUSES,
  ApproveColumnMappingsRequest,
  BulkLoadColumnMapping,
  BulkLoadJob,
  BulkLoadRecordAudit,
  ColumnMappingOverride,
  DomainType,
} from '../../models/bulk-import.models';
import type { CorrectionSubmitEvent } from '../bulk-import-error-records-table/bulk-import-error-records-table.component';

export type BulkImportWizardState = 'idle' | 'loading' | 'upload' | 'uploading' | 'mapping' | 'progress' | 'results' | 'conflict' | 'error';

/**
 * Shared behaviour of every domain's bulk-import wizard page (upload → column
 * mapping → progress → results/corrections). The eight domain pages were
 * line-for-line copies differing only in their `DomainType`; each is now a thin
 * `@Component` subclass that sets {@link domainType} and supplies its own template.
 */
@Directive()
export abstract class BulkImportWizardPageBase implements OnInit, OnDestroy {
  private readonly service = inject(BulkImportService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<BulkImportWizardState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly job = signal<BulkLoadJob | null>(null);
  readonly mappings = signal<BulkLoadColumnMapping[]>([]);
  readonly auditRecords = signal<BulkLoadRecordAudit[]>([]);
  readonly selectedFile = signal<File | null>(null);
  readonly uploadProgress = signal<number>(0);
  readonly conflictJob = signal<BulkLoadJob | null>(null);
  readonly correctionPendingIds = signal<Set<string>>(new Set());
  readonly auditReadFailed = signal<boolean>(false);
  readonly auditErrorKey = signal<string | null>(null);
  readonly correctionErrorKey = signal<string | null>(null);
  private readonly correctionReloader = new BulkImportCorrectionReloader(this.correctionPendingIds);

  /** The bulk-loader domain this wizard imports into. */
  abstract readonly domainType: DomainType;
  private uploadAbort: (() => void) | null = null;
  private pollSubscription: Subscription | null = null;

  ngOnInit(): void {
    this.checkActiveJob();
  }

  private checkActiveJob(): void {
    this.state.set('loading');
    this.service.getActiveJobForDomain(this.domainType)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: activeJob => {
          if (!activeJob) {
            this.state.set('upload');
          } else if (activeJob.domainType === this.domainType) {
            this.job.set(activeJob);
            this.resumeToStep(activeJob);
          } else {
            this.conflictJob.set(activeJob);
            this.state.set('conflict');
          }
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('BULK_IMPORT.WIZARD.ERROR.LOAD');
        },
      });
  }

  private resumeToStep(job: BulkLoadJob): void {
    switch (job.status) {
      case 'CREATED':
        this.uploadProgress.set(0);
        this.state.set('upload');
        break;
      case 'UPLOADING':
        this.uploadProgress.set(0);
        this.selectedFile.set(null);
        this.state.set('uploading');
        this.startPolling();
        break;
      case 'DETECTING':
      case 'DEDUP':
      case 'PROCESSING':
        this.state.set('progress');
        this.startPolling();
        break;
      case 'MAPPING_REVIEW':
        this.loadMappings();
        break;
      case 'COMPLETED':
      case 'FAILED':
      case 'CANCELLED':
        this.loadAuditRecords();
        break;
    }
  }

  onFileSelected(file: File): void {
    this.selectedFile.set(file);
    this.startUpload(file);
  }

  private startUpload(file: File): void {
    const resumableJob = this.job();
    if (resumableJob && (resumableJob.status === 'CREATED' || resumableJob.status === 'UPLOADING')) {
      this.job.update(current => current ? { ...current, status: 'UPLOADING', fileName: file.name } : current);
      this.uploadToSession(this.service.getTusUploadUrl(resumableJob.jobId), file);
      return;
    }

    this.state.set('loading');
    this.service.createUploadSession({ domainType: this.domainType, fileName: file.name, fileSize: file.size })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: session => {
          this.job.update(j => j
            ? { ...j, jobId: session.jobId, status: 'UPLOADING', fileName: file.name }
            : { jobId: session.jobId, domainType: this.domainType, status: 'UPLOADING', fileName: file.name });
          this.uploadToSession(session.uploadUrl, file);
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('BULK_IMPORT.WIZARD.ERROR.CREATE_SESSION');
        },
      });
  }

  private uploadToSession(uploadUrl: string, file: File): void {
    this.state.set('uploading');
    this.uploadProgress.set(0);
    this.selectedFile.set(file);

    const uploadSub = this.service.uploadFile(uploadUrl, file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: progress => this.uploadProgress.set(progress),
        complete: () => this.pollForStatus(),
        error: () => {
          this.state.set('error');
          this.errorKey.set('BULK_IMPORT.WIZARD.ERROR.UPLOAD');
        },
      });

    this.uploadAbort = () => uploadSub.unsubscribe();
  }

  cancelUpload(): void {
    this.uploadAbort?.();
    this.uploadAbort = null;
    const jobId = this.job()?.jobId;
    if (jobId) {
      this.service.cancelJob(jobId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    }
    this.state.set('upload');
    this.selectedFile.set(null);
    this.uploadProgress.set(0);
  }

  private pollForStatus(): void {
    this.state.set('progress');
    this.startPolling();
  }

  private startPolling(): void {
    this.stopPolling();
    const jobId = this.job()?.jobId;
    if (!jobId) { return; }
    this.pollSubscription = interval(3000)
      .pipe(
        switchMap(() => this.service.getJob(jobId)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: updated => {
          this.job.set(updated);
          if (updated.status === 'UPLOADING') {
            this.state.set('uploading');
          } else if (updated.status === 'DETECTING' || updated.status === 'DEDUP' || updated.status === 'PROCESSING') {
            this.state.set('progress');
          } else if (updated.status === 'MAPPING_REVIEW') {
            this.stopPolling();
            this.loadMappings();
          } else if (updated.status === 'CREATED') {
            this.stopPolling();
            this.uploadProgress.set(0);
            this.state.set('upload');
          } else if (!ACTIVE_JOB_STATUSES.includes(updated.status)) {
            this.stopPolling();
            this.loadAuditRecords();
          }
        },
        error: () => {
          this.stopPolling();
          this.state.set('error');
          this.errorKey.set('BULK_IMPORT.WIZARD.ERROR.POLL');
        },
      });
  }

  private stopPolling(): void {
    this.pollSubscription?.unsubscribe();
    this.pollSubscription = null;
  }

  private loadMappings(): void {
    const jobId = this.job()?.jobId;
    if (!jobId) { return; }
    this.service.getColumnMappings(jobId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: mappings => {
          this.mappings.set(mappings);
          this.state.set('mapping');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('BULK_IMPORT.WIZARD.ERROR.LOAD_MAPPINGS');
        },
      });
  }

  onMappingApprove(overrides: ColumnMappingOverride[]): void {
    const jobId = this.job()?.jobId;
    if (!jobId) { return; }
    const req: ApproveColumnMappingsRequest = { overrides };
    this.service.approveColumnMappings(jobId, req)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.pollForStatus(),
        error: () => {
          this.state.set('error');
          this.errorKey.set('BULK_IMPORT.WIZARD.ERROR.APPROVE_MAPPINGS');
        },
      });
  }

  private loadAuditRecords(): void {
    const jobId = this.job()?.jobId;
    if (!jobId) { this.state.set('results'); return; }
    this.service.listAuditRecords(jobId, { reviewStatus: 'PENDING' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.auditRecords.set(result.items);
          this.auditReadFailed.set(false);
          this.auditErrorKey.set(null);
          this.state.set('results');
        },
        error: () => {
          this.auditReadFailed.set(true);
          this.auditErrorKey.set('BULK_IMPORT.WIZARD.ERROR.LOAD_RESULTS');
          this.state.set('results');
        },
      });
  }

  /** Re-issues the audit list read after a failed initial load or re-read (ADR-0064 §1-2). */
  retryAuditLoad(): void {
    this.loadAuditRecords();
  }

  onSubmitCorrection(event: CorrectionSubmitEvent): void {
    const jobId = this.job()?.jobId;
    if (!jobId) { return; }
    this.correctionErrorKey.set(null);
    this.correctionReloader.run(
      event.record.recordId,
      this.service.submitCorrection(jobId, event.record.recordId, event.request),
      {
        reload$: this.service.listAuditRecords(jobId, { reviewStatus: 'PENDING' }),
        onReloadSuccess: result => {
          this.auditRecords.set(result.items);
          this.auditReadFailed.set(false);
          this.auditErrorKey.set(null);
          this.state.set('results');
        },
        onReloadError: () => {
          // Keep the stale rows visible but read-only (ADR-0064): a failed re-read
          // must never look like a successful one.
          this.auditReadFailed.set(true);
          this.auditErrorKey.set('BULK_IMPORT.WIZARD.ERROR.LOAD_RESULTS');
          this.state.set('results');
        },
        onSubmitError: () => {
          // Never surface the server's rejectionReason text directly (ADR-0064 §4-5).
          this.correctionErrorKey.set('BULK_IMPORT.WIZARD.ERROR.CORRECTION');
        },
      },
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  /**
   * (durion-positivity-backend#2216 precedent, issue #350) A bare `window.open()` of the
   * legacy `/api/...` path sent no bearer token and was rejected by the gateway for a real
   * session; the download now goes through the authenticated SDK blob download instead.
   */
  downloadErrorReport(): void {
    const jobId = this.job()?.jobId;
    if (!jobId) { return; }
    this.correctionErrorKey.set(null);
    this.service.downloadErrorReport(jobId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.correctionErrorKey.set('BULK_IMPORT.WIZARD.ERROR.DOWNLOAD');
        },
      });
  }

  retryJob(): void {
    const jobId = this.job()?.jobId;
    if (!jobId) { return; }
    this.service.retryJob(jobId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.checkActiveJob(),
        error: () => {
          this.state.set('error');
          this.errorKey.set('BULK_IMPORT.WIZARD.ERROR.RETRY');
        },
      });
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }
}
