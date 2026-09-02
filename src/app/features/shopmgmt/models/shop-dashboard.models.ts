import type { WorkorderStatus } from '../../workexec/models/workexec.models';

/**
 * View model for the Shop Manager Dashboard
 * (docs/design/shopmgmt-shop-manager-dashboard.md in the durion repo).
 *
 * These shapes deliberately mirror the planned aggregate read
 * `GET /v1/shopmgmt/shop-dashboard` (spec §5.1) rather than any endpoint that
 * exists today. `ShopDashboardService` composes them from the dispatch,
 * location, workorder-detail and vehicle-registry APIs in the meantime, so
 * swapping to the aggregate endpoint is a change inside the service only.
 */

export type RepairUnitType = 'BAY' | 'MOBILE_UNIT';

/** Colour band driving the card header. Never the sole carrier of meaning (ADR-0039). */
export type StatusBand =
  | 'idle'
  | 'queued'
  | 'active'
  | 'blocked'
  | 'ready'
  | 'closed'
  | 'cancelled';

export interface DashboardVehicle {
  readonly vehicleId: string;
  readonly vin?: string;
  readonly year?: number;
  readonly make?: string;
  readonly model?: string;
  /**
   * Unstructured fallback supplied by the dispatch/WIP projections when the
   * structured registry lookup is unavailable. Rendered only when year/make/model
   * are all absent.
   */
  readonly description?: string;
}

export interface DashboardMechanic {
  readonly personId: string;
  readonly displayName: string;
}

export interface DashboardWorkorder {
  readonly workorderId: string;
  readonly workorderNumber?: string;
  readonly status: WorkorderStatus;
  readonly vehicle?: DashboardVehicle;
  readonly mechanic?: DashboardMechanic;
}

/** One bay or mobile unit, with whatever work is on it. */
export interface RepairUnitCard {
  readonly unitId: string;
  readonly unitType: RepairUnitType;
  readonly unitName: string;
  readonly unitSubtitle?: string;
  readonly unitStatus?: string;
  readonly workorder?: DashboardWorkorder;
}

/** One row of the open-workorder roster beneath the card grid. */
export interface OpenWorkorderRow {
  readonly workorderId: string;
  readonly workorderNumber?: string;
  readonly status: WorkorderStatus;
  readonly vehicle?: DashboardVehicle;
  readonly mechanic?: DashboardMechanic;
  /** Absent when the workorder is not on a bay or mobile unit. */
  readonly unitId?: string;
  readonly unitName?: string;
}

export interface ShopDashboardView {
  readonly locationId: string;
  readonly locationName?: string;
  readonly date: string;
  readonly generatedAt?: string;
  readonly units: readonly RepairUnitCard[];
  readonly openWorkorders: readonly OpenWorkorderRow[];
  readonly openWorkordersTruncated: boolean;
  /**
   * True when an upstream source was unavailable during composition, so the
   * view may be incomplete. Mirrors the dispatch dashboard's own flag.
   */
  readonly dataQualityWarning: boolean;
}

/** A location offered by the dashboard's location filter. */
export interface RepairLocationOption {
  readonly locationId: string;
  readonly name: string;
  readonly bayCount: number;
  readonly mobileUnitCount: number;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Statuses that keep a workorder on the roster. */
const CLOSED_STATUSES: ReadonlySet<string> = new Set(['COMPLETED', 'CANCELLED']);

const BANDS: ReadonlyMap<string, StatusBand> = new Map<string, StatusBand>([
  ['DRAFT', 'queued'],
  ['APPROVED', 'queued'],
  ['ASSIGNED', 'queued'],
  ['WORK_IN_PROGRESS', 'active'],
  ['AWAITING_PARTS', 'blocked'],
  ['AWAITING_APPROVAL', 'blocked'],
  ['READY_FOR_PICKUP', 'ready'],
  ['COMPLETED', 'closed'],
  ['CANCELLED', 'cancelled'],
]);

/**
 * Maps a workorder status to its colour band. An absent status is `idle` (the
 * unit holds no work); an unrecognised status falls back to `queued` with the
 * raw value shown, so a new backend enum member never blanks a card.
 */
export function statusBand(status?: WorkorderStatus | string | null): StatusBand {
  if (!status) {
    return 'idle';
  }
  return BANDS.get(status) ?? 'queued';
}

/** True for every status except COMPLETED and CANCELLED. */
export function isOpenStatus(status?: WorkorderStatus | string | null): boolean {
  return !!status && !CLOSED_STATUSES.has(status);
}

/**
 * "2021 Ford F-150" from the structured parts, falling back to the projection's
 * unstructured description. Returns '' when nothing is known, so the template
 * can show its own "details unavailable" copy rather than an empty row.
 */
export function vehicleLabel(vehicle?: DashboardVehicle | null): string {
  if (!vehicle) {
    return '';
  }
  const structured = [
    vehicle.year !== undefined && vehicle.year !== null ? String(vehicle.year) : '',
    vehicle.make ?? '',
    vehicle.model ?? '',
  ]
    .filter(part => part.trim().length > 0)
    .join(' ');

  return structured || (vehicle.description ?? '').trim();
}

/** i18n key for a status, or undefined when the value is not a known enum member. */
export function statusKey(status?: WorkorderStatus | string | null): string | undefined {
  if (!status || !BANDS.has(status)) {
    return undefined;
  }
  return `SHOPMGMT.SHOP_DASHBOARD.STATUS.${status}`;
}
