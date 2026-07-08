import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Upload } from 'tus-js-client';
import {
  BulkLoadJobsAPIService,
  ColumnMappingAPIService,
  ReviewQueueAPIService,
} from '@durion-sdk/bulk-loader';
import type { AuditRecordResponse, BulkLoadJobCreateRequest, BulkLoadJobResponse } from '@durion-sdk/bulk-loader';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';
import {
  ACTIVE_JOB_STATUSES,
  ApproveColumnMappingsRequest,
  AuditRecordFilterParams,
  AuditRecordListResponse,
  BulkLoadColumnMapping,
  BulkLoadJob,
  BulkLoadRecordAudit,
  CreateUploadSessionRequest,
  CreateUploadSessionResponse,
  DomainType,
  JobFilterParams,
  JobListResponse,
  SubmitCorrectionRequest,
} from '../models/bulk-import.models';

type ApiDomainType =
  | 'CATALOG_PRODUCT'
  | 'INVENTORY_STOCK_COUNT'
  | 'LOCATION'
  | 'CUSTOMER'
  | 'PERSON'
  | 'BASE_PRICE'
  | 'VEHICLE'
  | 'VEHICLE_FITMENT';

interface ApiAuditRecord {
  id: string;
  jobId: string;
  entityType: string;
  entityId?: string;
  rowNumber: number;
  reviewStatus: string;
  reasonCodes: string;
  originalValues: string;
  createdAt?: string;
}

const FRONTEND_TO_API_DOMAIN_TYPE: Record<DomainType, ApiDomainType> = {
  CATALOG: 'CATALOG_PRODUCT',
  INVENTORY: 'INVENTORY_STOCK_COUNT',
  LOCATION: 'LOCATION',
  CUSTOMER: 'CUSTOMER',
  PEOPLE: 'PERSON',
  PRICE: 'BASE_PRICE',
  VEHICLE_INVENTORY: 'VEHICLE',
  VEHICLE_FITMENT: 'VEHICLE_FITMENT',
};

const API_TO_FRONTEND_DOMAIN_TYPE: Record<ApiDomainType, DomainType> = {
  CATALOG_PRODUCT: 'CATALOG',
  INVENTORY_STOCK_COUNT: 'INVENTORY',
  LOCATION: 'LOCATION',
  CUSTOMER: 'CUSTOMER',
  PERSON: 'PEOPLE',
  BASE_PRICE: 'PRICE',
  VEHICLE: 'VEHICLE_INVENTORY',
  VEHICLE_FITMENT: 'VEHICLE_FITMENT',
};

@Injectable({ providedIn: 'root' })
export class BulkImportService {
  private readonly api = inject(ApiBaseService);
  private readonly auth = inject(AuthService);
  private readonly bulkLoadJobsService = inject(BulkLoadJobsAPIService);
  private readonly columnMappingService = inject(ColumnMappingAPIService);
  private readonly reviewQueueService = inject(ReviewQueueAPIService);

  createUploadSession(request: CreateUploadSessionRequest): Observable<CreateUploadSessionResponse> {
    return this.bulkLoadJobsService
      .createJob(this.toCreateJobRequest(request))
      .pipe(map(job => ({
        jobId: job.id ?? '',
        uploadUrl: this.buildTusUploadEndpoint(job.id ?? ''),
      })));
  }

  getJob(jobId: string): Observable<BulkLoadJob> {
    return this.bulkLoadJobsService
      .getJob(jobId)
      .pipe(map(job => this.toBulkLoadJob(job)));
  }

  getActiveJobForDomain(domainType: DomainType): Observable<BulkLoadJob | null> {
    return this.listJobs().pipe(
      map(result => {
        const activeJobs = result.items.filter(job => ACTIVE_JOB_STATUSES.includes(job.status));

        return activeJobs.find(job => job.domainType === domainType) ?? activeJobs[0] ?? null;
      }),
    );
  }

  getActiveJobDomains(): Observable<Set<DomainType>> {
    return this.listJobs().pipe(
      map(result => new Set(
        result.items
          .filter(job => ACTIVE_JOB_STATUSES.includes(job.status))
          .map(job => job.domainType),
      )),
    );
  }

  listJobs(filters?: JobFilterParams): Observable<JobListResponse> {
    return this.bulkLoadJobsService
      .listJobs({ size: filters?.pageSize ?? 20 })
      .pipe(map(page => ({
        items: this.applyJobFilters((page.content ?? []).map(job => this.toBulkLoadJob(job)), filters),
        nextPageToken: null,
      })));
  }

