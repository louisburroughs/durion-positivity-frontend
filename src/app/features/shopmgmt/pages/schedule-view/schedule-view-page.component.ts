import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { LocationPickerComponent } from '../../../location/components/location-picker/location-picker.component';
import {
  BoardAppointment,
  CapacityCalendarView,
  CapacityDay,
  CapacityHour,
  isCertifiedTechnician,
  isEligibleBay,
  isoDateLocal,
  JobRequirement,
  LimitReason,
  parseIsoDateLocal,
  rankEligibleBays,
  shopUtilization,
} from '../../models/capacity-calendar.models';
import {
  CapacityCalendarService,
  CapacityScope,
} from '../../services/capacity-calendar.service';

/** Page lifecycle, explicit and typed (AGENTS.md "Critical Rules"). */
type PageState = 'idle' | 'loading' | 'ready' | 'error';

/** Height of one hour row on the day board, in pixels. Mirrored in the CSS. */
const HOUR_PITCH_PX = 64;

/**
 * Why an hour offers nothing, as a single token the tick row and the legend
 * both key off. `fits` is the only positive outcome.
 */
export type HourVerdict =
  /** The job's whole duration fits unbroken starting here. */
  | 'fits'
  /** An eligible bay and technician are free, but not for long enough. */
  | 'short'
  /** An eligible bay is free; no certified technician is. */
  | 'tech'
  /** Every eligible bay is taken. */
  | 'taken'
  /** The shop is not open this hour. */
  | 'shut';

/** One hour of the month cell's fill strip and tick row. */
export interface MonthHourCell {
  readonly hourDate: Date;
  /** Shop-wide load as a percentage, the quiet grey ground behind the ticks. */
  readonly loadPercent: number;
  readonly verdict: HourVerdict;
}

/** One day cell of the month grid. */
export interface MonthDayCell {
  readonly day: CapacityDay;
  readonly date: Date;
  readonly hours: readonly MonthHourCell[];
  /** `fits` when the job has a slot, otherwise why not. */
  readonly verdict: Exclude<HourVerdict, 'short'>;
  readonly firstFit?: Date;
}

/** One cell of the week grid: an hour of one day. */
export interface WeekHourCell {
  readonly day: CapacityDay;
  readonly hour?: CapacityHour;
  readonly verdict: HourVerdict;
  /** Per-bay squares, in fixed bay order so a column reads as one bay. */
  readonly bays: readonly { readonly name: string; readonly state: string; readonly eligible: boolean }[];
  /** Per-technician dots; certified ones are drawn larger. */
  readonly techs: readonly { readonly name: string; readonly state: string; readonly certified: boolean }[];
}

/** One hour row of the week grid. */
export interface WeekRow {
  readonly hourDate: Date;
  readonly cells: readonly WeekHourCell[];
}

/** One card on the day board, already positioned. */
export interface BoardCard {
  readonly appointment: BoardAppointment;
  readonly topPx: number;
  readonly heightPx: number;
  /** Present only when the backend distinguishes planned from actual (gap 4). */
  readonly plannedTopPx?: number;
}

/** One bay column of the day board. */
export interface BoardColumn {
  readonly bayId: string;
  readonly name: string;
  readonly bayType: string;
  readonly eligible: boolean;
  readonly outOfService: boolean;
  readonly cards: readonly BoardCard[];
}

/** One technician row in the lane beneath the board. */
export interface TechLaneRow {
  readonly name: string;
  readonly skills: string;
  readonly certified: boolean;
  readonly cells: readonly { readonly state: string; readonly hourDate: Date }[];
  readonly assignedHours: number;
}

/**
 * Shop Capacity Calendar — month, week and day views of *eligible* capacity.
 *
 * The three grids answer one question at three zoom levels: when can this job
 * be done? Capacity is bay-hours filtered by what the job actually needs — an
 * eligible bay, a certified technician, and the duration free unbroken — never
 * an appointment count and never raw bay availability.
 *
 * Composition, the endpoint gaps it works around, and what each gap costs on
 * screen are documented on {@link CapacityCalendarService}.
 */
