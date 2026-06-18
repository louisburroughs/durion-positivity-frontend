import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  BayAPIService,
  LocationAPIService,
  MobileUnitAPIService,
  SiteDefaultsAPIService,
  StorageLocationAPIService,
} from '@durion-sdk/location';
import type {
  CoverageRuleRequest,
  LocationRequestDTO,
  LocationPatchRequest,
  BayRequest,
  BayPatchRequest,
  MobileUnitRequest,
  SiteDefaultsRequest,
  StorageLocationRequest,
  StorageLocationPatchRequest,
} from '@durion-sdk/location';

/**
 * Storage location types exposed by the location service
 * (StorageLocationType enum). The location service has no meta endpoint, so the
 * stable enum set is provided client-side for the create form.
 */
export const STORAGE_LOCATION_TYPES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'FLOOR', label: 'Floor' },
  { value: 'SHELF', label: 'Shelf' },
  { value: 'BIN', label: 'Bin' },
  { value: 'CAGE', label: 'Cage' },
  { value: 'TRUCK', label: 'Truck' },
];

@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly locationApi = inject(LocationAPIService);
  private readonly bayApi = inject(BayAPIService);
  private readonly mobileUnitApi = inject(MobileUnitAPIService);
  private readonly siteDefaultsApi = inject(SiteDefaultsAPIService);
  private readonly storageLocationApi = inject(StorageLocationAPIService);

  // ── Locations ────────────────────────────────────────────────────────────

  getAllLocations(): Observable<unknown[]> {
    return this.locationApi.getAllLocations() as Observable<unknown[]>;
  }

  createLocation(body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    const request = this.toLocationRequest(body);
    return this.locationApi.createLocation(request) as Observable<unknown>;
  }

  getLocationById(locationId: string): Observable<unknown> {
    return this.locationApi.getLocationById(locationId) as Observable<unknown>;
  }

  patchLocation(locationId: string, patch: Record<string, unknown>): Observable<unknown> {
    return this.locationApi.patchLocation(locationId, patch as LocationPatchRequest) as Observable<unknown>;
  }

  updateLocation(locationId: string, body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    const request = this.toLocationRequest(body);
    return this.locationApi.updateLocation(locationId, request) as Observable<unknown>;
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

  // NOTE: idempotencyKey is accepted for parity with the other write methods on
  // this service, but the location SDK's create2/patch2 expose no Idempotency-Key
  // header hook, so it is not yet forwarded. Threading it via an HttpContext
  // interceptor is a separate follow-up.
  createStorageLocation(
    siteId: string,
    body: Record<string, unknown>,
    idempotencyKey?: string,
  ): Observable<unknown> {
    const request: StorageLocationRequest = {
      name: this.asOptionalString(body['name']) as string,
      type: this.asOptionalString(body['type']) as StorageLocationRequest['type'],
      barcode: this.asOptionalString(body['barcode']),
      parentStorageLocationId: this.asOptionalString(body['parentStorageLocationId']),
    };
    return this.storageLocationApi.create2(siteId, request) as Observable<unknown>;
  }

  /**
   * Deactivates a storage location by patching its status to INACTIVE. An
   * optional destination is forwarded for the relocate-on-deactivate flow.
   */
  deactivateStorageLocation(
    siteId: string,
    storageLocationId: string,
    body: Record<string, unknown>,
    idempotencyKey?: string,
  ): Observable<unknown> {
    const patch: StorageLocationPatchRequest = {
      status: 'INACTIVE' as StorageLocationPatchRequest['status'],
      destinationStorageLocationId: this.asOptionalString(body['destinationStorageLocationId']),
    };
    return this.storageLocationApi.patch2(siteId, storageLocationId, patch) as Observable<unknown>;
  }

  configureLocationDefaults(locationId: string, body: unknown, idempotencyKey?: string): Observable<unknown> {
    return this.siteDefaultsApi.configureDefaults(locationId, body as SiteDefaultsRequest) as Observable<unknown>;
  }

  // ── Bays ─────────────────────────────────────────────────────────────────

  listBays(locationId: string): Observable<unknown[]> {
    return (this.bayApi.listBays(locationId) as Observable<unknown>).pipe(map(toContentArray));
  }

  createBay(locationId: string, body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    const request = this.toBayRequest(body);
    return this.bayApi.createBay(locationId, request) as Observable<unknown>;
  }

  getBay(locationId: string, bayId: string): Observable<unknown> {
    return this.bayApi.getBay(locationId, bayId) as Observable<unknown>;
  }

  patchBay(locationId: string, bayId: string, patch: Record<string, unknown>): Observable<unknown> {
    return this.bayApi.patchBay(locationId, bayId, patch as BayPatchRequest) as Observable<unknown>;
  }

  // ── Mobile Units ─────────────────────────────────────────────────────────

  listMobileUnits(params?: Record<string, string>): Observable<unknown[]> {
    const page = params?.['page'] ? Number(params['page']) : undefined;
    const size = params?.['size'] ? Number(params['size']) : undefined;
    return (this.mobileUnitApi.listMobileUnits(page, size) as Observable<unknown>).pipe(map(toContentArray));
  }

  createMobileUnit(body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    const request = this.toMobileUnitRequest(body);
    return this.mobileUnitApi.createMobileUnit(request) as Observable<unknown>;
  }

  replaceCoverageRules(mobileUnitId: string, body: Record<string, unknown>[]): Observable<unknown> {
    const requestBody = this.toCoverageRulesReplaceRequest(body);
    return this.mobileUnitApi.replaceCoverageRules(mobileUnitId, requestBody) as Observable<unknown>;
  }

  private toLocationRequest(body: Record<string, unknown>): LocationRequestDTO {
    return {
      name: this.asString(body['name']),
      code: this.asString(body['code']),
      geographicalLocationId: this.asOptionalString(body['geographicalLocationId']),
      addressLine1: this.asOptionalString(body['addressLine1']),
      addressLine2: this.asOptionalString(body['addressLine2']),
      city: this.asOptionalString(body['city']),
      state: this.asOptionalString(body['state']),
      postalCode: this.asOptionalString(body['postalCode']),
      country: this.asOptionalString(body['country']),
      mailingAddress: this.asOptionalString(body['mailingAddress']),
      active: this.asOptionalBoolean(body['active']),
      responsiblePersonId: this.asOptionalNumber(body['responsiblePersonId']),
      timezone: this.asOptionalString(body['timezone']),
      operatingHours: this.asArray(body['operatingHours']),
      holidayClosures: this.asArray(body['holidayClosures']),
      checkInBufferMinutes: this.asOptionalNumber(body['checkInBufferMinutes']),
      cleanupBufferMinutes: this.asOptionalNumber(body['cleanupBufferMinutes']),
      type: this.asLocationType(body['type']),
      parents: this.asRecord(body['parents']),
    };
  }

  private toBayRequest(body: Record<string, unknown>): BayRequest {
    const maxConcurrentVehicles = this.asOptionalNumber(body['maxConcurrentVehicles']) ?? 0;
    const capacity = this.asRecord(body['capacity']);

    return {
      name: this.asString(body['name']),
      bayType: this.asString(body['bayType']),
      capacity: {
        maxConcurrentVehicles: this.asOptionalNumber(capacity['maxConcurrentVehicles']) ?? maxConcurrentVehicles,
      },
      maxConcurrentVehicles,
      serviceCapabilityIds: this.asStringArray(body['serviceCapabilityIds']),
      skillRequirementIds: this.asStringArray(body['skillRequirementIds']),
      status: this.asOptionalString(body['status']),
    };
  }

  private toMobileUnitRequest(body: Record<string, unknown>): MobileUnitRequest {
    return {
      name: this.asOptionalString(body['name']) as string,
      baseLocationId: this.asOptionalString(body['baseLocationId']),
      status: this.asOptionalString(body['status']),
      travelBufferPolicyId: this.asOptionalString(body['travelBufferPolicyId']),
      notes: this.asOptionalString(body['notes']),
      capabilityIds: this.asStringArray(body['capabilityIds']),
      coverageRules: this.toCoverageRuleArray(body['coverageRules']),
    };
  }

  private toCoverageRulesReplaceRequest(body: Record<string, unknown>[]): { [key: string]: unknown } {
    return {
      rules: body.map(rule => this.toCoverageRuleRequest(rule)),
    };
  }

  private toCoverageRuleArray(value: unknown): CoverageRuleRequest[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }
    return value
      .filter((entry): entry is Record<string, unknown> => this.isRecord(entry))
      .map(entry => this.toCoverageRuleRequest(entry));
  }

  private toCoverageRuleRequest(rule: Record<string, unknown>): CoverageRuleRequest {
    return {
      serviceAreaId: this.asOptionalString(rule['serviceAreaId']) as string,
      ruleType: this.asOptionalString(rule['ruleType']) as string,
      priority: this.asOptionalNumber(rule['priority']),
      validFrom: this.asOptionalString(rule['validFrom']),
      validTo: this.asOptionalString(rule['validTo']),
      maxDistance: this.asOptionalNumber(rule['maxDistance']),
    };
  }

  private asLocationType(value: unknown): { id?: string; name?: string; description?: string } {
    const record = this.asRecord(value);
    return {
      id: this.asOptionalString(record['id']),
      name: this.asOptionalString(record['name']) ?? this.asString(record['name']),
      description: this.asOptionalString(record['description']),
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }

  private asArray<T = unknown>(value: unknown): T[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }
    return value as T[];
  }

  private asStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }
    return value.filter((item): item is string => typeof item === 'string');
  }

  private asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private asOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private asOptionalBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}

/**
 * Unwraps a list response into a plain array. Backend list endpoints return a
 * Spring Data page (`{ content: [...] }`); some return `{ items: [...] }` or a
 * bare array. Normalizes all three so callers always receive an array.
 */
function toContentArray(response: unknown): unknown[] {
  if (Array.isArray(response)) {
    return response;
  }
  const page = response as { content?: unknown[]; items?: unknown[] } | null;
  return page?.content ?? page?.items ?? [];
}