  getTusUploadUrl(jobId: string): string {
    return this.buildTusUploadEndpoint(jobId);
  }

  getColumnMappings(jobId: string): Observable<BulkLoadColumnMapping[]> {
    return this.columnMappingService
      .getMappings(jobId)
      .pipe(map(mappings => mappings.map(mapping => ({
        mappingId: mapping.id ?? '',
        jobId: mapping.jobId ?? '',
        sourceColumn: mapping.sourceColumn ?? '',
        targetField: mapping.targetField ?? '',
        confidence: mapping.confidence ?? 0,
        overriddenByUser: mapping.overriddenByUser ?? false,
      }))));
  }

  approveColumnMappings(jobId: string, request: ApproveColumnMappingsRequest): Observable<void> {
    return this.columnMappingService.approveMappings(jobId, {
      mappings: request.overrides.map(override => ({
        mappingId: override.mappingId,
        sourceColumn: override.sourceColumn,
        targetField: override.targetField,
      })),
    }).pipe(map(() => undefined as void));
  }

  cancelJob(jobId: string): Observable<void> {
    return this.bulkLoadJobsService.cancelJob(jobId).pipe(map(() => undefined as void));
  }

  retryJob(jobId: string): Observable<void> {
    return this.bulkLoadJobsService.retryJob(jobId).pipe(map(() => undefined as void));
  }

  listAuditRecords(jobId: string, _filters?: AuditRecordFilterParams): Observable<AuditRecordListResponse> {
    return this.reviewQueueService.getAuditRecords(jobId).pipe(
      map(records => ({
        items: records.map(record => this.toAuditRecord(record)),
        nextPageToken: null,
      })),
    );
  }

  submitCorrection(
    jobId: string,
    recordId: string,
    request: SubmitCorrectionRequest,
  ): Observable<BulkLoadRecordAudit> {
    return this.api.put<ApiAuditRecord>(
      `/bulk-loader/v1/bulk-jobs/${encodeURIComponent(jobId)}/audit/${encodeURIComponent(recordId)}/correction`,
      request,
    ).pipe(map(record => this.toAuditRecord(record)));
  }

  /** Returns the API URL for downloading the error report CSV. */
  getErrorReportUrl(jobId: string): string {
    return `/api/bulk-loader/v1/bulk-jobs/${encodeURIComponent(jobId)}/error-report`;
  }

  /**
   * Uploads a file using the backend's tus creation endpoint for resumable transfers.
   * Returns an Observable<number> emitting upload progress (0-100), completing on success.
   */
  uploadFile(uploadUrl: string, file: File): Observable<number> {
    return new Observable<number>(observer => {
      // tus-js-client resolves the creation response's Location header via
      // `new URL(location, endpoint)`, which throws when the endpoint is a
      // bare path like `/api/...` and the backend sends a relative Location.
      const endpoint = new URL(uploadUrl, window.location.origin).toString();

      // Tracks whether the upload reached a terminal state (success/error) so
      // the teardown below only terminates genuinely cancelled uploads.
      let isSettled = false;

      const upload = new Upload(file, {
        endpoint,
        metadata: {
          filename: file.name,
        },
        removeFingerprintOnSuccess: true,
        retryDelays: [0, 1000, 3000, 5000],
        // tus-js-client issues its own XHRs, bypassing authInterceptor, so the
        // gateway rejects /bulk-loader/** with 401 unless the JWT is attached
        // here. Read the token per request so retries pick up a refreshed one.
        onBeforeRequest: req => {
          const token = this.auth.accessToken();
          if (token) {
            req.setHeader('Authorization', `Bearer ${token}`);
          }
        },
        onProgress: (bytesSent, bytesTotal) => {
          if (bytesTotal > 0) {
            observer.next(Math.round((bytesSent / bytesTotal) * 100));
          }
        },
        onSuccess: () => {
          isSettled = true;
          observer.next(100);
          observer.complete();
        },
        onError: error => {
          isSettled = true;
          observer.error(error);
        },
      });

      let isDisposed = false;

      void upload.findPreviousUploads()
        .then(previousUploads => {
          if (isDisposed) {
            return;
          }

          const resumable = previousUploads.find(prev => this.isTrustedUploadUrl(prev.uploadUrl));
          if (resumable) {
            upload.resumeFromPreviousUpload(resumable);
          }

          upload.start();
        })
        .catch(() => {
          if (!isDisposed) {
            upload.start();
          }
        });

      return () => {
        isDisposed = true;
        // Teardown also runs after complete/error; only an unsettled upload
        // is a cancellation that should delete the partial upload server-side.
        if (!isSettled) {
          upload.abort(true).catch(() => {
            // Best-effort cleanup; a failed DELETE must not become an
            // unhandled rejection.
          });
        }
      };
    });
  }

