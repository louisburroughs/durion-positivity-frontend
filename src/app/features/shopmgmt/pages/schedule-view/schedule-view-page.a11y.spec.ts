import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import axe from 'axe-core';

import { ScheduleViewPageComponent } from './schedule-view-page.component';
import { CapacityCalendarService } from '../../services/capacity-calendar.service';
import { LocationService } from '../../../location/services/location.service';
import {
  BayHourState,
  CapacityCalendarView,
  JobRequirement,
  computeDay,
  isoDateLocal,
} from '../../models/capacity-calendar.models';

/**
 * Genuine axe coverage of the RENDERED capacity calendar.
 *
 * `scripts/a11y/smoke-routes.mjs` cannot provide this: it builds its JSDOM with
 * `runScripts: 'outside-only'`, so the Angular bundle never executes and axe
 * only ever sees the un-hydrated index shell. These specs render real DOM
 * through TestBed, so they exercise the three grids as a screen reader meets
 * them — which matters here because the page leans on colour to carry capacity
 * verdicts, and every one of those has to have a text equivalent (ADR-0039).
 */

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

const JOB: JobRequirement = {
  serviceId: 'svc-align',
  label: '4-wheel alignment',
  operationCode: 'WHEEL-ALIGNMENT-4-WHEEL',
  skillCodes: ['ALIGN'],
  skillRequirementsConfigured: true,
  durationHours: 1.5,
};

const TECHS = [
  {
    personId: 'bell',
    displayName: 'J. Bell',
    skills: ['ALIGN'],
    onDutyHours: new Set(HOURS.map((_, index) => index)),
    assignedHours: new Set<number>([0]),
  },
];

function buildDay(date: string, grid?: BayHourState[][]) {
  return computeDay({
    date,
    kind: 'open',
    isToday: date === TODAY,
    hours: HOURS,
    bays: BAYS,
    technicians: TECHS,
    job: JOB,
    grid: grid ?? BAYS.map(() => HOURS.map(() => 'free' as BayHourState)),
  });
}

const VIEW: CapacityCalendarView = {
  locationId: 'loc-1',
  locationName: 'Riverside Tire & Auto',
  focusDate: TODAY,
  job: JOB,
  bays: BAYS,
  technicians: TECHS,
  hours: HOURS,
  weeks: [
    [
      buildDay(TODAY),
      // A day with the rack taken, so the red verdict path renders too.
      buildDay('2026-09-16', [HOURS.map(() => 'free'), HOURS.map(() => 'busy')]),
    ],
  ],
  weekDays: [buildDay(TODAY), buildDay('2026-09-16')],
  focusDay: buildDay(TODAY),
  board: [
    {
      eventId: 'evt-1',
      bayId: 'rack',
      title: 'Alignment — Idris',
      startHour: 9,
      endHour: 10.5,
      state: 'inProgress',
      technicianName: 'J. Bell',
      hasConflict: true,
      conflictSeverity: 'SOFT',
    },
  ],
  degraded: true,
  locationHasNoSchedule: false,
  skillRequirementsUnknown: false,
};

const capacityStub = {
  getCalendar: vi.fn(),
  searchJobTypes: vi.fn(),
};

const locationServiceStub = {
  getAllLocations: vi.fn(),
  getLocationById: vi.fn(),
};

async function violations(root: HTMLElement): Promise<axe.Result[]> {
  const results = await axe.run(root, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
  });
  return results.violations;
}

describe('Capacity calendar a11y (rendered DOM)', () => {
  let fixture: ComponentFixture<ScheduleViewPageComponent>;

  beforeEach(async () => {
    vi.clearAllMocks();
    capacityStub.getCalendar.mockReturnValue(of(VIEW));
    capacityStub.searchJobTypes.mockReturnValue(of({ options: [JOB], ok: true }));
    locationServiceStub.getAllLocations.mockReturnValue(of([{ id: 'loc-1', name: 'Riverside' }]));
    locationServiceStub.getLocationById.mockReturnValue(of(null));

    await TestBed.configureTestingModule({
      imports: [ScheduleViewPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: CapacityCalendarService, useValue: capacityStub },
        { provide: LocationService, useValue: locationServiceStub },
        {
          provide: ActivatedRoute,
          useValue: { queryParams: of({ locationId: 'loc-1' }) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScheduleViewPageComponent);
    fixture.detectChanges();
  });

  it('month grid has no WCAG A/AA violations', async () => {
    expect(await violations(fixture.nativeElement)).toEqual([]);
  });

  it('week grid has no WCAG A/AA violations', async () => {
    fixture.componentInstance.setScope('week');
    fixture.detectChanges();
    expect(await violations(fixture.nativeElement)).toEqual([]);
  });

  it('day board has no WCAG A/AA violations', async () => {
    fixture.componentInstance.setScope('day');
    fixture.detectChanges();
    expect(await violations(fixture.nativeElement)).toEqual([]);
  });

  it('gives every month day a keyboard-reachable control with an accessible name', () => {
    const openers = fixture.nativeElement.querySelectorAll('.month-cell-body');
    expect(openers.length).toBeGreaterThan(0);
    openers.forEach((opener: HTMLElement) => {
      expect(opener.tagName).toBe('BUTTON');
      expect(opener.getAttribute('aria-label')).toBeTruthy();
    });
  });

  it('states each day verdict in text, not colour alone (ADR-0039)', () => {
    // The tick row and the cell tint are decorative reinforcement; the chip is
    // what a screen reader — or anyone who cannot separate the hues — reads.
    const chips = fixture.nativeElement.querySelectorAll('.verdict-chip');
    expect(chips.length).toBe(2);
    chips.forEach((chip: HTMLElement) => {
      expect(chip.textContent?.trim()).not.toBe('');
    });
  });

  it('announces the degradation notice politely', () => {
    // The fixture is degraded; eligibility itself is read from the specialty map, so
    // there is no longer an "approximate" notice beside it (CAP-325 D14).
    const outputs = fixture.nativeElement.querySelectorAll('output[aria-live="polite"]');
    expect(outputs.length).toBeGreaterThanOrEqual(1);
  });
});
