import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, from, map, mergeMap, of, shareReplay, switchMap, toArray } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { BayAPIService, LocationAPIService, MobileUnitAPIService } from '@durion-sdk/location';
import type { BayResponse, LocationResponseDTO, MobileUnitResponse } from '@durion-sdk/location';
import {
  DailyDispatchBoardDashboardService,
  WorkorderDetailService,
  WorkorderSummaryResourceTypeEnum,
} from '@durion-sdk/workorder';
import type { BayStatus, DashboardResponse, MechanicStatus, WorkorderSummary } from '@durion-sdk/workorder';
import { VehicleRegistryAPIService } from '@durion-sdk/vehicle-inventory';
import type { WorkorderStatus } from '../../workexec/models/workexec.models';
import {
  DashboardMechanic,
  DashboardVehicle,
  DashboardWorkorder,
  OpenWorkorderRow,
  RepairLocationOption,
  RepairUnitCard,
  RepairLocationsResult,
  ShopDashboardView,
  isOpenStatus,
  todayIsoLocal,
} from '../models/shop-dashboard.models';

/** Roster cap; mirrors the aggregate endpoint's own cap (design spec §5.1). */
const OPEN_WORKORDER_LIMIT = 200;

/**
 * Vehicle resolution costs two calls per workorder (detail → registry), so it is
 * both concurrency-limited and capped. Beyond the cap, rows fall back to the
 * unstructured `vehicleDescription` the dispatch projection already carries.
 */
const VEHICLE_LOOKUP_CONCURRENCY = 6;

/**
 * Both bay and mobile-unit endpoints are Spring pages whose default size is 20.
 * A site with more units than that would silently lose cards, so an explicit
 * size is requested. Real pagination belongs with the aggregate endpoint (#419).
 */
const PAGE_SIZE = 500;
const VEHICLE_LOOKUP_LIMIT = 40;

/**
 * Backs the Shop Manager Dashboard
 * (docs/design/shopmgmt-shop-manager-dashboard.md in the durion repo).
 *
 * INTERIM COMPOSITION. The design specs a single aggregate read,
 * `GET /v1/shopmgmt/shop-dashboard` (§5.1), which does not exist yet. Until it
 * does, this service composes the same view model from the endpoints that do:
 *
 *   dispatch dashboard  → bays, their assigned workorder, mechanics, statuses
 *   mobile units        → mobile-unit cards (always idle — see below)
 *   workorder detail    → vehicleId for an assigned workorder
 *   vehicle registry    → structured year/make/model/VIN
 *
 * Two gaps are tracked as backend stories and are visible in the output:
 *
 *   louisburroughs/durion#416 — SDK 0.11 added `DashboardResponse.mobileUnits`,
 *     but it is fed by the bay/mobile-unit lifecycle events that backend #1668
 *     has not published yet, so mobile-unit cards still come from the location
 *     inventory. What a unit is working on is read from the workorder side
 *     (`assignedResourceId` + `resourceType`), which is populated today.
 *   louisburroughs/durion#417 — no repair-capability projection on Location, so
 *     {@link listRepairLocations} fans out over the bays endpoint.
 *
 * When the aggregate endpoint lands, both public methods become thin SDK calls
 * and every consumer stays unchanged.
 */
@Injectable({ providedIn: 'root' })
export class ShopDashboardService {
  private readonly dispatchDashboard = inject(DailyDispatchBoardDashboardService);
  private readonly locationApi = inject(LocationAPIService);
  private readonly bayApi = inject(BayAPIService);
  private readonly mobileUnitApi = inject(MobileUnitAPIService);
  private readonly workorderDetail = inject(WorkorderDetailService);
  private readonly vehicleRegistry = inject(VehicleRegistryAPIService);

  /**
   * Memoised so switching location does not re-fan-out. Invalidated by
   * {@link invalidateRepairLocations} — the cache outlives the page (this
   * service is root-provided), so a bay created elsewhere would otherwise never
   * appear until a full browser reload.
   */
  private repairLocations$?: Observable<RepairLocationsResult>;

