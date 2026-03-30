export interface AuditEventFilter {
  fromDate: string;
  toDate: string;
  actorId?: string;
  workorderId?: string;
  movementId?: string;
  productId?: string;
  sku?: string;
  eventType?: string;
  aggregateId?: string;
  correlationId?: string;
  reasonCode?: string;
  locationIds?: string[];
  pageToken?: string;
}

export interface AuditEventDetail {
  eventId: string;
  eventType: string;
  aggregateId: string;
  actorId: string;
  timestamp: string;
  location?: string;
  payload?: unknown;
  pricingProof?: unknown;
}

export interface AuditEventPageResponse {
  items: AuditEventDetail[];
  nextPageToken: string | null;
}

export interface AuditExportJob {
  jobId: string;
  status: string;
  downloadUrl?: string;
  readonly completedAt?: string;
}
