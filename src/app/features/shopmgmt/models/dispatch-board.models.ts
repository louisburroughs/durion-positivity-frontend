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
 * `UNKNOWN` is the state every card loads in, and it is not a placeholder for a
 * value that exists elsewhere: no endpoint on this board publishes clock state.
 * `WorkSessionsAPIService` is all POST mutations — there is no getter — and the
 * roster read the panel is built from (`GET /v1/people/availability`) carries
 * assignment metadata with no instant on it. Backend issue #2061 adds the read;
 * until it lands `UNKNOWN` means "this board cannot ask", and the card offers
 * both actions rather than asserting a state it would be guessing at.
 *
 * The other three are only ever set from a server answer to a clock write —
 * either the `WorkSessionDto` a start/stop returns, or the refusal that
 * contradicts it (a 409 on start says the session is already open). They are
 * observed, not predicted. They are also not re-read: the 30s poll carries no
 * clock state, so a session someone ends elsewhere leaves this card stale until
 * the next clock write or a reload. #2061 closes that too.
 */
export type MechanicClockState = 'CLOCKED_IN' | 'ON_BREAK' | 'CLOCKED_OUT' | 'UNKNOWN';

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
 *   reports availability as a flag, never as a span. No shift-window entity
 *   exists on the platform yet; backend issue #2060 adds a placeholder window
 *   derived from the location's operating hours.
 * - mechanic clock state — the clock write endpoints exist, the read does not
 *   (backend issue #2061). See `MechanicClockState`.
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
  /** Always null: no shift window is published for this board. */
  readonly freeHours: null;
  /**
   * `UNKNOWN` on every load — nothing on this board reads clock state. It turns
   * real only after a clock write on this card answers. See `MechanicClockState`.
   */
  readonly clockState: MechanicClockState;
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
