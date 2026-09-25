export type DomainType =
  | 'CATALOG'
  | 'INVENTORY'
  | 'LOCATION'
  | 'CUSTOMER'
  | 'PEOPLE'
  | 'PRICE'
  | 'VEHICLE_INVENTORY'
  | 'VEHICLE_FITMENT';

export type JobStatus =
  | 'CREATED'
  | 'UPLOADING'
  | 'DETECTING'
  | 'MAPPING_REVIEW'
  | 'DEDUP'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Active statuses - job is in-flight */
export const ACTIVE_JOB_STATUSES: JobStatus[] = [
  'CREATED', 'UPLOADING', 'DETECTING', 'MAPPING_REVIEW', 'DEDUP', 'PROCESSING',
];

export interface BulkLoadJob {
  jobId: string;
  domainType: DomainType;
  status: JobStatus;
  fileName: string;
  locationId?: string;
  totalRows?: number;
  processedRows?: number;
  successCount?: number;
  failureCount?: number;
  /** @serverGenerated */
  readonly createdAt?: string;
  readonly startedAt?: string;
  /** @serverGenerated */
  readonly completedAt?: string;
}

export interface BulkLoadColumnMapping {
  mappingId: string;
  jobId: string;
  sourceColumn: string;
  targetField: string;
  confidence: number; // 0..1
  overriddenByUser: boolean;
}

export const DO_NOT_IMPORT_TARGET_FIELD = 'DO_NOT_IMPORT';

export interface BulkLoadRecordAudit {
  recordId: string;
  jobId: string;
  entityType: string;
  entityId?: string;
  rowNumber: number;
  reviewStatus: ReviewStatus;
  reasonCodes: string[];
  originalValues: Record<string, unknown>;
  correctedValues?: Record<string, unknown>;
  /** @serverGenerated */
  readonly createdAt?: string;
}

export interface CreateUploadSessionRequest {
  domainType: DomainType;
  fileName: string;
  fileSize: number;
  locationId?: string;
}

export interface CreateUploadSessionResponse {
  jobId: string;
  uploadUrl: string;
}

export interface ColumnMappingOverride {
  mappingId: string;
  sourceColumn: string;
  targetField: string;
}

export interface ApproveColumnMappingsRequest {
  overrides: ColumnMappingOverride[];
}

export interface JobFilterParams {
  domainType?: DomainType;
  status?: JobStatus;
  pageSize?: number;
  pageToken?: string;
}

export interface JobListResponse {
  items: BulkLoadJob[];
  nextPageToken: string | null;
}

export interface AuditRecordFilterParams {
  reviewStatus?: ReviewStatus;
  pageSize?: number;
  pageToken?: string;
}

export interface AuditRecordListResponse {
  items: BulkLoadRecordAudit[];
  nextPageToken: string | null;
}

export interface SubmitCorrectionRequest {
  correctedValues: Record<string, unknown>;
}

/**
 * Thrown by `BulkImportService.submitCorrection()` when the backend's
 * `CorrectionResultDto.status` is `REJECTED`. This is a normal HTTP 200, not an SDK
 * throw, so the service routes it through the Observable's error channel itself
 * (issue #376 follow-up). `rejectionReason` is the server's free-text explanation;
 * it is carried here for logging/future reason-code mapping only and must never be
 * rendered to the user as-is (ADR-0064 §4-5) — surface the rejection through the
 * caller's existing localized correction-error key instead.
 */
export class CorrectionRejectedError extends Error {
  constructor(readonly rejectionReason?: string) {
    // i18n-ignore-next-line: internal Error.message for logs/devtools only — never rendered; callers translate their own localized error key.
    super('Correction was rejected by the server');
    this.name = 'CorrectionRejectedError';
  }
}
