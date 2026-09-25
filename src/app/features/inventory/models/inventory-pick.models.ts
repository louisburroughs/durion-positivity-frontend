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
  /** The task's human-readable location name/code, replicated from
   * `pos-location` (#2221). Null on a task last updated before scan codes
   * were replicated — never fall back to `storageLocationId` (ADR-0064 §5). */
  storageLocationCode?: string;
  /** The location's scannable barcode, when replicated (#2221). */
  storageLocationBarcode?: string;
  /** The SKU's scannable EAN/UPC code, when replicated (#2217/#2221). */
  productCode?: string;
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
//
// #2217: a mechanic's scanner reads the printed product/location code off the
// part and the bin, not their internal UUIDs, so `resolvePickScan` now takes
// a scanned product code and a scanned location code as the primary inputs.
// Exactly one of scannedSkuId/scannedProductCode and exactly one of
// scannedLocationId/scannedLocationCode may be supplied; the UUID pair is
// kept as an alternative the SDK still accepts, though the pick-execute page
// only ever sends the code pair.
export interface ScanResolveRequest {
  scannedSkuId?: string;
  scannedLocationId?: string;
  scannedProductCode?: string;
  scannedLocationCode?: string;
}

/** Evaluative only (ADR-0064 §1) — resolving a scan records no state; `matched`
 * plus `matchStatus` drive the confirm step's gating. `matchStatus` mirrors
 * the backend's `MatchStatus` (#2217): 'MATCHED' (both scans matched);
 * 'SKU_MISMATCH' (location matched, product did not); 'LOCATION_MISMATCH'
 * (product matched, location did not); 'NO_MATCH' (neither matched);
 * 'PRODUCT_CODE_UNAVAILABLE' / 'LOCATION_CODE_UNAVAILABLE' (a code was
 * scanned but the task carries no replicated code to compare against yet —
 * "cannot verify", not "wrong part/bin"). `expectedProductCode` /
 * `expectedLocationCode` / `expectedLocationBarcode` tell the mechanic what
 * the task actually expected. */
export interface ScanResolveResult {
  pickTaskId: string;
  matched: boolean;
  matchStatus?: string;
  resolvedSkuId?: string;
  resolvedLocationId?: string;
  expectedProductCode?: string;
  expectedLocationCode?: string;
  expectedLocationBarcode?: string;
}
