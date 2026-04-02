// Shared location refs
export interface LocationRef {
  locationId: string;
  name: string;
  status: string;
}

export interface StorageLocation {
  storageLocationId: string;
  locationId: string;
  name: string;
  barcode?: string;
  status: string;
}

export interface LocationZone {
  zoneId: string;
  zoneName: string;
  locationId: string;
}

// Availability (CAP-215 #100)
export interface AvailabilityView {
  productSku: string;
  locationId: string;
  storageLocationId?: string;
  onHandQuantity: number;
  allocatedQuantity: number;
  availableToPromiseQuantity: number;
  unitOfMeasure: string;
}

// Ledger (CAP-215 #101)
export interface LedgerFilter {
  productSku?: string;
  locationId?: string;
  storageLocationId?: string;
  movementTypes?: string[];
  dateFrom?: string;
  dateTo?: string;
  sourceTransactionId?: string;
  workorderId?: string;
  workorderLineId?: string;
  pageSize?: number;
  pageToken?: string;
}

export interface InventoryLedgerEntry {
  ledgerEntryId: string;
  timestamp: string;
  movementType: string;
  productSku: string;
  quantityChange: number;
  uom: string;
  fromLocationId?: string;
  fromStorageLocationId?: string;
  toLocationId?: string;
  toStorageLocationId?: string;
  actorId?: string;
  reasonCode?: string;
  sourceTransactionId?: string;
  workorderId?: string;
  workorderLineId?: string;
}

export interface LedgerPageResponse {
  items: InventoryLedgerEntry[];
  nextPageToken: string | null;
}

// Receiving (CAP-216 #98)
export interface ReceivingDocumentResponse {
  documentId: string;
  documentType: string;
  status: string;
  locationId: string;
  locationName?: string;
  stagingStorageLocationId: string;
  stagingStorageLocationName: string;
  stagingStorageLocationBarcode?: string;
  lines: ReceivingLine[];
}

export interface ReceivingLine {
  receivingLineId: string;
  productSku: string;
  productName?: string;
  expectedQty: number;
  expectedUomId: string;
  state: string;
  isReceivable: boolean;
  uomEditable?: boolean;
}

export interface ConfirmReceiptRequest {
  documentId: string;
  documentType: string;
  locationId: string;
  stagingStorageLocationId: string;
  lines: ConfirmReceiptLine[];
}

export interface ConfirmReceiptLine {
  receivingLineId: string;
  actualQty: number;
  actualUomId?: string;
}

export interface ReceiptResult {
  receiptCorrelationId: string;
  readonly receivedAt?: string;
  receivedByUserId: string;
  lines: ReceiptResultLine[];
  ledgerEntryCount?: number;
  ledgerEntryIds?: string[];
}

export interface ReceiptResultLine {
  receivingLineId: string;
  state: string;
  varianceType?: string;
  varianceQty?: number;
}

// Putaway (CAP-217 #95)
export interface PutawayTask {
  putawayTaskId: string;
  locationId: string;
  stagingStorageLocationId: string;
  targetStorageLocationId?: string;
  productSku: string;
  quantity: number;
  uom: string;
  status: string;
  sourceDocumentId?: string;
}

export interface PutawayCompleteRequest {
  putawayTaskId: string;
  targetStorageLocationId: string;
}

export interface PutawayResult {
  putawayTaskId: string;
  status: string;
  ledgerEntryId?: string;
}

// Replenishment (CAP-217 #94)
export interface ReplenishmentTask {
  replenishmentTaskId: string;
  locationId: string;
  fromStorageLocationId: string;
  toStorageLocationId: string;
  productSku: string;
  requestedQty: number;
  uom: string;
  status: string;
}

// Cycle Count (CAP-219 #91, #90)
export interface CycleCountTask {
  cycleCountTaskId: string;
  locationId: string;
  storageLocationId?: string;
  productSku: string;
  uom: string;
  status: string;
  assignedToId?: string;
}

export interface CountEntry {
  sequence: number;
  timestamp: string;
  countedQuantity: number;
  countedBy: string;
  varianceQuantity?: number;
}

export interface CountSubmitRequest {
  entries: CountEntryInput[];
}

export interface CountEntryInput {
  sequence: number;
  countedQuantity: number;
}

export interface CountSubmitResponse {
  cycleCountTaskId: string;
  status: string;
  entries: CountEntry[];
  adjustment?: {
    adjustmentId: string;
    status: string;
  };
}

export interface AdjustmentDetail {
  adjustmentId: string;
  locationId: string;
  storageLocationId?: string;
  productSku: string;
  countedQuantity: number;
  expectedQuantity: number;
  varianceQuantity: number;
  varianceValue?: number;
  status: string;
  requiredApprovalTier: number;
  readonly createdAt?: string;
  readonly approvedAt?: string;
  readonly rejectedAt?: string;
  rejectionReason?: string;
  ledgerReference?: string;
}