@Component({
  selector: 'app-schedule-view-page',
  standalone: true,
  imports: [DatePipe, TranslatePipe, LocationPickerComponent],
  templateUrl: './schedule-view-page.component.html',
  styleUrl: './schedule-view-page.component.css',
})
export class ScheduleViewPageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly capacity = inject(CapacityCalendarService);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly locationId = signal('');
  readonly focusDate = signal(isoDateLocal(new Date()));
  readonly scope = signal<CapacityScope>('month');
  readonly view = signal<CapacityCalendarView | null>(null);

  /** Job-type filter. An empty label means "all work" — every bay eligible. */
  readonly job = signal<JobRequirement>(CapacityCalendarService.allWorkJob(''));
  readonly jobQuery = signal('');
  readonly jobOptions = signal<readonly JobRequirement[]>([]);
  readonly jobPickerOpen = signal(false);

  readonly hourPitchPx = HOUR_PITCH_PX;

  /** Sunday-first weekday headers, rendered through the locale's own names. */
  readonly weekdayHeaders = computed(() => {
    const sunday = new Date(2024, 0, 7);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(sunday);
      date.setDate(sunday.getDate() + index);
      return date;
    });
  });

  readonly focusDateAsDate = computed(() => parseIsoDateLocal(this.focusDate()));

  /**
   * The job the rendered data was actually fetched for.
   *
   * `job()` is the *request*; while a reload is in flight it has already moved
   * on. Rendering against it would recolour the grid for a job the figures on
   * screen were never computed for, so every view model reads this instead.
   */
  readonly activeJob = computed(() => this.view()?.job ?? this.job());

  readonly isFiltered = computed(() => this.activeJob().label.length > 0);

  /**
   * Whether there is a calendar to draw at all.
   *
   * A location the schedule service does not know as a shop gets one sentence
   * saying so instead of the grids: an empty month under a full legend reads as
   * "this shop has no capacity", which is a far stronger — and wrong — claim.
   */
  readonly showCalendar = computed(
    () => this.state() === 'ready' && !this.view()?.locationHasNoSchedule,
  );

  /**
   * Bays that can perform the selected job — the "eligible" in eligible capacity —
   * in offer order (D14): general bays first, specialty bays taking general work
   * last, so the rack is named only once the general bays are.
   */
  readonly eligibleBays = computed(() => {
    const bays = this.view()?.bays ?? [];
    return rankEligibleBays(bays.filter(bay => isEligibleBay(bay, this.activeJob(), bays)));
  });

  /** Eligible bay names, for the "resources required" line. */
  readonly eligibleBayNames = computed(() =>
    this.eligibleBays()
      .map(bay => bay.name)
      .join(', '),
  );

  readonly eligibleBayCount = computed(() => this.eligibleBays().length);

  readonly totalBayCount = computed(() => (this.view()?.bays ?? []).length);

  readonly certifiedTechNames = computed(() =>
    (this.view()?.technicians ?? [])
      .filter(tech => isCertifiedTechnician(tech, this.activeJob()))
      .map(tech => tech.displayName)
      .join(', '),
  );

  // ── Month grid ────────────────────────────────────────────────────────────

  readonly monthWeeks = computed<readonly (readonly MonthDayCell[])[]>(() =>
    (this.view()?.weeks ?? []).map(week => week.map(day => this.toMonthCell(day))),
  );

  // ── Week grid ─────────────────────────────────────────────────────────────

  readonly weekDays = computed(() => this.view()?.weekDays ?? []);

  readonly weekRows = computed<readonly WeekRow[]>(() => {
    const current = this.view();
    if (!current) {
      return [];
    }
    return current.hours.map((hour, hourIndex) => ({
      hourDate: this.hourDate(hour),
      cells: current.weekDays.map(day => this.toWeekCell(day, hourIndex)),
    }));
  });

  // ── Day board ─────────────────────────────────────────────────────────────

  readonly boardColumns = computed<readonly BoardColumn[]>(() => {
    const current = this.view();
    if (!current) {
      return [];
    }
    const first = current.hours[0] ?? 0;
    return current.bays.map(bay => ({
      bayId: bay.bayId,
      name: bay.name,
      bayType: bay.bayType,
      eligible: isEligibleBay(bay, this.activeJob(), this.view()?.bays ?? []),
      outOfService: bay.outOfService,
      cards: current.board
        .filter(appointment => appointment.bayId === bay.bayId)
        .map(appointment => ({
          appointment,
          topPx: (appointment.startHour - first) * HOUR_PITCH_PX,
          heightPx: Math.max(
            HOUR_PITCH_PX / 2,
            (appointment.endHour - appointment.startHour) * HOUR_PITCH_PX,
          ),
          plannedTopPx:
            appointment.plannedEndHour === undefined
              ? undefined
              : (appointment.plannedEndHour - appointment.startHour) * HOUR_PITCH_PX,
        })),
    }));
  });

  readonly boardHours = computed(() => (this.view()?.hours ?? []).map(hour => this.hourDate(hour)));

  /** Gutter plus one track per bay; the bay count is a property of the shop. */
  readonly boardTemplate = computed(
    // i18n-ignore-next-line: grid-template-columns value, not UI copy
    () => `78px repeat(${this.boardColumns().length}, minmax(0, 1fr))`,
  );

  /** Offset of the now-line, or undefined when the focus day is not today. */
  readonly nowOffsetPx = computed(() => {
    const current = this.view();
    const day = current?.focusDay;
    if (!current || !day?.isToday || current.hours.length === 0) {
      return undefined;
    }
    const now = new Date();
    const nowHour = now.getHours() + now.getMinutes() / 60;
    const first = current.hours[0];
    const last = current.hours[current.hours.length - 1] + 1;
    if (nowHour < first || nowHour > last) {
      return undefined;
    }
    return (nowHour - first) * HOUR_PITCH_PX;
  });

  readonly nowLabel = computed(() => (this.nowOffsetPx() === undefined ? null : new Date()));

  readonly techLane = computed<readonly TechLaneRow[]>(() => {
    const current = this.view();
    if (!current) {
      return [];
    }
    return current.technicians.map(tech => ({
      name: tech.displayName,
      skills: tech.skills.join(' · '),
      certified: isCertifiedTechnician(tech, this.activeJob()),
      cells: current.hours.map((hour, index) => ({
        hourDate: this.hourDate(hour),
        state: !tech.onDutyHours.has(index)
          ? 'off'
          : tech.assignedHours.has(index)
            ? 'assigned'
            : 'free',
      })),
      assignedHours: tech.assignedHours.size,
    }));
  });

  /** The focus day, for the day view's summary tiles. */
  readonly focusDay = computed(() => this.view()?.focusDay);

  readonly focusUtilization = computed(() => {
    const day = this.focusDay();
    return day ? Math.round(shopUtilization(day) * 100) : 0;
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const locationId = params['locationId'];
      const date = params['date'];
      const scope = params['scope'];
      if (typeof locationId === 'string' && locationId) {
        this.locationId.set(locationId);
      }
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        this.focusDate.set(date);
      }
      if (scope === 'month' || scope === 'week' || scope === 'day') {
        this.scope.set(scope);
      }
      if (this.locationId()) {
        this.load();
      }
    });
  }

  // ── Intent ────────────────────────────────────────────────────────────────

  onLocationPicked(id: string): void {
    this.locationId.set(id);
    this.syncQueryParams();
    this.load();
  }

  setScope(scope: CapacityScope): void {
    if (this.scope() === scope) {
      return;
    }
    this.scope.set(scope);
    this.syncQueryParams();
    this.load();
  }

  /** Steps one month, week or day, matching the grid currently shown. */
  step(direction: -1 | 1): void {
    const date = parseIsoDateLocal(this.focusDate());
    if (this.scope() === 'month') {
      date.setMonth(date.getMonth() + direction);
    } else if (this.scope() === 'week') {
      date.setDate(date.getDate() + 7 * direction);
    } else {
      date.setDate(date.getDate() + direction);
    }
    this.focusDate.set(isoDateLocal(date));
    this.syncQueryParams();
    this.load();
  }

  goToToday(): void {
    this.focusDate.set(isoDateLocal(new Date()));
    this.syncQueryParams();
    this.load();
  }

  /** Opens a day from the month or week grid on the day board. */
  openDay(date: string): void {
    this.focusDate.set(date);
    this.scope.set('day');
    this.syncQueryParams();
    this.load();
  }

  toggleJobPicker(): void {
    this.jobPickerOpen.update(open => !open);
  }

  onJobQuery(value: string): void {
    this.jobQuery.set(value);
    this.capacity
      .searchJobTypes(value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(options => this.jobOptions.set(options));
  }

  selectJob(job: JobRequirement): void {
    this.job.set(job);
    this.jobPickerOpen.set(false);
    this.load();
  }

  clearJob(): void {
    this.job.set(CapacityCalendarService.allWorkJob(''));
    this.jobQuery.set('');
    this.jobOptions.set([]);
    this.load();
  }

  load(): void {
    const locationId = this.locationId();
    if (!locationId) {
      this.state.set('idle');
      return;
    }
    this.state.set('loading');
    this.errorKey.set(null);
    this.capacity
      .getCalendar({
        locationId,
        focusDate: this.focusDate(),
        scope: this.scope(),
        job: this.job(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: view => {
          this.view.set(view);
          this.state.set('ready');
        },
        error: () => {
          this.view.set(null);
          this.errorKey.set('SHOPMGMT.SCHEDULE_VIEW.ERROR_LOAD');
          this.state.set('error');
        },
      });
  }

  // ── Presentation helpers ──────────────────────────────────────────────────

  /** Stable track key for a day cell. */
  trackDay(_index: number, cell: MonthDayCell): string {
    return cell.day.date;
  }

  private syncQueryParams(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        locationId: this.locationId() || null,
        date: this.focusDate(),
        scope: this.scope(),
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** A `Date` on the focus day at `hour`, so the template can format it. */
  private hourDate(hour: number): Date {
    const date = parseIsoDateLocal(this.focusDate());
    date.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
    return date;
  }

  private toMonthCell(day: CapacityDay): MonthDayCell {
    const hours: MonthHourCell[] = day.hours.map(hour => ({
      hourDate: this.hourDateOn(day.date, hour.hour),
      loadPercent:
        hour.shopCapacity === 0
          ? 0
          : Math.round(((hour.shopCapacity - hour.shopFree) / hour.shopCapacity) * 100),
      verdict: this.hourVerdict(hour),
    }));

    let verdict: Exclude<HourVerdict, 'short'>;
    if (day.kind === 'closed' || day.kind === 'holiday' || day.kind === 'outside') {
      verdict = 'shut';
    } else if (day.firstFitHour !== undefined) {
      verdict = 'fits';
    } else if (day.techBlock) {
      verdict = 'tech';
    } else {
      verdict = 'taken';
    }

    return {
      day,
      date: parseIsoDateLocal(day.date),
      hours,
      verdict,
      firstFit:
        day.firstFitHour === undefined
          ? undefined
          : this.hourDateOn(day.date, day.firstFitHour),
    };
  }

  private toWeekCell(day: CapacityDay, hourIndex: number): WeekHourCell {
    const bays = this.view()?.bays ?? [];
    const hour = day.hours[hourIndex];
    const job = this.activeJob();
    return {
      day,
      hour,
      verdict: hour ? this.hourVerdict(hour) : 'shut',
      bays: bays.map((bay, bayIndex) => ({
        name: bay.name,
        eligible: isEligibleBay(bay, job, bays),
        state: day.bayStates[bayIndex]?.[hourIndex] ?? 'closed',
      })),
      techs: (this.view()?.technicians ?? []).map(tech => ({
        name: tech.displayName,
        certified: isCertifiedTechnician(tech, job),
        state: !tech.onDutyHours.has(hourIndex)
          ? 'off'
          : tech.assignedHours.has(hourIndex)
            ? 'assigned'
            : 'free',
      })),
    };
  }

  private hourVerdict(hour: CapacityHour): HourVerdict {
    if (hour.bayCapacity === 0) {
      return 'shut';
    }
    if (hour.fits) {
      return 'fits';
    }
    if (hour.eligible > 0) {
      return 'short';
    }
    return hour.bayFree > 0 && hour.techFree === 0 ? 'tech' : 'taken';
  }

  private hourDateOn(isoDate: string, hour: number): Date {
    const date = parseIsoDateLocal(isoDate);
    date.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
    return date;
  }

  /** i18n key for why a day is limited, or null when it is not. */
  limitKey(day: CapacityDay): string | null {
    if (day.hours.length === 0) {
      return null;
    }
    if (day.techOffHours > 0) {
      return 'SHOPMGMT.SCHEDULE_VIEW.LIMIT_TECH_OFF';
    }
    if (day.techAssignedHours > 0) {
      return 'SHOPMGMT.SCHEDULE_VIEW.LIMIT_TECH_ASSIGNED';
    }
    return 'SHOPMGMT.SCHEDULE_VIEW.LIMIT_BAY';
  }

  /** Hours quoted alongside {@link limitKey}. */
  limitHours(day: CapacityDay): number {
    return day.techOffHours > 0 ? day.techOffHours : day.techAssignedHours;
  }

  /** Exposed for the template's `@switch` on the binding constraint. */
  limitOf(hour: CapacityHour): LimitReason {
    return hour.limit;
  }
}
