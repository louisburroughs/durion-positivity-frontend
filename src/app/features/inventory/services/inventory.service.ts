import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  InventoryAvailabilityService,
  InventoryLedgerEntryDto,
  InventoryLedgerService,
  InventoryReferenceDataService,
  LedgerPage,
  ReasonCodeDto,
  ReturnsService,
} from '@durion-sdk/inventory';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { pageContent } from '../../../core/util/spring-page';
import {
  AvailabilityView,
  InventoryLedgerEntry,
  LedgerFilter,
  LedgerPageResponse,
  LocationRef,
  LocationZone,
  PutawayCompleteRequest,
  PutawayResult,
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
  private readonly ledgerSdk = inject(InventoryLedgerService);
  private readonly returnsSdk = inject(ReturnsService);

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

  queryLedger(filter: LedgerFilter): Observable<LedgerPageResponse> {
    return this.ledgerSdk
      .listInventoryLedger(
        filter.productSku,
        filter.locationId,
        filter.storageLocationId,
        filter.dateFrom,
        filter.dateTo,
        filter.sourceTransactionId,
        filter.workorderId,
        filter.workorderLineId,
        filter.movementTypes,
        filter.pageToken,
        filter.pageSize,
      )
      .pipe(map(page => this.toLedgerPageResponse(page)));
  }

  getLedgerEntry(ledgerEntryId: string): Observable<InventoryLedgerEntry> {
    return this.ledgerSdk.getInventoryLedgerEntry(ledgerEntryId).pipe(
      map(dto => this.toLedgerEntry(dto)),
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

  completePutawayTask(taskId: string, body: PutawayCompleteRequest): Observable<PutawayResult> {
    return this.api.post<PutawayResult>(
      `/inventory/v1/inventory/putaway/tasks/${encodeURIComponent(taskId)}/complete`,
      body,
    );
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

  // D5 follow-up: the SDK's listShortageOptions requires sku and shortQuantity (plus
  // allocationId); neither is available at this call site's current shape, and
  // resolveShortage's ShortageResolveRequest needs the same additional fields plus an
  // idempotencyKey. Left on ApiBaseService pending an SDK model alignment or a wider
  // page-level request shape.
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

  private toLedgerPageResponse(page: LedgerPage): LedgerPageResponse {
    const entries = (page.entries ?? []) as InventoryLedgerEntryDto[];
    return {
      items: entries.map(dto => this.toLedgerEntry(dto)),
      nextPageToken: page.nextPageToken ?? null,
    };
  }

  private toLedgerEntry(dto: InventoryLedgerEntryDto): InventoryLedgerEntry {
    return {
      ledgerEntryId: dto.ledgerEntryId,
      timestamp: dto.timestamp,
      movementType: dto.eventType,
      productSku: dto.stockItemId,
      quantityChange: dto.changeInQuantity,
      uom: dto.unitOfMeasure ?? '',
      fromLocationId: dto.fromLocationId,
      toLocationId: dto.toLocationId,
      actorId: dto.transactionUserId,
      reasonCode: dto.reasonCode,
      sourceTransactionId: dto.sourceTransactionId,
    };
  }

  private toReturnReasonCode(dto: ReasonCodeDto): ReturnReasonCode {
    return { code: dto.code, label: dto.description };
  }
}
