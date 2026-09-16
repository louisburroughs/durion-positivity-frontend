/**
 * View model and pure capacity engine for the Shop Capacity Calendar
 * (`/app/shopmgmt/schedule`).
 *
 * ── The primitive is *eligible* capacity, never bay capacity ────────────────
 *
 * "Three bays free" is not an answer. If all three are general-service bays and
 * the job needs the alignment rack, actual capacity is zero. Every figure this
 * module produces is therefore capacity *for the selected job*, computed as
 *
 *     eligible(hour) = min(eligible bays free, certified technicians free)
 *
 * and an opening only counts when the job's whole duration is free unbroken in
 * one bay. Raw shop bay-hours survive as grey context only, and appointment
 * counts are not modelled at all — one 4-hour diagnostic consumes four
 * bay-hours, four oil changes consume four, and a count conflates them.
 *
 * The two ways eligibility hits zero are kept apart deliberately, because the
 * fix differs: `bay` (the rack is taken — no action available) versus `tech`,
 * which splits again into `off` (nobody certified is rostered — call someone
 * in) and `assigned` (the certified technician is on another job — reassign).
 *
 * Everything here is pure and synchronous so it is unit-testable without HTTP;
 * `CapacityCalendarService` does the composition and hands these functions
 * already-normalized inputs.
 */

/** Operational state of one bay for one whole hour. */
export type BayHourState =
  /** Bookable. */
  | 'free'
  /** Holds a confirmed appointment. */
  | 'busy'
  /** Holds a tentative appointment that has not been confirmed. */
  | 'hold'
  /** Bay is OUT_OF_SERVICE, or blocked for a service call, for this hour. */
  | 'down'
  /** The shop is not open this hour (outside operating hours, or a closure). */
  | 'closed';

/** Why a day or hour offers no eligible capacity. */
export type LimitReason =
  /** The shop is shut this hour. */
  | 'shut'
  /** Every eligible bay is taken. */
  | 'bay'
  /** An eligible bay is free but no certified technician is. */
  | 'tech';

/**
 * Why the technician dimension is the binding constraint. Amber in both cases,
 * but `off` means call someone in and `assigned` means reassign.
 */
export type TechBlockReason = 'off' | 'assigned';

/** How a calendar day relates to the shop's operating calendar. */
export type DayKind =
  /** Padding from the previous or next month. */
  | 'outside'
  /** Normal operating day. */
  | 'open'
  /** Open, but on shorter hours than the weekday norm (e.g. Saturday 8–1). */
  | 'reduced'
  /** Closed for the weekly rest day. */
  | 'closed'
  /** Closed for a dated holiday closure. */
  | 'holiday';

// ── Resources ───────────────────────────────────────────────────────────────

/**
 * One service bay, as the capacity model needs it.
 *
 * `capabilityCodes` is `BayResponse.serviceCapabilityCodes` (CAP-325 D14): the
 * catalog operation codes this bay type alone performs; empty for a general
 * bay. `maxDutyClass` is the heaviest GVWR class the bay accepts (D13), null
 * when unconstrained. `bayType` is the coarse classification (GENERAL_SERVICE,
 * ALIGNMENT, …) and is only a fallback for a job whose operation code is not
 * known — see {@link JobRequirement}. A bay carries no skill requirement: the
 * catalog service does (CAP-329).
 */
export interface CapacityBay {
  readonly bayId: string;
  readonly name: string;
  readonly bayType: string;
  readonly capabilityCodes: readonly string[];
  readonly maxDutyClass?: number;
  /** True for `status === 'OUT_OF_SERVICE'`; the bay is never capacity. */
  readonly outOfService: boolean;
}

/**
 * One technician on the location's roster, with the skill codes of the
 * credentials they hold today (CAP-328: ACTIVE on the roster's reference date;
 * expired, revoked and superseded ones are not held).
 */
