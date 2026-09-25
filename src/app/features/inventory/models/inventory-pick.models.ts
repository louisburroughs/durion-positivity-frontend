/**
 * Fulfillment picking models: pick list / mechanic picking / consume-picked-items.
 * Source of truth: durion-positivity-backend/pos-workorder/openapi.yaml
 * (`WorkorderPickFacadeController`, `WorkorderPickedItemsController`), all
 * served through the generated `@durion-sdk/workorder` `WorkorderPickFacadeService`
 * / `WorkorderPickedItemsService` (see `services/inventory-pick.service.ts`).
 * The legacy `/workexec/v1/workorders/{workorderId}/picks/*` endpoints never
 * existed behind the gateway (issue #369) and are gone.
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

// Mechanic Picking (CAP-218 #244) — per pick task (issue #369): the SDK's
// `WorkorderPickFacadeService` models scan-resolve/confirm/complete at
// pick-task granularity, not a whole pick list, and `pickLineId` equals
// `pickTaskId` in the current single-line-per-task backend model.
export interface ScanResolveRequest {
  scannedSkuId: string;
  scannedLocationId: string;
}

/** Evaluative only (ADR-0064 §1) — resolving a scan records no state; `matched`
 * plus `matchStatus` ('MATCHED' | 'SKU_MISMATCH' | 'LOCATION_MISMATCH' | 'NO_MATCH')
 * drive the confirm step's gating. */
export interface ScanResolveResult {
  pickTaskId: string;
  matched: boolean;
  matchStatus?: string;
  resolvedSkuId?: string;
  resolvedLocationId?: string;
}
