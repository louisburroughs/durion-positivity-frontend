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
  readonly createdAt?: string;
  readonly startedAt?: string;
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