export interface CapacityTechnician {
  readonly personId: string;
  readonly displayName: string;
  readonly skills: readonly string[];
  /** Bay ids this technician is the assigned resource for, per hour index. */
  readonly assignedHours: ReadonlySet<number>;
  /** Hour indices the technician is rostered on shift and not on PTO. */
  readonly onDutyHours: ReadonlySet<number>;
}

/**
 * The job the whole board is filtered by: what it needs and how long it takes.
 *
 * `operationCode` is the catalog's own vocabulary (CAP-325 D14), and bay
 * eligibility reads it against each bay's `serviceCapabilityCodes`. A service
 * the catalog gave no code is unclaimed by definition, so it is general work
 * for every bay but a wash bay — never inferred from its name or category.
 */
export interface JobRequirement {
  readonly serviceId?: string;
  readonly label: string;
  /**
   * The catalog operation code (CAP-325 D14). Eligibility is the specialty map:
   * a bay claiming this code, or any general bay when no bay claims it.
   */
  readonly operationCode?: string;
  /**
   * Skill codes a technician must hold — every one of them (CAP-329). Empty
   * means any rostered technician. Without a vehicle only ANY-class
   * requirements apply, as the server itself resolves them.
   */
  readonly skillCodes: readonly string[];
  /** Job duration in hours; drives the unbroken-window test. */
  readonly durationHours: number;
}

// ── Per-hour and per-day results ────────────────────────────────────────────

/** One hour of one day, after eligibility is applied. */
export interface CapacityHour {
  /** Hour of day in 24h local time, e.g. 13 for 1 PM. */
  readonly hour: number;
  /** Bays that could take *any* work this hour (shop-wide context). */
  readonly shopCapacity: number;
  /** Of {@link shopCapacity}, how many are free (shop-wide context). */
  readonly shopFree: number;
  /** Eligible bays open this hour. */
  readonly bayCapacity: number;
  /** Of {@link bayCapacity}, how many are free. */
  readonly bayFree: number;
  /** Certified technicians rostered on duty this hour. */
  readonly techOnDuty: number;
  /** Of {@link techOnDuty}, how many are not already assigned. */
  readonly techFree: number;
  /** `min(bayFree, techFree)` — the number this page actually means. */
  readonly eligible: number;
  readonly limit: LimitReason;
  /** True when the job's full duration fits unbroken starting at this hour. */
  readonly fits: boolean;
}

/** Work carried into a day because yesterday's job ran past its planned finish. */
export interface CarryOver {
  readonly hours: number;
  readonly fromDate: string;
  readonly reason: string;
}

/** One cell of the month grid, and one column header of the week grid. */
export interface CapacityDay {
  /** Local calendar date, `YYYY-MM-DD`. */
  readonly date: string;
  readonly dayOfMonth: number;
  readonly kind: DayKind;
  readonly isToday: boolean;
  /** Empty for a day the shop is shut. */
  readonly hours: readonly CapacityHour[];
  /**
   * `bayStates[bayIndex][hourIndex]`, aligned to the view's bay order.
   *
   * Retained rather than folded away because the week grid draws one square per
   * bay in fixed order — a column of hatching is how "Bay 4 is down all
   * Wednesday" reads at a glance, and a free/busy count cannot say which bay.
   */
  readonly bayStates: readonly (readonly BayHourState[])[];
  /** Total shop bay-hours open, as grey context only. */
  readonly shopCapacityBayHours: number;
  readonly shopFreeBayHours: number;
  /** Eligible bay-hours — the figure the page leads with. */
  readonly eligibleCapacityBayHours: number;
  readonly eligibleFreeBayHours: number;
  /** First hour the job fits unbroken, or undefined when it never does. */
  readonly firstFitHour?: number;
  /** Set only when {@link firstFitHour} is undefined and a bay was free. */
  readonly techBlock?: TechBlockReason;
  /** Hours with an eligible bay free but no certified technician rostered. */
  readonly techOffHours: number;
  /** Hours with a certified technician rostered but assigned elsewhere. */
  readonly techAssignedHours: number;
  readonly carryOver?: CarryOver;
}

