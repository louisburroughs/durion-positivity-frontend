import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  AvailabilityView,
  InventoryLedgerEntry,
  LedgerFilter,
  LedgerPageResponse,
  LocationRef,
  PutawayCompleteRequest,
  PutawayResult,
  PutawayTask,
  ReplenishmentTask,
  StorageLocation,
} from '../models/inventory.models';

@Injectable({ providedIn: 'root' })
export class InventoryDomainService {
  private readonly api = inject(ApiBaseService);

  queryAvailability(
    sku: string,
    locationId?: string,
    storageLocationId?: string,
  ): Observable<AvailabilityView[]> {
    let params = new HttpParams().set('sku', sku);
    if (locationId) {
      params = params.set('locationId', locationId);
    }
    if (storageLocationId) {
      params = params.set('storageLocationId', storageLocationId);
    }
    return this.api.get<AvailabilityView[]>('/inventory/v1/availability', params);
  }

  getLocations(): Observable<LocationRef[]> {
    return this.api.get<LocationRef[]>('/inventory/v1/locations');
  }

  getStorageLocations(locationId: string): Observable<StorageLocation[]> {
    return this.api.get<StorageLocation[]>(
      `/inventory/v1/locations/${encodeURIComponent(locationId)}/storage-locations`,
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
}
