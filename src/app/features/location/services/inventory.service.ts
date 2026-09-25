import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { InventoryReferenceDataService, LocationSyncService } from '@durion-sdk/inventory';
import { pageContent } from '../../../core/utils/spring-page';
import {
  LocationDto,
  LocationSyncRunResponse,
  StorageLocationDto,
  SyncLogResponse,
} from '../models/location-sync.models';

/** Outcome filter accepted by the SDK `listSyncLogs` operation. */
type SyncLogOutcome = 'OK' | 'PARTIAL' | 'FAILED' | 'INVALID_PAYLOAD';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly refDataSdk = inject(InventoryReferenceDataService);
  private readonly locationSyncSdk = inject(LocationSyncService);

  listInventoryLocations(params?: { pageIndex?: number; pageSize?: number }): Observable<LocationDto[]> {
    return (this.refDataSdk.listInventoryLocations(undefined, params?.pageIndex, params?.pageSize) as Observable<unknown>).pipe(
      map(page => pageContent<LocationDto>(page)),
    );
  }

  listStorageLocations(
    locationId: string,
    params?: { pageIndex?: number; pageSize?: number },
  ): Observable<StorageLocationDto[]> {
    return (
      this.refDataSdk.listInventoryStorageLocations(locationId, params?.pageIndex, params?.pageSize) as Observable<unknown>
    ).pipe(map(page => pageContent<StorageLocationDto>(page)));
  }

  // Issue #371: getStorageLocation/createStorageLocation/updateStorageLocation/
  // deactivateStorageLocation used to live here, hand-built against
  // `/inventory/v1/inventory/storage-locations/...` — pos-inventory's read-only
  // placeholder module, not the storage-location owner. Storage-location CRUD lives in
  // pos-location's StorageLocationController (`/v1/locations/{siteId}/storage-locations`,
  // gateway `/location/**`) and was unreachable at this path (404). None of the four
  // methods had any caller (grep confirmed), so they were removed rather than repointed;
  // the real, site-scoped operations are LocationService.listStorageLocations/
  // createStorageLocation/deactivateStorageLocation (src/app/features/location/services/
  // location.service.ts), backed by @durion-sdk/location's StorageLocationAPIService and
  // already used by StorageLocationsPageComponent with siteId = the selected location.

  listStorageTypes(): Observable<string[]> {
    return this.refDataSdk.listStorageTypes();
  }

  listSyncLogs(params?: {
    pageIndex?: number;
    pageSize?: number;
    outcome?: SyncLogOutcome;
  }): Observable<SyncLogResponse[]> {
    return this.locationSyncSdk.listSyncLogs(
      params?.outcome,
      undefined,
      undefined,
      params?.pageIndex,
      params?.pageSize,
    );
  }

  getSyncLog(syncLogId: string): Observable<SyncLogResponse> {
    return this.locationSyncSdk.getSyncLog(syncLogId);
  }

  triggerLocationSync(idempotencyKey: string): Observable<LocationSyncRunResponse> {
    return this.locationSyncSdk.triggerLocationSync(idempotencyKey);
  }

  private toPageable(params?: { pageIndex?: number; pageSize?: number }): { page?: number; size?: number } {
    const pageable: { page?: number; size?: number } = {};
    if (params?.pageIndex !== undefined) {
      pageable.page = params.pageIndex;
    }
    if (params?.pageSize !== undefined) {
      pageable.size = params.pageSize;
    }
    return pageable;
  }
}
