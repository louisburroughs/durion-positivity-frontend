import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { InventoryReferenceDataService } from '@durion-sdk/inventory';
import { ApiBaseService } from '../../../core/services/api-base.service';
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

@Injectable({ providedIn: 'root' })
export class InventoryDomainService {
  private readonly api = inject(ApiBaseService);
  private readonly refDataSdk = inject(InventoryReferenceDataService);

  queryAvailability(
    sku: string,
    locationId?: string,
    storageLocationId?: string,
  ): Observable<AvailabilityView[]> {
    let params = new HttpParams().set('productSku', sku);
    if (locationId) {
      params = params.set('locationId', locationId);
    }
    if (storageLocationId) {
      params = params.set('storageLocationId', storageLocationId);
    }
    return this.api.get<AvailabilityView>('/inventory/v1/availability/by-sku', params).pipe(
      map(view => (view ? [view] : [])),
    );
  }

  getLocations(): Observable<LocationRef[]> {
    return this.refDataSdk.listInventoryLocations({ size: 200 }).pipe(
      map((page: any) => ((page?.content ?? []) as Array<any>).map(dto => ({
        locationId: dto.locationId ?? '',
        name: dto.name ?? '',
        status: dto.active ? 'ACTIVE' : 'INACTIVE',
      }))),
    );
  }

  getStorageLocations(locationId: string): Observable<StorageLocation[]> {
    return this.refDataSdk.listInventoryStorageLocations({ size: 500 }, locationId).pipe(
      map((page: any) => ((page?.content ?? []) as Array<any>).map(dto => ({
        storageLocationId: dto.storageLocationId ?? '',
        locationId: dto.locationId ?? '',
        name: dto.code ?? '',
        barcode: undefined,
        status: dto.active ? 'ACTIVE' : 'INACTIVE',
      }))),
    );
  }

  getLocationZones(locationId: string): Observable<LocationZone[]> {
    return this.refDataSdk.listInventoryLocationZones({ size: 500 }, locationId).pipe(
      map((page: any) => ((page?.content ?? []) as Array<any>).map(dto => ({
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
    return this.api.get<LedgerPageResponse>('/inventory/v1/ledger', params);
  }

  getLedgerEntry(ledgerEntryId: string): Observable<InventoryLedgerEntry> {
    return this.api.get<InventoryLedgerEntry>(
      `/inventory/v1/ledger/${encodeURIComponent(ledgerEntryId)}`,
    );
  }

  getPutawayTasks(locationId?: string): Observable<PutawayTask[]> {
    let params = new HttpParams();
    if (locationId) {
      params = params.set('locationId', locationId);
    }
    return this.api.get<PutawayTask[]>('/inventory/v1/putaway/tasks', params);
  }

  completePutawayTask(taskId: string, body: PutawayCompleteRequest): Observable<PutawayResult> {
    return this.api.post<PutawayResult>(
      `/inventory/v1/putaway/tasks/${encodeURIComponent(taskId)}/complete`,
      body,
    );
  }

  getReplenishmentTasks(locationId?: string): Observable<ReplenishmentTask[]> {
    let params = new HttpParams();
    if (locationId) {
      params = params.set('locationId', locationId);
    }
    return this.api.get<ReplenishmentTask[]>('/inventory/v1/replenishment/tasks', params);
  }

  getReturnableItems(workorderId: string): Observable<ReturnableItem[]> {
    return this.api.get<ReturnableItem[]>(
      `/inventory/v1/workorders/${encodeURIComponent(workorderId)}/returnable-items`,
    );
  }

  getReasonCodes(type: string): Observable<ReturnReasonCode[]> {
    const params = new HttpParams().set('type', type);
    return this.api.get<ReturnReasonCode[]>('/inventory/v1/reasons', params);
  }

  submitReturnToStock(request: ReturnToStockRequest): Observable<ReturnToStockResult> {
    return this.api.post<ReturnToStockResult>(
      '/inventory/v1/movements/return-to-stock',
      request,
    );
  }

  getShortageOptions(
    workorderId: string,
    allocationLineId: string,
  ): Observable<ShortageOption[]> {
    return this.api.get<ShortageOption[]>(
      `/inventory/v1/workorders/${encodeURIComponent(workorderId)}/allocations/${encodeURIComponent(allocationLineId)}/shortage-options`,
    );
  }

  resolveShortage(request: ShortageResolutionRequest): Observable<ShortageResolutionResult> {
    return this.api.post<ShortageResolutionResult>(
      `/inventory/v1/workorders/${encodeURIComponent(request.workorderId)}/allocations/${encodeURIComponent(request.allocationLineId)}/resolve-shortage`,
      request,
    );
  }
}
