import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, Subscription, switchMap } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { BulkImportService } from '../../../bulk-import/services/bulk-import.service';
import {
  ACTIVE_JOB_STATUSES,
  ApproveColumnMappingsRequest,
  BulkLoadColumnMapping,
  BulkLoadJob,
  BulkLoadRecordAudit,
  ColumnMappingOverride,
  DomainType,
} from '../../../bulk-import/models/bulk-import.models';
import { BulkImportColumnMappingTableComponent } from '../../../bulk-import/components/bulk-import-column-mapping-table/bulk-import-column-mapping-table.component';
import { BulkImportErrorRecordsTableComponent, CorrectionSubmitEvent } from '../../../bulk-import/components/bulk-import-error-records-table/bulk-import-error-records-table.component';
import { BulkImportFileDropComponent } from '../../../bulk-import/components/bulk-import-file-drop/bulk-import-file-drop.component';
import { BulkImportProgressStepperComponent } from '../../../bulk-import/components/bulk-import-progress-stepper/bulk-import-progress-stepper.component';
import { BulkImportResultsSummaryComponent } from '../../../bulk-import/components/bulk-import-results-summary/bulk-import-results-summary.component';
import { BulkImportUploadProgressComponent } from '../../../bulk-import/components/bulk-import-upload-progress/bulk-import-upload-progress.component';

type WizardState = 'idle' | 'loading' | 'upload' | 'uploading' | 'mapping' | 'progress' | 'results' | 'conflict' | 'error';

const DOMAIN_TYPE: DomainType = 'CATALOG';

@Component({
  selector: 'app-catalog-bulk-import-page',
  templateUrl: './catalog-bulk-import-page.component.html',
  styleUrl: './catalog-bulk-import-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, TranslatePipe,
    BulkImportFileDropComponent, BulkImportUploadProgressComponent,
    BulkImportColumnMappingTableComponent, BulkImportProgressStepperComponent,
    BulkImportResultsSummaryComponent, BulkImportErrorRecordsTableComponent,
  ],
})
export class CatalogBulkImportPageComponent implements OnInit, OnDestroy {
  private readonly service = inject(BulkImportService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<WizardState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly job = signal<BulkLoadJob | null>(null);
  readonly mappings = signal<BulkLoadColumnMapping[]>([]);
  readonly auditRecords = signal<BulkLoadRecordAudit[]>([]);
  readonly selectedFile = signal<File | null>(null);
  readonly uploadProgress = signal<number>(0);
  readonly conflictJob = signal<BulkLoadJob | null>(null);
  readonly correctionPendingIds = signal<Set<string>>(new Set());

  readonly domainType = DOMAIN_TYPE;
  private uploadAbort: (() => void) | null = null;
  private pollSubscription: Subscription | null = null;

  ngOnInit(): void {
    this.checkActiveJob();
  }

  private checkActiveJob(): void {
    this.state.set('loading');
    this.service.getActiveJobForDomain(DOMAIN_TYPE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: activeJob => {
          if (!activeJob) {
            this.state.set('upload');
          } else if (activeJob.domainType === DOMAIN_TYPE) {
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
      case 'UPLOADING':
        this.uploadProgress.set(0);
        this.state.set('upload');
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
    this.service.createUploadSession({ domainType: DOMAIN_TYPE, fileName: file.name, fileSize: file.size })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: session => {
          this.job.update(j => j
            ? { ...j, jobId: session.jobId, status: 'UPLOADING', fileName: file.name }
            : { jobId: session.jobId, domainType: DOMAIN_TYPE, status: 'UPLOADING', fileName: file.name });
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
          if (updated.status === 'MAPPING_REVIEW') {
            this.stopPolling();
            this.loadMappings();
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
          this.state.set('results');
        },
        error: () => {
          this.state.set('results');
        },
      });
  }

  onSubmitCorrection(event: CorrectionSubmitEvent): void {
    const jobId = this.job()?.jobId;
    if (!jobId) { return; }
    this.correctionPendingIds.update(s => { const n = new Set(s); n.add(event.record.recordId); return n; });
    this.service.submitCorrection(jobId, event.record.recordId, event.request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.auditRecords.update(records => records.map(r => r.recordId === updated.recordId ? updated : r));
          this.correctionPendingIds.update(s => { const n = new Set(s); n.delete(event.record.recordId); return n; });
        },
        error: () => {
          this.correctionPendingIds.update(s => { const n = new Set(s); n.delete(event.record.recordId); return n; });
        },
      });
  }

  downloadErrorReport(): void {
    const jobId = this.job()?.jobId;
    if (jobId) { window.open(this.service.getErrorReportUrl(jobId), '_blank', 'noopener,noreferrer'); }
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
