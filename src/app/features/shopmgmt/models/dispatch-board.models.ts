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
 * Whether the mechanic is on the timekeeping clock — a different question from
 * `MechanicAvailability`, which is a dispatch reading (has work / on break / off)
 * assembled from the workexec dashboard and says nothing about a work session.
 *
 * The three real states come from `GET /v1/people/availability`, which carries
 * `clockState` per person since backend #2061, and are re-read after every clock
 * write and on the 30s poll — so a session started or ended elsewhere corrects
 * itself rather than lingering.
 *
 * `UNKNOWN` no longer means "this board cannot ask", as it did before that
 * endpoint existed. It now means the caller may not see this person's state:
 * pos-people nulls `clockState` for a row the caller holds no
 * `people:timekeeping:view` over rather than refusing the whole read. A card in
 * that state offers both actions, because guessing which one applies is exactly
 * what the null is there to prevent.
 */
export type MechanicClockState = 'CLOCKED_IN' | 'ON_BREAK' | 'CLOCKED_OUT' | 'UNKNOWN';

/**
 * Why a mechanic has no free-hours figure. `CLOSED` is a known fact about the
 * day; `UNKNOWN` is the location's hours being unreadable or its timezone
 * unrecognised; `OFF_ROSTER` is the technician not coming back in the roster
 * read at all, which the dispatch projection can outlive.
 */
export type FreeHoursReason = 'CLOSED' | 'UNKNOWN' | 'OFF_ROSTER';

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
 * - shop open capacity — still needs a real per-person shift window. Mechanic
 *   free hours now has one (backend #2060), but it is the shop's operating
 *   hours standing in for a roster, which is too coarse to total into a
 *   shop-wide capacity figure without overstating it.
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
  /** Null when neither name has replicated — never the person id. */
  readonly name: string | null;
  readonly initials: string;
  readonly availability: MechanicAvailability;
  /** Durion skill codes from the location technician roster; empty when none are replicated. */
  readonly skillCodes: readonly string[];
  readonly assignedWorkorderId?: string;
  /** Bay name the mechanic's workorder stands on, when it holds one. */
  readonly whereLabel: string | null;
  readonly breakExpectedReturn: string | null;
  /**
   * Hours left in the shift after committed work, or null when the board cannot
   * say. Null is not zero: a closed day, an unreadable operating-hours payload
   * and a technician missing from the roster read all land here, and each one
   * renders the not-available placeholder rather than a number.
   *
   * The shift window behind it is a **placeholder** — the shop's operating
   * hours, identical for every technician at the location — so this is "hours
   * the shop is open that this mechanic has not committed", not a personal
   * roster. See `TechnicianShift` in the service.
   */
  readonly freeHours: number | null;
  /** Why `freeHours` is null, for the placeholder to explain itself. */
  readonly freeHoursReason: FreeHoursReason | null;
  /** From the availability read; `UNKNOWN` when the caller may not see it. */
  readonly clockState: MechanicClockState;
  /** The open session, for the break endpoints; null unless clocked in or on break. */
  readonly workSessionId: string | null;
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
  /** Null for a closed workorder with nothing left to dispatch: it is listed in no lane. */
  readonly lane: RowLane | null;
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
  /**
   * True when the workorder stands on a mobile unit and no bay claims it. The
   * board places bays only, so the slot is read-only rather than "+ bay".
   */
  readonly onMobileUnit: boolean;
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
  /**
   * BAY only: where the mutation put the workorder — a bay, the site's HOLD,
   * or nowhere (null). Undo compares the row against this before writing, so
   * a placement another dispatcher has since changed is left alone.
   */
  readonly currentPosition: PositionKind | null;
  /** BAY only: the bay the mutation placed the workorder on, when `currentPosition` is `BAY`. */
  readonly currentBayId: string | null;
}
