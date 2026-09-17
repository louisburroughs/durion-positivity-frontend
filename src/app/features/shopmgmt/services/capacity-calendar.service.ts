import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, forkJoin, from, map, mergeMap, of, toArray } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { BayAPIService, LocationAPIService } from '@durion-sdk/location';
import type { BayResponse } from '@durion-sdk/location';
import { ProductsAPIService } from '@durion-sdk/catalog';
import type { ServiceDto } from '@durion-sdk/catalog';
import { ScheduleAPIService, TechnicianAPIService, TechnicianCredentialResponseStatusEnum } from '@durion-sdk/shop-manager';
import type {
  LocationTechnicianRosterEntryResponse,
  ScheduleEventView,
  ScheduleResourceView,
  ScheduleViewResponse,
  TechnicianCredentialResponse,
} from '@durion-sdk/shop-manager';
import {
  AppointmentState,
  BayHourState,
  BoardAppointment,
  CapacityBay,
  CapacityCalendarView,
  CapacityDay,
  CapacityTechnician,
  DayKind,
  JobRequirement,
  computeDay,
  isCertifiedTechnician,
  isEligibleBay,
  isoDateLocal,
  parseIsoDateLocal,
} from '../models/capacity-calendar.models';

/** Which grid the page is showing; each needs a different number of days. */
export type CapacityScope = 'month' | 'week' | 'day';

export interface CapacityCalendarRequest {
  readonly locationId: string;
  /** Local `YYYY-MM-DD` the day board shows and the month/week centre on. */
  readonly focusDate: string;
  readonly scope: CapacityScope;
  readonly job: JobRequirement;
}

/**
 * Bay and mobile-unit endpoints are Spring pages defaulting to 20 rows. A shop
 * with more bays than that would silently lose columns, so an explicit size is
 * requested — the same reasoning as {@link ShopDashboardService}'s PAGE_SIZE.
 */
const PAGE_SIZE = 500;

/**
 * The month grid needs one `viewSchedule` call per day (see louisburroughs/durion#474), so the
 * fan-out is concurrency-limited rather than fired as 42 parallel requests.
 * Matches the dashboard's VEHICLE_LOOKUP_CONCURRENCY for the same reason.
 */
const SCHEDULE_FAN_OUT_CONCURRENCY = 6;

/** `status` values that take a bay out of the capacity model entirely. */
const BAY_OUT_OF_SERVICE = 'OUT_OF_SERVICE';

/** `ScheduleEventView.eventType` values, as documented on the schedule view. */
const EVENT_APPOINTMENT = 'APPOINTMENT';
const EVENT_SHIFT = 'SHIFT';
const EVENT_PTO = 'PTO';

/**
 * How one day's `viewSchedule` call came back.
 *
 * `ABSENT` is a 404, which this endpoint documents as "the location is unknown"
 * — it answers only for a location the schedule service knows **as a shop**.
 * That is data absence, not a transport failure: a site that is not a shop
 * simply has no schedule, and saying "could not be loaded" about it sends
 * someone to look for an outage that is not there. `FAILED` is everything else
 * — a real fault, and the only thing that sets `degraded`.
 */
const ABSENT = Symbol('schedule-absent');
const FAILED = Symbol('schedule-failed');

type ScheduleOutcome = ScheduleViewResponse | typeof ABSENT | typeof FAILED;
type ScheduleEntry = readonly [string, ScheduleOutcome];

/** One day's schedules, with the two failure modes counted apart. */
interface ScheduleLoad {
  readonly byDate: Map<string, ScheduleViewResponse | undefined>;
  /** Days the schedule service answered 404 for. */
  readonly absent: number;
  /** Days that failed for any other reason. */
  readonly failed: number;
  readonly total: number;
}

/** True for the 404 this endpoint returns when it does not know the location. */
function isScheduleAbsent(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 404;
}

/**
 * Some days answered 404 and some answered normally — a partial picture, which
 * is neither clean absence nor a clean read.
 */
function isPartiallyAbsent(load: ScheduleLoad): boolean {
  return load.absent > 0 && load.absent < load.total;
}

/** `ScheduleResourceView.resourceType` lanes this page reads. */
const LANE_BAY = 'BAY';
const LANE_MECHANIC = 'MECHANIC';

