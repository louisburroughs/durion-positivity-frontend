export interface PagedResponse<T> {
  items?: T[];
  content?: T[];
  pageNumber?: number;
  pageSize?: number;
  totalCount?: number;
  totalPages?: number;
  totalElements?: number;
}

export interface IngestionListFilters {
  eventType?: string;
  processingStatus?: string;
  idempotencyOutcome?: string;
  receivedAtFrom?: string;
  receivedAtTo?: string;
  eventId?: string;
  ingestionId?: string;
  domainKeyId?: string;
  organizationId?: string;
  invoiceId?: string;
}

export interface InvoicePaymentStatus {
  readonly invoiceId: string;
  readonly paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'UNKNOWN';
  readonly balanceDue: number;
  readonly totalAmount?: number;
  readonly paidAmount?: number;
  readonly currency?: string;
  readonly latestEventId?: string;
  readonly latestIngestionStatus?: string;
  readonly journalEntryId?: string;
  readonly ledgerTransactionId?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

export interface EventProcessingLogEntry {
  logId?: string;
  eventId?: string;
  step?: string;
  status?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  readonly timestamp?: string;
  message?: string;
}

export enum IngestionProcessingStatus {
  Received = 'RECEIVED',
  Processing = 'PROCESSING',
  Processed = 'PROCESSED',
  Failed = 'FAILED',
  Suspended = 'SUSPENDED',
  Rejected = 'REJECTED',
  Quarantined = 'QUARANTINED',
}

export enum IngestionIdempotencyOutcome {
  New = 'NEW',
  DuplicateIgnored = 'DUPLICATE_IGNORED',
  DuplicateConflict = 'DUPLICATE_CONFLICT',
}

export interface AccountingEventListItem {
  eventId: string;
  eventType: string;
  processingStatus: IngestionProcessingStatus;
  idempotencyOutcome?: IngestionIdempotencyOutcome;
  receivedAt?: string;
  processedAt?: string;
  journalEntryId?: string;
  ledgerTransactionId?: string;
  errorCode?: string;
  errorMessage?: string;
  domainKeyId?: string;
}

export interface AccountingEventDetail extends AccountingEventListItem {
  organizationId?: string;
  sourceSystem?: string;
  schemaVersion?: string;
  transactionDate?: string;
  payloadSummary?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

export interface EnvelopeFieldDefinition {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  example?: string;
}

export interface TraceabilityIdDefinition {
  name: string;
  type: string;
  description?: string;
  source?: string;
}

export interface EventEnvelopeExample {
  name: string;
  json: string;
}

export interface EventEnvelopeContract {
  contractVersion: string;
  identifierStrategy: string;
  fields: EnvelopeFieldDefinition[];
  traceabilityIds: TraceabilityIdDefinition[];
  processingStatuses: string[];
  idempotencyOutcomes: string[];
  examples?: EventEnvelopeExample[];
}

export interface AccountingEventSubmitRequest {
  eventId?: string;
  eventType: string;
  organizationId: string;
  sourceSystem?: string;
  transactionDate?: string;
  payload: Record<string, unknown>;
}

export interface IngestionSubmitForm {
  eventId: string;
  eventType: string;
  organizationId: string;
  sourceSystem?: string;
  transactionDate?: string;
  payload: string;
}

export interface IngestionSubmitOutcome {
  eventId?: string;
  status?: IngestionProcessingStatus;
  journalEntryId?: string;
  errorMessage?: string;
}

export enum RuleSetStatus {
  Draft = 'DRAFT',
  Published = 'PUBLISHED',
  Archived = 'ARCHIVED',
}

export interface PostingRuleVersion {
  versionId?: string;
  postingRuleSetId?: string;
  versionNumber?: number;
  state?: RuleSetStatus;
  rulesDefinition?: string;
  publishedAt?: string;
  publishedBy?: string;
  archivedAt?: string;
  archivedBy?: string;
}

export interface PostingRuleSet {
  postingRuleSetId?: string;
  name?: string;
  eventType?: string;
  description?: string;
  versions?: PostingRuleVersion[];
  createdAt?: string;
  createdBy?: string;
  modifiedAt?: string;
  modifiedBy?: string;
}

export interface PostingRuleSetListItem {
  postingRuleSetId?: string;
  name?: string;
  eventType?: string;
  latestVersionNumber?: number;
  latestState?: RuleSetStatus;
  updatedAt?: string;
  updatedBy?: string;
}

export interface PostingRuleSetCreateRequest {
  name: string;
  eventType: string;
  description?: string;
  rulesDefinition: string;
  createdBy: string;
}

export type PostingRuleSetUpdateRequest = PostingRuleSetCreateRequest;

export interface InvoiceApplication {
  invoiceId: string;
  amount: number;
}

export interface PaymentApplicationRequest {
  /** Path parameter in apply-payment API contract. */
  paymentId: string;
  applicationRequestId: string;
  applications: InvoiceApplication[];
}

export interface PaymentApplication {
  paymentId?: string;
  customerId?: string;
  currency?: string;
  totalAmount?: number;
  appliedAmount?: number;
  remainingAmount?: number;
  applicationRequestId?: string;
  customerCredit?: {
    creditId?: string;
    amount?: number;
    currency?: string;
  };
}

export interface CreditMemo {
  creditMemoId?: string;
  originalInvoiceId?: string;
  customerId?: string;
  creditAmount?: number;
  taxAmountReversed?: number;
  totalAmount?: number;
  reasonCode?: string;
  justificationNote?: string;
  status?: 'DRAFT' | 'POSTED' | 'APPLIED' | 'VOIDED';
  creationTimestamp?: string;
  postedTimestamp?: string;
  createdByUserId?: string;
  priorPeriodAdjustment?: boolean;
  originalPeriodId?: string;
  currency?: string;
  invoiceBalanceAfter?: number;
}

export interface CreditMemoCreateRequest {
  originalInvoiceId: string;
  customerId: string;
  creditAmount: number;
  reasonCode: string;
  justificationNote: string;
}

export interface CreditMemoListItem {
  creditMemoId?: string;
  originalInvoiceId?: string;
  customerId?: string;
  creditAmount?: number;
  totalAmount?: number;
  status?: 'DRAFT' | 'POSTED' | 'APPLIED' | 'VOIDED';
  creationTimestamp?: string;
}

export interface VendorBill {
  vendorBillId?: string;
  vendorId?: string;
  vendorName?: string;
  billNumber?: string;
  billDate?: string;
  dueDate?: string;
  totalAmount?: number;
  openAmount?: number;
  status?:
  | 'OPEN'
  | 'PENDING_RECEIPT_MATCH'
  | 'MATCH_EXCEPTION'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAID'
  | 'CANCELLED'
  | 'VOIDED';
}

export interface VendorPaymentRequest {
  vendorId: string;
  grossAmount: number;
  feeAmount?: number;
  netAmount?: number;
  currency: string;
  paymentRef: string;
  paymentMethod: 'ACH' | 'CHECK' | 'WIRE' | 'CREDIT_CARD' | 'OTHER';
  paymentSource?: string;
  memo?: string;
  allocations?: Array<{
    vendorBillId: string;
    amount: number;
  }>;
}

export interface VendorPaymentResult {
  paymentId?: string;
  paymentRef?: string;
  vendorId?: string;
  vendorName?: string;
  grossAmount?: number;
  feeAmount?: number;
  netAmount?: number;
  unappliedAmount?: number;
  currency?: string;
  status?:
  | 'INITIATED'
  | 'GATEWAY_PENDING'
  | 'GATEWAY_FAILED'
  | 'GATEWAY_SUCCEEDED'
  | 'GL_POST_PENDING'
  | 'GL_POSTED'
  | 'GL_POST_FAILED'
  | 'SETTLED';
  gatewayTransactionId?: string;
  gatewayTimestamp?: string;
  glJournalEntryId?: string;
  glPostedAt?: string;
  glPostError?: string;
  memo?: string;
  createdAt?: string;
  createdBy?: string;
  allocations?: Array<{
    vendorBillId?: string;
    amount?: number;
  }>;
}

export type VendorPaymentDetail = VendorPaymentResult;

export interface ReprocessRequest {
  justification: string;
}

export interface ReprocessJobStatus {
  jobId: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  startedAt?: string;
  finishedAt?: string;
  message?: string;
}

export interface ReprocessingAttemptHistory {
  attemptId?: string;
  eventId?: string;
  attemptedAt?: string;
  triggeredByUserId?: string;
  outcome?: 'SUCCESS' | 'FAILURE';
  outcomeDetails?: string;
  mappingVersionUsed?: string;
}
