import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { WorkorderPickFacadeService, WorkorderPickedItemsService } from '@durion-sdk/workorder';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  ConsumePickedItemsRequest,
  ConsumptionResult,
  PickConfirmRequest,
  PickExecuteLine,
  PickListView,
  PickedItemLine,
  ScanResolveRequest,
} from '../models/inventory-pick.models';

/**
 * InventoryPickService — fulfillment picking (CAP-218 #92, #243, #244): pick
 * list, mechanic picking (scan/confirm/complete), consume-picked-items.
 *
 * Moved out of `WorkexecService` (issue #347, group 5) — picking belongs to
 * inventory, even though a mechanic performs it on a workorder. Backend
 * operationId mapping (pos-workorder/openapi.yaml):
 *   getWorkorderPickList (facade)  → GET  /v1/workorders/{workorderId}/pick-list
 *   getPickTasks (facade)          → GET  /v1/workorders/{workorderId}/pick-list/tasks
 *   getPickedItems                 → GET  /v1/workorders/{workorderId}/picked-items
 *   consumeWorkorderPickedItems    → POST /v1/workorders/{workorderId}/picked-items:consume
 *
 * `resolvePickScan`/`confirmPickLine`/`completePickList` stay on `ApiBaseService`:
 * the SDK's `WorkorderPickFacadeService` models scan-resolve/confirm/complete at
 * per-pick-task granularity (`resolvePickScan(workorderId, pickTaskId, {...})`,
 * `confirmPickLine(workorderId, pickTaskId, pickLineId, ...)`, and a per-task
 * `completePickTask` rather than a whole-list `completePickList`), while these
 * local shapes (scanValue → PickExecuteLine[], pickLineId+quantity → single
 * PickExecuteLine, list-wide complete) are list-level and would need a
 * page-level redesign to track pickTaskId per line before this can migrate
 * safely (see SDK-03/SDK-05 baselines).
 */
@Injectable({ providedIn: 'root' })
export class InventoryPickService {
  private readonly api = inject(ApiBaseService);
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
   * The SDK splits the pick list into a header read and a task read; the page
   * model composes both. `EA` is the local default because the generated task
   * carries no unit of measure — a different UOM needs a backend contract
   * addition, never a derivation from SKU text.
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
        tasks: tasks.map(task => ({
          pickTaskId: task.pickTaskId,
          productSku: task.skuId,
          requestedQty: task.requiredQty,
          pickedQty: task.pickedQty,
          uom: 'EA',
          storageLocationId: task.locationId,
          status: task.status,
          sortOrder: task.sortOrder,
        })),
      })),
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

  // SDK follow-up: see class docblock. Left on ApiBaseService.
  resolvePickScan(workorderId: string, req: ScanResolveRequest): Observable<PickExecuteLine[]> {
    return this.api.post<PickExecuteLine[]>(
      `/workexec/v1/workorders/${encodeURIComponent(workorderId)}/picks/resolve-scan`,
      req,
    );
  }

  confirmPickLine(workorderId: string, req: PickConfirmRequest): Observable<PickExecuteLine> {
    return this.api.post<PickExecuteLine>(
      `/workexec/v1/workorders/${encodeURIComponent(workorderId)}/picks/confirm`,
      req,
    );
  }

  completePickList(
    workorderId: string,
  ): Observable<{ status: string; readonly completedAt?: string }> {
    return this.api.post<{ status: string; readonly completedAt?: string }>(
      `/workexec/v1/workorders/${encodeURIComponent(workorderId)}/picks/complete`,
      {},
    );
  }
}
