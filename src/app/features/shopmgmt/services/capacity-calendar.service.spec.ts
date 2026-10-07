import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { BayAPIService, LocationAPIService } from '@durion-sdk/location';
import { ProductsAPIService } from '@durion-sdk/catalog';
import type { ServiceDto } from '@durion-sdk/catalog';
import {
  DayCapacityViewStatusEnum,
  LocationTechnicianRosterEntryResponseShiftSourceEnum,
  LocationTechnicianRosterEntryResponseShiftStatusEnum,
  ScheduleAPIService,
  ScheduleCapacityResponseStaffingStatusEnum,
  TechnicianAPIService,
  TechnicianCredentialResponseStatusEnum,
} from '@durion-sdk/shop-manager';
import type {
  BayCapacityView,
  DayCapacityView,
  LocationTechnicianRosterEntryResponse,
  ScheduleViewResponse,
  TechnicianCapacityView,
  TechnicianCredentialResponse,
} from '@durion-sdk/shop-manager';
import { CapacityCalendarService, heldSkillCodes } from './capacity-calendar.service';
import type { CapacityCalendarView, CapacityDay, JobRequirement } from '../models/capacity-calendar.models';

/**
 * The transport mappings the capacity engine depends on (CAP-325, CAP-329): what a catalog
 * service becomes as a job, and which credentials count as competence today. Wrong here and
 * every technician silently reads as certified, so the contract edges are pinned at the service.
 */
