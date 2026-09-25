/**
 * Fulfillment picking models: pick list / mechanic picking / consume-picked-items.
 * Source of truth: durion-positivity-backend/pos-workorder/openapi.yaml
 * (`WorkorderPickFacadeController`, `WorkorderPickedItemsController`) plus the
 * legacy `/workexec/v1/workorders/{workorderId}/picks/*` endpoints still served
 * off `ApiBaseService` (see `services/inventory-pick.service.ts`).
 *
 * Picking belongs to inventory even though a mechanic performs it on a
 * workorder (issue #347, group 5) — moved out of `features/workexec` so the pages
 * that read/write pick state don't reach across a feature boundary for their
 * own models (ADR-0036 §2).
 */

// Pick List (CAP-218 #92)
export interface PickListView {
  workorderId: string;
  pickListId: string;
  status: string;
  /** @serverGenerated */
  readonly createdAt?: string;
  tasks: PickTaskLine[];
}

export interface PickTaskLine {
  pickTaskId: string;
  productSku: string;
  productDisplayName?: string;
  requestedQty: number;
  pickedQty: number;
  uom: string;
  storageLocationId?: string;
  storageLocationCode?: string;
  status: string;
  sortOrder?: number;
}

// Consume Picked Items (CAP-218 #243)
export interface PickedItemLine {
  pickedItemId: string;
  workorderLineId?: string;
  productSku: string;
  qtyPicked: number;
  qtyConsumed: number;
  status: string;
}

export interface ConsumePickedItemsRequest {
  lines: ConsumePickedItemsLine[];
}

export interface ConsumePickedItemsLine {
  pickedItemId: string;
  quantity: number;
}

export interface ConsumptionResult {
  referenceId: string;
  readonly consumedAt?: string;
  consumedLineCount: number;
}

// Mechanic Picking (CAP-218 #244)
export interface PickExecuteLine {
  pickLineId: string;
  pickTaskId: string;
  productSku: string;
  requestedQty: number;
  confirmedQty: number;
  status: string;
}

export interface ScanResolveRequest {
  scanValue: string;
}

export interface PickConfirmRequest {
  pickLineId: string;
  quantity: number;
}
