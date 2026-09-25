import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  InventoryAvailabilityService,
  InventoryReferenceDataService,
  PutawayExecutionResponse as SdkPutawayExecutionResponse,
  PutawayExecutionService,
  ReasonCodeDto,
  ReturnsService,
} from '@durion-sdk/inventory';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { pageContent } from '../../../core/utils/spring-page';
import {
  AvailabilityView,
  InventoryLedgerEntry,
  LedgerFilter,
  LedgerPageResponse,
  LocationRef,
  LocationZone,
  PutawayExecuteRequest,
  PutawayExecutionResult,
  PutawayTask,
  ReturnReasonCode,
  ReturnToStockRequest,
  ReturnToStockResult,
  ReturnableItem,
  ReplenishmentTask,
  ShortageOption,
  ShortageResolutionRequest,
  ShortageResolutionResult,
  StorageLocation,
} from '../models/inventory.models';

/**
 * Minimal shapes of the paged reference-data DTOs. The generated inventory SDK
 * types these list endpoints loosely as `Observable<string>`, so the concrete
 * response fields are described here and narrowed via {@link pageContent}.
 */
interface InventoryLocationDto {
  locationId?: string;
  name?: string;
  active?: boolean;
}

interface InventoryStorageLocationDto {
  storageLocationId?: string;
  locationId?: string;
  code?: string;
  active?: boolean;
}

interface InventoryLocationZoneDto {
  zoneId?: string;
  zoneName?: string;
  locationId?: string;
}

@Injectable({ providedIn: 'root' })
export class InventoryDomainService {
  private readonly api = inject(ApiBaseService);
  private readonly refDataSdk = inject(InventoryReferenceDataService);
  private readonly availabilitySdk = inject(InventoryAvailabilityService);
  private readonly returnsSdk = inject(ReturnsService);
  private readonly putawayExecutionSdk = inject(PutawayExecutionService);

  queryAvailability(
    sku: string,
    locationId?: string,
    storageLocationId?: string,
  ): Observable<AvailabilityView[]> {
    return this.availabilitySdk.listAvailabilityBySku(sku, locationId, storageLocationId).pipe(
      map(view => (view ? [view as unknown as AvailabilityView] : [])),
    );
  }

  getLocations(): Observable<LocationRef[]> {
    return (this.refDataSdk.listInventoryLocations(undefined, undefined, 200) as Observable<unknown>).pipe(
      map(page => pageContent<InventoryLocationDto>(page).map(dto => ({
        locationId: dto.locationId ?? '',
        name: dto.name ?? '',
        status: dto.active ? 'ACTIVE' : 'INACTIVE',
      }))),
    );
  }

  getStorageLocations(locationId: string): Observable<StorageLocation[]> {
    return (this.refDataSdk.listInventoryStorageLocations(locationId, undefined, 500) as Observable<unknown>).pipe(
      map(page => pageContent<InventoryStorageLocationDto>(page).map(dto => ({
        storageLocationId: dto.storageLocationId ?? '',
        locationId: dto.locationId ?? '',
        name: dto.code ?? '',
        barcode: undefined,
        status: dto.active ? 'ACTIVE' : 'INACTIVE',
      }))),
    );
  }

  getLocationZones(locationId: string): Observable<LocationZone[]> {
    return (this.refDataSdk.listInventoryLocationZones(locationId, undefined, 500) as Observable<unknown>).pipe(
      map(page => pageContent<InventoryLocationZoneDto>(page).map(dto => ({
        zoneId: dto.zoneId ?? '',
        zoneName: dto.zoneName ?? '',
        locationId: dto.locationId ?? '',
      }))),
    );
  }

  // D5 follow-up (docs/PRD-sdk-migration-completion.md): InventoryLedgerEntryDto has no
  // fromStorageLocationId/toStorageLocationId/workorderId/workorderLineId — the ledger detail
  // page renders all four, and the SDK shape cannot produce them. Left on ApiBaseService
  // pending an SDK model alignment rather than silently dropping them.
  queryLedger(filter: LedgerFilter): Observable<LedgerPageResponse> {
    let params = new HttpParams();
    if (filter.productSku != null) { params = params.set('productSku', filter.productSku); }
    if (filter.locationId != null) { params = params.set('locationId', filter.locationId); }
    if (filter.storageLocationId != null) { params = params.set('storageLocationId', filter.storageLocationId); }
    if (filter.dateFrom != null) { params = params.set('dateFrom', filter.dateFrom); }
    if (filter.dateTo != null) { params = params.set('dateTo', filter.dateTo); }
    if (filter.sourceTransactionId != null) { params = params.set('sourceTransactionId', filter.sourceTransactionId); }
    if (filter.workorderId != null) { params = params.set('workorderId', filter.workorderId); }
    if (filter.workorderLineId != null) { params = params.set('workorderLineId', filter.workorderLineId); }
    if (filter.pageSize != null) { params = params.set('pageSize', String(filter.pageSize)); }
    if (filter.pageToken != null) { params = params.set('pageToken', filter.pageToken); }
    if (filter.movementTypes != null && filter.movementTypes.length > 0) {
      filter.movementTypes.forEach(t => { params = params.append('movementTypes', t); });
    }
    return this.api.get<LedgerPageResponse>('/inventory/v1/inventory/ledger', params);
  }

