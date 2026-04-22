import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Upload } from 'tus-js-client';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { environment } from '../../../../environments/environment';
import {
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

interface ApiBulkLoadJob {
  id: string;
  locationId?: string | null;
  fileName: string;
  domainType: ApiDomainType;
  status: string;
  totalRows?: number | null;
  processedRows?: number | null;
  successCount?: number | null;
  failureCount?: number | null;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
}

interface ApiPage<T> {
  content: T[];
}

interface ApiColumnMapping {
  id: string;
  jobId: string;
  sourceColumn: string;
  targetField: string;
  confidence: number;
  overriddenByUser: boolean;
}

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

  createUploadSession(request: CreateUploadSessionRequest): Observable<CreateUploadSessionResponse> {
    return this.api
      .post<ApiBulkLoadJob>('/bulk-loader/v1/bulk-jobs', this.toCreateJobRequest(request))
      .pipe(map(job => ({
        jobId: job.id,
        uploadUrl: this.buildTusUploadEndpoint(job.id),
      })));
  }

  getJob(jobId: string): Observable<BulkLoadJob> {
    return this.api
      .get<ApiBulkLoadJob>(`/bulk-loader/v1/bulk-jobs/${encodeURIComponent(jobId)}`)
      .pipe(map(job => this.toBulkLoadJob(job)));
  }

  getActiveJobForDomain(domainType: DomainType): Observable<BulkLoadJob | null> {
    return this.listJobs().pipe(
      map(result => {
        const activeJobs = result.items.filter(job => job.status !== 'COMPLETED'
          && job.status !== 'FAILED'
          && job.status !== 'CANCELLED');

        return activeJobs.find(job => job.domainType === domainType) ?? activeJobs[0] ?? null;
      }),
    );
  }

  listJobs(filters?: JobFilterParams): Observable<JobListResponse> {
    let params = new HttpParams();
    if (filters?.pageSize != null) { params = params.set('pageSize', filters.pageSize.toString()); }
    return this.api
      .get<ApiPage<ApiBulkLoadJob>>('/bulk-loader/v1/bulk-jobs', params)
      .pipe(map(page => {
        let items = page.content.map(job => this.toBulkLoadJob(job));

        if (filters?.domainType) {
          items = items.filter(job => job.domainType === filters.domainType);
        }

        if (filters?.status) {
          items = items.filter(job => job.status === filters.status);
        }

        return {
          items,
          nextPageToken: null,
        };
      }));
  }

  getColumnMappings(jobId: string): Observable<BulkLoadColumnMapping[]> {
    return this.api
      .get<ApiColumnMapping[]>(`/bulk-loader/v1/bulk-jobs/${encodeURIComponent(jobId)}/mappings`)
      .pipe(map(mappings => mappings.map(mapping => ({
        mappingId: mapping.id,
        jobId: mapping.jobId,
        sourceColumn: mapping.sourceColumn,
        targetField: mapping.targetField,
        confidence: mapping.confidence,
        overriddenByUser: mapping.overriddenByUser,
      }))));
  }

  approveColumnMappings(jobId: string, request: ApproveColumnMappingsRequest): Observable<void> {
    return this.api.put<void>(
      `/bulk-loader/v1/bulk-jobs/${encodeURIComponent(jobId)}/mappings`,
      {
        mappings: request.overrides.map(override => ({
          mappingId: override.mappingId,
          sourceColumn: override.sourceColumn,
          targetField: override.targetField,
        })),
      },
    );
  }

  cancelJob(jobId: string): Observable<void> {
    return this.api.post<void>(
      `/bulk-loader/v1/bulk-jobs/${encodeURIComponent(jobId)}/cancel`,
      {},
    );
  }

  retryJob(jobId: string): Observable<void> {
    return this.api.post<void>(
      `/bulk-loader/v1/bulk-jobs/${encodeURIComponent(jobId)}/retry`,
      {},
    );
  }

  listAuditRecords(jobId: string, filters?: AuditRecordFilterParams): Observable<AuditRecordListResponse> {
    return this.api
      .get<ApiAuditRecord[]>(`/bulk-loader/v1/bulk-jobs/${encodeURIComponent(jobId)}/audit`)
      .pipe(map(records => {
        let items = records.map(record => this.toAuditRecord(record));

        if (filters?.reviewStatus) {
          items = items.filter(record => record.reviewStatus === filters.reviewStatus);
        }

        if (filters?.pageSize != null) {
          items = items.slice(0, filters.pageSize);
        }

        return {
          items,
          nextPageToken: null,
        };
      }));
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
      const upload = new Upload(file, {
        endpoint: uploadUrl,
        metadata: {
          filename: file.name,
        },
        removeFingerprintOnSuccess: true,
        retryDelays: [0, 1000, 3000, 5000],
        onProgress: (bytesSent, bytesTotal) => {
          if (bytesTotal > 0) {
            observer.next(Math.round((bytesSent / bytesTotal) * 100));
          }
        },
        onSuccess: () => {
          observer.next(100);
          observer.complete();
        },
        onError: error => {
          observer.error(error);
        },
      });

      upload.start();

      return () => {
        void upload.abort(true);
      };
    });
  }

  private toCreateJobRequest(request: CreateUploadSessionRequest): { domainType: ApiDomainType; fileName: string; locationId?: string } {
    return {
      domainType: FRONTEND_TO_API_DOMAIN_TYPE[request.domainType],
      fileName: request.fileName,
      ...(request.locationId ? { locationId: request.locationId } : {}),
    };
  }

  private toBulkLoadJob(job: ApiBulkLoadJob): BulkLoadJob {
    return {
      jobId: job.id,
      domainType: API_TO_FRONTEND_DOMAIN_TYPE[job.domainType],
      status: this.toJobStatus(job.status),
      fileName: job.fileName,
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

  private toAuditRecord(record: ApiAuditRecord): BulkLoadRecordAudit {
    return {
      recordId: record.id,
      jobId: record.jobId,
      entityType: record.entityType,
      entityId: record.entityId,
      rowNumber: record.rowNumber,
      reviewStatus: this.toReviewStatus(record.reviewStatus),
      reasonCodes: this.parseReasonCodes(record.reasonCodes),
      originalValues: this.parseOriginalValues(record.originalValues),
      createdAt: record.createdAt,
    };
  }

  private buildTusUploadEndpoint(jobId: string): string {
    return `${environment.apiBaseUrl}/bulk-loader/v1/bulk-jobs/${encodeURIComponent(jobId)}/tus`;
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
