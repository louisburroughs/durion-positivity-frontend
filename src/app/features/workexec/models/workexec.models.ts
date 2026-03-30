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
  lineItemApprovalStatus?: 'APPROVED' | 'DECLINED' | string;
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

// ── CAP-248: Estimate List / WIP / Invoice Visibility (Stories 259, 260, 261) ─

export interface EstimateListFilters {
  customerId?: string;
  vehicleId?: string;
  status?: EstimateStatus[];
}

export interface EstimateListItem {
  readonly estimateId: string;
  readonly workorderId?: string;
  readonly customerId: string;
  readonly vehicleId?: string;
  readonly status: EstimateStatus;
  readonly totalAmount: number;
  readonly currency: string;
  readonly lastUpdatedAt?: string;
  readonly createdAt?: string;
  readonly notes?: string;
}

export type WipStatus = 'WAITING' | 'IN_PROGRESS' | 'PARTS_PENDING' | 'READY' | 'COMPLETED';

export interface WorkorderWipView {
  readonly workorderId: string;
  readonly workorderNumber: string;
  readonly wipStatus: WipStatus;
  readonly assignedTechnicianName?: string;
  readonly bayLocation?: string;
  readonly customerId?: string;
  readonly vehicleDescription?: string;
  readonly statusUpdatedAt?: string;
}

export interface WipListFilters {
  wipStatus?: WipStatus[];
}

export interface WorkorderInvoiceView {
  readonly workorderId: string;
  readonly invoiceId?: string;
  readonly lineItems: InvoiceLineItem[];
  readonly subtotal: number;
  readonly taxAmount: number;
  readonly total: number;
  readonly currency: string;
  readonly invoiceStatus: string;
  readonly finalizedAt?: string;
  readonly createdAt?: string;
}

export interface InvoiceLineItem {
  readonly lineItemId: string;
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly lineTotal: number;
  readonly itemType: 'PART' | 'LABOR' | 'FEE';
}

export interface FinalizeInvoiceRequest {
  reason?: string;
  authorityCode?: string;
}