  getLedgerEntry(ledgerEntryId: string): Observable<InventoryLedgerEntry> {
    return this.api.get<InventoryLedgerEntry>(
      `/inventory/v1/inventory/ledger/${encodeURIComponent(ledgerEntryId)}`,
    );
  }

  // D5 follow-up (docs/PRD-sdk-migration-completion.md): the generated putaway/
  // replenishment/returnable-items/shortage operations describe a source/destination
  // shape with no top-level site `locationId` and no `uom`, which this local model
  // needs; migrating would silently drop or fabricate data rather than rename fields.
  // Left on ApiBaseService pending SDK model alignment.
  getPutawayTasks(locationId?: string): Observable<PutawayTask[]> {
    let params = new HttpParams();
    if (locationId) {
      params = params.set('locationId', locationId);
    }
    return this.api.get<PutawayTask[]>('/inventory/v1/inventory/putaway/tasks', params);
  }

  /**
   * (issue #377) The backend has no `/putaway/tasks/{taskId}/complete` endpoint;
   * `PutawayExecuteController` only exposes `POST .../tasks/{taskId}/execute`, whose
   * `PutawayExecutionRequest` (skuId/sourceLocationId/destinationLocationId/quantity)
   * matches the SDK's `PutawayExecutionService.executePutaway` exactly.
   */
  executePutawayTask(taskId: string, request: PutawayExecuteRequest): Observable<PutawayExecutionResult> {
    return this.putawayExecutionSdk
      .executePutaway(taskId, {
        skuId: request.skuId,
        sourceLocationId: request.sourceLocationId,
        destinationLocationId: request.destinationLocationId,
        quantity: request.quantity,
      })
      .pipe(map(response => this.toPutawayExecutionResult(response)));
  }

  getReplenishmentTasks(locationId?: string): Observable<ReplenishmentTask[]> {
    let params = new HttpParams();
    if (locationId) {
      params = params.set('locationId', locationId);
    }
    return this.api.get<ReplenishmentTask[]>('/inventory/v1/inventory/replenishment/tasks', params);
  }

  // D5 follow-up: SDK's ReturnableItemDto has no `uom` and keys the returnable row by
  // `itemId`, not `workorderLineId` (this endpoint is also a documented backend stub).
  // Left on ApiBaseService pending SDK model alignment.
  getReturnableItems(workorderId: string): Observable<ReturnableItem[]> {
    const params = new HttpParams().set('workorderId', workorderId);
    return this.api.get<ReturnableItem[]>(
      '/inventory/v1/inventory/returns/returnable-items',
      params,
    );
  }

  // `type` is unused by the SDK's fixed reason-code catalog (no filter support) but
  // stays in the signature so callers don't churn.
  getReasonCodes(_type: string): Observable<ReturnReasonCode[]> {
    return this.returnsSdk.listReturnReasonCodes().pipe(
      map((codes: ReasonCodeDto[]) => codes.map(dto => this.toReturnReasonCode(dto))),
    );
  }

  // D5 follow-up: the SDK's ReturnSubmitRequest carries only workorderId + lines; it
  // drops locationId/storageLocationId/reasonCode, which this request needs per line.
  // Left on ApiBaseService pending SDK model alignment.
  submitReturnToStock(request: ReturnToStockRequest): Observable<ReturnToStockResult> {
    return this.api.post<ReturnToStockResult>(
      '/inventory/v1/inventory/returns/submit-to-stock',
      request,
    );
  }

  // D5 follow-up (issue #378, backend #2206): `ShortageController` requires sku,
  // shortQuantity, workorderLineId and siteId in addition to allocationId, and
  // resolveShortage's request needs the same fields plus an idempotencyKey. Neither is
  // available at this call site's current shape, and there is no cheap existing read to
  // supply them, so `ShortageResolutionPageComponent` no longer calls either method —
  // it shows a "not available yet" notice instead of sending a request that will 400.
  // Left on ApiBaseService pending an SDK model alignment or a wider page-level request
  // shape once backend #2206 lands.
  getShortageOptions(allocationLineId: string): Observable<ShortageOption[]> {
    const params = new HttpParams().set('allocationId', allocationLineId);
    return this.api.get<ShortageOption[]>(
      '/inventory/v1/inventory/shortage/options',
      params,
    );
  }

  resolveShortage(request: ShortageResolutionRequest): Observable<ShortageResolutionResult> {
    return this.api.post<ShortageResolutionResult>(
      '/inventory/v1/inventory/shortage/resolve',
      request,
    );
  }

  private toReturnReasonCode(dto: ReasonCodeDto): ReturnReasonCode {
    return { code: dto.code, label: dto.description };
  }

  private toPutawayExecutionResult(response: SdkPutawayExecutionResponse): PutawayExecutionResult {
    return {
      ledgerEntryId: response.ledgerEntryId,
      taskId: response.taskId,
      skuId: response.skuId,
      sourceLocationId: response.sourceLocationId,
      destinationLocationId: response.destinationLocationId,
      quantityMoved: response.quantityMoved,
      transactionType: response.transactionType,
      status: response.status,
      executedAt: response.executedAt,
      actorId: response.actorId,
    };
  }
}
