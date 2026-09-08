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
  eventReference?: string;
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

export type EventPayloadReferenceType =
  | 'INVOICE'
  | 'CUSTOMER'
  | 'ORGANIZATION'
  | 'LOCATION'
  | 'JOURNAL_ENTRY'
  | 'VENDOR'
  | 'VENDOR_BILL'
  /** Anything the backend adds that this build does not know about yet. */
  | 'UNKNOWN';

/** The reference types this build can label; anything else maps to 'UNKNOWN'. */
export const EVENT_PAYLOAD_REFERENCE_TYPES: readonly EventPayloadReferenceType[] = [
  'INVOICE',
  'CUSTOMER',
  'ORGANIZATION',
  'LOCATION',
  'JOURNAL_ENTRY',
  'VENDOR',
  'VENDOR_BILL',
  'UNKNOWN',
];

/**
 * Display projection of one reference value recognized inside an event payload.
 * The raw payload is kept verbatim for audit, so this is what the UI renders in
 * its place: `displayReference`/`displayName` are null when accounting cannot
 * resolve the reference, and are never the identifier rendered as text.
 */
export interface EventPayloadReference {
  /** JSON path the value was found at, e.g. "payload.invoiceId". */
  path: string;
  /** The value exactly as written in the payload. */
  rawValue: string;
  /** Set only when `rawValue` is a UUID. */
  id?: string | null;
  referenceType: EventPayloadReferenceType;
  /** Human-readable number, e.g. "INV-1787955433643-01a04a72". */
  displayReference?: string | null;
  /** Human-readable name of the referenced entity. */
  displayName?: string | null;
}

export interface AccountingEventDetail extends AccountingEventListItem {
  organizationId?: string;
  sourceSystem?: string;
  schemaVersion?: string;
  transactionDate?: string;
  payloadSummary?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  payloadReferences?: EventPayloadReference[];
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
  /** Human-readable memo number, e.g. "CM-202603-1". Shown instead of the UUID. */
  creditMemoReference?: string | null;
  originalInvoiceId?: string;
  /** Human-readable invoice number of the credited invoice. */
  originalInvoiceReference?: string | null;
  customerId?: string;
  /** Customer's display name; preferred over customerReference on screen. */
  customerDisplayName?: string | null;
  /** Human-readable customer number, used when no display name is available. */
  customerReference?: string | null;
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
  /** Human-readable memo number, e.g. "CM-202603-1". Shown instead of the UUID. */
  creditMemoReference?: string | null;
  originalInvoiceId?: string;
  /** Human-readable invoice number of the credited invoice. */
  originalInvoiceReference?: string | null;
  customerId?: string;
  /** Customer's display name; preferred over customerReference on screen. */
  customerDisplayName?: string | null;
  /** Human-readable customer number, used when no display name is available. */
  customerReference?: string | null;
  creditAmount?: number;
  totalAmount?: number;
  status?: 'DRAFT' | 'POSTED' | 'APPLIED' | 'VOIDED';
  creationTimestamp?: string;
}

/**
 * AP vendor directory entry (issue #816): the name-to-vendorId resolution
 * used by the vendor typeahead on the vendor-payment pages.
 */
export interface VendorDirectoryEntry {
  vendorId?: string;
  name?: string;
  vendorNumber?: string;
  status?: 'ACTIVE' | 'INACTIVE';
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

// CAP-316 — Location Labor & Overhead Cost Report (read-only)

export type LaborOverheadCostType = 'FIXED' | 'VARIABLE' | 'FIXED_IF_LOW_VOLUME';

export interface LaborOverheadReportLine {
  code: string;
  label: string;
  parentCode?: string;
  level: number;
  costType?: LaborOverheadCostType;
  isSubtotal: boolean;
  usdOnly: boolean;
  definition?: string;
  /** 12 monthly amounts, index 0 = January. */
  monthly: number[];
  ytd: number;
}

export interface LaborOverheadReport {
  locationId: string;
  locationLabel?: string;
  fiscalYear: number;
  asOfMonth: number;
  currency: string;
  localCurrencyPerUsd: number;
  averageRate: number;
  lines: LaborOverheadReportLine[];
}
