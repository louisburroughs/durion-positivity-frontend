import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  BayAPIService,
  LocationAPIService,
  MobileUnitAPIService,
  SiteDefaultsAPIService,
  StorageLocationControllerService,
} from '@durion-sdk/location';
import type {
  LocationRequestDTO,
  LocationPatchRequest,
  BayRequest,
  BayPatchRequest,
  MobileUnitRequest,
  SiteDefaultsRequest,
} from '@durion-sdk/location';

@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly locationApi = inject(LocationAPIService);
  private readonly bayApi = inject(BayAPIService);
  private readonly mobileUnitApi = inject(MobileUnitAPIService);
  private readonly siteDefaultsApi = inject(SiteDefaultsAPIService);
  private readonly storageLocationApi = inject(StorageLocationControllerService);

  // ── Locations ────────────────────────────────────────────────────────────

  getAllLocations(): Observable<unknown[]> {
    return this.locationApi.getAllLocations() as Observable<unknown[]>;
  }

  createLocation(body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.locationApi.createLocation(body as any as LocationRequestDTO) as Observable<unknown>;
  }

  getLocationById(locationId: string): Observable<unknown> {
    return this.locationApi.getLocationById(locationId) as Observable<unknown>;
  }

  patchLocation(locationId: string, patch: Record<string, unknown>): Observable<unknown> {
    return this.locationApi.patchLocation(locationId, patch as LocationPatchRequest) as Observable<unknown>;
  }

  updateLocation(locationId: string, body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.locationApi.updateLocation(locationId, body as any as LocationRequestDTO) as Observable<unknown>;
  }

  getLocationDefaults(locationId: string): Observable<unknown> {
    return this.siteDefaultsApi.getDefaults(locationId) as Observable<unknown>;
  }

  listStorageLocations(
    siteId: string,
    params?: { status?: string; pageIndex?: number; pageSize?: number },
  ): Observable<unknown> {
    const pageable = { page: params?.pageIndex, size: params?.pageSize };
    const status = params?.status as 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'QUARANTINED' | undefined;
    return this.storageLocationApi.list2(siteId, pageable, undefined, status) as Observable<unknown>;
  }

  configureLocationDefaults(locationId: string, body: unknown, idempotencyKey?: string): Observable<unknown> {
    return this.siteDefaultsApi.configureDefaults(locationId, body as SiteDefaultsRequest) as Observable<unknown>;
  }

  // ── Bays ─────────────────────────────────────────────────────────────────

  listBays(locationId: string): Observable<unknown[]> {
    return this.bayApi.listBays(locationId) as Observable<unknown[]>;
  }

  createBay(locationId: string, body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.bayApi.createBay(locationId, body as any as BayRequest) as Observable<unknown>;
  }

  getBay(locationId: string, bayId: string): Observable<unknown> {
    return this.bayApi.getBay(locationId, bayId) as Observable<unknown>;
  }

  patchBay(locationId: string, bayId: string, patch: Record<string, unknown>): Observable<unknown> {
    return this.bayApi.patchBay(locationId, bayId, patch as BayPatchRequest) as Observable<unknown>;
  }

  // ── Mobile Units ─────────────────────────────────────────────────────────

  listMobileUnits(params?: Record<string, string>): Observable<unknown[]> {
    const page = params?.['page'] !== undefined ? Number(params['page']) : undefined;
    const size = params?.['size'] !== undefined ? Number(params['size']) : undefined;
    return this.mobileUnitApi.listMobileUnits(page, size) as Observable<unknown[]>;
  }

  createMobileUnit(body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    return this.mobileUnitApi.createMobileUnit(body as MobileUnitRequest) as Observable<unknown>;
  }

  replaceCoverageRules(mobileUnitId: string, body: Record<string, unknown>[]): Observable<unknown> {
    // The SDK generated signature uses { [key: string]: any } but the actual payload is an array;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.mobileUnitApi.replaceCoverageRules(mobileUnitId, body as any) as Observable<unknown>;
  }
}
