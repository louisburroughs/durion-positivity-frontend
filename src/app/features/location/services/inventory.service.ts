import { HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly api = inject(ApiBaseService);
  private static readonly BASE = '/v1/inventory';

  private idempotencyOptions(key?: string) {
    return key ? { headers: { 'Idempotency-Key': key } } : undefined;
  }

  listInventoryLocations(params?: { status?: string; pageIndex?: number; pageSize?: number }): Observable<unknown> {
    const httpParams = this.toHttpParams(params);
    return this.api.get<unknown>(`${InventoryService.BASE}/locations`, httpParams);
  }

  listStorageLocations(
    locationId: string,
    params?: { status?: string; pageIndex?: number; pageSize?: number },
  ): Observable<unknown> {
    let httpParams = this.toHttpParams(params);
    httpParams = httpParams.set('locationId', locationId);
    return this.api.get<unknown>(`${InventoryService.BASE}/storage-locations`, httpParams);
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

  listStorageTypes(): Observable<unknown> {
    return this.api.get<unknown>(`${InventoryService.BASE}/meta/storage-types`);
  }

  listSyncLogs(params?: { pageIndex?: number; pageSize?: number; outcome?: string }): Observable<unknown> {
    const httpParams = this.toHttpParams(params);
    return this.api.get<unknown>(`${InventoryService.BASE}/sync-logs`, httpParams);
  }

  getSyncLog(syncLogId: string): Observable<unknown> {
    return this.api.get<unknown>(`${InventoryService.BASE}/sync-logs/${syncLogId}`);
  }

  triggerLocationSync(idempotencyKey: string): Observable<unknown> {
    return this.api.post<unknown>(
      `${InventoryService.BASE}/locations/sync`,
      {},
      this.idempotencyOptions(idempotencyKey),
    );
  }

  private toHttpParams(params?: { status?: string; pageIndex?: number; pageSize?: number; outcome?: string }): HttpParams {
    let httpParams = new HttpParams();
    if (params?.status) {
      httpParams = httpParams.set('status', params.status);
    }
    if (params?.outcome) {
      httpParams = httpParams.set('outcome', params.outcome);
    }
    if (params?.pageIndex !== undefined) {
      httpParams = httpParams.set('pageIndex', String(params.pageIndex));
    }
    if (params?.pageSize !== undefined) {
      httpParams = httpParams.set('pageSize', String(params.pageSize));
    }
    return httpParams;
  }
}
