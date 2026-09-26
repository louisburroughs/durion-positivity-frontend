import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, from, map, of, switchMap, throwError } from 'rxjs';
import { Upload } from 'tus-js-client';
import {
  BulkLoadJobsAPIService,
  ColumnMappingAPIService,
  Configuration as BulkLoaderConfiguration,
  ReviewQueueAPIService,
} from '@durion-sdk/bulk-loader';
import type {
  ApiError,
  AuditRecordResponse,
  BulkLoadJobCreateRequest,
  BulkLoadJobResponse,
  CorrectionResultDto,
} from '@durion-sdk/bulk-loader';
import { AuthService } from '../../../core/services/auth.service';
import {
  ACTIVE_JOB_STATUSES,
  ApproveColumnMappingsRequest,
  AuditRecordFilterParams,
  AuditRecordListResponse,
  BulkLoadColumnMapping,
  BulkLoadJob,
  BulkLoadRecordAudit,
  CorrectionRejectedError,
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
  private readonly auth = inject(AuthService);
  private readonly configuration = inject(BulkLoaderConfiguration);
  private readonly bulkLoadJobsService = inject(BulkLoadJobsAPIService);
  private readonly columnMappingService = inject(ColumnMappingAPIService);
  private readonly reviewQueueService = inject(ReviewQueueAPIService);

  createUploadSession(request: CreateUploadSessionRequest): Observable<CreateUploadSessionResponse> {
    return this.bulkLoadJobsService
      .createBulkLoadJob(this.toCreateJobRequest(request))
      .pipe(map(job => ({
        jobId: job.id ?? '',
        uploadUrl: this.buildTusUploadEndpoint(job.id ?? ''),
      })));
  }

  getJob(jobId: string): Observable<BulkLoadJob> {
    return this.bulkLoadJobsService
      .getBulkLoadJob(jobId)
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
      .listBulkLoadJobs(0, filters?.pageSize ?? 20)
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
      .getColumnMappings(jobId)
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
    return this.columnMappingService.approveColumnMappings(jobId, {
      mappings: request.overrides.map(override => ({
        mappingId: override.mappingId,
        sourceColumn: override.sourceColumn,
        targetField: override.targetField,
      })),
    }).pipe(map(() => undefined as void));
  }

  cancelJob(jobId: string): Observable<void> {
    return this.bulkLoadJobsService.cancelBulkLoadJob(jobId).pipe(map(() => undefined as void));
  }

  retryJob(jobId: string): Observable<void> {
    return this.bulkLoadJobsService.retryBulkLoadJob(jobId).pipe(map(() => undefined as void));
  }

  listAuditRecords(jobId: string, _filters?: AuditRecordFilterParams): Observable<AuditRecordListResponse> {
    return this.reviewQueueService.listAuditRecords(jobId).pipe(
      map(records => ({
        items: records.map(record => this.toAuditRecord(record)),
        nextPageToken: null,
      })),
    );
  }

  /**
   * (issue #376, durion-positivity-backend#2205) `ReviewQueueAPIService.submitSingleCorrection()`'s
   * `CorrectionResultDto` response now also carries `entityType`, `rowNumber`, `reviewStatus`,
   * `reasonCodes`, `originalValues`, `correctedValues`, and `createdAt` — but every one of them
   * is nullable (a reload miss on the server still returns `null`). When they are all present the
   * caller gets back a complete `BulkLoadRecordAudit` to splice in place; when any is `null` this
   * returns `null` and callers keep the existing re-read fallback.
   *
   * A `REJECTED` result is a normal HTTP 200 — it is not thrown by the SDK — so it is
   * routed through this Observable's error channel here as a `CorrectionRejectedError`.
   * Callers rely on their existing localized correction-error handling for this; the
   * server's free-text `rejectionReason` is carried on the error for logging/future
   * reason-code mapping only and must never be rendered as-is (ADR-0064 §4-5).
   */
  submitCorrection(
    jobId: string,
    recordId: string,
    request: SubmitCorrectionRequest,
  ): Observable<BulkLoadRecordAudit | null> {
    const correctedData: Record<string, string> = {};
    for (const [field, value] of Object.entries(request.correctedValues)) {
      correctedData[field] = String(value);
    }

    return this.reviewQueueService
      .submitSingleCorrection(jobId, { auditRecordId: recordId, correctedData })
      .pipe(
        switchMap(result => result.status === 'REJECTED'
          ? throwError(() => new CorrectionRejectedError(result.rejectionReason ?? undefined))
          : of(this.toCorrectionResultRow(jobId, result))),
      );
  }

  private toCorrectionResultRow(jobId: string, result: CorrectionResultDto): BulkLoadRecordAudit | null {
    if (
      result.entityType == null ||
      result.rowNumber == null ||
      result.reviewStatus == null ||
      result.reasonCodes == null ||
      result.originalValues == null
    ) {
      return null;
    }

    return {
      recordId: result.auditRecordId,
      jobId,
      entityType: result.entityType,
      entityId: result.entityId ?? undefined,
      rowNumber: result.rowNumber,
      reviewStatus: this.toReviewStatus(result.reviewStatus),
      reasonCodes: this.parseReasonCodes(result.reasonCodes),
      originalValues: this.parseOriginalValues(result.originalValues),
      correctedValues: result.correctedValues != null ? this.parseOriginalValues(result.correctedValues) : undefined,
      createdAt: result.createdAt ?? undefined,
    };
  }

  /**
   * Downloads the job's error report CSV via `ReviewQueueAPIService.downloadErrorReport()`
   * (`responseType: 'blob'`), replacing the bare `/api/bulk-loader/v1/bulk-jobs/{jobId}/error-report`
   * URL a caller previously `window.open()`-ed directly — that request carried no bearer
   * token and was rejected by the gateway for a real session. Follows the same authenticated
   * object-URL download pattern as `accounting.service.ts#downloadExport` (deferred revoke,
   * SEC-08 / ADR-0065 §3): a 404 also arrives as a `Blob` (`responseType: 'blob'` applies to
   * the error body too), so it is read and JSON-parsed to pull out the backend `ApiError.code`
   * only — the server's free-text `message` is never forwarded to the UI (ADR-0064). Unlike
   * `downloadReportExport`, this operation's generated `httpHeaderAccept` option is typed
   * `'application/json'` only — the controller presets `text/csv` regardless (#2216 precedent),
   * so the option is omitted rather than cast to a value the type doesn't declare.
   */
  downloadErrorReport(jobId: string): Observable<void> {
    return this.reviewQueueService
      .downloadErrorReport(jobId)
      .pipe(
        map(blob => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `bulk-import-error-report-${jobId}.csv`;
          document.body.append(a);
          a.click();
          a.remove();
          // Deferred revoke: revoking synchronously can invalidate the anchor's
          // in-flight read of the blob URL it just triggered (ADR-0065 §3 / SEC-08).
          setTimeout(() => URL.revokeObjectURL(url));
        }),
        catchError(error => this.mapErrorReportDownloadError(error)),
      );
  }

  private mapErrorReportDownloadError(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse && error.error instanceof Blob) {
      return from((error.error as Blob).text()).pipe(
        catchError(() => of('')),
        switchMap(text => throwError(() => new Error(this.formatErrorReportDownloadError(text)))),
      );
    }
    return throwError(() => error);
  }

  private formatErrorReportDownloadError(rawBody: string): string {
    try {
      const body = JSON.parse(rawBody) as Partial<ApiError>;
      return typeof body.code === 'string' ? `ERROR_REPORT_DOWNLOAD_FAILED:${body.code}` : 'ERROR_REPORT_DOWNLOAD_FAILED';
    } catch {
      return 'ERROR_REPORT_DOWNLOAD_FAILED';
    }
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
      // `document.baseURI` (not `window.location.origin`, SDK-11) supplies the
      // absolute base the same way the browser resolves any relative URL.
      const endpoint = new URL(uploadUrl, document.baseURI).toString();

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

  private toAuditRecord(record: AuditRecordResponse): BulkLoadRecordAudit {
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
    return `${this.configuration.basePath}/v1/bulk-jobs/${encodeURIComponent(jobId)}/tus`;
  }

  /**
   * Accepts only stored tus upload URLs under the bulk-loader module's own base path
   * (the injected `BulkLoaderConfiguration.basePath`, not `environment.apiBaseUrl` read
   * directly — SDK-06). tus-js-client replays stored URLs verbatim and onBeforeRequest
   * attaches the JWT to whatever URL it targets, so a foreign or relative URL persisted
   * in localStorage must never be resumed. The check is anchored to the module base
   * (not the creation endpoint's full path) because the backend issues upload URLs
   * under /bulk-loader/v1/tus/, outside the endpoint path.
   */
  private isTrustedUploadUrl(uploadUrl: string | null | undefined): boolean {
    if (!uploadUrl) {
      return false;
    }

    const apiBase = new URL(this.configuration.basePath ?? '', document.baseURI);
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
