import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, from, map, mergeMap, of, shareReplay, switchMap, toArray } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { BayAPIService, LocationAPIService, MobileUnitAPIService } from '@durion-sdk/location';
import type { BayResponse, LocationResponseDTO, MobileUnitResponse } from '@durion-sdk/location';
import { DailyDispatchBoardDashboardService, WorkorderDetailService } from '@durion-sdk/workorder';
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
  ShopDashboardView,
  isOpenStatus,
} from '../models/shop-dashboard.models';

/** Roster cap; mirrors the aggregate endpoint's own cap (design spec §5.1). */
const OPEN_WORKORDER_LIMIT = 200;

/**
 * Vehicle resolution costs two calls per workorder (detail → registry), so it is
 * both concurrency-limited and capped. Beyond the cap, rows fall back to the
 * unstructured `vehicleDescription` the dispatch projection already carries.
 */
const VEHICLE_LOOKUP_CONCURRENCY = 6;
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
 *   louisburroughs/durion#416 — the dispatch read model is bay-shaped, so no
 *     workorder can be resolved to a mobile unit. Mobile-unit cards therefore
 *     always render idle here; that is the backend gap, not a bug in this file.
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

  /** Cached for the page's lifetime so switching location does not re-fan-out. */
  private repairLocations$?: Observable<RepairLocationOption[]>;

  /**
   * Locations with at least one bay or at least one mobile unit based there.
   *
   * Interim derivation (design spec §5.2): one locations call, one mobile-units
   * call, and one bays call per active location. A location whose bays call
   * fails is still offered when it has mobile units, so one failing site cannot
   * empty the picker.
   */
  listRepairLocations(): Observable<RepairLocationOption[]> {
    this.repairLocations$ ??= forkJoin({
      locations: this.locationApi.listLocations().pipe(catchError(() => of([] as LocationResponseDTO[]))),
      mobileUnits: this.listAllMobileUnits(),
    }).pipe(
      switchMap(({ locations, mobileUnits }) => {
        const active = locations.filter(location => location.active !== false && !!location.id);
        if (active.length === 0) {
          return of([] as RepairLocationOption[]);
        }

        const mobileUnitCounts = this.countByBaseLocation(mobileUnits);

        return forkJoin(
          active.map(location =>
            this.countBays(location.id).pipe(
              map(bayCount => ({
                locationId: location.id,
                name: location.name || location.code || location.id,
                bayCount,
                mobileUnitCount: mobileUnitCounts.get(location.id) ?? 0,
              })),
            ),
          ),
        ).pipe(
          map(options =>
            options
              .filter(option => option.bayCount > 0 || option.mobileUnitCount > 0)
              .sort((a, b) => a.name.localeCompare(b.name)),
          ),
        );
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.repairLocations$;
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
        this.resolveVehicles(dashboard.workorders ?? []).pipe(
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

    const bayCards = (dashboard.bays ?? []).map(bayStatus =>
      this.toBayCard(bayStatus, bayDetail, summaries, mechanicsByWorkorder, vehicles),
    );

    // #416: no read path resolves a workorder to a mobile unit, so these are
    // rendered from the location inventory alone and always read as idle.
    const mobileUnitCards: RepairUnitCard[] = mobileUnits
      .filter(unit => unit.baseLocationId === locationId)
      .map(unit => ({
        unitId: unit.id,
        unitType: 'MOBILE_UNIT' as const,
        unitName: unit.name || unit.id,
        unitStatus: unit.status,
      }));

    const unitNamesByWorkorder = new Map<string, string>();
    for (const card of bayCards) {
      if (card.workorder) {
        unitNamesByWorkorder.set(card.workorder.workorderId, card.unitName);
      }
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
        unitNamesByWorkorder,
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
    unitNamesByWorkorder: ReadonlyMap<string, string>,
  ): OpenWorkorderRow[] {
    return workorders
      .filter(summary => isOpenStatus(summary.status))
      .map(summary => ({
        workorderId: summary.workorderId,
        workorderNumber: summary.workorderNumber,
        status: summary.status as WorkorderStatus,
        vehicle: this.vehicleFor(summary.workorderId, summary, vehicles),
        mechanic: mechanicsByWorkorder.get(summary.workorderId),
        unitId: summary.assignedBayId,
        unitName: unitNamesByWorkorder.get(summary.workorderId),
      }))
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
    if (resolved) {
      return resolved;
    }
    const description = summary?.vehicleDescription?.trim();
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
  ): Observable<ReadonlyMap<string, DashboardVehicle>> {
    const ids = workorders
      .filter(summary => isOpenStatus(summary.status))
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
    return this.bayApi.listBays(locationId).pipe(
      map(page => page?.content ?? []),
      catchError(() => of([] as BayResponse[])),
    );
  }

  private countBays(locationId: string): Observable<number> {
    return this.listBays(locationId).pipe(map(bays => bays.length));
  }

  private listAllMobileUnits(): Observable<MobileUnitResponse[]> {
    return this.mobileUnitApi.listMobileUnits().pipe(
      map(page => page?.content ?? []),
      catchError(() => of([] as MobileUnitResponse[])),
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

  /** Accepts an already-correct date string to avoid timezone drift (ADR-0038). */
  private toIsoDate(value: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }
    return parsed.toISOString().slice(0, 10);
  }
}
