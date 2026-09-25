import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { WorkorderPickFacadeService, WorkorderPickedItemsService, WorkorderPickTaskResponse } from '@durion-sdk/workorder';
import {
  ConsumePickedItemsRequest,
  ConsumptionResult,
  PickListView,
  PickTaskLine,
  PickedItemLine,
  ScanResolveRequest,
  ScanResolveResult,
} from '../models/inventory-pick.models';

/**
 * InventoryPickService — fulfillment picking (CAP-218 #92, #243, #244): pick
 * list, mechanic picking (scan/confirm/complete), consume-picked-items.
 *
 * Moved out of `WorkexecService` (issue #347, group 5) — picking belongs to
 * inventory, even though a mechanic performs it on a workorder. Backend
 * operationId mapping (pos-workorder/openapi.yaml, `WorkorderPickFacadeController`
 * / `WorkorderPickedItemsController`), all through `@durion-sdk/workorder`:
 *   getWorkorderPickList  → GET  /v1/workorders/{workorderId}/pick-list
 *   getPickTasks           → GET  /v1/workorders/{workorderId}/pick-list/tasks
 *   getPickedItems         → GET  /v1/workorders/{workorderId}/picked-items
 *   consumeWorkorderPickedItems → POST /v1/workorders/{workorderId}/picked-items:consume
 *   resolvePickScan   → POST /v1/workorders/{workorderId}/pick-tasks/{pickTaskId}:resolve-scan
 *   confirmPickLine   → POST /v1/workorders/{workorderId}/pick-tasks/{pickTaskId}/lines/{pickLineId}:confirm
 *   completePickTask  → POST /v1/workorders/{workorderId}/pick-tasks/{pickTaskId}:complete
 *
 * issue #369: `resolvePickScan`/`confirmPickLine`/`completePickTask` used to post
 * to `/workexec/v1/workorders/{id}/picks/...` off `ApiBaseService` — a gateway
 * prefix (`/workexec/**`) that `pos-api-gateway` never routed, so every scan,
 * confirm, and complete 404'd. Migrated to the per-pick-task
 * `WorkorderPickFacadeService` operations; `ApiBaseService` is no longer used
 * anywhere in this service. `confirmPickLine` and `completePickTask` queue an
 * asynchronous command over the Kafka feed (ADR-0044) and answer 202 PENDING;
 * callers must re-read `getPickTasks` to observe the applied state — see
 * `PickExecutePageComponent`'s post-mutation readback.
 */
@Injectable({ providedIn: 'root' })
export class InventoryPickService {
  private readonly workorderPickFacade = inject(WorkorderPickFacadeService);
  private readonly workorderPickedItems = inject(WorkorderPickedItemsService);

  /**
   * Adapts local ConsumePickedItemsRequest (lines with pickedItemId/quantity) to SDK
   * ConsumePickedItemsRequest (items with pickTaskId/quantityToConsume).
   */
  private toSdkConsumePickedItemsRequest(r: ConsumePickedItemsRequest): import('@durion-sdk/workorder').ConsumePickedItemsRequest {
    return {
      items: r.lines.map(line => ({
        pickTaskId: line.pickedItemId,
        quantityToConsume: line.quantity,
      })),
    };
  }

  /**
   * `EA` is the local default because the generated task carries no unit of
   * measure — a different UOM needs a backend contract addition, never a
   * derivation from SKU text.
   */
  private mapTask(task: WorkorderPickTaskResponse): PickTaskLine {
    return {
      pickTaskId: task.pickTaskId,
      productSku: task.skuId,
      requestedQty: task.requiredQty,
      pickedQty: task.pickedQty,
      uom: 'EA',
      storageLocationId: task.locationId,
      // #2221: the human-readable location name (served as storageLocationCode),
      // its barcode, and the SKU's scannable code — null on a task last updated
      // before scan codes were replicated; never fall back to the raw UUID
      // (ADR-0064 §5).
      storageLocationCode: task.storageLocationCode,
      storageLocationBarcode: task.storageLocationBarcode,
      productCode: task.productCode,
      status: task.status,
      sortOrder: task.sortOrder,
    };
  }

