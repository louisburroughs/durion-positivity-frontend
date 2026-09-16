import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BayAPIService, LocationAPIService } from '@durion-sdk/location';
import { ProductsAPIService } from '@durion-sdk/catalog';
import type { ServiceDto } from '@durion-sdk/catalog';
import { ScheduleAPIService, TechnicianAPIService, TechnicianCredentialResponseStatusEnum } from '@durion-sdk/shop-manager';
import type { TechnicianCredentialResponse } from '@durion-sdk/shop-manager';
import { CapacityCalendarService, heldSkillCodes } from './capacity-calendar.service';

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
});