/**
 * Backs the Shop Capacity Calendar (`/app/shopmgmt/schedule`), whose primitive
 * is *eligible* capacity — see `capacity-calendar.models.ts` for the model.
 *
 * INTERIM COMPOSITION, in the same shape as {@link ShopDashboardService}: the
 * page wants one capacity read and there is no capacity endpoint, so the view is
 * composed from the endpoints that do exist:
 *
 *   bays                    → columns, bay type, specialty codes, duty class, OOS
 *   location technicians    → technician roster and the skill codes they hold
 *   schedule view (per day) → bay occupancy, mechanic assignment, shift/PTO
 *   catalog services        → the job-type filter, its operation code, its
 *                             required skills and its default duration
 *
 * Eligibility is read, not inferred: a bay's `serviceCapabilityCodes` against the
 * service's `operationCode` (CAP-325 D14) and a technician's held credentials
 * against the service's `requiredSkills` (CAP-329) — the gap durion#473 named is
 * closed. Three gaps remain visible in the output rather than papered over. Each
 * is tracked as a backend story and each has a named degradation on screen:
 *
 *   louisburroughs/durion#474 — `viewSchedule` is one location and one date; its
 *     `range` selects LOCATION_HOURS or FULL_DAY, not a week or a month. The
 *     month grid is therefore a capped fan-out of one request per day, which is
 *     why the month scope is loaded only when that grid is actually shown.
 *
 *   louisburroughs/durion#475 — nothing answers "the next unbroken 1.5 h in an
 *     eligible bay with a certified technician". That fit is computed in
 *     `computeDay`, so it can only see the days already fetched.
 *
 *   louisburroughs/durion#476 — `AppointmentResponse` exposes `startAt`/`endAt`
 *     only, with no actual start or finish, so planned-vs-actual cannot be
 *     derived. The day board draws the overrun hatch only for an appointment
 *     the schedule view has already flagged, and the carry-over debit is left
 *     unset rather than invented.
 *
 *   louisburroughs/durion#477 — `LocationResponseDTO` omits `operatingHours`,
 *     `holidayClosures` and `timezone`; they are writable but not readable. The
 *     operating window therefore comes from each day's own
 *     `dayStartAt`/`dayEndAt`, and closed days are not shaded, because shading
 *     one would assert a closure no read confirmed.
 */
@Injectable({ providedIn: 'root' })
export class CapacityCalendarService {
  private readonly bayApi = inject(BayAPIService);
  private readonly locationApi = inject(LocationAPIService);
  private readonly scheduleApi = inject(ScheduleAPIService);
  private readonly technicianApi = inject(TechnicianAPIService);
  /** `searchCatalogServices` lives on the products API, not the catalog API. */
  private readonly catalogApi = inject(ProductsAPIService);

