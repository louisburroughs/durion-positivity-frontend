/**
 * ScheduleViewPageComponent — Shop Capacity Calendar.
 *
 * Route: /app/shopmgmt/schedule
 * Selector: app-schedule-view-page
 *
 * Covers the three grids (month, week, day), the eligible-capacity framing the
 * page exists to carry, and the degradation notices that keep a gap in the
 * backend visible instead of silently wrong.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';

import { ScheduleViewPageComponent } from './schedule-view-page.component';
import { CapacityCalendarService } from '../../services/capacity-calendar.service';
import { LocationService } from '../../../location/services/location.service';
import {
  BayHourState,
  CapacityCalendarView,
  CapacityDay,
  JobRequirement,
  computeDay,
  isoDateLocal,
} from '../../models/capacity-calendar.models';

// ── Fixtures ────────────────────────────────────────────────────────────────

const HOURS = [7, 8, 9, 10, 11];
const TODAY = isoDateLocal(new Date());

const BAYS = [
  {
    bayId: 'gen-1',
    name: 'Bay 1',
    bayType: 'GENERAL_SERVICE',
    capabilityCodes: [],
    outOfService: false,
  },
  {
    bayId: 'rack',
    name: 'Bay 5',
    bayType: 'ALIGNMENT',
    capabilityCodes: ['WHEEL-ALIGNMENT-4-WHEEL'],
    outOfService: false,
  },
];

const ALIGNMENT_JOB: JobRequirement = {
  serviceId: 'svc-align',
  label: '4-wheel alignment',
  operationCode: 'WHEEL-ALIGNMENT-4-WHEEL',
  skillCodes: ['ALIGN'],
  durationHours: 1.5,
};

const ALL_WORK: JobRequirement = {
  label: '',
  skillCodes: [],
  durationHours: 1,
};

function technicians(options: { onDuty?: boolean; assigned?: boolean } = {}) {
  const { onDuty = true, assigned = false } = options;
  return [
    {
      personId: 'bell',
      displayName: 'J. Bell',
      skills: ['ALIGN'],
      onDutyHours: onDuty ? new Set(HOURS.map((_, index) => index)) : new Set<number>(),
      assignedHours: assigned ? new Set(HOURS.map((_, index) => index)) : new Set<number>(),
    },
  ];
}

function day(
  date: string,
  options: {
    job?: JobRequirement;
    grid?: BayHourState[][];
    onDuty?: boolean;
    assigned?: boolean;
  } = {},
): CapacityDay {
  return computeDay({
    date,
    kind: 'open',
    isToday: date === TODAY,
    hours: HOURS,
    bays: BAYS,
    technicians: technicians(options),
    job: options.job ?? ALIGNMENT_JOB,
    grid: options.grid ?? BAYS.map(() => HOURS.map(() => 'free' as BayHourState)),
  });
}

function view(overrides: Partial<CapacityCalendarView> = {}): CapacityCalendarView {
  const focus = day(TODAY);
  return {
    locationId: 'loc-1',
    locationName: 'Riverside Tire & Auto',
    focusDate: TODAY,
    job: ALIGNMENT_JOB,
    bays: BAYS,
    technicians: technicians(),
    hours: HOURS,
    weeks: [[focus, day('2026-09-16'), day('2026-09-17')]],
    weekDays: [focus, day('2026-09-16')],
    focusDay: focus,
    board: [
      {
        eventId: 'evt-1',
        bayId: 'rack',
        title: 'Alignment — Idris',
        startHour: 9,
        endHour: 10.5,
        state: 'inProgress',
        technicianName: 'J. Bell',
        hasConflict: false,
      },
    ],
    degraded: false,
    ...overrides,
  };
}

const capacityStub = {
  getCalendar: vi.fn(),
  searchJobTypes: vi.fn(),
};

const locationServiceStub = {
  getAllLocations: vi.fn(),
  getLocationById: vi.fn(),
};

// ── Suite ───────────────────────────────────────────────────────────────────

describe('ScheduleViewPageComponent', () => {
  let fixture: ComponentFixture<ScheduleViewPageComponent>;
  let component: ScheduleViewPageComponent;

  const setup = async (queryParams: Record<string, string> = { locationId: 'loc-1' }) => {
    await TestBed.configureTestingModule({
      imports: [ScheduleViewPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: CapacityCalendarService, useValue: capacityStub },
        { provide: LocationService, useValue: locationServiceStub },
        { provide: ActivatedRoute, useValue: { queryParams: of(queryParams) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScheduleViewPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  const text = () => fixture.nativeElement.textContent as string;
  const all = (selector: string) => fixture.debugElement.queryAll(By.css(selector));

  beforeEach(() => {
    vi.clearAllMocks();
    // The real service composes the view *for* the requested job, and the page
    // renders against the view's own job rather than the in-flight request, so
    // the stub has to honour the request for the filter tests to mean anything.
    capacityStub.getCalendar.mockImplementation((request: { job: JobRequirement }) =>
      of(view({ job: request.job })),
    );
    capacityStub.searchJobTypes.mockReturnValue(of([ALIGNMENT_JOB]));
    locationServiceStub.getAllLocations.mockReturnValue(of([{ id: 'loc-1', name: 'Riverside' }]));
    locationServiceStub.getLocationById.mockReturnValue(of(null));
  });

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('renders without crashing', async () => {
    await setup();
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('prompts for a location before loading anything', async () => {
    await setup({});
    expect(capacityStub.getCalendar).not.toHaveBeenCalled();
    expect(component.state()).toBe('idle');
  });

  it('reads locationId, date and scope from query params', async () => {
    await setup({ locationId: 'loc-9', date: '2026-06-01', scope: 'week' });
    expect(component.locationId()).toBe('loc-9');
    expect(component.focusDate()).toBe('2026-06-01');
    expect(component.scope()).toBe('week');
  });

  it('ignores a malformed date query param rather than showing an invalid grid', async () => {
    await setup({ locationId: 'loc-1', date: 'last-tuesday' });
    expect(component.focusDate()).toBe(TODAY);
  });

  // ── Month grid ────────────────────────────────────────────────────────────

  it('renders one cell per day of the month grid', async () => {
    await setup();
    expect(component.scope()).toBe('month');
    expect(all('.month-cell').length).toBe(3);
  });

  it('draws one fill track and one verdict tick per hour', async () => {
    await setup();
    const cell = all('.month-cell')[0];
    expect(cell.queryAll(By.css('.hour-track')).length).toBe(HOURS.length);
    expect(cell.queryAll(By.css('.tick')).length).toBe(HOURS.length);
  });

  it('fills the strip with shop-wide load, not with eligibility', async () => {
    // Bay 1 busy, the rack free: the ground is 50% load even though the job fits.
    const busyGeneral: BayHourState[][] = [
      HOURS.map(() => 'busy'),
      HOURS.map(() => 'free'),
    ];
    capacityStub.getCalendar.mockReturnValue(
      of(view({ weeks: [[day(TODAY, { grid: busyGeneral })]] })),
    );
    await setup();

    const fill = all('.hour-fill')[0].nativeElement as HTMLElement;
    expect(fill.style.height).toBe('50%');
  });

  it('marks a day amber when the rack is free but no technician is rostered', async () => {
    capacityStub.getCalendar.mockReturnValue(
      of(view({ weeks: [[day(TODAY, { onDuty: false })]] })),
    );
    await setup();

    expect(all('.month-cell.day-tech').length).toBe(1);
    expect(all('.month-cell.day-taken').length).toBe(0);
    expect(all('.verdict-chip.verdict-tech').length).toBe(1);
  });

  it('marks a day red when every eligible bay is taken', async () => {
    const rackBusy: BayHourState[][] = [
      HOURS.map(() => 'free'),
      HOURS.map(() => 'busy'),
    ];
    capacityStub.getCalendar.mockReturnValue(
      of(view({ weeks: [[day(TODAY, { grid: rackBusy })]] })),
    );
    await setup();

    expect(all('.month-cell.day-taken').length).toBe(1);
    expect(all('.month-cell.day-tech').length).toBe(0);
  });

  it('opens the day board when a month cell is activated', async () => {
    await setup();
    (all('.month-cell-body')[0].nativeElement as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(component.scope()).toBe('day');
    expect(component.focusDate()).toBe(TODAY);
  });

  // ── Week grid ─────────────────────────────────────────────────────────────

  it('renders an eligible ratio, bay blocks and technician dots per week cell', async () => {
    await setup();
    component.selectJob(ALIGNMENT_JOB);
    component.setScope('week');
    fixture.detectChanges();

    const cell = all('.week-cell')[0];
    expect(cell.query(By.css('.ratio'))).toBeTruthy();
    expect(cell.queryAll(By.css('.bay-block')).length).toBe(BAYS.length);
    expect(cell.queryAll(By.css('.tech-dot')).length).toBe(1);
  });

  it('draws the eligible bay large and the ineligible bay small', async () => {
    await setup();
    component.selectJob(ALIGNMENT_JOB);
    component.setScope('week');
    fixture.detectChanges();

    const blocks = all('.week-cell')[0].queryAll(By.css('.bay-block'));
    // Bay 1 cannot do an alignment; Bay 5 can.
    expect((blocks[0].nativeElement as HTMLElement).classList).not.toContain('is-eligible');
    expect((blocks[1].nativeElement as HTMLElement).classList).toContain('is-eligible');
  });

  it('shows the ratio as eligible over eligible, not the whole shop', async () => {
    await setup();
    component.selectJob(ALIGNMENT_JOB);
    component.setScope('week');
    fixture.detectChanges();

    // Two bays in the shop, one of them eligible and free.
    expect(all('.ratio')[0].nativeElement.textContent.trim()).toBe('1/1');
  });

  // ── Day board ─────────────────────────────────────────────────────────────

  it('renders one board column per bay and positions cards by time', async () => {
    await setup();
    component.setScope('day');
    fixture.detectChanges();

    expect(all('.board-column').length).toBe(BAYS.length);
    const card = all('.board-card')[0].nativeElement as HTMLElement;
    // 9 AM on a 7 AM board, at 64px per hour.
    expect(card.style.top).toBe('128px');
    expect(card.style.height).toBe('96px');
  });

  it('greys a bay that cannot do the selected job instead of hiding it', async () => {
    await setup();
    component.selectJob(ALIGNMENT_JOB);
    component.setScope('day');
    fixture.detectChanges();

    expect(all('.board-column.is-ineligible').length).toBe(1);
    expect(all('.board-column').length).toBe(2);
  });

  it('renders a technician lane row per technician', async () => {
    await setup();
    component.setScope('day');
    fixture.detectChanges();

    expect(all('.tech-row').length).toBe(1);
    expect(all('.tech-row')[0].queryAll(By.css('.tech-cell')).length).toBe(HOURS.length);
  });

  it('marks assigned hours in the technician lane', async () => {
    capacityStub.getCalendar.mockReturnValue(
      of(view({ technicians: technicians({ assigned: true }) })),
    );
    await setup();
    component.setScope('day');
    fixture.detectChanges();

    expect(all('.tech-cell.state-assigned').length).toBe(HOURS.length);
  });

  // ── Job-type filter ───────────────────────────────────────────────────────

  it('reloads with the selected job when a job type is picked', async () => {
    await setup();
    capacityStub.getCalendar.mockClear();
    component.selectJob(ALIGNMENT_JOB);

    expect(capacityStub.getCalendar).toHaveBeenCalledWith(
      expect.objectContaining({ job: ALIGNMENT_JOB }),
    );
  });

  it('returns to all work when the filter is cleared', async () => {
    await setup();
    component.selectJob(ALIGNMENT_JOB);
    capacityStub.getCalendar.mockClear();
    component.clearJob();

    expect(component.isFiltered()).toBe(false);
    expect(capacityStub.getCalendar).toHaveBeenCalledWith(
      expect.objectContaining({ job: expect.objectContaining({ label: '', skillCodes: [] }) }),
    );
    // All work names no operation, so every in-service bay is eligible again.
    const request = capacityStub.getCalendar.mock.calls[0][0] as { job: JobRequirement };
    expect(request.job.operationCode).toBeUndefined();
  });

  it('names the eligible bays and certified technicians the job needs', async () => {
    await setup();
    component.selectJob(ALIGNMENT_JOB);
    expect(component.eligibleBayNames()).toBe('Bay 5');
    expect(component.eligibleBayCount()).toBe(1);
    expect(component.totalBayCount()).toBe(2);
    expect(component.certifiedTechNames()).toBe('J. Bell');
  });

  it('counts every bay as eligible when no job type is selected', async () => {
    capacityStub.getCalendar.mockReturnValue(of(view({ job: ALL_WORK })));
    await setup();
    component.selectJob(ALL_WORK);
    fixture.detectChanges();

    expect(component.eligibleBayCount()).toBe(2);
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  it('steps a whole month in the month view and a single day in the day view', async () => {
    await setup({ locationId: 'loc-1', date: '2026-09-15', scope: 'month' });
    component.step(1);
    expect(component.focusDate()).toBe('2026-10-15');

    component.setScope('day');
    component.step(-1);
    expect(component.focusDate()).toBe('2026-10-14');
  });

  it('returns to today', async () => {
    await setup({ locationId: 'loc-1', date: '2020-01-01' });
    component.goToToday();
    expect(component.focusDate()).toBe(TODAY);
  });

  // ── Honest degradation ────────────────────────────────────────────────────

  it('warns when an upstream source was unavailable', async () => {
    capacityStub.getCalendar.mockReturnValue(of(view({ degraded: true })));
    await setup();
    expect(text()).toContain('SHOPMGMT.SCHEDULE_VIEW.DEGRADED');
  });

  it('surfaces a load failure with a retry', async () => {
    capacityStub.getCalendar.mockReturnValue(throwError(() => new Error('boom')));
    await setup();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('SHOPMGMT.SCHEDULE_VIEW.ERROR_LOAD');
    expect(all('[role="alert"]').length).toBeGreaterThan(0);
  });

  it('retries the load from the error state', async () => {
    capacityStub.getCalendar.mockReturnValue(throwError(() => new Error('boom')));
    await setup();

    capacityStub.getCalendar.mockReturnValue(of(view()));
    component.load();
    fixture.detectChanges();

    expect(component.state()).toBe('ready');
    expect(component.errorKey()).toBeNull();
  });
});