// ── Day board ───────────────────────────────────────────────────────────────

/** Where a scheduled job stands against its plan. */
export type AppointmentState =
  | 'scheduled'
  | 'inProgress'
  | 'complete'
  | 'tentative'
  /** Past its planned finish and still running. */
  | 'overrunning'
  /** Not an appointment: the bay is blocked. */
  | 'blocked';

/** One card on the day board's bay column. */
export interface BoardAppointment {
  readonly eventId: string;
  readonly bayId: string;
  readonly title: string;
  /** Fractional hours from midnight, e.g. 13.5 for 1:30 PM. */
  readonly startHour: number;
  readonly endHour: number;
  /**
   * Planned finish, when it differs from {@link endHour}. Absent whenever the
   * backend cannot distinguish planned from actual — see the service's gap list.
   */
  readonly plannedEndHour?: number;
  readonly state: AppointmentState;
  readonly technicianName?: string;
  readonly hasConflict: boolean;
  readonly conflictSeverity?: 'HARD' | 'SOFT';
}

/** Everything the three views render, for one location and one focus date. */
export interface CapacityCalendarView {
  readonly locationId: string;
  readonly locationName?: string;
  /** Local `YYYY-MM-DD` the day board shows and the month/week centre on. */
  readonly focusDate: string;
  readonly job: JobRequirement;
  readonly bays: readonly CapacityBay[];
  readonly technicians: readonly CapacityTechnician[];
  /** Hour-of-day labels the grids are built on, ascending. */
  readonly hours: readonly number[];
  /** Five or six weeks of seven days, for the month grid. */
  readonly weeks: readonly (readonly CapacityDay[])[];
  /** The focus date's operating days, for the week grid. */
  readonly weekDays: readonly CapacityDay[];
  readonly focusDay?: CapacityDay;
  readonly board: readonly BoardAppointment[];
  /**
   * True when an upstream source was unavailable during composition, so the
   * numbers may be incomplete. Mirrors the dispatch dashboard's own flag.
   */
  readonly degraded: boolean;
}

// ── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Local-calendar `YYYY-MM-DD`.
 *
 * ADR-0038 rejects `toISOString().slice(0, 10)` by name: it is UTC, so in any
 * UTC-N zone it returns tomorrow's date during the last hours of the local day
 * — which here would ask for the wrong day's board.
 */
