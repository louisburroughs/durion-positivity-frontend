import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { InventoryReferenceDataService, LocationSyncService } from '@durion-sdk/inventory';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { pageContent } from '../../../core/util/spring-page';
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
  private readonly api = inject(ApiBaseService);
  private readonly refDataSdk = inject(InventoryReferenceDataService);
  private readonly locationSyncSdk = inject(LocationSyncService);

  // Gateway routes the inventory module under /{module}/v1/{domain}, i.e.
  // /api/inventory/v1/inventory/* (matches the SDK's InventoryConfiguration
  // basePath of `${apiBaseUrl}/inventory`). Without the leading /inventory
  // module segment these calls 404. Still used by the storage-location
  // write operations, which the generated SDK does not yet expose.
  private static readonly BASE = '/inventory/v1/inventory';

  private idempotencyOptions(key?: string) {
    return key ? { headers: { 'Idempotency-Key': key } } : undefined;
  }

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

  getStorageLocation(storageLocationId: string): Observable<unknown> {
    return this.api.get<unknown>(`${InventoryService.BASE}/storage-locations/${storageLocationId}`);
  }

  createStorageLocation(body: unknown, idempotencyKey?: string): Observable<unknown> {
    return this.api.post<unknown>(
      `${InventoryService.BASE}/storage-locations`,
      body,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  updateStorageLocation(storageLocationId: string, body: unknown, idempotencyKey?: string): Observable<unknown> {
    return this.api.put<unknown>(
      `${InventoryService.BASE}/storage-locations/${storageLocationId}`,
      body,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  deactivateStorageLocation(storageLocationId: string, body: unknown, idempotencyKey?: string): Observable<unknown> {
    return this.api.post<unknown>(
      `${InventoryService.BASE}/storage-locations/${storageLocationId}/deactivate`,
      body,
      this.idempotencyOptions(idempotencyKey),
    );
  }

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
