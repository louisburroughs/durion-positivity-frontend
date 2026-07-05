import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { InventoryAvailabilityService, InventoryReferenceDataService } from '@durion-sdk/inventory';
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
    return (this.refDataSdk.listInventoryLocations({ size: 200 }) as Observable<unknown>).pipe(
      map(page => pageContent<InventoryLocationDto>(page).map(dto => ({
        locationId: dto.locationId ?? '',
        name: dto.name ?? '',
        status: dto.active ? 'ACTIVE' : 'INACTIVE',
      }))),
    );
  }

  getStorageLocations(locationId: string): Observable<StorageLocation[]> {
    return (this.refDataSdk.listInventoryStorageLocations({ size: 500 }, locationId) as Observable<unknown>).pipe(
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
    return (this.refDataSdk.listInventoryLocationZones({ size: 500 }, locationId) as Observable<unknown>).pipe(
      map(page => pageContent<InventoryLocationZoneDto>(page).map(dto => ({
        zoneId: dto.zoneId ?? '',
        zoneName: dto.zoneName ?? '',
        locationId: dto.locationId ?? '',
      }))),
    );
  }

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

  getReturnableItems(workorderId: string): Observable<ReturnableItem[]> {
    const params = new HttpParams().set('workorderId', workorderId);
    return this.api.get<ReturnableItem[]>(
      '/inventory/v1/inventory/returns/returnable-items',
      params,
    );
  }

  getReasonCodes(type: string): Observable<ReturnReasonCode[]> {
    const params = new HttpParams().set('type', type);
    return this.api.get<ReturnReasonCode[]>('/inventory/v1/inventory/returns/reason-codes', params);
  }

  submitReturnToStock(request: ReturnToStockRequest): Observable<ReturnToStockResult> {
    return this.api.post<ReturnToStockResult>(
      '/inventory/v1/inventory/returns/submit-to-stock',
      request,
    );
  }

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
}
