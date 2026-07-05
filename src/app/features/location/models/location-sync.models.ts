import type { LocationSyncRunResponse, SyncLogResponse } from '@durion-sdk/inventory';

/**
 * Typed views over the inventory location-sync endpoints.
 *
 * `SyncLogResponse` and `LocationSyncRunResponse` are the generated SDK models
 * and are re-exported here so the location-sync page can consume them without
 * reaching into `@durion-sdk/inventory` directly.
 *
 * The paged location/storage-location reference-data endpoints are typed by the
 * generated SDK loosely as `Observable<string>`, so their row shapes are
 * described locally and narrowed in {@link InventoryService}.
 */
export type { LocationSyncRunResponse, SyncLogResponse };

/** A single inventory location row returned by the paged locations endpoint. */
export interface LocationDto {
  locationId: string;
  name?: string;
  type?: string;
  active?: boolean;
}

/** A single storage-location row returned by the paged storage-locations endpoint. */
export interface StorageLocationDto {
  storageLocationId: string;
  locationId?: string;
  code?: string;
  active?: boolean;
}
