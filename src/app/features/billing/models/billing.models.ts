/**
 * Billing domain models.
 * Service contracts: CAP-007 (Stories 213–209)
 * Base URL: /billing (billing microservice)
 */

// ── Invoice status ────────────────────────────────────────────────────────────

export type InvoiceStatus = 'DRAFT' | 'PENDING_REVIEW' | 'ISSUED' | 'VOID' | 'CANCELLED';

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
  createdAt?: string;
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
  poNumber?: string;
  status: InvoiceStatus;
  subtotal?: number;
  taxTotal?: number;
  taxAmount?: number;
  feeTotal?: number;
  discountAmount?: number;
  adjustmentTotal?: number;
  grandTotal?: number;
  currencyCode?: string;
  createdAt?: string;
  updatedAt?: string;
  issuedAt?: string;
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
  password: string;
}

export interface ElevateResponse {
  elevationToken: string;
  expiresAt?: string;
}