  /**
   * The SDK splits the pick list into a header read and a task read; the page
   * model composes both.
   *
   * Emits `null` when the header read answers 404: the workorder has no pick
   * list yet (labour-only job, or inventory has not generated one). Only the
   * header's 404 means that; a 404 from the task read, or any other failure,
   * still errors (#286).
   */
  getWorkorderPickList(workorderId: string): Observable<PickListView | null> {
    return forkJoin({
      header: this.workorderPickFacade.getWorkorderPickList(workorderId).pipe(
        catchError(err => (err?.status === 404 ? of(null) : throwError(() => err))),
      ),
      tasks: this.workorderPickFacade.getPickTasks(workorderId),
    }).pipe(
      map(({ header, tasks }) => header && ({
        workorderId: header.workorderId,
        pickListId: header.pickListId,
        status: header.status,
        createdAt: header.createdAt,
        tasks: tasks.map(task => this.mapTask(task)),
      })),
    );
  }

  /** Read-only replica projection (issue #369) — the readback a mechanic's
   * confirm/complete action re-runs to observe the queued command's applied
   * state; also the source for the task picker `PickExecutePageComponent`
   * lists from. */
  getPickTasks(workorderId: string): Observable<PickTaskLine[]> {
    return this.workorderPickFacade.getPickTasks(workorderId).pipe(
      map(tasks => tasks.map(task => this.mapTask(task))),
    );
  }

  getPickedItems(workorderId: string): Observable<PickedItemLine[]> {
    return this.workorderPickedItems.getPickedItems(workorderId) as unknown as Observable<PickedItemLine[]>;
  }

  consumePickedItems(
    workorderId: string,
    request: ConsumePickedItemsRequest,
  ): Observable<ConsumptionResult> {
    return this.workorderPickedItems.consumeWorkorderPickedItems(workorderId, this.toSdkConsumePickedItemsRequest(request)) as unknown as Observable<ConsumptionResult>;
  }

  /**
   * Evaluative only — no pick state changes; validates a scan against
   * `pickTaskId`'s expected product/location before `confirmPickLine`.
   *
   * #2217: forwards only the fields the caller actually supplied — a scanner
   * flow sends `scannedProductCode`/`scannedLocationCode`; the UUID pair
   * (`scannedSkuId`/`scannedLocationId`) is still accepted as an alternative
   * so a caller with ids on hand need not fabricate codes. Sending both of a
   * pair, or neither, is a 400 VALIDATION_FAILED the backend itself enforces.
   */
  resolvePickScan(workorderId: string, pickTaskId: string, req: ScanResolveRequest): Observable<ScanResolveResult> {
    return this.workorderPickFacade
      .resolvePickScan(workorderId, pickTaskId, {
        ...(req.scannedProductCode !== undefined && { scannedProductCode: req.scannedProductCode }),
        ...(req.scannedLocationCode !== undefined && { scannedLocationCode: req.scannedLocationCode }),
        ...(req.scannedSkuId !== undefined && { scannedSkuId: req.scannedSkuId }),
        ...(req.scannedLocationId !== undefined && { scannedLocationId: req.scannedLocationId }),
      })
      .pipe(
        map(res => ({
          pickTaskId: res.pickTaskId,
          matched: res.matched,
          matchStatus: res.matchStatus,
          resolvedSkuId: res.resolvedSkuId,
          resolvedLocationId: res.resolvedLocationId,
          expectedProductCode: res.expectedProductCode,
          expectedLocationCode: res.expectedLocationCode,
          expectedLocationBarcode: res.expectedLocationBarcode,
        })),
      );
  }

  /** `pickLineId` equals `pickTaskId` in the current single-line-per-task
   * model (SDK docblock). Queues a partial-quantity confirm; 202 PENDING. */
  confirmPickLine(workorderId: string, pickTaskId: string, quantityPicked: number): Observable<PickTaskLine> {
    return this.workorderPickFacade
      .confirmPickLine(workorderId, pickTaskId, pickTaskId, { quantityPicked })
      .pipe(map(task => this.mapTask(task)));
  }

  /** Queues confirmation of the task's full remaining quantity; 202 PENDING,
   * or 200 with the current state when nothing is left to pick. */
  completePickTask(workorderId: string, pickTaskId: string, reason?: string): Observable<PickTaskLine> {
    return this.workorderPickFacade
      .completePickTask(workorderId, pickTaskId, reason ? { reason } : {})
      .pipe(map(task => this.mapTask(task)));
  }
}
