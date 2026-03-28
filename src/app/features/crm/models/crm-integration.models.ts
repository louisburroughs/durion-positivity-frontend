/**
 * CRM Integration models — inbound accounting event processing logs & suspense.
 * Source of truth: durion-positivity-backend/pos-accounting/openapi.yaml
 */

export type AccountingEventStatus = 'PENDING' | 'PROCESSED' | 'SUSPENDED' | 'FAILED';

export interface AccountingEventListItem {
  eventId: string;
  eventType: string;
  processingStatus: AccountingEventStatus;
  receivedAt: string;
  organizationId?: string;
}

export interface AccountingEventListResponse {
  items: AccountingEventListItem[];
  totalCount: number;
}

export interface AccountingEventResponse {
  eventId: string;
  eventType: string;
  processingStatus: AccountingEventStatus;
  receivedAt: string;
  organizationId?: string;
  payload?: Record<string, unknown>;
}

export interface ReprocessingAttemptHistoryResponse {
  attemptId: string;
  eventId: string;
  attemptedAt: string;
  outcome: string;
  errorMessage?: string;
}
