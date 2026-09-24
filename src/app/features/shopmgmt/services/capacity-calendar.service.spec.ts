import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { BayAPIService, LocationAPIService } from '@durion-sdk/location';
import { ProductsAPIService } from '@durion-sdk/catalog';
import type { ServiceDto } from '@durion-sdk/catalog';
import { ScheduleAPIService, TechnicianAPIService, TechnicianCredentialResponseStatusEnum } from '@durion-sdk/shop-manager';
import type { TechnicianCredentialResponse } from '@durion-sdk/shop-manager';
import { CapacityCalendarService, heldSkillCodes } from './capacity-calendar.service';
import type { JobRequirement } from '../models/capacity-calendar.models';

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
        { provide: ScheduleAPIService, useValue: { viewSchedule: vi.fn() } },
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
  describe('schedule 404s', () => {
    const REQUEST = {
      locationId: 'loc-1',
      focusDate: '2026-09-29',
      scope: 'day' as const,
      job: { label: '', operationCode: '', skillCodes: [], skillRequirementsConfigured: true, durationHours: 1 },
    };

    const arrange = (scheduleResult: unknown) => {
      const schedule = TestBed.inject(ScheduleAPIService) as unknown as { viewSchedule: ReturnType<typeof vi.fn> };
      const bays = TestBed.inject(BayAPIService) as unknown as { listBays: ReturnType<typeof vi.fn> };
      const techs = TestBed.inject(TechnicianAPIService) as unknown as { listLocationTechnicians: ReturnType<typeof vi.fn> };
      const locations = TestBed.inject(LocationAPIService) as unknown as { getLocationById: ReturnType<typeof vi.fn> };
      bays.listBays.mockReturnValue(of({ content: [] }));
      techs.listLocationTechnicians.mockReturnValue(of({ content: [] }));
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

    /**
     * A month fans out over the whole grid, so the two counts that decide these
     * flags only have more than one outcome to weigh here. The mixed case is
     * the one that matters: the endpoint 404s on a date with no appointments at
     * a location it holds no shop row for, so a shopless location with any
     * bookings answers 200 for those dates and 404 for the rest.
     */
    describe('across a month', () => {
      const MONTH = { ...REQUEST, scope: 'month' as const };

      const dayResponse = (date: string) => ({
        date,
        dayStartAt: `${date}T14:00:00Z`,
        dayEndAt: `${date}T22:00:00Z`,
        locationId: 'loc-1',
        resources: [],
        viewGeneratedAt: `${date}T14:00:00Z`,
      });

      /** Answers per date, so one fan-out can mix 404s and real days. */
      const arrangeByDate = (answer: (date: string) => unknown) =>
        arrange(undefined).viewSchedule.mockImplementation((_loc: string, date: string) => answer(date));

      const calendar = () =>
        new Promise<{ locationHasNoSchedule: boolean; degraded: boolean }>(resolve =>
          service.getCalendar(MONTH).subscribe(resolve),
        );

      it('every day 404 is the location having no shop, across the whole grid', async () => {
        arrangeByDate(() => throwError(() => new HttpErrorResponse({ status: 404 })));

        const view = await calendar();

        expect(view.locationHasNoSchedule).toBe(true);
        expect(view.degraded).toBe(false);
      });

      it('some days 404 and some answer: an incomplete picture, not a location without a shop', async () => {
        // The booked day answers; the rest 404 because the shop row is missing.
        // Left ungraded, those blanks would read as open and empty rather than
        // unknown, which is the one reading that gets someone double-booked.
        arrangeByDate(date =>
          date === '2026-09-29'
            ? of(dayResponse(date))
            : throwError(() => new HttpErrorResponse({ status: 404 })),
        );

        const view = await calendar();

        expect(view.degraded).toBe(true);
        expect(view.locationHasNoSchedule).toBe(false);
      });

      it('a whole month that answers is neither degraded nor schedule-less', async () => {
        arrangeByDate(date => of(dayResponse(date)));

        const view = await calendar();

        expect(view.degraded).toBe(false);
        expect(view.locationHasNoSchedule).toBe(false);
      });
    });
  });

});
