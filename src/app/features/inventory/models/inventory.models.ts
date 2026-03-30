// Shared location refs
export interface LocationRef { locationId: string; name: string; status: string; }
export interface StorageLocation { storageLocationId: string; locationId: string; name: string; barcode?: string; status: string; }

// Availability (CAP-215 #100)
export interface AvailabilityView { productSku: string; locationId: string; storageLocationId?: string; onHandQuantity: number; allocatedQuantity: number; availableToPromiseQuantity: number; unitOfMeasure: string; }

// Ledger (CAP-215 #101)
export interface LedgerFilter { productSku?: string; locationId?: string; storageLocationId?: string; movementTypes?: string[]; dateFrom?: string; dateTo?: string; sourceTransactionId?: string; workorderId?: string; workorderLineId?: string; pageSize?: number; pageToken?: string; }
export interface InventoryLedgerEntry { ledgerEntryId: string; timestamp: string; movementType: string; productSku: string; quantityChange: number; uom: string; fromLocationId?: string; fromStorageLocationId?: string; toLocationId?: string; toStorageLocationId?: string; actorId?: string; reasonCode?: string; sourceTransactionId?: string; workorderId?: string; workorderLineId?: string; }
export interface LedgerPageResponse { items: InventoryLedgerEntry[]; nextPageToken: string | null; }

// Receiving (CAP-216 #98)
export interface ReceivingDocumentResponse { documentId: string; documentType: string; status: string; locationId: string; locationName?: string; stagingStorageLocationId: string; stagingStorageLocationName: string; stagingStorageLocationBarcode?: string; lines: ReceivingLine[]; }
export interface ReceivingLine { receivingLineId: string; productSku: string; productName?: string; expectedQty: number; expectedUomId: string; state: string; isReceivable: boolean; uomEditable?: boolean; }
export interface ConfirmReceiptRequest { documentId: string; documentType: string; locationId: string; stagingStorageLocationId: string; lines: ConfirmReceiptLine[]; }
export interface ConfirmReceiptLine { receivingLineId: string; actualQty: number; actualUomId?: string; }
export interface ReceiptResult { receiptCorrelationId: string; readonly receivedAt?: string; receivedByUserId: string; lines: ReceiptResultLine[]; ledgerEntryCount?: number; ledgerEntryIds?: string[]; }
export interface ReceiptResultLine { receivingLineId: string; state: string; varianceType?: string; varianceQty?: number; }

// Putaway (CAP-217 #95)
export interface PutawayTask { putawayTaskId: string; locationId: string; stagingStorageLocationId: string; targetStorageLocationId?: string; productSku: string; quantity: number; uom: string; status: string; sourceDocumentId?: string; }
export interface PutawayCompleteRequest { putawayTaskId: string; targetStorageLocationId: string; }
export interface PutawayResult { putawayTaskId: string; status: string; ledgerEntryId?: string; }

// Replenishment (CAP-217 #94)
export interface ReplenishmentTask { replenishmentTaskId: string; locationId: string; fromStorageLocationId: string; toStorageLocationId: string; productSku: string; requestedQty: number; uom: string; status: string; }

// Cycle Count (CAP-219 #91, #90)
export interface CycleCountTask { cycleCountTaskId: string; locationId: string; storageLocationId?: string; productSku: string; uom: string; status: string; assignedToId?: string; }
export interface CountEntry { sequence: number; timestamp: string; countedQuantity: number; countedBy: string; varianceQuantity?: number; }
export interface CountSubmitRequest { entries: CountEntryInput[]; }
export interface CountEntryInput { sequence: number; countedQuantity: number; }
export interface CountSubmitResponse { cycleCountTaskId: string; status: string; entries: CountEntry[]; adjustment?: { adjustmentId: string; status: string; }; }
export interface AdjustmentDetail { adjustmentId: string; locationId: string; storageLocationId?: string; productSku: string; countedQuantity: number; expectedQuantity: number; varianceQuantity: number; varianceValue?: number; status: string; requiredApprovalTier: number; readonly createdAt?: string; readonly approvedAt?: string; readonly rejectedAt?: string; rejectionReason?: string; ledgerReference?: string; }
export interface AdjustmentPageResponse { items: AdjustmentDetail[]; nextPageToken: string | null; }
export interface ApprovalQueueFilter { status?: string; locationId?: string; productSku?: string; requiredApprovalTier?: number; dateFrom?: string; dateTo?: string; pageToken?: string; }

// Purchase Orders (CAP-315 #572)
export interface PurchaseOrderDetail { poId: string; poNumber: string; status: string; supplierId: string; supplierName?: string; lineCount: number; openBalance: number; scheduledDeliveryDate: string; notes?: string; lines: PurchaseOrderLine[]; readonly createdAt?: string; readonly updatedAt?: string; }
export interface PurchaseOrderLine { poLineId: string; productSku: string; productName?: string; orderedQty: number; receivedQty: number; unitPrice: number; lineTotal?: number; status: string; }
export interface PurchaseOrderPageResponse { items: PurchaseOrderDetail[]; nextPageToken: string | null; }
export interface PurchaseOrderFilter { statuses?: string[]; supplierId?: string; dateFrom?: string; dateTo?: string; pageToken?: string; }
export interface CreatePurchaseOrderRequest { supplierId: string; scheduledDeliveryDate: string; notes?: string; lines: CreatePurchaseOrderLine[]; }
export interface CreatePurchaseOrderLine { productSku: string; orderedQty: number; unitPrice: number; }
export interface RevisePurchaseOrderRequest { scheduledDeliveryDate?: string; notes?: string; lines?: CreatePurchaseOrderLine[]; }