describe('CapacityCalendarService', () => {
  let service: CapacityCalendarService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: BayAPIService, useValue: { listBays: vi.fn() } },
        { provide: LocationAPIService, useValue: { getLocationById: vi.fn() } },
        { provide: ScheduleAPIService, useValue: { viewSchedule: vi.fn(), getScheduleCapacity: vi.fn() } },
        { provide: TechnicianAPIService, useValue: { listLocationTechnicians: vi.fn() } },
        { provide: ProductsAPIService, useValue: { searchCatalogServices: vi.fn() } },
      ],
    });
    service = TestBed.inject(CapacityCalendarService);
  });

  const catalogService = (overrides: Partial<ServiceDto> = {}): ServiceDto =>
    ({ id: 'svc-1', name: 'Front brake pads', operationCode: 'BRAKE-PAD-REPLACE-FRONT', ...overrides }) as ServiceDto;

  describe('toJobRequirement', () => {
    it('reads the operation code and the labor default (tenths of an hour)', () => {
      const job = service.toJobRequirement(catalogService({ defaultLaborHours: 15 }));
      expect(job.serviceId).toBe('svc-1');
      expect(job.operationCode).toBe('BRAKE-PAD-REPLACE-FRONT');
      expect(job.durationHours).toBe(1.5);
      expect(service.toJobRequirement(catalogService({ defaultLaborHours: undefined })).durationHours).toBe(1);
    });

    it('a service never configured (requiredSkills null, no configured-at) requires nothing and says so', () => {
      const job = service.toJobRequirement(catalogService({ requiredSkills: undefined, requirementsConfiguredAt: undefined }));
      expect(job.skillCodes).toEqual([]);
      expect(job.skillRequirementsConfigured).toBe(false);
    });

    it('a declared empty list with a configured-at is unconstrained, not unconfigured (spec D4)', () => {
      const job = service.toJobRequirement(
        catalogService({ requiredSkills: [], requirementsConfiguredAt: '2026-09-16T12:00:00Z' }),
      );
      expect(job.skillCodes).toEqual([]);
      expect(job.skillRequirementsConfigured).toBe(true);
    });

    it('without a vehicle only ANY-class requirements apply; a class-ranged one is not a requirement here (D13)', () => {
      const job = service.toJobRequirement(
        catalogService({
          requirementsConfiguredAt: '2026-09-16T12:00:00Z',
          requiredSkills: [
            { skillCode: 'BRAKES-LIGHT', minGvwrClass: 1, maxGvwrClass: 3 },
            { skillCode: 'BRAKES-MEDIUM_HEAVY', minGvwrClass: 4, maxGvwrClass: 8 },
            { skillCode: 'DOT-INSPECTOR' },
            { skillCode: '' },
          ],
        }),
      );
      expect(job.skillCodes).toEqual(['DOT-INSPECTOR']);
      expect(job.skillRequirementsConfigured).toBe(true);
    });
  });

  describe('searchJobTypes', () => {
    const catalogApi = () =>
      TestBed.inject(ProductsAPIService) as unknown as { searchCatalogServices: ReturnType<typeof vi.fn> };

    it('answers { options: [], ok: true } without calling the catalog for a blank query', () => {
      let result: { options: unknown[]; ok: boolean } | undefined;
      service.searchJobTypes('   ').subscribe(r => (result = r));

      expect(result).toEqual({ options: [], ok: true });
      expect(catalogApi().searchCatalogServices).not.toHaveBeenCalled();
    });

    it('maps catalog services to job requirements and answers ok: true', () => {
      catalogApi().searchCatalogServices.mockReturnValue(of([catalogService()]));
      let result: { options: JobRequirement[]; ok: boolean } | undefined;

      service.searchJobTypes('brake').subscribe(r => (result = r));

      expect(catalogApi().searchCatalogServices).toHaveBeenCalledWith('brake', 20);
      expect(result?.ok).toBe(true);
      expect(result?.options).toHaveLength(1);
      expect(result?.options[0].serviceId).toBe('svc-1');
    });

    // #343 (ADR-0064 §1): a catalog outage must not look like "no matches" —
    // it now surfaces as ok: false, never a bare empty array (was `of([])`).
    it('answers { options: [], ok: false } instead of silently swallowing a catalog failure', () => {
      catalogApi().searchCatalogServices.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500 })),
      );
      let result: { options: unknown[]; ok: boolean } | undefined;

      service.searchJobTypes('brake').subscribe(r => (result = r));

      expect(result).toEqual({ options: [], ok: false });
    });
  });

  describe('heldSkillCodes', () => {
    const credential = (overrides: Partial<TechnicianCredentialResponse>): TechnicianCredentialResponse =>
      ({ skillCode: 'BRAKES-LIGHT', status: TechnicianCredentialResponseStatusEnum.Active, ...overrides }) as TechnicianCredentialResponse;

    it('counts only ACTIVE credentials as competence today (CAP-328)', () => {
      const held = heldSkillCodes([
        credential({ skillCode: 'BRAKES-LIGHT' }),
        credential({ skillCode: 'ALIGN', status: TechnicianCredentialResponseStatusEnum.Expired }),
        credential({ skillCode: 'DOT-INSPECTOR', status: TechnicianCredentialResponseStatusEnum.Revoked }),
        credential({ skillCode: undefined }),
      ]);
      expect(held).toEqual(['BRAKES-LIGHT']);
    });

    it('is empty for a technician with no credentials at all', () => {
      expect(heldSkillCodes(undefined)).toEqual([]);
      expect(heldSkillCodes([])).toEqual([]);
    });
  });

  /**
   * `viewSchedule` answers only for a location the schedule service knows **as a
   * shop**, and says so with a 404. That is absence, not breakage: a site that
   * is not a shop has no schedule, and reporting it as a load failure sends
   * someone hunting an outage that does not exist.
   */
  /**
   * The roster row carries two ids since SDK 0.80: `mechanicRecordId` (the
   * shop-manager record) and `mechanicPersonId`. The schedule's MECHANIC lanes are
   * keyed by the person id, so joining on the record id finds no lane — every
   * shift, PTO and appointment is lost and the technician reads as free all day,
   * overstating capacity. Distinct ids below make the wrong join observable.
   */
  describe('technician lanes join on the person id', () => {
    const REQUEST = {
      locationId: 'loc-1',
      focusDate: '2026-09-29',
      scope: 'day' as const,
      job: { label: '', operationCode: '', skillCodes: [], skillRequirementsConfigured: true, durationHours: 1 },
    };
    // Local wall-clock instants: the service buckets events by local hour.
    const at = (hour: number) => new Date(2026, 8, 29, hour).toISOString();
    const rosterEntry: LocationTechnicianRosterEntryResponse = {
      mechanicRecordId: 'record-1',
      mechanicPersonId: 'person-1',
      firstName: 'Jo',
      lastName: 'Bell',
      credentials: [],
      shiftSource: LocationTechnicianRosterEntryResponseShiftSourceEnum.LocationHours,
      shiftStatus: LocationTechnicianRosterEntryResponseShiftStatusEnum.Derived,
    };

    const scheduleWithLane = (laneId: string): ScheduleViewResponse => ({
      date: '2026-09-29',
      dayStartAt: at(8),
      dayEndAt: at(12),
      locationId: 'loc-1',
      availabilityOverlayStatus: 'AVAILABLE',
      viewGeneratedAt: at(8),
      resources: [
        {
          resourceType: 'MECHANIC',
          resourceId: laneId,
          events: [
            { eventId: 'shift-1', eventType: 'SHIFT', startTime: at(8), endTime: at(11), affected: false, hasConflict: false },
            { eventId: 'appt-1', eventType: 'APPOINTMENT', startTime: at(9), endTime: at(10), affected: false, hasConflict: false },
          ],
        },
      ],
    });

    const calendarFor = async (laneId: string) => {
      const schedule = TestBed.inject(ScheduleAPIService) as unknown as {
        viewSchedule: ReturnType<typeof vi.fn>;
        getScheduleCapacity: ReturnType<typeof vi.fn>;
      };
      const bays = TestBed.inject(BayAPIService) as unknown as { listBays: ReturnType<typeof vi.fn> };
      const techs = TestBed.inject(TechnicianAPIService) as unknown as { listLocationTechnicians: ReturnType<typeof vi.fn> };
      const locations = TestBed.inject(LocationAPIService) as unknown as { getLocationById: ReturnType<typeof vi.fn> };
      bays.listBays.mockReturnValue(of({ content: [] }));
      techs.listLocationTechnicians.mockReturnValue(of({ content: [rosterEntry] }));
      // No capacity day, so duty and assignment fall back to the view's overlay, which is what this pins.
      schedule.getScheduleCapacity.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
      locations.getLocationById.mockReturnValue(of({ id: 'loc-1', name: 'Northgate' }));
      schedule.viewSchedule.mockReturnValue(of(scheduleWithLane(laneId)));
      return new Promise<CapacityCalendarView>(resolve => service.getCalendar(REQUEST).subscribe(resolve));
    };

    it('reads shift and appointment hours from the lane keyed by mechanicPersonId', async () => {
      const view = await calendarFor('person-1');

      expect(view.technicians).toHaveLength(1);
      const [tech] = view.technicians;
      expect(tech.personId).toBe('person-1');
      // Window 08:00-12:00 is hour indexes 0..3; the shift covers 08-11, the appointment 09-10.
      expect([...tech.onDutyHours].sort()).toEqual([0, 1, 2]);
      expect([...tech.assignedHours]).toEqual([1]);
    });

    it('finds no lane keyed by the record id, which is exactly what the person-id join prevents', async () => {
      const view = await calendarFor('record-1');

      const [tech] = view.technicians;
      // No lane matched: no shift data means on duty all window, and the appointment is lost.
      expect([...tech.onDutyHours].sort()).toEqual([0, 1, 2, 3]);
      expect([...tech.assignedHours]).toEqual([]);
    });
  });

  describe('schedule 404s', () => {
    const REQUEST = {
      locationId: 'loc-1',
      focusDate: '2026-09-29',
      scope: 'day' as const,
      job: { label: '', operationCode: '', skillCodes: [], skillRequirementsConfigured: true, durationHours: 1 },
    };

    const arrange = (scheduleResult: unknown) => {
      const schedule = TestBed.inject(ScheduleAPIService) as unknown as {
        viewSchedule: ReturnType<typeof vi.fn>;
        getScheduleCapacity: ReturnType<typeof vi.fn>;
      };
      const bays = TestBed.inject(BayAPIService) as unknown as { listBays: ReturnType<typeof vi.fn> };
      const techs = TestBed.inject(TechnicianAPIService) as unknown as { listLocationTechnicians: ReturnType<typeof vi.fn> };
      const locations = TestBed.inject(LocationAPIService) as unknown as { getLocationById: ReturnType<typeof vi.fn> };
      bays.listBays.mockReturnValue(of({ content: [] }));
      techs.listLocationTechnicians.mockReturnValue(of({ content: [] }));
      // The capacity read answers the same 404 as the view for a location it has no shop for.
      schedule.getScheduleCapacity.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
      locations.getLocationById.mockReturnValue(of({ id: 'loc-1', name: 'Northgate Warehouse' }));
      schedule.viewSchedule.mockReturnValue(scheduleResult);
      return schedule;
    };

    // SDK 0.42 inserted `date` between `skillCode` and the paging arguments.
    // Nothing here asserted the positions, so a later positional edit could
    // compile while sending the page number as the date — the roster would come
    // back for the wrong day and every test would still pass.
    it('passes the roster arguments in the positions the SDK expects', async () => {
      const schedule = arrange(of({ days: [] }));
      void schedule;
      const techs = TestBed.inject(TechnicianAPIService) as unknown as {
        listLocationTechnicians: ReturnType<typeof vi.fn>;
      };

      await new Promise(resolve => service.getCalendar(REQUEST).subscribe(resolve));

      // `date` is left undefined on purpose: this caller wants the roster, not
      // a dated shift window, so the endpoint's own default applies.
      expect(techs.listLocationTechnicians).toHaveBeenCalledWith(
        REQUEST.locationId,
        'ACTIVE',
        undefined,
        undefined,
        0,
        expect.any(Number),
      );
    });

    it('a location the schedule service does not know is reported as having no schedule, not as degraded', async () => {
      arrange(throwError(() => new HttpErrorResponse({ status: 404 })));
      const view = await new Promise<{ locationHasNoSchedule: boolean; degraded: boolean }>(resolve =>
        service.getCalendar(REQUEST).subscribe(resolve),
      );

      expect(view.locationHasNoSchedule).toBe(true);
      // Nothing failed, so nothing is degraded: the banner would send someone
      // looking for an outage that is not there.
      expect(view.degraded).toBe(false);
    });

    it('a real fault degrades and is never mistaken for a location without a shop', async () => {
      arrange(throwError(() => new HttpErrorResponse({ status: 500 })));
      const view = await new Promise<{ locationHasNoSchedule: boolean; degraded: boolean }>(resolve =>
        service.getCalendar(REQUEST).subscribe(resolve),
      );

      expect(view.degraded).toBe(true);
      expect(view.locationHasNoSchedule).toBe(false);
    });

    it('a shop that simply answers is neither degraded nor schedule-less', async () => {
      arrange(of({
        date: '2026-09-29',
        dayStartAt: '2026-09-29T14:00:00Z',
        dayEndAt: '2026-09-29T22:00:00Z',
        locationId: 'loc-1',
        resources: [],
        viewGeneratedAt: '2026-09-29T14:00:00Z',
      }));
      const view = await new Promise<{ locationHasNoSchedule: boolean; degraded: boolean }>(resolve =>
        service.getCalendar(REQUEST).subscribe(resolve),
      );

      expect(view.locationHasNoSchedule).toBe(false);
      expect(view.degraded).toBe(false);
    });
  });

  /**
   * The month grid is one `getScheduleCapacity` read (backend #2023), not one
   * `viewSchedule` per day. September 2026 is used throughout: its grid runs
   * Sunday 30 August to Saturday 3 October, 35 dates.
   */
  describe('month scope reads the range capacity endpoint', () => {
    const MONTH = {
      locationId: 'loc-1',
      focusDate: '2026-09-29',
      scope: 'month' as const,
      job: { label: '', operationCode: '', skillCodes: [], skillRequirementsConfigured: true, durationHours: 1 },
    };
    const GRID_FROM = '2026-08-30';
    const GRID_TO = '2026-10-03';

    // Local wall-clock instants: the service buckets hour slots by local hour.
    const local = (date: string, hour: number) => {
      const [year, month, day] = date.split('-').map(Number);
      return new Date(year, month - 1, day, hour).toISOString();
    };
    const gridDates = Array.from({ length: 35 }, (_, index) => {
      const date = new Date(2026, 7, 30 + index);
      const pad = (value: number) => String(value).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    });

    const bayDay = (overrides: Partial<BayCapacityView> = {}): BayCapacityView => ({
      bayId: 'bay-1',
      name: 'Bay 1',
      occupancy: [0, 0, 0, 0],
      occupiedMinutes: 0,
      carryOverIn: [],
      ...overrides,
    });
    /** An open day, 08:00 to 12:00 unless told otherwise: four hour slots. */
    const okDay = (date: string, bays: BayCapacityView[] = [bayDay()], endHour = 12): DayCapacityView => ({
      date,
      status: DayCapacityViewStatusEnum.Ok,
      dayStartAt: local(date, 8),
      dayEndAt: local(date, endHour),
      bays,
    });
    const shutDay = (date: string, status: DayCapacityViewStatusEnum, closureReason?: string): DayCapacityView => ({
      date,
      status,
      closureReason,
      bays: [],
    });

    const scheduleApi = () =>
      TestBed.inject(ScheduleAPIService) as unknown as {
        viewSchedule: ReturnType<typeof vi.fn>;
        getScheduleCapacity: ReturnType<typeof vi.fn>;
      };

    const arrange = (
      days: Record<string, DayCapacityView> = {},
      bayRows: unknown[] = [{ id: 'bay-1', name: 'Bay 1', status: 'ACTIVE' }],
      staffingStatus?: ScheduleCapacityResponseStaffingStatusEnum,
    ) => {
      const bays = TestBed.inject(BayAPIService) as unknown as { listBays: ReturnType<typeof vi.fn> };
      const techs = TestBed.inject(TechnicianAPIService) as unknown as { listLocationTechnicians: ReturnType<typeof vi.fn> };
      const locations = TestBed.inject(LocationAPIService) as unknown as { getLocationById: ReturnType<typeof vi.fn> };
      bays.listBays.mockReturnValue(of({ content: bayRows }));
      techs.listLocationTechnicians.mockReturnValue(
        of({ content: [{ mechanicRecordId: 'record-1', mechanicPersonId: 'person-1', firstName: 'Jo', lastName: 'Bell', credentials: [] }] }),
      );
      locations.getLocationById.mockReturnValue(of({ id: 'loc-1', name: 'Northgate' }));
      scheduleApi().getScheduleCapacity.mockReturnValue(
        of({
          locationId: 'loc-1',
          from: GRID_FROM,
          to: GRID_TO,
          viewGeneratedAt: local(GRID_FROM, 8),
          staffingStatus,
          days: gridDates.map(date => days[date] ?? okDay(date)),
        }),
      );
    };

    const calendar = (request: typeof MONTH | (Omit<typeof MONTH, 'scope'> & { scope: 'week' }) = MONTH) =>
      new Promise<CapacityCalendarView>(resolve => service.getCalendar(request).subscribe(resolve));
    const dayOf = (view: CapacityCalendarView, date: string): CapacityDay => {
      const found = view.weeks.flat().find(day => day.date === date);
      if (!found) {
        throw new Error(`no ${date} in the month grid`);
      }
      return found;
    };

    it('makes one capacity call spanning the whole grid, and no per-day schedule call', async () => {
      arrange();

      const view = await calendar();

      expect(scheduleApi().getScheduleCapacity).toHaveBeenCalledTimes(1);
      expect(scheduleApi().getScheduleCapacity).toHaveBeenCalledWith('loc-1', GRID_FROM, GRID_TO);
      expect(scheduleApi().viewSchedule).not.toHaveBeenCalled();
      expect(view.weeks).toHaveLength(5);
      expect(view.degraded).toBe(false);
      expect(view.locationHasNoSchedule).toBe(false);
    });

    it('reads a bay hour as busy when its occupancy slot counts any appointment', async () => {
      arrange({ '2026-09-29': okDay('2026-09-29', [bayDay({ occupancy: [0, 2, 0, 0], occupiedMinutes: 60 })]) });

      const view = await calendar();
      const day = dayOf(view, '2026-09-29');

      expect(view.hours).toEqual([8, 9, 10, 11]);
      expect(day.kind).toBe('open');
      expect(day.bayStates[0]).toEqual(['free', 'busy', 'free', 'free']);
      expect(day.shopCapacityBayHours).toBe(4);
      expect(day.shopFreeBayHours).toBe(3);
    });

    it('hatches an out-of-service bay, and counts no capacity for a bay the capacity read does not list', async () => {
      arrange({}, [
        { id: 'bay-1', name: 'Bay 1', status: 'ACTIVE' },
        { id: 'bay-2', name: 'Bay 2', status: 'OUT_OF_SERVICE' },
        { id: 'bay-3', name: 'Bay 3', status: 'ACTIVE' },
      ]);

      const day = dayOf(await calendar(), '2026-09-29');

      expect(day.bayStates[1]).toEqual(['down', 'down', 'down', 'down']);
      // Unknown to the schedule service: claiming it free would invent capacity.
      expect(day.bayStates[2]).toEqual(['closed', 'closed', 'closed', 'closed']);
      expect(day.shopCapacityBayHours).toBe(4);
    });

    it('closes the hours outside a short day\'s own window', async () => {
      arrange({ '2026-09-26': okDay('2026-09-26', [bayDay({ occupancy: [0, 0] })], 10) });

      const view = await calendar();
      const saturday = dayOf(view, '2026-09-26');

      // The grid still spans the widest window any day reports.
      expect(view.hours).toEqual([8, 9, 10, 11]);
      expect(saturday.bayStates[0]).toEqual(['free', 'free', 'closed', 'closed']);
      expect(saturday.shopCapacityBayHours).toBe(2);
    });

    it('shows a weekly closure and a holiday as facts, not as failures', async () => {
      arrange({
        '2026-09-27': shutDay('2026-09-27', DayCapacityViewStatusEnum.Closed),
        '2026-09-07': shutDay('2026-09-07', DayCapacityViewStatusEnum.Holiday, 'Labor Day'),
      });

      const view = await calendar();

      expect(dayOf(view, '2026-09-27').kind).toBe('closed');
      expect(dayOf(view, '2026-09-07').kind).toBe('holiday');
      expect(dayOf(view, '2026-09-07').closureReason).toBe('Labor Day');
      expect(view.degraded).toBe(false);
    });

    it('marks padding days from the neighbouring months as outside, whatever their status', async () => {
      arrange();

      const view = await calendar();

      expect(dayOf(view, '2026-08-30').kind).toBe('outside');
      expect(dayOf(view, '2026-10-03').kind).toBe('outside');
    });

    it('degrades when a day could not be assembled, so the gap never reads as a quiet day', async () => {
      arrange({ '2026-09-15': shutDay('2026-09-15', DayCapacityViewStatusEnum.Unavailable) });

      const view = await calendar();

      expect(view.degraded).toBe(true);
      expect(view.locationHasNoSchedule).toBe(false);
      expect(dayOf(view, '2026-09-15').kind).toBe('closed');
      expect(dayOf(view, '2026-09-15').shopFreeBayHours).toBe(0);
    });

    it('degrades when the capacity read omits a date it was asked for', async () => {
      arrange();
      scheduleApi().getScheduleCapacity.mockReturnValue(
        of({
          locationId: 'loc-1',
          from: GRID_FROM,
          to: GRID_TO,
          viewGeneratedAt: local(GRID_FROM, 8),
          days: gridDates.filter(date => date !== '2026-09-15').map(date => okDay(date)),
        }),
      );

      const view = await calendar();

      expect(view.degraded).toBe(true);
      expect(dayOf(view, '2026-09-15').kind).toBe('closed');
    });

    it('sums carry-over across bays and names the earliest day the work began', async () => {
      arrange(
        {
          '2026-09-29': okDay('2026-09-29', [
            bayDay({ carryOverIn: [{ appointmentId: 'appt-1', bayHours: 1.5, fromDate: '2026-09-28' }] }),
            bayDay({ bayId: 'bay-2', name: 'Bay 2', carryOverIn: [{ appointmentId: 'appt-2', bayHours: 2, fromDate: '2026-09-25' }] }),
          ]),
        },
        [
          { id: 'bay-1', name: 'Bay 1', status: 'ACTIVE' },
          { id: 'bay-2', name: 'Bay 2', status: 'ACTIVE' },
        ],
      );

      const view = await calendar();

      expect(dayOf(view, '2026-09-29').carryOver).toEqual({ hours: 3.5, fromDate: '2026-09-25' });
      expect(dayOf(view, '2026-09-28').carryOver).toBeUndefined();
    });

    /** person-1's slice of an open day; four slots for the default 08:00-12:00 window. */
    const technicianDay = (overrides: Partial<TechnicianCapacityView> = {}): TechnicianCapacityView => ({
      mechanicPersonId: 'person-1',
      onDuty: [1, 1, 1, 1],
      assigned: [0, 0, 0, 0],
      assignedMinutes: 0,
      ...overrides,
    });
    const withTechnicians = (date: string, technicians: TechnicianCapacityView[]): DayCapacityView => ({
      ...okDay(date),
      technicians,
    });
    const AVAILABLE = ScheduleCapacityResponseStaffingStatusEnum.Available;

    it('reads each day\'s duty and assignment from the capacity read, joined on mechanicPersonId (#488 AC2)', async () => {
      arrange(
        {
          '2026-09-29': withTechnicians('2026-09-29', [technicianDay({ assigned: [1, 2, 0, 0], assignedMinutes: 120 })]),
          '2026-09-30': withTechnicians('2026-09-30', [technicianDay()]),
        },
        undefined,
        AVAILABLE,
      );

      const view = await calendar();
      const busy = dayOf(view, '2026-09-29');
      const free = dayOf(view, '2026-09-30');

      expect(view.technicianAvailabilityUnknown).toBe(false);
      // The only technician is assigned 08:00-10:00, so the bay is free but nobody can take the job.
      expect(busy.bayStates[0]).toEqual(['free', 'free', 'free', 'free']);
      expect(busy.firstFitHour).toBe(10);
      expect(free.firstFitHour).toBe(8);
    });

    it('counts a rostered technician the day does not list as off duty that day (#488 AC3)', async () => {
      arrange({ '2026-09-29': withTechnicians('2026-09-29', []) }, undefined, AVAILABLE);

      const view = await calendar();

      expect(dayOf(view, '2026-09-29').firstFitHour).toBeUndefined();
      expect(view.technicianAvailabilityUnknown).toBe(false);
    });

    it('reads on-duty slots, so an off-duty hour leaves no technician for it', async () => {
      arrange(
        { '2026-09-29': withTechnicians('2026-09-29', [technicianDay({ onDuty: [0, 0, 1, 1] })]) },
        undefined,
        AVAILABLE,
      );

      expect(dayOf(await calendar(), '2026-09-29').firstFitHour).toBe(10);
    });

    it('UNAVAILABLE staffing counts the roster on duty and unassigned, and says availability is unknown (#488 AC4)', async () => {
      arrange(
        { '2026-09-29': withTechnicians('2026-09-29', []) },
        undefined,
        ScheduleCapacityResponseStaffingStatusEnum.Unavailable,
      );

      const view = await calendar();

      expect(view.technicianAvailabilityUnknown).toBe(true);
      expect(view.degraded).toBe(false);
      expect([...view.technicians[0].onDutyHours].sort()).toEqual([0, 1, 2, 3]);
      expect([...view.technicians[0].assignedHours]).toEqual([]);
      expect(dayOf(view, '2026-09-29').firstFitHour).toBe(8);
    });

    it('an older backend that omits staffingStatus is treated as unknown, not as nobody rostered (#488 AC4)', async () => {
      arrange();

      const view = await calendar();

      expect(view.technicianAvailabilityUnknown).toBe(true);
      expect(dayOf(view, '2026-09-29').firstFitHour).toBe(8);
    });

    it('a failed capacity read degrades and is never mistaken for a location without a shop', async () => {
      arrange();
      scheduleApi().getScheduleCapacity.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));

      const view = await calendar();

      expect(view.degraded).toBe(true);
      expect(view.locationHasNoSchedule).toBe(false);
      expect(view.technicianAvailabilityUnknown).toBe(false);
      expect(dayOf(view, '2026-09-29').kind).toBe('closed');
    });

    it('a 404 from the capacity read is the location having no shop, not a degraded read', async () => {
      arrange();
      scheduleApi().getScheduleCapacity.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

      const view = await calendar();

      expect(view.locationHasNoSchedule).toBe(true);
      expect(view.degraded).toBe(false);
    });

    it('reads the week from one capacity call and no per-day schedule call (#488 AC1)', async () => {
      arrange(
        { '2026-09-29': withTechnicians('2026-09-29', [technicianDay({ assigned: [1, 0, 0, 0] })]) },
        undefined,
        AVAILABLE,
      );

      const view = await calendar({ ...MONTH, scope: 'week' });

      expect(scheduleApi().getScheduleCapacity).toHaveBeenCalledTimes(1);
      expect(scheduleApi().getScheduleCapacity).toHaveBeenCalledWith('loc-1', '2026-09-27', '2026-10-03');
      expect(scheduleApi().viewSchedule).not.toHaveBeenCalled();
      expect(view.weeks).toEqual([]);
      expect(view.weekDays.map(day => day.date)).toEqual([
        '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03',
      ]);
      // A week has no padding: October 3rd is in scope, not outside.
      expect(view.weekDays[6].kind).toBe('open');
      expect(view.weekDays[2].firstFitHour).toBe(9);
      // The page-level technicians are the focus day's.
      expect([...view.technicians[0].assignedHours]).toEqual([0]);
    });

    const DAY = { ...MONTH, scope: 'day' } as unknown as typeof MONTH;
    /** The view for one date: 08:00-12:00, with whatever appointment lanes are given. */
    const viewFor = (resources: ScheduleViewResponse['resources'] = []) =>
      scheduleApi().viewSchedule.mockImplementation((_loc: string, date: string) =>
        of({
          date,
          dayStartAt: local(date, 8),
          dayEndAt: local(date, 12),
          locationId: 'loc-1',
          resources,
          viewGeneratedAt: local(date, 8),
        }),
      );

    it('reads the day board from the schedule view for its cards and the capacity read for its load', async () => {
      arrange();
      viewFor();

      const view = await calendar(DAY);

      expect(scheduleApi().viewSchedule).toHaveBeenCalledTimes(1);
      expect(scheduleApi().getScheduleCapacity).toHaveBeenCalledTimes(1);
      expect(scheduleApi().getScheduleCapacity).toHaveBeenCalledWith('loc-1', '2026-09-29', '2026-09-29');
      expect(view.focusDay?.date).toBe('2026-09-29');
      expect(view.degraded).toBe(false);
      expect(view.technicianAvailabilityUnknown).toBe(false);
    });

    it('counts a bay held by a work order the schedule view does not list, as the week grid does', async () => {
      arrange({
        '2026-09-29': okDay('2026-09-29', [
          bayDay({
            occupancy: [1, 1, 0, 0],
            occupiedMinutes: 120,
            carryOverIn: [{ workorderId: 'wo-1', bayHours: 2, fromDate: '2026-09-28' }],
          }),
        ]),
      });
      // The view lists appointments only, and this day has none.
      viewFor();

      const view = await calendar(DAY);
      const day = view.focusDay!;

      expect(day.bayStates[0]).toEqual(['busy', 'busy', 'free', 'free']);
      expect(day.shopFreeBayHours).toBe(2);
      expect(day.shopCapacityBayHours).toBe(4);
      expect(day.carryOver).toEqual({ hours: 2, fromDate: '2026-09-28' });
      expect(view.board).toEqual([]);
    });

    it('still marks an hour busy for an appointment the capacity read has not counted', async () => {
      arrange();
      viewFor([
        {
          resourceType: 'BAY',
          resourceId: 'bay-1',
          events: [
            {
              eventId: 'appt-1',
              eventType: 'APPOINTMENT',
              startTime: local('2026-09-29', 10),
              endTime: local('2026-09-29', 11),
              affected: false,
              hasConflict: false,
            },
          ],
        },
      ]);

      const view = await calendar(DAY);

      expect(view.focusDay?.bayStates[0]).toEqual(['free', 'free', 'busy', 'free']);
    });

    it('takes the day\'s duty and assignment from the capacity read when it knows the roster', async () => {
      arrange(
        { '2026-09-29': withTechnicians('2026-09-29', [technicianDay({ onDuty: [1, 1, 0, 0], assigned: [1, 0, 0, 0] })]) },
        undefined,
        AVAILABLE,
      );
      viewFor();

      const view = await calendar(DAY);

      expect([...view.technicians[0].onDutyHours]).toEqual([0, 1]);
      expect([...view.technicians[0].assignedHours]).toEqual([0]);
    });

    it('a failed capacity read leaves the board to the appointments and degrades', async () => {
      arrange();
      scheduleApi().getScheduleCapacity.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
      viewFor();

      const view = await calendar(DAY);

      expect(view.degraded).toBe(true);
      expect(view.focusDay?.kind).toBe('open');
      expect(view.focusDay?.bayStates[0]).toEqual(['free', 'free', 'free', 'free']);
    });
  });

});
