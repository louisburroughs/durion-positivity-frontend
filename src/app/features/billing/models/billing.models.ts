/**
 * Billing domain models.
 * Service contracts: CAP-007 (Stories 213–209)
 * Base URL: /billing (billing microservice)
 */

// ── Invoice status ────────────────────────────────────────────────────────────

export type InvoiceStatus = 'DRAFT' | 'PENDING_REVIEW' | 'ISSUED' | 'FINALIZED' | 'VOID' | 'CANCELLED';

// ── Invoice finder (search dropdown) ──────────────────────────────────────────

/**
 * Lightweight invoice finder row for the billing landing search dropdown.
 *
 * Rendered as three lines: customer name (primary), invoice number + status
 * (secondary) and human workorder number (tertiary).
 */
export interface InvoiceFinderItem {
  /** Invoice id used to launch the invoice-detail page. */
  id: string;
  /** Primary line — customer name. */
  primary: string;
  /** Secondary line — invoice number + status. */
  secondary: string;
  /** Tertiary line — workorder number. */
  tertiary?: string;
}

// ── Invoice line items ────────────────────────────────────────────────────────

export interface InvoiceLineItem {
  id: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  lineTotal?: number;
  type?: 'PART' | 'LABOR' | 'FEE' | 'TAX';
  itemType?: 'PART' | 'LABOR' | 'FEE' | 'TAX';
  taxCode?: string;
}

// ── Traceability links (Story 211) ───────────────────────────────────────────

export interface InvoiceTraceability {
  estimateId?: string;
  estimateNumber?: string;
  workorderId?: string;
  workorderNumber?: string;
  approvalId?: string;
  snapshotId?: string;
  snapshotVersion?: number;
  snapshotCapturedAt?: string;
  workorderCompletedAt?: string;
  generatedById?: string;
}

// ── Invoice adjustment (Story 210) ───────────────────────────────────────────

export interface InvoiceAdjustment {
  id: string;
  reasonCode: string;
  reason?: string;
  justification?: string;
  adjustmentType?: string;
  amount: number;
  appliedAt?: string;
  appliedBy?: string;
  adjustedAt?: string;
  adjustedBy?: string;
}

// ── Issuance policy (Story 209) ──────────────────────────────────────────────

export interface IssuanceBlocker {
  blockerId: string;
  description: string;
  severity: 'BLOCKING' | 'WARNING';
}

export interface IssuancePolicy {
  requiresElevation?: boolean;
  blockers?: IssuanceBlocker[];
  issuableNow?: boolean;
}

// ── Artifact (Story 209) ─────────────────────────────────────────────────────

export interface InvoiceArtifact {
  artifactRefId: string;
  fileName?: string;
  filename?: string;
  mimeType?: string;
  contentType?: string;
  /** @serverGenerated */
  readonly createdAt?: string;
}

export interface ArtifactDownloadToken {
  downloadToken: string;
  downloadUrl?: string;
  expiresAt?: string;
}

// ── Invoice detail (Stories 212, 211, 210, 209) ───────────────────────────────

export interface InvoiceDetail {
  invoiceId: string;
  invoiceNumber?: string;
  workOrderId?: string;
  workOrderNumber?: string;
  poNumber?: string;
  status: InvoiceStatus;
  subtotal?: number;
  taxAmount?: number;
  feeTotal?: number;
  discountAmount?: number;
  adjustmentTotal?: number;
  grandTotal?: number;
  currencyCode?: string;
  /** @serverGenerated */
  readonly createdAt?: string;
  /** @serverGenerated */
  readonly updatedAt?: string;
  /** @serverGenerated */
  readonly issuedAt?: string;
  issuedBy?: string;
  lineItems?: InvoiceLineItem[];
  adjustments?: InvoiceAdjustment[];
  traceability?: InvoiceTraceability;
  issuancePolicy?: IssuancePolicy;
}

// ── Create invoice draft (Story 213) ─────────────────────────────────────────

export interface CreateInvoiceDraftRequest {
  workOrderId: string;
}

export interface CreateInvoiceDraftResponse {
  invoiceId: string;
  status?: InvoiceStatus;
  workOrderId?: string;
}

// ── Issue invoice (Story 209) ─────────────────────────────────────────────────

export interface IssueInvoiceRequest {
  elevationToken?: string;
}

export interface ElevateRequest {
  /** Employee number of the approving manager. */
  managerEmployeeNumber: string;
  /** Invoice the elevation token will authorise. */
  invoiceId: string;
}

export interface ElevateResponse {
  elevationToken: string;
  expiresAt?: string;
}

// ── CAP-250: Payment flow ───────────────────────────────────────────────────