export function isoDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parses `YYYY-MM-DD` as local midnight, not the UTC instant `new Date(s)` gives. */
export function parseIsoDateLocal(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/**
 * True when `bay` can perform `job`.
 *
 * CAP-325 D14, the specialty map: when a job names its operation code, a bay
 * is eligible if it claims that code; when no bay at the location claims it,
 * the operation is general work, which every bay but a `WASH_DETAIL` one may
 * do — a specialty bay too (physically an alignment bay can do an oil change;
 * making it ineligible would manufacture "shop is full"), ranked after the
 * general bays by {@link rankEligibleBays}. `bays` is the location's roster,
 * needed to know whether anyone claims the code; without it the bay's own
 * codes decide. A job with no operation code is unclaimed by definition and
 * takes the same general-work path. An empty requirement on every axis means
 * "all work", which every in-service bay satisfies. Duty class (D13) is a
 * vehicle question the calendar cannot ask yet; `maxDutyClass` is carried, not
 * applied.
 */
export function isEligibleBay(
  bay: CapacityBay,
  job: JobRequirement,
  bays: readonly CapacityBay[] = [],
): boolean {
  if (bay.outOfService) {
    return false;
  }
  const operation = normalizeCode(job.operationCode);
  if (operation) {
    const claims = (candidate: CapacityBay): boolean =>
      candidate.capabilityCodes.some(code => normalizeCode(code) === operation);
    if (claims(bay)) {
      return true;
    }
    if (bays.some(candidate => !candidate.outOfService && claims(candidate))) {
      return false;
    }
    return bay.bayType !== WASH_DETAIL;
  }
  return true;
}

/** The one bay type that never absorbs general mechanical work (D14: the exception to the default). */
const WASH_DETAIL = 'WASH_DETAIL';

/** True for a bay that claims nothing — general work's first choice (D14). */
export function isGeneralBay(bay: CapacityBay): boolean {
  return bay.capabilityCodes.length === 0;
}

/**
 * Eligible bays in offer order (D14): general bays first, then specialty bays
 * taking general work, so the rack is offered only once the general bays are.
 * Stable, so the caller's own order is kept within each group.
 */
export function rankEligibleBays(bays: readonly CapacityBay[]): CapacityBay[] {
  return [...bays].sort((a, b) => Number(!isGeneralBay(a)) - Number(!isGeneralBay(b)));
}

function normalizeCode(code: string | undefined): string {
  return (code ?? '').trim().toUpperCase();
}

/**
 * True when `tech` holds every skill `job` requires (CAP-329: one mechanic
 * must hold all of it — competence is per person, not pooled). A job stating
 * no requirement admits every rostered technician: an unstated requirement is
 * not a requirement, and the view degrades to bay-only capacity, never to zero.
 * Matching is on the Durion skill code, uppercase-and-trimmed on both sides.
 */
export function isCertifiedTechnician(tech: CapacityTechnician, job: JobRequirement): boolean {
  if (job.skillCodes.length === 0) {
    return true;
  }
  const held = new Set(tech.skills.map(normalizeCode));
  return job.skillCodes.every(code => held.has(normalizeCode(code)));
}

/**
 * Whole hours a job occupies. An opening must hold the job unbroken, and the
 * grids are hour-resolution, so 1.5 h needs two consecutive free hours — the
 * conservative rounding, which never offers a slot that cannot be worked.
 */
export function hoursNeeded(job: JobRequirement): number {
  return Math.max(1, Math.ceil(job.durationHours));
}

// ── The engine ──────────────────────────────────────────────────────────────

/** Inputs for one day, already normalized from the API responses. */
export interface DayCapacityInput {
  readonly date: string;
  readonly kind: DayKind;
  readonly isToday: boolean;
  /** Hour-of-day labels for the grid, ascending. */
  readonly hours: readonly number[];
  readonly bays: readonly CapacityBay[];
  readonly technicians: readonly CapacityTechnician[];
  readonly job: JobRequirement;
  /** `grid[bayIndex][hourIndex]`, aligned to {@link bays} and {@link hours}. */
  readonly grid: readonly (readonly BayHourState[])[];
  /**
   * Hour of day now, when {@link isToday}. An hour already under way cannot be
   * offered, so scanning starts at the next whole hour.
   */
  readonly currentHour?: number;
  readonly carryOver?: CarryOver;
}

/**
 * Folds one day's grid into the eligibility figures every view reads.
 *
 * The technician axis is deliberately computed from assignment, not just from
 * the roster: a technician covering two bays is unavailable for the rack while
 * working the other one, so a day can show the rack free all afternoon and
 * still offer nothing.
 */
export function computeDay(input: DayCapacityInput): CapacityDay {
  const { hours, bays, technicians, job, grid, isToday, currentHour } = input;
  const dayOfMonth = parseIsoDateLocal(input.date).getDate();

  if (input.kind === 'closed' || input.kind === 'holiday' || input.kind === 'outside') {
    return {
      date: input.date,
      dayOfMonth,
      kind: input.kind,
      isToday,
      hours: [],
      bayStates: grid,
      shopCapacityBayHours: 0,
      shopFreeBayHours: 0,
      eligibleCapacityBayHours: 0,
      eligibleFreeBayHours: 0,
      techOffHours: 0,
      techAssignedHours: 0,
      carryOver: input.carryOver,
    };
  }

  const eligibleBayIndexes = bays
    .map((bay, index) => (isEligibleBay(bay, job, bays) ? index : -1))
    .filter(index => index >= 0);
  const certified = technicians.filter(tech => isCertifiedTechnician(tech, job));

  const cells: CapacityHour[] = hours.map((hour, hourIndex) => {
    let shopCapacity = 0;
    let shopFree = 0;
    bays.forEach((_, bayIndex) => {
      const state = grid[bayIndex]?.[hourIndex] ?? 'closed';
      if (state === 'closed' || state === 'down') {
        return;
      }
      shopCapacity += 1;
      if (state === 'free') {
        shopFree += 1;
      }
    });

    let bayCapacity = 0;
    let bayFree = 0;
    eligibleBayIndexes.forEach(bayIndex => {
      const state = grid[bayIndex]?.[hourIndex] ?? 'closed';
      if (state === 'closed' || state === 'down') {
        return;
      }
      bayCapacity += 1;
      if (state === 'free') {
        bayFree += 1;
      }
    });

    const onDuty = certified.filter(tech => tech.onDutyHours.has(hourIndex));
    const free = onDuty.filter(tech => !tech.assignedHours.has(hourIndex));
    const eligible = Math.min(bayFree, free.length);

    let limit: LimitReason;
    if (bayCapacity === 0) {
      limit = 'shut';
    } else if (bayFree === 0) {
      limit = 'bay';
    } else if (free.length === 0) {
      limit = 'tech';
    } else {
      limit = bayFree <= free.length ? 'bay' : 'tech';
    }

    return {
      hour,
      shopCapacity,
      shopFree,
      bayCapacity,
      bayFree,
      techOnDuty: onDuty.length,
      techFree: free.length,
      eligible,
      limit,
      fits: false,
    };
  });

  const need = hoursNeeded(job);
  const withFit = cells.map((cell, hourIndex) => {
    if (hourIndex + need > cells.length) {
      return cell;
    }
    // An hour already under way cannot hold a job that starts on the hour.
    if (isToday && currentHour !== undefined && cell.hour < currentHour) {
      return cell;
    }
    for (let step = 0; step < need; step += 1) {
      if ((cells[hourIndex + step]?.eligible ?? 0) < 1) {
        return cell;
      }
    }
    return { ...cell, fits: true };
  });

  const firstFit = withFit.find(cell => cell.fits);
  const techOffHours = withFit.filter(
    cell => cell.bayCapacity > 0 && cell.bayFree > 0 && cell.techOnDuty === 0,
  ).length;
  const techAssignedHours = withFit.filter(
    cell => cell.bayCapacity > 0 && cell.bayFree > 0 && cell.techOnDuty > 0 && cell.techFree === 0,
  ).length;

  let techBlock: TechBlockReason | undefined;
  if (!firstFit) {
    // "Nobody is rostered" is a different call from "the one who is, is busy",
    // so `off` wins whenever any hour shows it.
    if (techOffHours > 0) {
      techBlock = 'off';
    } else if (techAssignedHours > 0) {
      techBlock = 'assigned';
    }
  }

  const sum = (pick: (cell: CapacityHour) => number): number =>
    withFit.reduce((total, cell) => total + pick(cell), 0);

  return {
    date: input.date,
    dayOfMonth,
    kind: input.kind,
    isToday,
    hours: withFit,
    bayStates: grid,
    shopCapacityBayHours: sum(cell => cell.shopCapacity),
    shopFreeBayHours: sum(cell => cell.shopFree),
    eligibleCapacityBayHours: sum(cell => cell.bayCapacity),
    eligibleFreeBayHours: sum(cell => cell.bayFree),
    firstFitHour: firstFit?.hour,
    techBlock,
    techOffHours,
    techAssignedHours,
    carryOver: input.carryOver,
  };
}

/**
 * Utilization as a 0–1 fraction of shop bay-hours consumed. Shown as grey
 * context beside the eligible figures, never as the headline.
 */
export function shopUtilization(day: CapacityDay): number {
  if (day.shopCapacityBayHours === 0) {
    return 0;
  }
  return 1 - day.shopFreeBayHours / day.shopCapacityBayHours;
}