  /**
   * Locations with at least one bay or at least one mobile unit based there.
   *
   * Interim derivation (design spec §5.2): one locations call, one mobile-units
   * call, and one bays call per active location. A location whose bays call
   * fails is still offered when it has mobile units, so one failing site cannot
   * empty the picker.
   */
  listRepairLocations(): Observable<RepairLocationsResult> {
    this.repairLocations$ ??= forkJoin({
      locations: this.locationApi.listLocations().pipe(
        map(rows => ({ rows, failed: false })),
        catchError(() => of({ rows: [] as LocationResponseDTO[], failed: true })),
      ),
      mobileUnits: this.listAllMobileUnitsResult(),
    }).pipe(
      switchMap(({ locations, mobileUnits }) => {
        const upstreamDegraded = locations.failed || mobileUnits.failed;
        const active = locations.rows.filter(location => location.active !== false && !!location.id);
        if (active.length === 0) {
          return of({ options: [] as RepairLocationOption[], degraded: upstreamDegraded });
        }

        const mobileUnitCounts = this.countByBaseLocation(mobileUnits.rows);

        return forkJoin(
          active.map(location =>
            this.listBaysResult(location.id).pipe(
              map(bays => ({
                option: {
                  locationId: location.id,
                  name: location.name || location.code || location.id,
                  bayCount: bays.rows.length,
                  mobileUnitCount: mobileUnitCounts.get(location.id) ?? 0,
                },
                failed: bays.failed,
              })),
            ),
          ),
        ).pipe(
          map(entries => ({
            options: entries
              .map(entry => entry.option)
              .filter(option => option.bayCount > 0 || option.mobileUnitCount > 0)
              .sort((a, b) => a.name.localeCompare(b.name)),
            // A location whose bays call failed may be missing from the list
            // entirely, so the page must be able to say the list is partial.
            degraded: upstreamDegraded || entries.some(entry => entry.failed),
          })),
        );
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.repairLocations$;
  }

  /** Drops the memoised filter list so the next call re-derives it. */
  invalidateRepairLocations(): void {
    this.repairLocations$ = undefined;
  }

  /**
   * Every repair unit at a location with the work currently on it, plus the
   * roster of open workorders at that location.
   */
  getDashboard(locationId: string, date: string): Observable<ShopDashboardView> {
    const trimmedLocationId = locationId.trim();
    const normalizedDate = this.toIsoDate(date);

    return forkJoin({
      dashboard: this.dispatchDashboard.getDispatchDashboard(trimmedLocationId, normalizedDate),
      mobileUnits: this.listAllMobileUnits(),
      bays: this.listBays(trimmedLocationId),
    }).pipe(
      switchMap(({ dashboard, mobileUnits, bays }) =>
        this.resolveVehicles(dashboard.workorders ?? [], dashboard.bays ?? []).pipe(
          map(vehicles =>
            this.toView(trimmedLocationId, normalizedDate, dashboard, mobileUnits, bays, vehicles),
          ),
        ),
      ),
    );
  }

  // ── Composition ────────────────────────────────────────────────────────────

  private toView(
    locationId: string,
    date: string,
    dashboard: DashboardResponse,
    mobileUnits: MobileUnitResponse[],
    bays: BayResponse[],
    vehicles: ReadonlyMap<string, DashboardVehicle>,
  ): ShopDashboardView {
    const summaries = new Map<string, WorkorderSummary>(
      (dashboard.workorders ?? []).map(summary => [summary.workorderId, summary]),
    );
    const mechanicsByWorkorder = this.indexMechanics(dashboard.mechanics ?? []);
    const bayDetail = new Map<string, BayResponse>(bays.map(bay => [bay.id, bay]));
    const mobileUnitDetail = new Map<string, MobileUnitResponse>(
      mobileUnits.map(unit => [unit.id, unit]),
    );

    const bayCards = (dashboard.bays ?? []).map(bayStatus =>
      this.toBayCard(bayStatus, bayDetail, summaries, mechanicsByWorkorder, vehicles),
    );

    // Cards come from the location inventory, not `dashboard.mobileUnits`,
    // which stays incomplete until backend #1668 (see the class comment). The
    // work on a unit is read from the workorder side instead — a summary
    // naming this unit as its assigned resource.
    //
    // `BayStatus.assignedWorkorderId` (bayCards, above) and
    // `WorkorderSummary.assignedResourceId`/`resourceType` are independent,
    // optional fields on two different projections with no consistency
    // guarantee. If they ever name the same workorder for two different
    // units, the bay's own live feed wins — a mobile-unit card must never
    // claim a workorder a bay card already claims, or the dashboard would
    // render one workorder "in progress" on two units at once.
    const claimedByBay = new Set(
      bayCards.map(card => card.workorder?.workorderId).filter((id): id is string => !!id),
    );
    const workorderByMobileUnit = this.indexMobileUnitAssignments(
      dashboard.workorders ?? [],
      claimedByBay,
    );
    const mobileUnitCards: RepairUnitCard[] = mobileUnits
      .filter(unit => unit.baseLocationId === locationId)
      .map(unit => ({
        unitId: unit.id,
        unitType: 'MOBILE_UNIT' as const,
        unitName: unit.name || unit.id,
        unitStatus: unit.status,
        workorder: this.toWorkorder(
          workorderByMobileUnit.get(unit.id),
          summaries,
          mechanicsByWorkorder,
          vehicles,
        ),
      }));

    // Single source of truth for "which unit is this workorder on".
    // `WorkorderSummary.assignedResourceId` and `BayStatus.assignedWorkorderId`
    // are two independent optional fields of the same projection with no
    // consistency guarantee, so reading each separately let the roster contradict
    // the grid above it. The card join wins; the summary only fills gaps.
    const unitByWorkorder = new Map<string, { unitId: string; unitName: string }>();
    for (const card of [...bayCards, ...mobileUnitCards]) {
      // First writer wins: bayCards is spread first, so a bay's claim on a
      // workorder is never overwritten by a later mobile-unit card. This
      // mirrors the `.has()` guard in the loop below and enforces the
      // invariant in code rather than relying solely on `claimedByBay`
      // upstream already having excluded the conflict.
      if (card.workorder && !unitByWorkorder.has(card.workorder.workorderId)) {
        unitByWorkorder.set(card.workorder.workorderId, {
          unitId: card.unitId,
          unitName: card.unitName,
        });
      }
    }
    for (const summary of dashboard.workorders ?? []) {
      const resourceId = summary.assignedResourceId;
      if (!resourceId || unitByWorkorder.has(summary.workorderId)) {
        continue;
      }
      unitByWorkorder.set(summary.workorderId, {
        unitId: resourceId,
        // Never surface a raw UUID: an unresolvable resource reads as
        // "unknown unit".
        unitName: this.resourceName(resourceId, summary.resourceType, bayDetail, mobileUnitDetail),
      });
    }

    return {
      locationId,
      // The dispatch projection carries no location name; the page shows it via
      // the picker. The aggregate endpoint (spec §5.1) returns it directly.
      date: dashboard.date || date,
      generatedAt: dashboard.lastRefreshed,
      units: [...bayCards, ...mobileUnitCards],
      openWorkorders: this.toRoster(
        dashboard.workorders ?? [],
        mechanicsByWorkorder,
        vehicles,
        unitByWorkorder,
      ),
      openWorkordersTruncated: (dashboard.workorders ?? []).filter(w => isOpenStatus(w.status)).length
        > OPEN_WORKORDER_LIMIT,
      dataQualityWarning: dashboard.dataQualityWarning === true,
    };
  }

  private toBayCard(
    bayStatus: BayStatus,
    bayDetail: ReadonlyMap<string, BayResponse>,
    summaries: ReadonlyMap<string, WorkorderSummary>,
    mechanicsByWorkorder: ReadonlyMap<string, DashboardMechanic>,
    vehicles: ReadonlyMap<string, DashboardVehicle>,
  ): RepairUnitCard {
    const detail = bayDetail.get(bayStatus.bayId);
    return {
      unitId: bayStatus.bayId,
      unitType: 'BAY',
      unitName: bayStatus.bayName || detail?.name || bayStatus.bayId,
      unitSubtitle: detail?.bayType,
      unitStatus: bayStatus.status,
      workorder: this.toWorkorder(
        bayStatus.assignedWorkorderId,
        summaries,
        mechanicsByWorkorder,
        vehicles,
      ),
    };
  }

  /**
   * Workorders that name a mobile unit as their assigned resource, keyed by
   * unit. A workorder's assignment is `assignedResourceId` plus `resourceType`
   * in SDK 0.11, so the identifier alone does not say which kind of unit it
   * points at — only rows typed `MOBILE_UNIT` belong here.
   *
   * The projection carries no uniqueness guarantee, so the first row wins:
   * two workorders claiming one unit must not make the card flip between them
   * on refresh.
   *
   * `claimedByBay` excludes any workorder a `BayStatus` row has already
   * claimed: bay status is the bay's own live operational feed, whereas this
   * reads the workorder's side of an independent, optionally-inconsistent
   * field, so on conflict the bay wins and this method must not also hand
   * the same workorder to a mobile unit.
   */
  private indexMobileUnitAssignments(
    workorders: WorkorderSummary[],
    claimedByBay: ReadonlySet<string>,
  ): Map<string, string> {
    const byUnit = new Map<string, string>();
    for (const summary of workorders) {
      const resourceId = summary.assignedResourceId;
      if (
        !resourceId ||
        summary.resourceType !== WorkorderSummaryResourceTypeEnum.MobileUnit ||
        byUnit.has(resourceId) ||
        claimedByBay.has(summary.workorderId)
      ) {
        continue;
      }
      byUnit.set(resourceId, summary.workorderId);
    }
    return byUnit;
  }

  /**
   * Display name for an assigned resource. `resourceType` picks the inventory
   * to read; an untyped identifier is looked up in both rather than assumed to
   * be a bay, since a mobile unit's id would otherwise resolve to '' and read
   * as an unknown unit.
   */
  private resourceName(
    resourceId: string,
    resourceType: WorkorderSummaryResourceTypeEnum | undefined,
    bays: ReadonlyMap<string, BayResponse>,
    mobileUnits: ReadonlyMap<string, MobileUnitResponse>,
  ): string {
    if (resourceType === WorkorderSummaryResourceTypeEnum.Bay) {
      return bays.get(resourceId)?.name ?? '';
    }
    if (resourceType === WorkorderSummaryResourceTypeEnum.MobileUnit) {
      return mobileUnits.get(resourceId)?.name ?? '';
    }
    return bays.get(resourceId)?.name ?? mobileUnits.get(resourceId)?.name ?? '';
  }

  /**
   * A unit still linked to a closed workorder reads as idle: the work is done,
   * the bay is free, and showing stale work would misreport shop capacity.
   */
  private toWorkorder(
    workorderId: string | undefined,
    summaries: ReadonlyMap<string, WorkorderSummary>,
    mechanicsByWorkorder: ReadonlyMap<string, DashboardMechanic>,
    vehicles: ReadonlyMap<string, DashboardVehicle>,
  ): DashboardWorkorder | undefined {
    if (!workorderId) {
      return undefined;
    }
    const summary = summaries.get(workorderId);
    if (!isOpenStatus(summary?.status)) {
      return undefined;
    }

    return {
      workorderId,
      workorderNumber: summary?.workorderNumber,
      status: summary?.status as WorkorderStatus,
      vehicle: this.vehicleFor(workorderId, summary, vehicles),
      mechanic: mechanicsByWorkorder.get(workorderId),
    };
  }

  private toRoster(
    workorders: WorkorderSummary[],
    mechanicsByWorkorder: ReadonlyMap<string, DashboardMechanic>,
    vehicles: ReadonlyMap<string, DashboardVehicle>,
    unitByWorkorder: ReadonlyMap<string, { unitId: string; unitName: string }>,
  ): OpenWorkorderRow[] {
    return workorders
      .filter(summary => isOpenStatus(summary.status))
      .map(summary => {
        const unit = unitByWorkorder.get(summary.workorderId);
        return {
          workorderId: summary.workorderId,
          workorderNumber: summary.workorderNumber,
          status: summary.status as WorkorderStatus,
          vehicle: this.vehicleFor(summary.workorderId, summary, vehicles),
          mechanic: mechanicsByWorkorder.get(summary.workorderId),
          unitId: unit?.unitId,
          unitName: unit?.unitName || undefined,
        };
      })
      .sort((a, b) => this.compareRosterRows(a, b))
      .slice(0, OPEN_WORKORDER_LIMIT);
  }

  /** Unassigned work first — it is the work with nowhere to go. */
  private compareRosterRows(a: OpenWorkorderRow, b: OpenWorkorderRow): number {
    const aAssigned = a.unitId ? 1 : 0;
    const bAssigned = b.unitId ? 1 : 0;
    if (aAssigned !== bAssigned) {
      return aAssigned - bAssigned;
    }
    return (a.workorderNumber ?? a.workorderId).localeCompare(b.workorderNumber ?? b.workorderId);
  }

  private vehicleFor(
    workorderId: string,
    summary: WorkorderSummary | undefined,
    vehicles: ReadonlyMap<string, DashboardVehicle>,
  ): DashboardVehicle | undefined {
    const resolved = vehicles.get(workorderId);
    const description = summary?.vehicleDescription?.trim();

    if (resolved) {
      // The registry stores `description` as '' when omitted and year/make/model
      // are all optional, so a VIN-only record can resolve to nothing display-able.
      // Fall back to the projection's description rather than showing "unavailable"
      // next to a VIN we do have.
      const hasStructured = !!(resolved.year || resolved.make || resolved.model);
      if (hasStructured || resolved.description?.trim()) {
        return resolved;
      }
      return description ? { ...resolved, description } : resolved;
    }

    return description ? { vehicleId: '', description } : undefined;
  }

  private indexMechanics(mechanics: MechanicStatus[]): Map<string, DashboardMechanic> {
    const byWorkorder = new Map<string, DashboardMechanic>();
    for (const mechanic of mechanics) {
      const displayName = [mechanic.firstName, mechanic.lastName]
        .filter(part => !!part && part.trim().length > 0)
        .join(' ')
        .trim();
      if (mechanic.assignedWorkorderId && displayName) {
        byWorkorder.set(mechanic.assignedWorkorderId, {
          personId: mechanic.personId,
          displayName,
        });
      }
    }
    return byWorkorder;
  }

  // ── Vehicle resolution (interim) ───────────────────────────────────────────

  /**
   * Resolves structured vehicle detail per workorder: detail call for the
   * vehicleId, then the registry for year/make/model/VIN. Failures degrade to
   * the unstructured description rather than failing the page, so one bad
   * vehicle record cannot blank the dashboard.
   */
  private resolveVehicles(
    workorders: WorkorderSummary[],
    bays: BayStatus[],
  ): Observable<ReadonlyMap<string, DashboardVehicle>> {
    const open = workorders.filter(summary => isOpenStatus(summary.status));

    // The cards are the primary content, so work sitting on a unit claims the
    // budget before roster-only rows. Without this ordering a busy site can
    // spend all 40 lookups on the roster and leave every bay card showing
    // "vehicle details unavailable" — the one thing the page exists to show.
    // Mobile-unit cards count as units too, so their work is read from the
    // workorder's own assignment rather than from the bay-shaped status rows.
    const onUnit = new Set([
      ...bays.map(bay => bay.assignedWorkorderId).filter((id): id is string => !!id),
      ...workorders
        .filter(summary => summary.resourceType === WorkorderSummaryResourceTypeEnum.MobileUnit)
        .map(summary => summary.workorderId),
    ]);
    const ids = [
      ...open.filter(summary => onUnit.has(summary.workorderId)),
      ...open.filter(summary => !onUnit.has(summary.workorderId)),
    ]
      .map(summary => summary.workorderId)
      .slice(0, VEHICLE_LOOKUP_LIMIT);

    if (ids.length === 0) {
      return of(new Map<string, DashboardVehicle>());
    }

    return from(ids).pipe(
      mergeMap(workorderId => this.resolveVehicle(workorderId), VEHICLE_LOOKUP_CONCURRENCY),
      toArray(),
      map(entries => {
        const resolved = new Map<string, DashboardVehicle>();
        for (const entry of entries) {
          if (entry.vehicle) {
            resolved.set(entry.workorderId, entry.vehicle);
          }
        }
        return resolved;
      }),
    );
  }

  private resolveVehicle(
    workorderId: string,
  ): Observable<{ workorderId: string; vehicle?: DashboardVehicle }> {
    return this.workorderDetail.getWorkorderDetail(workorderId).pipe(
      switchMap(detail => {
        if (!detail?.vehicleId) {
          return of({ workorderId, vehicle: undefined });
        }
        return this.vehicleRegistry.getVehicle(detail.vehicleId).pipe(
          map(vehicle => ({
            workorderId,
            vehicle: {
              vehicleId: vehicle.vehicleId,
              vin: vehicle.vin,
              year: vehicle.year,
              make: vehicle.make,
              model: vehicle.model,
              description: vehicle.description,
            } satisfies DashboardVehicle,
          })),
          catchError(() => of({ workorderId, vehicle: undefined })),
        );
      }),
      catchError(() => of({ workorderId, vehicle: undefined })),
    );
  }

  // ── Location-domain helpers ────────────────────────────────────────────────

  private listBays(locationId: string): Observable<BayResponse[]> {
    return this.listBaysResult(locationId).pipe(map(result => result.rows));
  }

  private listBaysResult(locationId: string): Observable<{ rows: BayResponse[]; failed: boolean }> {
    return this.bayApi.listBays(locationId, undefined, undefined, 0, PAGE_SIZE).pipe(
      map(page => ({ rows: page?.content ?? [], failed: false })),
      catchError(() => of({ rows: [] as BayResponse[], failed: true })),
    );
  }

  private listAllMobileUnits(): Observable<MobileUnitResponse[]> {
    return this.listAllMobileUnitsResult().pipe(map(result => result.rows));
  }

  private listAllMobileUnitsResult(): Observable<{ rows: MobileUnitResponse[]; failed: boolean }> {
    return this.mobileUnitApi.listMobileUnits(0, PAGE_SIZE).pipe(
      map(page => ({ rows: page?.content ?? [], failed: false })),
      catchError(() => of({ rows: [] as MobileUnitResponse[], failed: true })),
    );
  }

  private countByBaseLocation(mobileUnits: MobileUnitResponse[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const unit of mobileUnits) {
      if (unit.baseLocationId) {
        counts.set(unit.baseLocationId, (counts.get(unit.baseLocationId) ?? 0) + 1);
      }
    }
    return counts;
  }

  /**
   * Accepts an already-correct date-only string unchanged; otherwise resolves to
   * the value's LOCAL calendar date. ADR-0038 forbids `toISOString().slice(0,10)`
   * here — it would report the UTC day and shift the board for UTC-N users.
   */
  private toIsoDate(value: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return todayIsoLocal();
    }
    return todayIsoLocal(parsed);
  }
}
