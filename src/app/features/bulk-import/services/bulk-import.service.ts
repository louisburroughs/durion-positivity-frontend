import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
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

@Injectable({ providedIn: 'root' })
export class BulkImportService {
  private readonly api = inject(ApiBaseService);

  createUploadSession(request: CreateUploadSessionRequest): Observable<CreateUploadSessionResponse> {
    return this.api.post<CreateUploadSessionResponse>('/bulk-loader/v1/jobs', request);
  }

  getJob(jobId: string): Observable<BulkLoadJob> {
    return this.api.get<BulkLoadJob>(`/bulk-loader/v1/jobs/${encodeURIComponent(jobId)}`);
  }

  getActiveJobForDomain(domainType: DomainType): Observable<BulkLoadJob | null> {
    const params = new HttpParams()
      .set('domainType', domainType)
      .set('activeOnly', 'true');
    return this.api.get<BulkLoadJob | null>('/bulk-loader/v1/jobs/active', params);
  }

  listJobs(filters?: JobFilterParams): Observable<JobListResponse> {
    let params = new HttpParams();
    if (filters?.domainType) { params = params.set('domainType', filters.domainType); }
    if (filters?.status) { params = params.set('status', filters.status); }
    if (filters?.pageSize != null) { params = params.set('pageSize', filters.pageSize.toString()); }
    if (filters?.pageToken) { params = params.set('pageToken', filters.pageToken); }
    return this.api.get<JobListResponse>('/bulk-loader/v1/jobs', params);
  }

  getColumnMappings(jobId: string): Observable<BulkLoadColumnMapping[]> {
    return this.api.get<BulkLoadColumnMapping[]>(
      `/bulk-loader/v1/jobs/${encodeURIComponent(jobId)}/mappings`,
    );
  }

  approveColumnMappings(jobId: string, request: ApproveColumnMappingsRequest): Observable<void> {
    return this.api.put<void>(
      `/bulk-loader/v1/jobs/${encodeURIComponent(jobId)}/mappings/approve`,
      request,
    );
  }

  cancelJob(jobId: string): Observable<void> {
    return this.api.post<void>(
      `/bulk-loader/v1/jobs/${encodeURIComponent(jobId)}/cancel`,
      {},
    );
  }

  retryJob(jobId: string): Observable<void> {
    return this.api.post<void>(
      `/bulk-loader/v1/jobs/${encodeURIComponent(jobId)}/retry`,
      {},
    );
  }

  listAuditRecords(jobId: string, filters?: AuditRecordFilterParams): Observable<AuditRecordListResponse> {
    let params = new HttpParams();
    if (filters?.reviewStatus) { params = params.set('reviewStatus', filters.reviewStatus); }
    if (filters?.pageSize != null) { params = params.set('pageSize', filters.pageSize.toString()); }
    if (filters?.pageToken) { params = params.set('pageToken', filters.pageToken); }
    return this.api.get<AuditRecordListResponse>(
      `/bulk-loader/v1/jobs/${encodeURIComponent(jobId)}/audit`,
      params,
    );
  }

  submitCorrection(
    jobId: string,
    recordId: string,
    request: SubmitCorrectionRequest,
  ): Observable<BulkLoadRecordAudit> {
    return this.api.put<BulkLoadRecordAudit>(
      `/bulk-loader/v1/jobs/${encodeURIComponent(jobId)}/audit/${encodeURIComponent(recordId)}/correction`,
      request,
    );
  }

  /** Returns the API URL for downloading the error report CSV. */
  getErrorReportUrl(jobId: string): string {
    return `/api/bulk-loader/v1/jobs/${encodeURIComponent(jobId)}/error-report`;
  }

  /**
   * Uploads a file to the given uploadUrl using XMLHttpRequest with progress tracking.
   * Returns an Observable<number> emitting upload progress (0-100), completing on success.
   * Assumption: the backend accepts a multipart/form-data POST with the file in a field named "file".
   * Replace with tus-js-client when the backend confirms tus.io protocol support.
   */
  uploadFile(uploadUrl: string, file: File): Observable<number> {
    return new Observable<number>(observer => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          observer.next(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          observer.next(100);
          observer.complete();
        } else {
          observer.error(new Error(`Upload failed: ${xhr.status}`));
        }
      };

      xhr.onerror = () => observer.error(new Error('Upload network error'));

      xhr.open('POST', uploadUrl);
      xhr.send(formData);

      return () => xhr.abort();
    });
  }
}