export type PaymentMethod = 'CARD' | 'CASH' | 'CHECK' | 'CREDIT_ACCOUNT';
export type PaymentStatus =
  | 'INITIATED'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'VOIDED'
  | 'REFUNDED'
  | 'FAILED';

export interface InitiatePaymentRequest {
  paymentMethod: PaymentMethod;
  amount: number;
  currency: string;
  paymentTokenRef?: string;
  authorityCode?: string;
  idempotencyKey?: string;
}

export interface PaymentTransactionRef {
  readonly paymentId: string;
  readonly invoiceId: string;
  readonly transactionId?: string;
  readonly authCode?: string;
  readonly status: PaymentStatus;
  readonly amount: number;
  readonly currency: string;
  /**
   * @serverGenerated - set by server; do not include in request payloads.
   */
  readonly createdAt?: string;
  /**
   * @serverGenerated - set by server; do not include in request payloads.
   */
  readonly capturedAt?: string;
}

export interface CapturePaymentRequest {
  authorityCode?: string;
}

export interface VoidPaymentRequest {
  reason: string;
  authorityCode: string;
}

export interface RefundPaymentRequest {
  reason: string;
  authorityCode: string;
  amount?: number;
}

export interface PaymentActionResult {
  readonly paymentId: string;
  readonly invoiceId: string;
  readonly status: PaymentStatus;
  /**
   * @serverGenerated - set by server; do not include in request payloads.
   */
  readonly actionAt: string;
}

// ── CAP-250: Receipt ────────────────────────────────────────────────────────

export interface GenerateReceiptRequest {
  deliveryMethod?: 'PRINT' | 'EMAIL' | 'NONE';
  emailAddress?: string;
}

// ── Issue #2215 ruling / durion-positivity-backend#2226: per-payment refund context ─────────

/**
 * Context shown to the operator before they enter a refund amount, from
 * `PaymentService.getInvoicePayment` (durion-positivity-backend#2226, superseding the
 * `listInvoiceRefunds`-derived `priorRefundsTotal` this replaces — that was only ever a stand-in
 * for the real per-payment balance Copilot #4106106128 found `invoice.total` unsafe to derive).
 *
 * `refundableAmount` is `capturedAmount` minus non-failed refunds, and is `null` unless the
 * payment intent's `status` is `CAPTURED` (a payment that is still `AUTHORIZED`, or already
 * `VOIDED`/`REFUNDED` in full, has no refundable balance to offer). The page uses it to prefill a
 * "refund full balance" amount for the operator to confirm, never to silently submit — the
 * server's own 422 (amount exceeds the remaining refundable balance) remains authoritative for a
 * partial refund entered by hand.
 */
export interface RefundContext {
  readonly capturedAmount: number;
  readonly refundedAmount: number;
  readonly refundableAmount: number | null;
  readonly status: PaymentStatus;
}

export interface ReceiptRef {
  readonly receiptId: string;
  readonly invoiceId: string;
  readonly paymentId?: string;
  readonly receiptNumber?: string;
  /**
   * @serverGenerated - set by server; do not include in request payloads.
   */
  readonly generatedAt?: string;
  /**
   * @serverGenerated - set by server; do not include in request payloads.
   */
  readonly emailedTo?: string;
  /**
   * @serverGenerated - set by server; do not include in request payloads.
   */
  readonly pdfUrl?: string;
  /**
   * Fields populated only when this ref came from `ReceiptService.getReceipt`
   * (durion-positivity-backend#2214) rather than a fresh `generateReceipt`/`reprintReceipt`
   * response — a deep-linked receipt is read-only detail, not a new print/email event, so
   * `generatedAt`/`emailedTo` above stay unset for it. Card brand and last-4 are deliberately not
   * exposed by `ReceiptViewResponse`.
   */
  readonly status?: 'GENERATED';
  readonly paidAmount?: number;
  readonly paymentMethod?: string;
  readonly cashierId?: string;
  readonly terminalId?: string;
  readonly deliveryMethod?: 'PRINT' | 'EMAIL';
  readonly deliveryStatus?: 'SUCCESS' | 'FAILED';
  readonly deliveryEmailAddress?: string;
  /** Reprint count as of the last load; drives {@link RECEIPT_REPRINT_OVERRIDE_THRESHOLD}. */
  readonly reprintCount?: number;
  readonly lastReprintedBy?: string;
  readonly lastReprintReason?: string;
  /**
   * @serverGenerated - set by server; do not include in request payloads.
   */
  readonly createdAt?: string;
}

/**
 * `ReceiptServiceImpl.reprintReceipt` (backend origin/main) requires
 * `invoice:receipt:reprint_override` once `reprintCount >= 5`. Mirrored here so the page can
 * pre-warn/gate before the request, not just map the resulting 403.
 */
export const RECEIPT_REPRINT_OVERRIDE_THRESHOLD = 5;