  /**
   * Job types for the filter control, with the duration the catalog knows.
   *
   * `defaultLaborHours` is in tenths of an hour, so 15 is 1.5 h. A service with
   * no default is offered at one hour, the smallest window the hour-resolution
   * grids can express.
   */
  searchJobTypes(query: string): Observable<JobRequirement[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return of([]);
    }
    return this.catalogApi.searchCatalogServices(trimmed, 20).pipe(
      map(services => services.map(service => this.toJobRequirement(service))),
      catchError(() => of([])),
    );
  }

  /** Maps one catalog service onto the requirement the capacity engine takes. */
  toJobRequirement(service: ServiceDto): JobRequirement {
    return {
      serviceId: service.id,
      label: service.name ?? '',
      // CAP-325 D14: the operation code is the eligibility key. A service without
      // one is unclaimed work; nothing is inferred from its name or category.
      operationCode: service.operationCode ?? undefined,
      // CAP-329: the catalog's declared requirement. The calendar has no vehicle, so
      // only ANY-class requirements apply here — exactly what the server resolves
      // without a vehicle (spec D13); a retired skill is still named, never dropped.
      skillCodes: (service.requiredSkills ?? [])
        .filter(skill => skill.minGvwrClass == null && skill.maxGvwrClass == null)
        .map(skill => skill.skillCode ?? '')
        .filter(code => code.length > 0),
      // Null is "never configured" (the contract's requirementsConfiguredAt is null too); an empty
      // list with a configured-at is a declared "unconstrained". Only the former is a warning.
      skillRequirementsConfigured: service.requiredSkills != null || service.requirementsConfiguredAt != null,
      durationHours: service.defaultLaborHours ? service.defaultLaborHours / 10 : 1,
    };
  }

  /** The unfiltered view: all work, one hour, every bay eligible. */
  static allWorkJob(label: string): JobRequirement {
    return {
      label,
      skillCodes: [],
      skillRequirementsConfigured: true,
      durationHours: 1,
    };
  }

  /**
   * Composes the calendar for one location, focus date and scope.
   *
   * Every upstream call degrades to empty rather than failing the page: a shop
   * with an unreachable roster should still show its bays, with `degraded` set
   * so the page can say the numbers may be incomplete.
   */
  getCalendar(request: CapacityCalendarRequest): Observable<CapacityCalendarView> {
    const dates = this.datesFor(request.focusDate, request.scope);

    return forkJoin({
      bays: this.loadBays(request.locationId),
      technicians: this.loadTechnicians(request.locationId),
      locationName: this.loadLocationName(request.locationId),
      schedules: this.loadSchedules(request.locationId, dates),
    }).pipe(
      map(({ bays, technicians, locationName, schedules }) =>
        this.assemble(request, bays, technicians, locationName, schedules),
      ),
    );
  }

  // ── Loads ─────────────────────────────────────────────────────────────────

  private loadBays(locationId: string): Observable<{ bays: CapacityBay[]; ok: boolean }> {
    // Status is left unfiltered: an OUT_OF_SERVICE bay still occupies a column
    // on the board, hatched, because "Bay 4 is down until noon" is exactly the
    // thing a capacity view must not hide by omitting the bay.
    return this.bayApi.listBays(locationId, undefined, undefined, 0, PAGE_SIZE).pipe(
      map(page => ({
        bays: (page.content ?? []).map(bay => this.toCapacityBay(bay)).sort(compareBayNames),
        ok: true,
      })),
      catchError(() => of({ bays: [] as CapacityBay[], ok: false })),
    );
  }

  private toCapacityBay(bay: BayResponse): CapacityBay {
    return {
      bayId: bay.id,
      name: bay.name,
      bayType: bay.bayType ?? '',
      capabilityCodes: bay.serviceCapabilityCodes ?? [],
      maxDutyClass: bay.maxDutyClass,
      outOfService: bay.status === BAY_OUT_OF_SERVICE,
    };
  }

  private loadTechnicians(
    locationId: string,
  ): Observable<{ roster: LocationTechnicianRosterEntryResponse[]; ok: boolean }> {
    return this.technicianApi
      .listLocationTechnicians(locationId, 'ACTIVE', undefined, 0, PAGE_SIZE)
      .pipe(
        map(page => ({ roster: page.content ?? [], ok: true })),
        catchError(() => of({ roster: [] as LocationTechnicianRosterEntryResponse[], ok: false })),
      );
  }

  private loadLocationName(locationId: string): Observable<string | undefined> {
    return this.locationApi.getLocationById(locationId).pipe(
      map(location => location.name),
      catchError(() => of(undefined)),
    );
  }

  /**
   * One `viewSchedule` per date (#474), concurrency-limited, each degrading to
   * `undefined` so one bad day does not blank the month.
   *
   * `includeAvailabilityOverlay` is what puts SHIFT and PTO events on the
   * mechanic lanes; without it a technician's absence is indistinguishable from
   * a technician with nothing booked, which would turn "no certified tech
   * rostered" into a silent overstatement of capacity.
   */
  private loadSchedules(locationId: string, dates: readonly string[]): Observable<ScheduleLoad> {
    return from(dates).pipe(
      mergeMap(
        date =>
          this.scheduleApi
            .viewSchedule(locationId, date, undefined, undefined, true, 'LOCATION_HOURS')
            .pipe(
              map(response => [date, response] as ScheduleEntry),
              catchError((error: unknown) =>
                of([date, isScheduleAbsent(error) ? ABSENT : FAILED] as ScheduleEntry),
              ),
            ),
        SCHEDULE_FAN_OUT_CONCURRENCY,
      ),
      toArray(),
      map(entries => {
        const byDate = new Map<string, ScheduleViewResponse | undefined>();
        let absent = 0;
        let failed = 0;
        entries.forEach(([date, outcome]) => {
          if (outcome === ABSENT) {
            absent += 1;
            byDate.set(date, undefined);
          } else if (outcome === FAILED) {
            failed += 1;
            byDate.set(date, undefined);
          } else {
            byDate.set(date, outcome);
          }
        });
        return { byDate, absent, failed, total: entries.length };
      }),
    );
  }

  // ── Assembly ──────────────────────────────────────────────────────────────

  private assemble(
    request: CapacityCalendarRequest,
    bays: { bays: CapacityBay[]; ok: boolean },
    technicians: { roster: LocationTechnicianRosterEntryResponse[]; ok: boolean },
    locationName: string | undefined,
    load: ScheduleLoad,
  ): CapacityCalendarView {
    const schedules = load.byDate;
    const hours = this.hourLabels(schedules);
    const today = isoDateLocal(new Date());
    const currentHour = new Date().getHours();
    const focusMonth = parseIsoDateLocal(request.focusDate).getMonth();

    const buildDay = (date: string): CapacityDay => {
      const schedule = schedules.get(date);
      const inFocusMonth = parseIsoDateLocal(date).getMonth() === focusMonth;
      const kind: DayKind = this.dayKind(schedule, inFocusMonth, request.scope);
      const dayTechnicians = this.technicianHours(technicians.roster, schedule, hours);
      return computeDay({
        date,
        kind,
        isToday: date === today,
        hours,
        bays: bays.bays,
        technicians: dayTechnicians,
        job: request.job,
        grid: this.bayGrid(bays.bays, schedule, hours),
        currentHour,
        // #476: no actual-vs-planned read, so carry-over is left unset rather
        // than guessed from a duration the backend never confirmed.
        carryOver: undefined,
      });
    };

    const monthWeeks =
      request.scope === 'month'
        ? this.monthGrid(request.focusDate).map(week => week.map(buildDay))
        : [];
    const weekDays =
      request.scope === 'week' ? this.weekDates(request.focusDate).map(buildDay) : [];
    const focusDay = request.scope === 'day' ? buildDay(request.focusDate) : undefined;

    return {
      locationId: request.locationId,
      locationName,
      focusDate: request.focusDate,
      job: request.job,
      bays: bays.bays,
      technicians: this.technicianHours(
        technicians.roster,
        schedules.get(request.focusDate),
        hours,
      ),
      hours,
      weeks: monthWeeks,
      weekDays,
      focusDay,
      board: request.scope === 'day' ? this.boardFor(schedules.get(request.focusDate)) : [],
      // A 404 day is absence, not breakage, so only a real fault degrades —
      // except when the 404s are partial. The endpoint 404s on a date with no
      // appointments at a location it holds no shop row for, so a shopless
      // location that has any bookings answers 200 for those dates and 404 for
      // the rest. That mixture cannot be told apart from a genuinely quiet day
      // downstream, so the blank cells would read as "open and empty" when the
      // truth is "unknown". Only all-404 is unambiguous absence.
      degraded: !bays.ok || !technicians.ok || load.failed > 0 || isPartiallyAbsent(load),
      // Every day answered 404: the schedule service does not know this
      // location as a shop, so there is nothing to report for any date. Said
      // once and plainly, rather than as a month of empty cells.
      locationHasNoSchedule: load.total > 0 && load.absent === load.total,
      skillRequirementsUnknown: !request.job.skillRequirementsConfigured,
    };
  }

  /**
   * Hour-of-day labels for the grids, taken from the widest `dayStartAt` →
   * `dayEndAt` window any fetched day reports.
   *
   * The location's own operating hours are not readable, so the schedule view's
   * window is the only available statement of when the shop is open. Instants
   * are UTC and are rendered in the browser's zone, which is the same
   * assumption the dispatch board already makes; a shop in another timezone
   * needs `LocationResponseDTO.timezone`, which the read DTO omits.
   */
  private hourLabels(schedules: Map<string, ScheduleViewResponse | undefined>): number[] {
    let start = Number.POSITIVE_INFINITY;
    let end = Number.NEGATIVE_INFINITY;
    schedules.forEach(schedule => {
      if (!schedule?.dayStartAt || !schedule?.dayEndAt) {
        return;
      }
      start = Math.min(start, new Date(schedule.dayStartAt).getHours());
      end = Math.max(end, Math.ceil(hourOfDay(new Date(schedule.dayEndAt))));
    });
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return [];
    }
    return Array.from({ length: end - start }, (_, index) => start + index);
  }

  /**
   * How a day relates to the operating calendar.
   *
   * With no readable operating hours or holiday closures, only two states can
   * be told apart honestly: a day outside the focus month, and everything else.
   * A day the shop is genuinely shut is left as `open` with an empty grid
   * rather than shaded as `closed`, because shading it would assert a closure
   * no read confirmed.
   */
  private dayKind(
    schedule: ScheduleViewResponse | undefined,
    inFocusMonth: boolean,
    scope: CapacityScope,
  ): DayKind {
    if (scope === 'month' && !inFocusMonth) {
      return 'outside';
    }
    return schedule ? 'open' : 'closed';
  }

  /**
   * `grid[bayIndex][hourIndex]` for one day.
   *
   * An hour is busy when any appointment on that bay lane overlaps it at all: a
   * 20-minute job still takes the bay for that hour as far as a job needing the
   * whole hour is concerned.
   */
  private bayGrid(
    bays: readonly CapacityBay[],
    schedule: ScheduleViewResponse | undefined,
    hours: readonly number[],
  ): BayHourState[][] {
    return bays.map(bay => {
      if (!schedule) {
        return hours.map(() => 'closed' as BayHourState);
      }
      if (bay.outOfService) {
        return hours.map(() => 'down' as BayHourState);
      }
      const lane = (schedule.resources ?? []).find(
        resource => resource.resourceType === LANE_BAY && resource.resourceId === bay.bayId,
      );
      const events = (lane?.events ?? []).filter(event => event.eventType === EVENT_APPOINTMENT);
      return hours.map(hour =>
        events.some(event => overlapsHour(event, hour)) ? 'busy' : 'free',
      );
    });
  }

  /**
   * The technician roster with their per-hour duty and assignment for one day.
   *
   * On duty comes from SHIFT events minus PTO; a roster with no shift data at
   * all is treated as on duty for the whole window, because reporting every
   * technician as absent would understate capacity everywhere the HR overlay is
   * unavailable — the schedule view reports that case as
   * `availabilityOverlayStatus: UNAVAILABLE`.
   */
  private technicianHours(
    roster: readonly LocationTechnicianRosterEntryResponse[],
    schedule: ScheduleViewResponse | undefined,
    hours: readonly number[],
  ): CapacityTechnician[] {
    const lanes = (schedule?.resources ?? []).filter(
      resource => resource.resourceType === LANE_MECHANIC,
    );
    const overlayUnavailable = schedule?.availabilityOverlayStatus !== 'AVAILABLE';

    return roster.map(entry => {
      const personId = entry.personId ?? entry.mechanicId ?? '';
      const lane = lanes.find(candidate => candidate.resourceId === personId);
      const events = lane?.events ?? [];
      const shifts = events.filter(event => event.eventType === EVENT_SHIFT);
      const pto = events.filter(event => event.eventType === EVENT_PTO);
      const assignments = events.filter(event => event.eventType === EVENT_APPOINTMENT);

      const onDutyHours = new Set<number>();
      const assignedHours = new Set<number>();
      hours.forEach((hour, index) => {
        const onShift = overlayUnavailable || shifts.length === 0
          ? true
          : shifts.some(event => overlapsHour(event, hour));
        const onLeave = pto.some(event => overlapsHour(event, hour));
        if (onShift && !onLeave) {
          onDutyHours.add(index);
        }
        if (assignments.some(event => overlapsHour(event, hour))) {
          assignedHours.add(index);
        }
      });

      return {
        personId,
        displayName: displayName(entry),
        skills: heldSkillCodes(entry.credentials),
        assignedHours,
        onDutyHours,
      };
    });
  }

  /** The day board's cards, one per appointment across every bay lane. */
  private boardFor(schedule: ScheduleViewResponse | undefined): BoardAppointment[] {
    if (!schedule) {
      return [];
    }
    const mechanicLanes = (schedule.resources ?? []).filter(
      resource => resource.resourceType === LANE_MECHANIC,
    );
    return (schedule.resources ?? [])
      .filter(resource => resource.resourceType === LANE_BAY)
      .flatMap(lane =>
        (lane.events ?? [])
          .filter(event => event.eventType === EVENT_APPOINTMENT)
          .map(event => this.toBoardAppointment(lane, event, mechanicLanes)),
      );
  }

  private toBoardAppointment(
    lane: ScheduleResourceView,
    event: ScheduleEventView,
    mechanicLanes: readonly ScheduleResourceView[],
  ): BoardAppointment {
    const technician = mechanicLanes.find(mechanic =>
      (mechanic.events ?? []).some(candidate => candidate.eventId === event.eventId),
    );
    const severity = event.severity === 'HARD' || event.severity === 'SOFT' ? event.severity : undefined;
    return {
      eventId: event.eventId,
      bayId: lane.resourceId,
      title: event.title ?? '',
      startHour: hourOfDay(new Date(event.startTime)),
      endHour: hourOfDay(new Date(event.endTime)),
      // #476: no actual finish is published, so no planned line is drawn.
      plannedEndHour: undefined,
      state: appointmentState(event),
      technicianName: technician?.resourceName,
      hasConflict: event.hasConflict,
      conflictSeverity: severity,
    };
  }

  // ── Date windows ──────────────────────────────────────────────────────────

  /** Dates the given scope needs fetched. */
  private datesFor(focusDate: string, scope: CapacityScope): string[] {
    if (scope === 'day') {
      return [focusDate];
    }
    if (scope === 'week') {
      return this.weekDates(focusDate);
    }
    return this.monthGrid(focusDate).flat();
  }

  /** Sunday-first week containing `focusDate`. */
  private weekDates(focusDate: string): string[] {
    const focus = parseIsoDateLocal(focusDate);
    const sunday = new Date(focus);
    sunday.setDate(focus.getDate() - focus.getDay());
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(sunday);
      date.setDate(sunday.getDate() + index);
      return isoDateLocal(date);
    });
  }

  /** Whole weeks covering the focus month, Sunday-first, including padding. */
  private monthGrid(focusDate: string): string[][] {
    const focus = parseIsoDateLocal(focusDate);
    const first = new Date(focus.getFullYear(), focus.getMonth(), 1);
    const last = new Date(focus.getFullYear(), focus.getMonth() + 1, 0);
    const cursor = new Date(first);
    cursor.setDate(first.getDate() - first.getDay());

    const weeks: string[][] = [];
    while (cursor <= last || cursor.getDay() !== 0) {
      const week: string[] = [];
      for (let index = 0; index < 7; index += 1) {
        week.push(isoDateLocal(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
      if (weeks.length >= 6) {
        break;
      }
    }
    return weeks;
  }
}

// ── Module-private helpers ──────────────────────────────────────────────────

/**
 * Orders bay columns by name, `numeric` so "Bay 10" sorts after "Bay 9" rather
 * than after "Bay 1" — the board is read as a floor plan and the Spring page
 * promises no order of its own.
 */
function compareBayNames(a: CapacityBay, b: CapacityBay): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

/** Local hour of day as a fraction, e.g. 13.5 for 1:30 PM. */
function hourOfDay(date: Date): number {
  return date.getHours() + date.getMinutes() / 60;
}

/** True when the event covers any part of the whole hour starting at `hour`. */
function overlapsHour(event: ScheduleEventView, hour: number): boolean {
  const start = hourOfDay(new Date(event.startTime));
  const end = hourOfDay(new Date(event.endTime));
  return start < hour + 1 && end > hour;
}

function appointmentState(event: ScheduleEventView): AppointmentState {
  const subType = (event.subType ?? '').toUpperCase();
  if (subType.includes('TENTATIVE') || subType.includes('HOLD')) {
    return 'tentative';
  }
  if (subType.includes('COMPLETE')) {
    return 'complete';
  }
  if (subType.includes('PROGRESS')) {
    return 'inProgress';
  }
  if (subType.includes('BLOCK') || subType.includes('OUT_OF_SERVICE')) {
    return 'blocked';
  }
  return 'scheduled';
}

function displayName(entry: LocationTechnicianRosterEntryResponse): string {
  return [entry.firstName, entry.lastName]
    .map(part => (part ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Skill codes a technician holds today (CAP-328): the credentials the roster reports
 * ACTIVE on its reference date. Expired, revoked and superseded credentials are
 * shown elsewhere; here they are not competence.
 */
export function heldSkillCodes(credentials: readonly TechnicianCredentialResponse[] | undefined): string[] {
  return (credentials ?? [])
    .filter(credential => credential.status === TechnicianCredentialResponseStatusEnum.Active)
    .map(credential => credential.skillCode ?? '')
    .filter(code => code.length > 0);
}

/** Re-exported so the page can narrow a day without importing the model file twice. */
export { isEligibleBay, isCertifiedTechnician };