export interface AdjustmentPageResponse {
  items: AdjustmentDetail[];
  nextPageToken: string | null;
}

export interface ApprovalQueueFilter {
  status?: string;
  locationId?: string;
  productSku?: string;
  requiredApprovalTier?: number;
  dateFrom?: string;
  dateTo?: string;
  pageToken?: string;
}

// Cycle Count Plans (CAP-219 #241)
export interface CycleCountPlan {
  planId: string;
  locationId: string;
  zoneIds: string[];
  planName?: string;
  scheduledDate: string;
  status: string;
  readonly createdAt?: string;
}

export interface CycleCountPlanRequest {
  locationId: string;
  zoneIds: string[];
  scheduledDate: string;
  planName?: string;
}

// Purchase Orders (CAP-315 #572)
export interface PurchaseOrderDetail {
  poId: string;
  poNumber: string;
  status: string;
  supplierId: string;
  supplierName?: string;
  lineCount: number;
  openBalance: number;
  scheduledDeliveryDate: string;
  notes?: string;
  lines: PurchaseOrderLine[];
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface PurchaseOrderLine {
  poLineId: string;
  productSku: string;
  productName?: string;
  orderedQty: number;
  receivedQty: number;
  unitPrice: number;
  lineTotal?: number;
  status: string;
}

export interface PurchaseOrderPageResponse {
  items: PurchaseOrderDetail[];
  nextPageToken: string | null;
}

export interface PurchaseOrderFilter {
  statuses?: string[];
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
  pageToken?: string;
}

export interface CreatePurchaseOrderRequest {
  supplierId: string;
  scheduledDeliveryDate: string;
  notes?: string;
  lines: CreatePurchaseOrderLine[];
}

export interface CreatePurchaseOrderLine {
  productSku: string;
  orderedQty: number;
  unitPrice: number;
}

export interface RevisePurchaseOrderRequest {
  scheduledDeliveryDate?: string;
  notes?: string;
  lines?: CreatePurchaseOrderLine[];
}

// ASN (CAP-315 #571)
export interface AsnCreateRequest {
  supplierId: string;
  supplierShipmentRef: string;
  poId: string;
  lines: AsnCreateLine[];
}

export interface AsnCreateLine {
  poLineId: string;
  expectedQty: number;
}

export interface AsnResponse {
  asnId: string;
  poId: string;
  status: string;
  readonly createdAt?: string;
  lines: AsnResponseLine[];
}

export interface AsnResponseLine {
  asnLineId: string;
  poLineId: string;
  expectedQty: number;
}

export interface ReceivingSessionFromAsnRequest {
  asnId: string;
  locationId: string;
}

// Cross-dock receiving (CAP-216 #97)
export interface WorkorderCrossDockRef {
  workorderId: string;
  workorderNumber: string;
  status: string;
}

export interface CrossDockReceiveRequest {
  sessionId: string;
  receivingLineId: string;
  workorderId: string;
  workorderLineId: string;
  quantity: number;
  overrideReasonCode?: string;
}

export interface CrossDockReceiveResult {
  issueReferenceId: string;
  issueMode: string;
  confirmedBy?: string;
  readonly confirmedAt?: string;
}

// Return to Stock (CAP-218 #242)
export interface ReturnableItem {
  workorderLineId: string;
  productSku: string;
  description?: string;
  maxReturnableQty: number;
  uom: string;
}

export interface ReturnReasonCode {
  code: string;
  label: string;
}

export interface ReturnToStockRequest {
  workorderId: string;
  locationId: string;
  storageLocationId?: string;
  reasonCode: string;
  lines: ReturnToStockLine[];
}

export interface ReturnToStockLine {
  workorderLineId: string;
  quantityToReturn: number;
}

export interface ReturnToStockResult {
  returnId: string;
  workorderId: string;
  totalItemsReturned: number;
  readonly createdAt?: string;
  ledgerEntryIds?: string[];
}

// Shortage Resolution (CAP-220 #89)
export interface ShortageOption {
  optionId: string;
  decisionType: string;
  label: string;
  leadTimeDays?: number;
  partialOptionsWarning?: boolean;
}

export interface ShortageResolutionRequest {
  workorderId: string;
  allocationLineId: string;
  optionId: string;
  decisionType: string;
  clientRequestId: string;
}

export interface ShortageResolutionResult {
  allocationLineId: string;
  resolvedDecisionType: string;
  readonly resolvedAt?: string;
}

// Inventory Security (CAP-221 #87)
export interface InventoryPermissionEntry {
  permissionKey: string;
  description: string;
  category: string;
  isCurrentUserGranted: boolean;
}

