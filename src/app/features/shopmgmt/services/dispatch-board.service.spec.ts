import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { DispatchBoardService } from './dispatch-board.service';
import {
  DailyDispatchBoardDashboardService,
  ServicePositionAPIService,
  TechnicianAssignmentAPIService,
} from '@durion-sdk/workorder';
import { BayAPIService } from '@durion-sdk/location';
import { TechnicianAPIService } from '@durion-sdk/shop-manager';
import { PeopleAvailabilityAPIService } from '@durion-sdk/people';

const dispatchDashboardStub = { getDispatchDashboard: vi.fn() };
const peopleAvailabilityStub = {
  getMyPrimaryLocation: vi.fn(),
  listPeopleAvailability: vi.fn(),
};
const technicianAssignmentStub = {
  assignTechnician: vi.fn(),
  reassignTechnician: vi.fn(),
  releaseTechnician: vi.fn(),
};
const servicePositionStub = {
  assignServicePosition: vi.fn(),
  releaseServicePosition: vi.fn(),
};
const bayStub = { listBays: vi.fn() };
const technicianStub = { listLocationTechnicians: vi.fn() };

describe('DispatchBoardService', () => {
  let service: DispatchBoardService;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatchDashboardStub.getDispatchDashboard.mockReturnValue(of({ workorders: [] }));
    peopleAvailabilityStub.getMyPrimaryLocation.mockReturnValue(of({ locationId: 'loc-primary' }));
    peopleAvailabilityStub.listPeopleAvailability.mockReturnValue(of([]));
    technicianAssignmentStub.assignTechnician.mockReturnValue(of({}));
    technicianAssignmentStub.reassignTechnician.mockReturnValue(of({}));
    technicianAssignmentStub.releaseTechnician.mockReturnValue(of(undefined));
    servicePositionStub.assignServicePosition.mockReturnValue(of({}));
    servicePositionStub.releaseServicePosition.mockReturnValue(of(undefined));
    bayStub.listBays.mockReturnValue(of({ content: [] }));
    technicianStub.listLocationTechnicians.mockReturnValue(of({ content: [] }));

    TestBed.configureTestingModule({
      providers: [
        DispatchBoardService,
        { provide: DailyDispatchBoardDashboardService, useValue: dispatchDashboardStub },
        { provide: PeopleAvailabilityAPIService, useValue: peopleAvailabilityStub },
        { provide: TechnicianAssignmentAPIService, useValue: technicianAssignmentStub },
        { provide: ServicePositionAPIService, useValue: servicePositionStub },
        { provide: BayAPIService, useValue: bayStub },
        { provide: TechnicianAPIService, useValue: technicianStub },
      ],
    });

    service = TestBed.inject(DispatchBoardService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls dispatchDashboardSdk.getDashboard with trimmed locationId and normalized date', () => {
    service.getDashboard('loc-1', '2026-04-18').subscribe();

    expect(dispatchDashboardStub.getDispatchDashboard).toHaveBeenCalledWith('loc-1', '2026-04-18');
  });

  it('trims whitespace from locationId before calling the SDK', () => {
    service.getDashboard(' loc-1 ', '2026-04-18').subscribe();

    expect(dispatchDashboardStub.getDispatchDashboard).toHaveBeenCalledWith('loc-1', '2026-04-18');
  });

  it('calls getCurrentUserPrimaryLocation for getPrimaryLocation()', () => {
    service.getPrimaryLocation().subscribe();

    expect(peopleAvailabilityStub.getMyPrimaryLocation).toHaveBeenCalledTimes(1);
  });

  it('getPrimaryLocation() maps an SDK 404 to an empty primary location (#201)', () => {
    peopleAvailabilityStub.getMyPrimaryLocation.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' })),
    );
    const next = vi.fn();
    const error = vi.fn();

    service.getPrimaryLocation().subscribe({ next, error });

    expect(error).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith({ locationId: undefined });
  });

  it('getPrimaryLocation() still propagates a 500', () => {
    const failure = new HttpErrorResponse({ status: 500, statusText: 'Server Error' });
    peopleAvailabilityStub.getMyPrimaryLocation.mockReturnValue(throwError(() => failure));
    const next = vi.fn();
    const error = vi.fn();

    service.getPrimaryLocation().subscribe({ next, error });

    expect(next).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(failure);
  });

  it('getPrimaryLocation() still propagates a 401 and a 403', () => {
    for (const status of [401, 403]) {
      const failure = new HttpErrorResponse({ status });
      peopleAvailabilityStub.getMyPrimaryLocation.mockReturnValue(throwError(() => failure));
      const error = vi.fn();

      service.getPrimaryLocation().subscribe({ error });

      expect(error).toHaveBeenCalledWith(failure);
    }
  });

  it('calls getPeopleAvailability with locationId and date for getAvailability()', () => {
    service.getAvailability('loc-1', '2026-04-18').subscribe();

    expect(peopleAvailabilityStub.listPeopleAvailability).toHaveBeenCalledWith('loc-1', '2026-04-18');
  });

  it('trims whitespace from locationId in getAvailability()', () => {
    service.getAvailability(' loc-1 ', '2026-04-18').subscribe();

    expect(peopleAvailabilityStub.listPeopleAvailability).toHaveBeenCalledWith('loc-1', '2026-04-18');
  });
  // -------------------------------------------------------------------------
  // Enrichment: decoration on the board, so a failure is absorbed
  // -------------------------------------------------------------------------
  describe('getBayInventory()', () => {
    it('maps each bay onto its name, type and lifecycle status', () => {
      bayStub.listBays.mockReturnValue(
        of({
          content: [
            { id: 'b1', name: 'Bay 1', bayType: 'ALIGNMENT', status: 'ACTIVE' },
            { id: 'b2', name: 'Bay 2', bayType: 'GENERAL_SERVICE', status: 'OUT_OF_SERVICE' },
          ],
        }),
      );
      const next = vi.fn();

      service.getBayInventory(' loc-1 ').subscribe(next);

      expect(bayStub.listBays).toHaveBeenCalledWith('loc-1', undefined, undefined, 0, 500);
      expect(next.mock.calls[0][0].get('b1')).toEqual({
        bayId: 'b1',
        name: 'Bay 1',
        kind: 'ALIGNMENT',
        outOfService: false,
      });
      expect(next.mock.calls[0][0].get('b2')?.outOfService).toBe(true);
    });

    // The inventory is the rail's roster of record, so a bay is carried whether
    // or not it has a type yet; only its name and kind stay null.
    it('carries a bay whose replica has arrived without a type or a name', () => {
      bayStub.listBays.mockReturnValue(of({ content: [{ id: 'b1' }] }));
      const next = vi.fn();

      service.getBayInventory('loc-1').subscribe(next);

      expect(next.mock.calls[0][0].get('b1')).toEqual({
        bayId: 'b1',
        name: null,
        kind: null,
        outOfService: false,
      });
    });

    it('answers an empty map when the location domain is unreachable', () => {
      bayStub.listBays.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
      const next = vi.fn();
      const error = vi.fn();

      service.getBayInventory('loc-1').subscribe({ next, error });

      expect(error).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].size).toBe(0);
    });
  });

  describe('getTechnicianSkills()', () => {
    it('collects the skill codes each technician is credentialled for', () => {
      technicianStub.listLocationTechnicians.mockReturnValue(
        of({
          content: [
            {
              personId: 'p1',
              credentials: [
                { skillCode: 'BRAKES', status: 'ACTIVE' },
                { skillCode: 'DOT', status: 'ACTIVE' },
              ],
            },
            { personId: 'p2', credentials: [] },
          ],
        }),
      );
      const next = vi.fn();

      service.getTechnicianSkills(' loc-1 ').subscribe(next);

      expect(technicianStub.listLocationTechnicians).toHaveBeenCalledWith('loc-1', 'ACTIVE', undefined, 0, 500);
      expect(next.mock.calls[0][0].get('p1')).toEqual(['BRAKES', 'DOT']);
      expect(next.mock.calls[0][0].get('p2')).toEqual([]);
    });

    it('drops duplicate skill codes from renewed credentials', () => {
      technicianStub.listLocationTechnicians.mockReturnValue(
        of({
          content: [
            {
              personId: 'p1',
              credentials: [
                { skillCode: 'DOT', status: 'ACTIVE' },
                { skillCode: 'DOT', status: 'ACTIVE' },
              ],
            },
          ],
        }),
      );
      const next = vi.fn();

      service.getTechnicianSkills('loc-1').subscribe(next);

      expect(next.mock.calls[0][0].get('p1')).toEqual(['DOT']);
    });

    it('falls back to the mechanic id when the roster row carries no person id', () => {
      technicianStub.listLocationTechnicians.mockReturnValue(
        of({ content: [{ mechanicId: 'm1', credentials: [{ skillCode: 'HVAC', status: 'ACTIVE' }] }] }),
      );
      const next = vi.fn();

      service.getTechnicianSkills('loc-1').subscribe(next);

      expect(next.mock.calls[0][0].get('m1')).toEqual(['HVAC']);
    });

    // A lapsed certification is not competence: shown as a chip it mislabels the
    // technician, and it floats them up the picker's credentialled-first order.
    it('keeps only the credentials the roster reports ACTIVE', () => {
      technicianStub.listLocationTechnicians.mockReturnValue(
        of({
          content: [
            {
              personId: 'p1',
              credentials: [
                { skillCode: 'BRAKES', status: 'ACTIVE' },
                { skillCode: 'DOT', status: 'EXPIRED' },
                { skillCode: 'HVAC', status: 'REVOKED' },
                { skillCode: 'WELD', status: 'SUPERSEDED' },
              ],
            },
          ],
        }),
      );
      const next = vi.fn();

      service.getTechnicianSkills('loc-1').subscribe(next);

      expect(next.mock.calls[0][0].get('p1')).toEqual(['BRAKES']);
    });

    it('answers an empty map when shop management is unreachable', () => {
      technicianStub.listLocationTechnicians.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 503 })),
      );
      const next = vi.fn();
      const error = vi.fn();

      service.getTechnicianSkills('loc-1').subscribe({ next, error });

      expect(error).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------
  describe('assignMechanic()', () => {
    // assignTechnician refuses a workorder that already holds one and
    // reassignTechnician refuses one that does not, so the incumbent picks.
    it('uses assignTechnician when the workorder has nobody on it', () => {
      service.assignMechanic('wo-1', 'tech-1', null).subscribe();

      expect(technicianAssignmentStub.assignTechnician).toHaveBeenCalledWith('wo-1', { technicianId: 'tech-1' });
      expect(technicianAssignmentStub.reassignTechnician).not.toHaveBeenCalled();
    });

    it('uses reassignTechnician when the workorder already has one', () => {
      service.assignMechanic('wo-1', 'tech-2', 'tech-1').subscribe();

      expect(technicianAssignmentStub.reassignTechnician).toHaveBeenCalledWith('wo-1', {
        newTechnicianId: 'tech-2',
      });
      expect(technicianAssignmentStub.assignTechnician).not.toHaveBeenCalled();
    });

    it('propagates a refusal rather than swallowing it', () => {
      technicianAssignmentStub.assignTechnician.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 409 })),
      );
      const error = vi.fn();

      service.assignMechanic('wo-1', 'tech-1', null).subscribe({ error });

      expect(error).toHaveBeenCalledTimes(1);
    });
  });

  it('releaseMechanic() releases the current technician', () => {
    service.releaseMechanic('wo-1').subscribe();

    expect(technicianAssignmentStub.releaseTechnician).toHaveBeenCalledWith('wo-1');
  });

  it('assignBay() places the workorder on a BAY position', () => {
    service.assignBay('wo-1', 'bay-1').subscribe();

    expect(servicePositionStub.assignServicePosition).toHaveBeenCalledWith('wo-1', {
      resourceType: 'BAY',
      resourceId: 'bay-1',
    });
  });

  it('releaseBay() gives up the position the workorder holds', () => {
    service.releaseBay('wo-1').subscribe();

    expect(servicePositionStub.releaseServicePosition).toHaveBeenCalledWith('wo-1');
  });

  // Parking is not releasing, and HOLD takes no resourceId: the contract
  // defaults it to the workorder's own locationId and refuses anything else.
  it('parkWorkorder() puts the workorder on the site HOLD position with no resourceId', () => {
    service.parkWorkorder('wo-1').subscribe();

    expect(servicePositionStub.assignServicePosition).toHaveBeenCalledWith('wo-1', {
      resourceType: 'HOLD',
    });
  });
});