export interface FinalizeInvoiceResponse {
  readonly workorderId: string;
  readonly invoiceId: string;
  readonly status: string;
  readonly finalizedAt: string;
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

// ── CAP-004: Workorder types (Stories 231, 230, 229, 228, 227, 226) ──────────

export type WorkorderStatus =
  | 'DRAFT'
  | 'PLANNED'
  | 'PENDING_ASSIGNMENT'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'PENDING_REVIEW'
  | 'COMPLETED'
  | 'INVOICED'
  | 'CANCELLED'
  | 'ARCHIVED';

export type ChangeRequestStatus =
  | 'AWAITING_ADVISOR_REVIEW'
  | 'APPROVED'
  | 'DECLINED'
  | 'CANCELLED';

/** operationId: promoteEstimateToWorkorder — response (201 or 409 with existingWorkorderId) */
export interface WorkorderResponse {
  id: string;
  estimateId?: string;
  customerId?: string;
  shopId?: string;
  vehicleId?: string;
  status?: WorkorderStatus;
  primaryTechnicianId?: string;
  primaryTechnicianName?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  /** Present on 409 — id of the existing work order */
  existingWorkorderId?: string;
}

/** operationId: getWorkorderDetail — rich composite response */
export interface WorkorderDetailResponse {
  id: string;
  estimateId?: string;
  status?: WorkorderStatus;
  customerId?: string;
  vehicleId?: string;
  crmPartyId?: string;
  crmVehicleId?: string;
  crmContactIds?: string[];
  shopId?: string;
  primaryTechnicianId?: string;
  primaryTechnicianName?: string;
  isStarted?: boolean;
  startedAt?: string;
  isInProgress?: boolean;
  inProgressReason?: string;
  completedAt?: string;
  createdAt?: string;
  version?: number;
  items?: WorkorderItemResponse[];
  technician?: TechnicianAssignmentResponse;
  operationalContext?: OperationalContextResponse;
}

/** Workorder line items promoted from estimate */
export interface WorkorderItemResponse {
  id: string;
  workorderId: string;
  sourceEstimateItemId?: string;
  itemType?: 'PART' | 'LABOR';
  description?: string;
  quantity?: number;
  unitPrice?: number;
  lineTotal?: number;
  status?: string;
}

/** operationId: getTransitionHistory */
export interface WorkorderTransition {
  id?: string;
  workorderId?: string;
  fromStatus?: WorkorderStatus;
  toStatus?: WorkorderStatus;
  reason?: string;
  actorUserId?: string;
  message?: string;
  transitionedAt?: string;
}

/** operationId: getOperationalContext */
export interface OperationalContextResponse {
  workorderId?: string;
  version?: string;
  shopId?: string;
  technicianId?: string;
  authorities?: string[];
  startedAt?: string;
}

// ── CAP-004/005: Technician assignment (Stories 225, 231) ────────────────────

export interface TechnicianAssignmentResponse {
  workorderId?: string;
  technicianId?: string;
  technicianName?: string;
  assignedAt?: string;
  assignedBy?: string;
  unassignedAt?: string;
  reason?: string;
}

export interface AssignTechnicianRequest {
  /** Required */
  technicianId: string;
  assignedByUserId?: string;
  notes?: string;
}

// ── CAP-005: Workorder start/status (Story 224) ───────────────────────────────

export interface WorkorderStartResponse {
  workorderId?: string;
  operationalContextVersion?: string;
  workStartedAt?: string;
  previousStatus?: WorkorderStatus;
  currentStatus?: WorkorderStatus;
  transitionedAt?: string;
  message?: string;
}

// ── CAP-005: Labor (Story 223) ────────────────────────────────────────────────

export interface StartLaborRequest {
  technicianId?: string;
  /** Service line item ID on the workorder */
  workorderServiceId?: string;
  startTime?: string;
}

export interface StopLaborRequest {
  stopTime?: string;
  notes?: string;
}

export interface CreateLaborPerformedRequest {
  workorderId: string;
  workorderServiceId?: string;
  technicianId?: string;
  startTime?: string;
  endTime?: string;
  hoursWorked?: number;
  laborCode?: string;
  description?: string;
  flatRate?: boolean;
}

export interface WorkorderLaborEntryResponse {
  id?: string;
  workorderId?: string;
  workorderServiceId?: string;
  technicianId?: string;
  startTime?: string;
  endTime?: string;
  hoursWorked?: number;
  laborCode?: string;
  description?: string;
  flatRate?: boolean;
  createdAt?: string;
}

// ── CAP-005: Parts (Stories 222, 221) ────────────────────────────────────────

export interface IssuePartsRequest {
  partId: string;
  quantity: number;
  workorderServiceId?: string;
  notes?: string;
}

export interface ConsumePartsRequest {
  partId: string;
  quantity: number;
  workorderServiceId?: string;
}

export interface ReturnPartsRequest {
  partId: string;
  quantity: number;
  reason?: string;
}

export interface SubstitutePartRequest {
  originalPartId: string;
  substitutePartId: string;
  reason?: string;
}

export interface PartUsageResponse {
  id?: string;
  workorderId?: string;
  partId?: string;
  quantityIssued?: number;
  quantityConsumed?: number;
  quantityReturned?: number;
  workorderServiceId?: string;
  issuedAt?: string;
  consumedAt?: string;
}

export interface SubstituteLinkResponse {
  id?: string;
  productId?: string;
  substitutePartId?: string;
  substituteType?: 'EQUIVALENT' | 'APPROVED_ALTERNATIVE' | 'UPGRADE' | 'DOWNGRADE';
  priority?: number;
  active?: boolean;
}

// ── CAP-005: Change Requests (Story 220) ─────────────────────────────────────

export interface ChangeRequestItemRequest {
  type: 'SERVICE' | 'PART';
  serviceId?: string;
  partId?: string;
  quantity?: number;
  isEmergency?: boolean;
  emergencyReason?: string;
}

export interface CreateChangeRequestRequest {
  description: string;
  requestedItems: ChangeRequestItemRequest[];
}

export interface ChangeRequestResponse {
  id: string;
  workorderId?: string;
  description?: string;
  status?: ChangeRequestStatus;
  createdAt?: string;
  createdBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  requestedItems?: ChangeRequestItemResponse[];
}

export interface ChangeRequestItemResponse {
  id?: string;
  changeRequestId?: string;
  type?: 'SERVICE' | 'PART';
  serviceId?: string;
  partId?: string;
  quantity?: number;
  isEmergency?: boolean;
  emergencyReason?: string;
  status?: string;
}

// ── UI state types ────────────────────────────────────────────────────────────

export type PageState = 'idle' | 'loading' | 'ready' | 'saving' | 'success' | 'error' | 'access-denied' | 'expired';

/** Totals panel state machine (Story 236) */
export type TotalsState = 'idle' | 'recalculating' | 'updated' | 'blocked-config' | 'error';

// ── CAP-006: Completion + Reopen (Stories 218, 215, 214) ─────────────────────

/**
 * operationId: completeWorkorder
 * POST /v1/workorders/{workorderId}/complete
 */
export interface CompleteWorkorderRequest {
  completionNotes?: string;
}

export interface CompletionFailedCheck {
  checkId: string;
  description: string;
  severity: 'BLOCKING' | 'WARNING';
}

export interface CompleteWorkorderResponse {
  workorderId: string;
  status: WorkorderStatus;
  completedAt?: string;
  completedBy?: string;
  completionNotes?: string;
  failedChecks?: CompletionFailedCheck[];
}

/**
 * operationId: reopenWorkorder
 * POST /v1/workorders/{workorderId}/reopen
 */
export interface ReopenWorkorderRequest {
  reopenReason: string;
}

export interface ReopenWorkorderResponse {
  workorderId: string;
  status: WorkorderStatus;
  reopenedAt?: string;
  reopenedBy?: string;
  reopenReason?: string;
}

// ── CAP-006: Finalize Billable Scope Snapshot (Story 216) ────────────────────

/**
 * POST /v1/workorders/{workorderId}/finalize
 */
export interface FinalizeWorkorderRequest {
  snapshotType?: string;
  poNumber?: string;
}

export interface BillableScopeSnapshotItem {
  id: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  lineTotal?: number;
  itemType?: 'PART' | 'LABOR';
}

export interface BillableScopeSnapshot {
  snapshotId: string;
  workorderId: string;
  snapshotVersion: number;
  snapshotStatus: string;
  partsTotal?: number;
  laborTotal?: number;
  taxTotal?: number;
  grandTotal?: number;
  poNumber?: string;
  finalizedAt?: string;
  finalizedBy?: string;
  items?: BillableScopeSnapshotItem[];
}

export interface FinalizeWorkorderResponse extends BillableScopeSnapshot {
  message?: string;
}

/**
 * operationId: getSnapshotHistory
 * GET /v1/workorders/{workorderId}/snapshots
 */
export interface WorkorderSnapshotHistoryEntry {
  id: string;
  workorderId?: string;
  status?: string;
  snapshotData?: string;
  capturedAt?: string;
  capturedById?: string;
  notes?: string;
}
