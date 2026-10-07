import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, forkJoin, from, map, mergeMap, of, toArray } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { BayAPIService, LocationAPIService } from '@durion-sdk/location';
import type { BayResponse } from '@durion-sdk/location';
import { ProductsAPIService } from '@durion-sdk/catalog';
import type { ServiceDto } from '@durion-sdk/catalog';
import {
  DayCapacityViewStatusEnum,
  ScheduleAPIService,
  ScheduleCapacityResponseStaffingStatusEnum,
  TechnicianAPIService,
  TechnicianCredentialResponseStatusEnum,
} from '@durion-sdk/shop-manager';
import type {
  DayCapacityView,
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
  CarryOver,
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
 * The day board's per-day schedule read is a single call today, but the load is
 * still concurrency-limited in case it is asked for more than one date. Matches
 * the dashboard's VEHICLE_LOOKUP_CONCURRENCY. The month and week grids do not
 * fan out: each is one `getScheduleCapacity` read (frontend #488).
 */
const SCHEDULE_FAN_OUT_CONCURRENCY = 6;

const MS_PER_HOUR = 3_600_000;

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

/**
 * The month or week grid's one `getScheduleCapacity` read (backend #2023),
 * keyed by date. A failed read leaves `byDate` empty with one of the two flags
 * set, in the same `ABSENT`/`FAILED` split the per-day schedule read uses.
 */
interface CapacityLoad {
  readonly byDate: Map<string, DayCapacityView>;
  /**
   * The read's `staffingStatus` was AVAILABLE (backend #2527), so each OK day's
   * `technicians` is that date's real roster. False when the staffing replica
   * holds nothing for the location, when an older backend omits the field, and
   * when the read failed — in each case who is on duty is unknown.
   */
  readonly staffingKnown: boolean;
  /** The read answered 404. */
  readonly absent: boolean;
  /** The read failed for any other reason. */
  readonly failed: boolean;
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
 * INTERIM COMPOSITION, in the same shape as {@link ShopDashboardService}: no
 * single read answers eligible capacity for a job, so the view is composed from
 * the endpoints that do exist:
 *
 *   bays                    → columns, bay type, specialty codes, duty class, OOS
 *   location technicians    → technician roster and the skill codes they hold
 *   schedule capacity       → every scope: per-day status, operating window, bay
 *                             occupancy by hour (work orders included),
 *                             carry-over, and each rostered technician's on-duty
 *                             and assigned hours, in one read (backend #2023, #2527)
 *   schedule view (per day) → day board: the appointment cards, which the
 *                             capacity read does not itemise
 *   catalog services        → the job-type filter, its operation code, its
 *                             required skills and its default duration
 *
 * Technician duty and assignment come from the capacity read (backend #2527).
 * When it reports `staffingStatus` UNAVAILABLE (or an older backend omits it)
 * the roster is counted on duty and unassigned, and the view says technician
 * availability is unknown rather than presenting that as measured; the day
 * board then falls back to the schedule view's overlay, which sees a technician
 * as busy only for an appointment booked directly on a mechanic resource.
 *
 * Eligibility is read, not inferred: a bay's `serviceCapabilityCodes` against the
 * service's `operationCode` (CAP-325 D14) and a technician's held credentials
 * against the service's `requiredSkills` (CAP-329) — the gap durion#473 named is
 * closed. Three gaps remain visible in the output rather than papered over. Each
 * is tracked as a backend story and each has a named degradation on screen:
 *
 *   louisburroughs/durion#474 — `viewSchedule` is one location and one date; its
 *     `range` selects LOCATION_HOURS or FULL_DAY, not a week. Closed for the
 *     month and week grids, which each read `getScheduleCapacity` once.
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
  searchJobTypes(query: string): Observable<{ options: JobRequirement[]; ok: boolean }> {
    const trimmed = query.trim();
    if (!trimmed) {
      return of({ options: [], ok: true });
    }
    return this.catalogApi.searchCatalogServices(trimmed, 20).pipe(
      map(services => ({ options: services.map(service => this.toJobRequirement(service)), ok: true })),
      // ADR-0064 §1: a catalog outage must not look like "no matches" — surface it via ok: false.
      catchError(() => of({ options: [] as JobRequirement[], ok: false })),
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
    if (request.scope !== 'day') {
      // Month and week are both one capacity read (#488): the month's grid is at
      // most six weeks, the week's is seven days, both inside the 42-day limit.
      const weeks =
        request.scope === 'month' ? this.monthGrid(request.focusDate) : [this.weekDates(request.focusDate)];
      return forkJoin({
        bays: this.loadBays(request.locationId),
        technicians: this.loadTechnicians(request.locationId),
        locationName: this.loadLocationName(request.locationId),
        capacity: this.loadCapacity(request.locationId, weeks.flat()),
      }).pipe(
        map(({ bays, technicians, locationName, capacity }) =>
          this.assembleCapacity(request, weeks, bays, technicians, locationName, capacity),
        ),
      );
    }

    const dates = [request.focusDate];

    // The day board reads both: the schedule view for the appointment cards, and
    // the capacity read for bay load. The view lists appointments only, so a bay
    // held by a work order with no appointment would read as free, and the day
    // would contradict the week grid that counts it.
    return forkJoin({
      bays: this.loadBays(request.locationId),
      technicians: this.loadTechnicians(request.locationId),
      locationName: this.loadLocationName(request.locationId),
      schedules: this.loadSchedules(request.locationId, dates),
      capacity: this.loadCapacity(request.locationId, dates),
    }).pipe(
      map(({ bays, technicians, locationName, schedules, capacity }) =>
        this.assemble(request, bays, technicians, locationName, schedules, capacity),
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
      // `date` (SDK 0.42) sits between skillCode and the paging arguments. This
      // caller wants the roster itself, not a dated shift window, so it is left
      // to the endpoint's own default — today in the location's timezone.
      .listLocationTechnicians(locationId, 'ACTIVE', undefined, undefined, 0, PAGE_SIZE)
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
   * The whole month grid in one read. The grid is at most six weeks, which is
   * exactly the 42-day span the endpoint allows.
   *
   * A failure degrades to an empty load rather than failing the page, like every
   * other upstream call here: the bays and roster are still worth showing.
   */
  private loadCapacity(locationId: string, dates: readonly string[]): Observable<CapacityLoad> {
    return this.scheduleApi.getScheduleCapacity(locationId, dates[0], dates[dates.length - 1]).pipe(
      map(response => ({
        byDate: new Map(response.days.map(day => [day.date, day] as const)),
        staffingKnown: response.staffingStatus === ScheduleCapacityResponseStaffingStatusEnum.Available,
        absent: false,
        failed: false,
      })),
      catchError((error: unknown) => {
        const absent = isScheduleAbsent(error);
        return of({
          byDate: new Map<string, DayCapacityView>(),
          staffingKnown: false,
          absent,
          failed: !absent,
        });
      }),
    );
  }

  /**
   * One `viewSchedule` per date (#474), concurrency-limited, each degrading to
   * `undefined` so one bad day does not blank the week.
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

  // ── Day assembly (per-day schedule view) ──────────────────────────────────

  private assemble(
    request: CapacityCalendarRequest,
    bays: { bays: CapacityBay[]; ok: boolean },
    technicians: { roster: LocationTechnicianRosterEntryResponse[]; ok: boolean },
    locationName: string | undefined,
    load: ScheduleLoad,
    capacity: CapacityLoad,
  ): CapacityCalendarView {
    const schedules = load.byDate;
    const hours = this.hourLabels([...schedules.values(), ...capacity.byDate.values()]);
    const today = isoDateLocal(new Date());
    const currentHour = new Date().getHours();

    const dayTechnicians = (date: string): CapacityTechnician[] => {
      const day = capacity.byDate.get(date);
      // Duty and assignment come from the capacity read when it knows the
      // roster, as on the week grid; otherwise from the schedule view's overlay.
      return capacity.staffingKnown && day?.status === DayCapacityViewStatusEnum.Ok
        ? this.capacityTechnicianHours(technicians.roster, day, true, hours)
        : this.technicianHours(technicians.roster, schedules.get(date), hours);
    };

    const buildDay = (date: string): CapacityDay => {
      const schedule = schedules.get(date);
      const day = capacity.byDate.get(date);
      const kind: DayKind = day ? capacityDayKind(day) : this.dayKind(schedule);
      return {
        ...computeDay({
          date,
          kind,
          isToday: date === today,
          hours,
          bays: bays.bays,
          technicians: dayTechnicians(date),
          job: request.job,
          grid: this.dayGrid(bays.bays, schedule, day, hours),
          currentHour,
          carryOver: carryOverInto(day),
        }),
        closureReason: day?.status === DayCapacityViewStatusEnum.Holiday ? day.closureReason : undefined,
      };
    };

    const focusDay = buildDay(request.focusDate);

    return {
      locationId: request.locationId,
      locationName,
      focusDate: request.focusDate,
      job: request.job,
      bays: bays.bays,
      technicians: dayTechnicians(request.focusDate),
      hours,
      weeks: [],
      weekDays: [],
      focusDay,
      board: this.boardFor(schedules.get(request.focusDate)),
      // A 404 day is absence, not breakage, so only a real fault degrades —
      // except when the 404s are partial. The endpoint 404s on a date with no
      // appointments at a location it holds no shop row for, so a shopless
      // location that has any bookings answers 200 for those dates and 404 for
      // the rest. That mixture cannot be told apart from a genuinely quiet day
      // downstream, so the blank cells would read as "open and empty" when the
      // truth is "unknown". Only all-404 is unambiguous absence.
      // A failed capacity read leaves the bay load to the appointments alone,
      // which understates it, so it degrades like any other failed read.
      degraded: !bays.ok || !technicians.ok || load.failed > 0 || isPartiallyAbsent(load) || capacity.failed,
      // Every day answered 404: the schedule service does not know this
      // location as a shop, so there is nothing to report for any date. Said
      // once and plainly, rather than as a month of empty cells.
      locationHasNoSchedule: load.total > 0 && load.absent === load.total,
      skillRequirementsUnknown: !request.job.skillRequirementsConfigured,
      // The day board's duty comes from the schedule view's own overlay, which
      // says "unknown" through its own status; the notice belongs to the grids.
      technicianAvailabilityUnknown: false,
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
  private hourLabels(
    days: Iterable<{ dayStartAt?: string; dayEndAt?: string } | undefined>,
  ): number[] {
    let start = Number.POSITIVE_INFINITY;
    let end = Number.NEGATIVE_INFINITY;
    for (const day of days) {
      if (!day?.dayStartAt || !day?.dayEndAt) {
        continue;
      }
      start = Math.min(start, new Date(day.dayStartAt).getHours());
      end = Math.max(end, Math.ceil(hourOfDay(new Date(day.dayEndAt))));
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return [];
    }
    return Array.from({ length: end - start }, (_, index) => start + index);
  }

  /**
   * How a day relates to the operating calendar, for the scopes built on the
   * per-day schedule view.
   *
   * The schedule view states no operating hours or holiday closures, so a day
   * the shop is genuinely shut is left as `open` with an empty grid rather than
   * shaded as `closed`, because shading it would assert a closure this read did
   * not confirm. Only a day with no schedule at all is drawn shut.
   */
  private dayKind(schedule: ScheduleViewResponse | undefined): DayKind {
    return schedule ? 'open' : 'closed';
  }

  // ── Month and week assembly (capacity read) ───────────────────────────────

  /**
   * Builds the month grid (`weeks` is the padded month) or the week grid
   * (`weeks` is the one week) from a single capacity read.
   */
  private assembleCapacity(
    request: CapacityCalendarRequest,
    weeks: readonly (readonly string[])[],
    bays: { bays: CapacityBay[]; ok: boolean },
    technicians: { roster: LocationTechnicianRosterEntryResponse[]; ok: boolean },
    locationName: string | undefined,
    load: CapacityLoad,
  ): CapacityCalendarView {
    const hours = this.hourLabels(load.byDate.values());
    const today = isoDateLocal(new Date());
    const currentHour = new Date().getHours();
    const focusMonth = parseIsoDateLocal(request.focusDate).getMonth();
    const isMonth = request.scope === 'month';
    const dayTechnicians = (date: string): CapacityTechnician[] =>
      this.capacityTechnicianHours(technicians.roster, load.byDate.get(date), load.staffingKnown, hours);

    const buildDay = (date: string): CapacityDay => {
      const day = load.byDate.get(date);
      // Padding days outside the focus month are only a month-grid notion.
      const inScope = !isMonth || parseIsoDateLocal(date).getMonth() === focusMonth;
      return {
        ...computeDay({
          date,
          kind: inScope ? capacityDayKind(day) : 'outside',
          isToday: date === today,
          hours,
          bays: bays.bays,
          technicians: dayTechnicians(date),
          job: request.job,
          grid: this.capacityGrid(bays.bays, day, hours),
          currentHour,
          carryOver: carryOverInto(day),
        }),
        closureReason: day?.status === DayCapacityViewStatusEnum.Holiday ? day.closureReason : undefined,
      };
    };

    // The endpoint promises a day per date and marks one it could not assemble
    // UNAVAILABLE. Either way the cell is an unknown, not a quiet day, so both
    // degrade rather than pass as "closed".
    const unknownDays = weeks
      .flat()
      .some(date => (load.byDate.get(date)?.status ?? DayCapacityViewStatusEnum.Unavailable) === DayCapacityViewStatusEnum.Unavailable);

    return {
      locationId: request.locationId,
      locationName,
      focusDate: request.focusDate,
      job: request.job,
      bays: bays.bays,
      technicians: dayTechnicians(request.focusDate),
      hours,
      weeks: isMonth ? weeks.map(week => week.map(buildDay)) : [],
      weekDays: isMonth ? [] : weeks[0].map(buildDay),
      focusDay: undefined,
      board: [],
      degraded: !bays.ok || !technicians.ok || load.failed || (!load.absent && unknownDays),
      locationHasNoSchedule: load.absent,
      skillRequirementsUnknown: !request.job.skillRequirementsConfigured,
      // Only an answered read can say rostering is unknown; a failed or 404 read
      // is already reported as degraded or as no schedule.
      technicianAvailabilityUnknown: !load.failed && !load.absent && !load.staffingKnown,
    };
  }

  /**
   * The roster's per-hour duty and assignment on one capacity-read day
   * (backend #2527), joined by `mechanicPersonId` so credentials come along.
   *
   * A rostered technician the day does not list has no staffing assignment
   * covering that date, so is off duty all day. When rostering is unknown
   * (`staffingKnown` false) the roster is counted on duty and unassigned, as
   * before #2527 — reporting everyone absent would understate capacity
   * everywhere — and the view flags it as unknown.
   */
  private capacityTechnicianHours(
    roster: readonly LocationTechnicianRosterEntryResponse[],
    day: DayCapacityView | undefined,
    staffingKnown: boolean,
    hours: readonly number[],
  ): CapacityTechnician[] {
    if (!staffingKnown || day?.status !== DayCapacityViewStatusEnum.Ok || !day.technicians) {
      return this.technicianHours(roster, undefined, hours);
    }
    const slotByHour = slotIndexByHour(day);
    const byPerson = new Map(day.technicians.map(entry => [entry.mechanicPersonId, entry] as const));
    return roster.map(entry => {
      const capacity = byPerson.get(entry.mechanicPersonId);
      const onDutyHours = new Set<number>();
      const assignedHours = new Set<number>();
      if (capacity) {
        hours.forEach((hour, index) => {
          const slot = slotByHour.get(hour);
          if (slot === undefined) {
            return;
          }
          if ((capacity.onDuty[slot] ?? 0) > 0) {
            onDutyHours.add(index);
          }
          if ((capacity.assigned[slot] ?? 0) > 0) {
            assignedHours.add(index);
          }
        });
      }
      return {
        personId: entry.mechanicPersonId,
        displayName: displayName(entry),
        skills: heldSkillCodes(entry.credentials),
        assignedHours,
        onDutyHours,
      };
    });
  }

  /**
   * `grid[bayIndex][hourIndex]` for one day of the capacity read.
   *
   * Each day carries its own operating window, so an hour the grid shows but
   * this day is not open for is `closed` — a short Saturday does not read as
   * free until the weekday closing time. A bay the capacity read does not list
   * is unknown to the schedule service; it is left `closed` rather than `free`,
   * because free would invent capacity nothing can be booked into.
   */
  private capacityGrid(
    bays: readonly CapacityBay[],
    day: DayCapacityView | undefined,
    hours: readonly number[],
  ): BayHourState[][] {
    if (day?.status !== DayCapacityViewStatusEnum.Ok) {
      return bays.map(() => hours.map(() => 'closed' as BayHourState));
    }
    const slotByHour = slotIndexByHour(day);
    return bays.map(bay => {
      const occupancy = day.bays.find(candidate => candidate.bayId === bay.bayId)?.occupancy;
      return hours.map((hour): BayHourState => {
        const slot = slotByHour.get(hour);
        if (slot === undefined) {
          return 'closed';
        }
        if (bay.outOfService) {
          return 'down';
        }
        if (!occupancy) {
          return 'closed';
        }
        return (occupancy[slot] ?? 0) > 0 ? 'busy' : 'free';
      });
    });
  }

  /**
   * `grid[bayIndex][hourIndex]` for the day board: the capacity read's bay load,
   * which counts work orders the schedule view does not list, with any
   * appointment the view shows on a free hour marked busy too. Without a
   * capacity day (the read failed or 404ed) the view's appointments are all
   * there is.
   */
  private dayGrid(
    bays: readonly CapacityBay[],
    schedule: ScheduleViewResponse | undefined,
    day: DayCapacityView | undefined,
    hours: readonly number[],
  ): BayHourState[][] {
    const fromView = this.bayGrid(bays, schedule, hours);
    if (!day) {
      return fromView;
    }
    return this.capacityGrid(bays, day, hours).map((row, bayIndex) =>
      row.map((state, hourIndex) =>
        state === 'free' && fromView[bayIndex][hourIndex] === 'busy' ? 'busy' : state,
      ),
    );
  }

  /**
   * `grid[bayIndex][hourIndex]` for one day of the schedule view.
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
      const personId = entry.mechanicPersonId;
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

/**
 * How a capacity day relates to the operating calendar. An UNAVAILABLE or
 * missing day has no confirmed hours, so it is drawn shut; the view's
 * `degraded` flag is what says the cell is an unknown.
 */
function capacityDayKind(day: DayCapacityView | undefined): DayKind {
  switch (day?.status) {
    case DayCapacityViewStatusEnum.Ok:
      return 'open';
    case DayCapacityViewStatusEnum.Holiday:
      return 'holiday';
    default:
      return 'closed';
  }
}

/**
 * Local hour of day → index into the day's `occupancy` arrays, which hold one
 * slot per hour of the day's own window starting at `dayStartAt`.
 */
function slotIndexByHour(day: DayCapacityView): Map<number, number> {
  const slots = new Map<number, number>();
  if (!day.dayStartAt || !day.dayEndAt) {
    return slots;
  }
  const start = new Date(day.dayStartAt).getTime();
  const count = Math.ceil((new Date(day.dayEndAt).getTime() - start) / MS_PER_HOUR);
  for (let index = 0; index < count; index += 1) {
    slots.set(new Date(start + index * MS_PER_HOUR).getHours(), index);
  }
  return slots;
}

/**
 * The bay-hours of a day already held by work that began on an earlier date.
 * The capacity read has netted them into occupancy already; this is the detail
 * behind the number, summed across bays.
 */
function carryOverInto(day: DayCapacityView | undefined): CarryOver | undefined {
  const entries = (day?.bays ?? []).flatMap(bay => bay.carryOverIn ?? []);
  if (entries.length === 0) {
    return undefined;
  }
  const hours = entries.reduce((total, entry) => total + entry.bayHours, 0);
  return {
    // bayHours arrive in tenths of an hour; rounding keeps float drift out of the sum.
    hours: Math.round(hours * 10) / 10,
    fromDate: entries.map(entry => entry.fromDate).sort()[0],
  };
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