  private applyJobFilters(items: BulkLoadJob[], filters?: JobFilterParams): BulkLoadJob[] {
    return items.filter(job => {
      if (filters?.domainType && job.domainType !== filters.domainType) {
        return false;
      }

      if (filters?.status && job.status !== filters.status) {
        return false;
      }

      return true;
    });
  }

  private toCreateJobRequest(request: CreateUploadSessionRequest): BulkLoadJobCreateRequest {
    return {
      domainType: FRONTEND_TO_API_DOMAIN_TYPE[request.domainType] as BulkLoadJobCreateRequest['domainType'],
      fileName: request.fileName,
      ...(request.locationId ? { locationId: request.locationId } : {}),
    };
  }

  private toBulkLoadJob(job: BulkLoadJobResponse): BulkLoadJob {
    return {
      jobId: job.id ?? '',
      domainType: API_TO_FRONTEND_DOMAIN_TYPE[(job.domainType ?? '') as ApiDomainType],
      status: this.toJobStatus(job.status ?? ''),
      fileName: job.fileName ?? '',
      locationId: job.locationId ?? undefined,
      totalRows: job.totalRows ?? undefined,
      processedRows: job.processedRows ?? undefined,
      successCount: job.successCount ?? undefined,
      failureCount: job.failureCount ?? undefined,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };
  }

  private toAuditRecord(record: AuditRecordResponse | ApiAuditRecord): BulkLoadRecordAudit {
    return {
      recordId: record.id ?? '',
      jobId: record.jobId ?? '',
      entityType: record.entityType ?? '',
      entityId: record.entityId,
      rowNumber: record.rowNumber ?? 0,
      reviewStatus: this.toReviewStatus(record.reviewStatus ?? ''),
      reasonCodes: this.parseReasonCodes(record.reasonCodes ?? ''),
      originalValues: this.parseOriginalValues(record.originalValues ?? ''),
      createdAt: record.createdAt,
    };
  }

  private buildTusUploadEndpoint(jobId: string): string {
    return `${environment.apiBaseUrl}/bulk-loader/v1/bulk-jobs/${encodeURIComponent(jobId)}/tus`;
  }

  /**
   * Accepts only stored tus upload URLs on our API origin under the apiBaseUrl
   * path. tus-js-client replays stored URLs verbatim and onBeforeRequest
   * attaches the JWT to whatever URL it targets, so a foreign or relative URL
   * persisted in localStorage must never be resumed. The check is anchored to
   * apiBaseUrl (not the creation endpoint's full path) because the backend
   * issues upload URLs under /bulk-loader/v1/tus/, outside the endpoint path.
   */
  private isTrustedUploadUrl(uploadUrl: string | null | undefined): boolean {
    if (!uploadUrl) {
      return false;
    }

    const apiBase = new URL(environment.apiBaseUrl, window.location.origin);
    const apiPathPrefix = apiBase.pathname.endsWith('/') ? apiBase.pathname : `${apiBase.pathname}/`;

    try {
      const url = new URL(uploadUrl);
      return url.origin === apiBase.origin && url.pathname.startsWith(apiPathPrefix);
    } catch {
      return false;
    }
  }

  private toJobStatus(status: string): BulkLoadJob['status'] {
    return status as BulkLoadJob['status'];
  }

  private toReviewStatus(reviewStatus: string): BulkLoadRecordAudit['reviewStatus'] {
    return reviewStatus as BulkLoadRecordAudit['reviewStatus'];
  }

  private parseReasonCodes(reasonCodes: string): string[] {
    if (!reasonCodes) {
      return [];
    }

    return reasonCodes
      .split(',')
      .map(code => code.trim())
      .filter(code => code.length > 0);
  }

  private parseOriginalValues(originalValues: string): Record<string, unknown> {
    if (!originalValues) {
      return {};
    }

    try {
      const parsed = JSON.parse(originalValues) as unknown;
      return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
}
