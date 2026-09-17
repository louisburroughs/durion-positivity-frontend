import type {
  BayStatus,
  ConflictEntry,
  DashboardResponse,
  MechanicStatus,
  MobileUnitStatus,
  PtoEntry,
  WorkorderSummary,
} from '@durion-sdk/workorder';

export type {
  BayStatus,
  ConflictEntry,
  DashboardResponse,
  MechanicStatus,
  MobileUnitStatus,
  PtoEntry,
  WorkorderSummary,
};

/** Page lifecycle, per the two-signal state machine (ADR-0031). */
export type BoardState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Where a mechanic stands right now, collapsed from the several fields the
 * dashboard reports them through (`onBreak`, `ptoEntries`, `assignedWorkorderId`,
 * `currentStatus`). The board groups the roster on this, so it has to be one value.
 */
export type MechanicAvailability = 'WORKING' | 'IDLE' | 'BREAK' | 'OFF';

/**
 * Which pile a row falls in. `HELD` is a workorder parked on the site's HOLD
 * position — the backend's "placed nowhere work happens" — which is the closest
 * real counterpart to the board's on-hold lane.
 */
export type RowLane = 'TO_ASSIGN' | 'HELD' | 'ASSIGNED';

export type RowStatusTone = 'NEUTRAL' | 'ACTIVE' | 'WAITING' | 'DRAFT' | 'DONE';

/**
 * Fields the design asks for that no endpoint on this board answers yet. They
 * render as an explicit "not available" placeholder rather than a derived guess,
 * so the gap stays visible instead of turning into a number nobody can source.
 *
 * - mechanic free hours / shop open capacity — needs shift windows; the dashboard
 *   reports availability as a flag, never as a span.
 * - workorder promised time — `scheduledDate` is a date with no time of day.
 * - workorder priority — no field on `WorkorderSummary`.
 * - required skills per workorder — the service lines carry descriptions, not
 *   catalog skill requirements.
 * - unit number / department — the summary carries `vehicleDescription` and
 *   `customerName` instead.
 */
export const NOT_AVAILABLE = null;

export interface MechanicCard {
  readonly personId: string;
  readonly name: string;
  readonly initials: string;
  readonly availability: MechanicAvailability;
  /** Durion skill codes from the location technician roster; empty when none are replicated. */
  readonly skillCodes: readonly string[];
  readonly assignedWorkorderId?: string;
  /** Bay name the mechanic's workorder stands on, when it holds one. */
  readonly whereLabel: string | null;
  readonly breakExpectedReturn: string | null;
  /** Always null: no shift window is published for this board. */
  readonly freeHours: null;
}

export interface BayCard {
  readonly bayId: string;
  /** Null when neither the dispatch replica nor the inventory carries a name. */
  readonly name: string | null;
  /** `bayType` from the location domain; null when the bay's replica has not arrived. */
  readonly kind: string | null;
  readonly available: boolean;
  readonly assignedWorkorderId?: string;
  /**
   * Available AND not held by an open workorder. A link to a closed workorder
   * is a stale projection, not occupancy.
   */
  readonly free: boolean;
}

export interface WorkorderRow {
  readonly workorderId: string;
  readonly number: string;
  readonly status: string;
  readonly statusTone: RowStatusTone;
  readonly lane: RowLane;
  /** Service line descriptions joined; the dashboard sends at most three. */
  readonly job: string | null;
  readonly vehicle: string | null;
  readonly customer: string | null;
  readonly estimatedHours: number | null;
  readonly actualHours: number | null;
  readonly serviceCount: number | null;
  readonly completedServiceCount: number | null;
  /** Parsed to local midnight (ADR-0038); the wire value is a date-only string. */
  readonly scheduledDate: Date | null;
  readonly mechanicId: string | null;
  readonly mechanicName: string | null;
  readonly mechanicInitials: string | null;
  readonly bayId: string | null;
  readonly bayName: string | null;
  /** True when the workorder is parked on the site's HOLD position. */
  readonly parked: boolean;
  /** COMPLETED or CANCELLED: every dispatch write answers 409 WORKORDER_CLOSED. */
  readonly closed: boolean;
  /** Always null: no promised time, priority or skill requirement is published. */
  readonly dueAt: null;
  readonly priority: null;
  readonly requiredSkills: null;
}

/** Counts the header strip reports. Hour spans it cannot source stay null. */
export interface BoardStats {
  readonly toAssign: number;
  readonly toAssignHours: number | null;
  readonly openCapacityHours: null;
  readonly onDuty: number;
  readonly out: number;
  readonly baysOpen: number;
  readonly baysTotal: number;
  readonly parked: number;
  readonly dueSoon: null;
}

/** Where a workorder stood before a position write: a bay, the site's HOLD, or nowhere. */
export type PositionKind = 'BAY' | 'HOLD';

/**
 * What a mutation changed, so the toast can offer to put it back.
 *
 * The step records the state the mutation is known to have produced, not only
 * what it replaced: undo fires before the post-mutation re-read lands, so the
 * row is still showing the old world when it is clicked.
 */
export interface UndoStep {
  readonly workorderId: string;
  readonly kind: 'MECHANIC' | 'BAY';
  /** The mechanic, or the bay, the workorder held before. */
  readonly previousId: string | null;
  /**
   * MECHANIC only: who the workorder holds now. Undo picks assign against
   * reassign from this — reading it off the row would still name the mechanic
   * a release has already taken off, and 409 TECHNICIAN_NOT_ASSIGNED follows.
   */
  readonly currentMechanicId: string | null;
  /**
   * BAY only: what the previous position was. A parked workorder carries no bay
   * id, so without this undo would release its HOLD instead of restoring it and
   * leave the workorder in a third state nobody asked for.
   */
  readonly previousPosition: PositionKind | null;
}
