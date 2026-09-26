import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { ProductsAPIService } from '@durion-sdk/catalog';
import type { ServiceDto } from '@durion-sdk/catalog';
import {
  BayAPIService,
  LocationAPIService,
  MobileUnitAPIService,
  MobileUnitEligibilityControllerService,
  ServiceAreaAPIService,
  SiteDefaultsAPIService,
  StorageLocationAPIService,
  TravelBufferPolicyAPIService,
} from '@durion-sdk/location';
import type {
  CoverageRuleRequest,
  CoverageRuleResponse,
  EligibleMobileUnitResponse,
  LocationRequestDTO,
  LocationPatchRequest,
  BayRequest,
  BayPatchRequest,
  BayResponse,
  MobileUnitRequest,
  MobileUnitResponse,
  ServiceAreaResponse,
  SiteDefaultsRequest,
  StorageLocationRequest,
  StorageLocationPatchRequest,
  TravelBufferPolicyResponse,
} from '@durion-sdk/location';
import type { MobileUnitPatch } from '../models/mobile-unit-setup.models';

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

/**
 * Rows asked for from the paged bay list. Matches the other bay readers
 * (`capacity-calendar.service.ts`, `shop-dashboard.service.ts`): a truncation mitigation, not a
 * completeness guarantee, since the Spring page silently drops rows past it.
 */
const BAY_PAGE_SIZE = 500;

/** Rows asked for from the paged mobile-unit list; the same cap `shop-dashboard.service.ts` uses. */
const MOBILE_UNIT_PAGE_SIZE = 500;

/** Coverage rules per mobile unit id. `ok` is false when any unit's read failed (ADR-0064). */
export interface CoverageRead {
  readonly rules: ReadonlyMap<string, readonly CoverageRuleResponse[]>;
  readonly ok: boolean;
}

/** A catalog service a bay or mobile unit can claim: only services with an operation code qualify. */
export interface ClaimableService {
  readonly operationCode: string;
  readonly name: string;
  readonly operationCategory: string | null;
}

