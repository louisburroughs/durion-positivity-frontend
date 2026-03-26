/**
 * Workexec domain models.
 * Source of truth: durion-positivity-backend/pos-workorder/openapi.yaml
 * Contract guide: domains/workexec/.business-rules/BACKEND_CONTRACT_GUIDE.md
 *
 * Capabilities: CAP-002 (Estimates), CAP-003 (Customer Approval Workflow)
 */

// ── Estimate status ──────────────────────────────────────────────────────────

export type EstimateStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'OPEN'
  | 'PENDING_CUSTOMER'
  | 'APPROVED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'SCHEDULED'
  | 'INVOICED'
  | 'CANCELLED'
  | 'ARCHIVED';

export type EstimateItemType = 'PART' | 'LABOR';

// ── Error envelope ────────────────────────────────────────────────────────────

export interface FieldError {
  field: string;
  message: string;
}

export interface ApiError {
  code: string;
  message: string;
  correlationId?: string;
  fieldErrors?: FieldError[];
  existingResourceId?: string;
}

// ── CAP-002: Create Estimate (Story 239) ─────────────────────────────────────

export interface CreateEstimateRequest {
  /** Required: Workexec customer ID (opaque string) */
  customerId: string;
  /** Required: Vehicle ID (opaque string) */
  vehicleId: string;
  /** Optional: CRM party ID (UUIDv7 string) */
  crmPartyId?: string;
  /** Optional: CRM vehicle ID (UUIDv7 string) */
  crmVehicleId?: string;
  /** Optional: CRM contact IDs (may be empty array) */
  crmContactIds?: string[];
  /** Optional: Location ID — defaults from session when omitted */
  locationId?: string;
  /** Optional: Currency code — defaults when omitted */
  currencyUomId?: string;
  /** Optional: Tax region ID — defaults when omitted */
  taxRegionId?: string;
}

// ── CAP-002: Estimate Response (Stories 239, 238, 237, 236, 235, 234) ────────

export interface EstimateResponse {
  id: string;
  estimateNumber?: string;
  customerId: string;
  vehicleId: string;
  locationId?: string;
  currencyUomId?: string;
  taxRegionId?: string;
  status: EstimateStatus;
  createdByUserId?: string;
  createdAt?: string;
  subtotal?: number;
  taxAmount?: number;
  total?: number;
  submittedAt?: string;
  submittedBy?: string;
  expiresAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  signatureData?: string;
  signatureMimeType?: string;
  signerName?: string;
  approvalNotes?: string;
  purchaseOrderNumber?: string;
  /** Optimistic locking version */
  version?: number;
  crmPartyId?: string;
  crmVehicleId?: string;
  crmContactIds?: string[];
  items?: EstimateItemResponse[];
}

// ── CAP-002: Estimate Items (Stories 238, 237) ───────────────────────────────

export interface AddEstimateItemRequest {
  itemType: EstimateItemType;
  description?: string;
  quantity: number;
  unitPrice: number;
  taxCode?: string;
  /** PART items: catalog product reference */
  productId?: string;
  /** LABOR items: service catalog reference */
  serviceId?: string;
}

export interface UpdateEstimateItemRequest {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  taxCode?: string;
}

export interface EstimateItemResponse {
  id: string;
  estimateId: string;
  itemType: EstimateItemType;
  description?: string;
  quantity: number;
  unitPrice: number;
  lineTotal?: number;
  taxCode?: string;
  productId?: string;
  serviceId?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ── CAP-002: Calculate Totals (Story 236) ────────────────────────────────────

export interface CalculateEstimateTotalsResponse {
  subtotal?: number;
  taxAmount?: number;
  total?: number;
  currencyUomId?: string;
  [key: string]: unknown;
}

// ── CAP-002: Estimate Snapshot (Story 234) ───────────────────────────────────

export interface EstimateSnapshotResponse {
  id: string;
  estimateId: string;
  status?: EstimateStatus;
  snapshotData?: string;
  capturedAt?: string;
  capturedById?: string;
  notes?: string;
}

// ── CAP-002: Estimate Summary (Story 234) ────────────────────────────────────

export interface EstimateSummaryResponse {
  id: string;
  estimateNumber?: string;
  createdAt?: string;
  expiresAt?: string;
  customerId?: string;
  vehicleId?: string;
  locationId?: string;
  status?: EstimateStatus;
  partItems?: EstimateItemResponse[];
  laborItems?: EstimateItemResponse[];
  subtotal?: number;
  taxAmount?: number;
  total?: number;
  currencyUomId?: string;
}

// ── CAP-003: Approval (Stories 233, 271, 270, 269, 268) ──────────────────────

/** Per-line approval decision for partial approval (Story 269) */
export interface LineItemApprovalDto {
  lineItemId: string;
  approved: boolean;
  rejectionReason?: string;
  notes?: string;
}

/**
 * Shared approval request body.
 * Used for: in-person (270), digital/signature (271), partial (269).
 * operationId: approveEstimate
 * POST /v1/workorders/estimates/{estimateId}/approval
 */
export interface ApproveEstimateRequest {
  /** Required: customer ID validating the approval */
  customerId: string;
  /** Signature image — base64-encoded PNG (required for digital approval, Story 271) */
  signatureData?: string;
  signatureMimeType?: string;
  signerName?: string;
  notes?: string;
  /** Selective line item approvals (Story 269); omit to approve all */
  lineItemApprovals?: LineItemApprovalDto[];
  /** Commercial accounts with PO enforcement (CAP-092) */
  purchaseOrderNumber?: string;
}

// ── UI state types ────────────────────────────────────────────────────────────

export type PageState = 'idle' | 'loading' | 'ready' | 'saving' | 'success' | 'error' | 'access-denied' | 'expired';

/** Totals panel state machine (Story 236) */
export type TotalsState = 'idle' | 'recalculating' | 'updated' | 'blocked-config' | 'error';