@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly locationApi = inject(LocationAPIService);
  private readonly bayApi = inject(BayAPIService);
  private readonly mobileUnitApi = inject(MobileUnitAPIService);
  private readonly mobileUnitEligibilityApi = inject(MobileUnitEligibilityControllerService);
  private readonly serviceAreaApi = inject(ServiceAreaAPIService);
  private readonly travelBufferPolicyApi = inject(TravelBufferPolicyAPIService);
  private readonly siteDefaultsApi = inject(SiteDefaultsAPIService);
  private readonly storageLocationApi = inject(StorageLocationAPIService);
  /** `searchCatalogServices` lives on the catalog's products API. */
  private readonly catalogProductsApi = inject(ProductsAPIService);

  // ── Locations ────────────────────────────────────────────────────────────

  getAllLocations(): Observable<unknown[]> {
    return this.locationApi.listLocations() as Observable<unknown[]>;
  }

  createLocation(body: Record<string, unknown>, _idempotencyKey?: string): Observable<unknown> {
    const request = this.toLocationRequest(body);
    return this.locationApi.createLocation(request) as Observable<unknown>;
  }

  getLocationById(locationId: string): Observable<unknown> {
    return this.locationApi.getLocationById(locationId) as Observable<unknown>;
  }

  patchLocation(locationId: string, patch: Record<string, unknown>): Observable<unknown> {
    return this.locationApi.patchLocation(locationId, patch as LocationPatchRequest) as Observable<unknown>;
  }

  updateLocation(locationId: string, body: Record<string, unknown>, _idempotencyKey?: string): Observable<unknown> {
    const request = this.toLocationRequest(body);
    return this.locationApi.updateLocation(locationId, request) as Observable<unknown>;
  }

  getLocationDefaults(locationId: string): Observable<unknown> {
    return this.siteDefaultsApi.getSiteDefaults(locationId) as Observable<unknown>;
  }

  listStorageLocations(
    siteId: string,
    params?: { status?: string; pageIndex?: number; pageSize?: number },
  ): Observable<unknown> {
    const status = params?.status as 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'QUARANTINED' | undefined;
    return this.storageLocationApi.listStorageLocations(
      siteId,
      undefined,
      status,
      params?.pageIndex,
      params?.pageSize,
    ) as Observable<unknown>;
  }

  // NOTE: idempotencyKey is accepted for parity with the other write methods on
  // this service, but the location SDK's create2/patch2 expose no Idempotency-Key
  // header hook, so it is not yet forwarded. Threading it via an HttpContext
  // interceptor is a separate follow-up.
  createStorageLocation(
    siteId: string,
    body: Record<string, unknown>,
    _idempotencyKey?: string,
  ): Observable<unknown> {
    const request: StorageLocationRequest = {
      name: this.asOptionalString(body['name']) as string,
      type: this.asOptionalString(body['type']) as StorageLocationRequest['type'],
      barcode: this.asOptionalString(body['barcode']),
      parentStorageLocationId: this.asOptionalString(body['parentStorageLocationId']),
    };
    return this.storageLocationApi.createStorageLocation(siteId, request) as Observable<unknown>;
  }

  /**
   * Deactivates a storage location by patching its status to INACTIVE. An
   * optional destination is forwarded for the relocate-on-deactivate flow.
   */
  deactivateStorageLocation(
    siteId: string,
    storageLocationId: string,
    body: Record<string, unknown>,
    _idempotencyKey?: string,
  ): Observable<unknown> {
    const patch: StorageLocationPatchRequest = {
      status: 'INACTIVE' as StorageLocationPatchRequest['status'],
      destinationStorageLocationId: this.asOptionalString(body['destinationStorageLocationId']),
    };
    return this.storageLocationApi.patchStorageLocation(siteId, storageLocationId, patch) as Observable<unknown>;
  }

  configureLocationDefaults(locationId: string, body: unknown, _idempotencyKey?: string): Observable<unknown> {
    return this.siteDefaultsApi.configureSiteDefaults(locationId, body as SiteDefaultsRequest) as Observable<unknown>;
  }

  // ── Bays ─────────────────────────────────────────────────────────────────

  /**
   * Every bay at the location, in and out of service. No status filter: an out-of-service bay must
   * still be listed (same call shape as the other bay readers).
   */
  listBays(locationId: string): Observable<BayResponse[]> {
    return this.bayApi
      .listBays(locationId, undefined, undefined, 0, BAY_PAGE_SIZE)
      .pipe(map(page => page?.content ?? []));
  }

  createBay(locationId: string, request: BayRequest): Observable<BayResponse> {
    return this.bayApi.createBay(locationId, request);
  }

  getBay(locationId: string, bayId: string): Observable<BayResponse> {
    return this.bayApi.getBay(locationId, bayId);
  }

  /** Null fields are left unchanged by pos-location. */
  patchBay(locationId: string, bayId: string, patch: BayPatchRequest): Observable<BayResponse> {
    return this.bayApi.patchBay(locationId, bayId, patch);
  }

  /**
   * Catalog services whose name contains `query`, for claiming as specialty services or mobile-unit
   * capabilities. Services without an operation code can't be claimed and are left out. The catalog
   * has no list-all read yet (durion-positivity-backend#2246), so a blank query returns nothing.
   */
  searchClaimableServices(query: string): Observable<{ services: ClaimableService[]; ok: boolean }> {
    const trimmed = query.trim();
    if (!trimmed) {
      return of({ services: [], ok: true });
    }
    return this.catalogProductsApi.searchCatalogServices(trimmed, 20).pipe(
      map(services => ({ services: toClaimableServices(services), ok: true })),
      // ADR-0064 §1: a catalog outage must not read as "no matches".
      catchError(() => of({ services: [] as ClaimableService[], ok: false })),
    );
  }

  // ── Mobile Units ─────────────────────────────────────────────────────────

  /**
   * The units based at one location. The list endpoint can't filter by base location
   * (durion-positivity-backend#2253), so this reads one 500-row page and filters it here.
   */
  listMobileUnits(baseLocationId: string): Observable<MobileUnitResponse[]> {
    return this.mobileUnitApi
      .listMobileUnits(0, MOBILE_UNIT_PAGE_SIZE)
      .pipe(map(page => (page?.content ?? []).filter(unit => unit.baseLocationId === baseLocationId)));
  }

  createMobileUnit(request: MobileUnitRequest): Observable<MobileUnitResponse> {
    return this.mobileUnitApi.createMobileUnit(request);
  }

  patchMobileUnit(id: string, patch: MobileUnitPatch): Observable<MobileUnitResponse> {
    return this.mobileUnitApi.patchMobileUnit(id, patch);
  }

  /**
   * Coverage rules for each unit, one read per unit until the list can carry them
   * (durion-positivity-backend#2253). A failed read leaves that unit out and marks the result not ok,
   * so "no coverage" is never shown for a read that didn't happen.
   */
  listCoverageRules(unitIds: readonly string[]): Observable<CoverageRead> {
    if (unitIds.length === 0) return of({ rules: new Map(), ok: true });
    return forkJoin(
      unitIds.map(id =>
        this.mobileUnitApi.listCoverageRules(id).pipe(
          map(rules => ({ id, rules: rules ?? [], ok: true })),
          catchError(() => of({ id, rules: [] as CoverageRuleResponse[], ok: false })),
        ),
      ),
    ).pipe(
      map(results => ({
        rules: new Map(results.filter(result => result.ok).map(result => [result.id, result.rules] as const)),
        ok: results.every(result => result.ok),
      })),
    );
  }

  /** Replaces the unit's whole rule set and returns the saved rules. */
  replaceCoverageRules(mobileUnitId: string, rules: CoverageRuleRequest[]): Observable<CoverageRuleResponse[]> {
    return this.mobileUnitApi.replaceCoverageRules(mobileUnitId, { rules });
  }

  /** Active units covering a postal code on a day, lowest priority first. */
  findEligibleMobileUnits(postalCode: string, countryCode: string, at: string): Observable<EligibleMobileUnitResponse[]> {
    return this.mobileUnitEligibilityApi.findEligibleMobileUnits(postalCode, countryCode, at);
  }

  listServiceAreas(): Observable<{ areas: ServiceAreaResponse[]; ok: boolean }> {
    return this.serviceAreaApi.listServiceAreas().pipe(
      map(areas => ({ areas: areas ?? [], ok: true })),
      catchError(() => of({ areas: [] as ServiceAreaResponse[], ok: false })),
    );
  }

  listTravelBufferPolicies(): Observable<{ policies: TravelBufferPolicyResponse[]; ok: boolean }> {
    return this.travelBufferPolicyApi.listTravelBufferPolicies().pipe(
      map(policies => ({ policies: policies ?? [], ok: true })),
      catchError(() => of({ policies: [] as TravelBufferPolicyResponse[], ok: false })),
    );
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
      responsiblePersonId: this.asOptionalString(body['responsiblePersonId']),
      timezone: this.asOptionalString(body['timezone']),
      operatingHours: this.asArray(body['operatingHours']),
      holidayClosures: this.asArray(body['holidayClosures']),
      checkInBufferMinutes: this.asOptionalNumber(body['checkInBufferMinutes']),
      cleanupBufferMinutes: this.asOptionalNumber(body['cleanupBufferMinutes']),
      type: this.asLocationType(body['type']),
      parents: this.asRecord(body['parents']),
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

function toClaimableServices(services: readonly ServiceDto[]): ClaimableService[] {
  return services
    .filter(service => (service.operationCode ?? '').trim().length > 0)
    .map(service => ({
      operationCode: (service.operationCode ?? '').trim(),
      name: service.name?.trim() || (service.operationCode ?? '').trim(),
      operationCategory: service.operationCategory ?? null,
    }));
}
