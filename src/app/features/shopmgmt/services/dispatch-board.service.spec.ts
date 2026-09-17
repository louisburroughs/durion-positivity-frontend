import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { DispatchBoardService } from './dispatch-board.service';
import {
  DailyDispatchBoardDashboardService,
  ServicePositionAPIService,
  ServicePositionResponseResourceTypeEnum,
  TechnicianAssignmentAPIService,
} from '@durion-sdk/workorder';
import type { ServicePositionResponse, TechnicianAssignmentResponse } from '@durion-sdk/workorder';
import { BayAPIService } from '@durion-sdk/location';
import { TechnicianAPIService } from '@durion-sdk/shop-manager';
import { PeopleAvailabilityAPIService, WorkSessionsAPIService } from '@durion-sdk/people';
import type { DashboardResponse } from '../models/dispatch-board.models';
import { isoDateLocal } from '../models/capacity-calendar.models';

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
const workSessionStub = {
  startWorkSession: vi.fn(),
  stopWorkSession: vi.fn(),
  startWorkSessionBreak: vi.fn(),
  stopWorkSessionBreak: vi.fn(),
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
    workSessionStub.startWorkSession.mockReturnValue(of({ sessionId: 'ws-1', personId: 'p-1' }));
    workSessionStub.stopWorkSession.mockReturnValue(of({ sessionId: 'ws-1', personId: 'p-1' }));
    workSessionStub.startWorkSessionBreak.mockReturnValue(of({ breakId: 'br-1' }));
    workSessionStub.stopWorkSessionBreak.mockReturnValue(of({ breakId: 'br-1' }));
    bayStub.listBays.mockReturnValue(of({ content: [] }));
    technicianStub.listLocationTechnicians.mockReturnValue(of({ content: [] }));

    TestBed.configureTestingModule({
      providers: [
        DispatchBoardService,
        { provide: DailyDispatchBoardDashboardService, useValue: dispatchDashboardStub },
        { provide: PeopleAvailabilityAPIService, useValue: peopleAvailabilityStub },
        { provide: WorkSessionsAPIService, useValue: workSessionStub },
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

  // ADR-0035: the call alone is not the contract — what the caller receives is.
  it('emits the dashboard the SDK answers', () => {
    const board: DashboardResponse = {
      date: '2026-04-18',
      locationId: 'loc-1',
      lastRefreshed: '2026-04-18T12:00:00Z',
      workorders: [{ workorderId: 'wo-1', status: 'APPROVED' }],
    };
    dispatchDashboardStub.getDispatchDashboard.mockReturnValue(of(board));
    const next = vi.fn();

    service.getDashboard('loc-1', '2026-04-18').subscribe(next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(board);
  });

  it('trims whitespace from locationId before calling the SDK', () => {
    service.getDashboard(' loc-1 ', '2026-04-18').subscribe();

    expect(dispatchDashboardStub.getDispatchDashboard).toHaveBeenCalledWith('loc-1', '2026-04-18');
  });

  // -------------------------------------------------------------------------
  // The board date (ADR-0038): a date-only string passes through; anything
  // else resolves to a LOCAL calendar day. d89a09a :208 fell back to
  // `new Date().toISOString().slice(0, 10)` — the UTC day, which from 17:00
  // Pacific onward is already tomorrow (ADR-0038 Alternatives #2). F14.
  // -------------------------------------------------------------------------
  describe('the board date', () => {
    it('passes a date-only string through without re-parsing it', () => {
      service.getDashboard('loc-1', '2026-12-31').subscribe();
      service.getAvailability('loc-1', '2026-01-01').subscribe();

      expect(dispatchDashboardStub.getDispatchDashboard).toHaveBeenCalledWith('loc-1', '2026-12-31');
      expect(peopleAvailabilityStub.listPeopleAvailability).toHaveBeenCalledWith('loc-1', '2026-01-01');
    });

    // A zone-less timestamp parses as local time, so its local day is fixed
    // whatever the zone; the UTC day it used to answer with is a day off in
    // every zone west of UTC for the first value and east of it for the second.
    it('resolves a parseable timestamp to the local calendar day of that instant', () => {
      for (const value of ['2026-04-18T23:59:59', '2026-04-18T00:00:01']) {
        dispatchDashboardStub.getDispatchDashboard.mockClear();

        service.getDashboard('loc-1', value).subscribe();

        expect(dispatchDashboardStub.getDispatchDashboard).toHaveBeenCalledWith('loc-1', '2026-04-18');
      }
    });

    it('resolves an unparseable value to the local today', () => {
      service.getDashboard('loc-1', 'not-a-date').subscribe();
      service.getAvailability('loc-1', '').subscribe();

      expect(dispatchDashboardStub.getDispatchDashboard).toHaveBeenCalledWith('loc-1', isoDateLocal(new Date()));
      expect(peopleAvailabilityStub.listPeopleAvailability).toHaveBeenCalledWith('loc-1', isoDateLocal(new Date()));
    });
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

  describe('getTechnicianRoster()', () => {
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

      service.getTechnicianRoster(' loc-1 ', '2026-04-18').subscribe(next);

      // `date` (SDK 0.42) sits between skillCode and the paging arguments.
      expect(technicianStub.listLocationTechnicians).toHaveBeenCalledWith(
        'loc-1',
        'ACTIVE',
        undefined,
        '2026-04-18',
        0,
        500,
      );
      expect(next.mock.calls[0][0].skills.get('p1')).toEqual(['BRAKES', 'DOT']);
      expect(next.mock.calls[0][0].skills.get('p2')).toEqual([]);
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

      service.getTechnicianRoster('loc-1', '2026-04-18').subscribe(next);

      expect(next.mock.calls[0][0].skills.get('p1')).toEqual(['DOT']);
    });

    it('falls back to the mechanic id when the roster row carries no person id', () => {
      technicianStub.listLocationTechnicians.mockReturnValue(
        of({ content: [{ mechanicId: 'm1', credentials: [{ skillCode: 'HVAC', status: 'ACTIVE' }] }] }),
      );
      const next = vi.fn();

      service.getTechnicianRoster('loc-1', '2026-04-18').subscribe(next);

      expect(next.mock.calls[0][0].skills.get('m1')).toEqual(['HVAC']);
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

      service.getTechnicianRoster('loc-1', '2026-04-18').subscribe(next);

      expect(next.mock.calls[0][0].skills.get('p1')).toEqual(['BRAKES']);
    });

    it('answers an empty map when shop management is unreachable', () => {
      technicianStub.listLocationTechnicians.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 503 })),
      );
      const next = vi.fn();
      const error = vi.fn();

      service.getTechnicianRoster('loc-1', '2026-04-18').subscribe({ next, error });

      expect(error).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].skills.size).toBe(0);
      expect(next.mock.calls[0][0].shifts.size).toBe(0);
      // Empty maps alone cannot be told from a shop with nobody rostered, so
      // the failure travels with them.
      expect(next.mock.calls[0][0].ok).toBe(false);
    });

    it('reports a read that answered, even when the roster is genuinely empty', () => {
      technicianStub.listLocationTechnicians.mockReturnValue(of({ content: [] }));
      const next = vi.fn();

      service.getTechnicianRoster('loc-1', '2026-04-18').subscribe(next);

      expect(next.mock.calls[0][0].ok).toBe(true);
      expect(next.mock.calls[0][0].shifts.size).toBe(0);
    });

    it('carries the placeholder shift window through for a DERIVED day', () => {
      technicianStub.listLocationTechnicians.mockReturnValue(
        of({
          content: [
            { personId: 'p1', shiftStatus: 'DERIVED', shiftSource: 'LOCATION_HOURS', shiftMinutes: 540 },
          ],
        }),
      );
      const next = vi.fn();

      service.getTechnicianRoster('loc-1', '2026-04-18').subscribe(next);

      expect(next.mock.calls[0][0].shifts.get('p1')).toEqual({
        status: 'DERIVED',
        source: 'LOCATION_HOURS',
        minutes: 540,
      });
    });

    // CLOSED and UNKNOWN are different facts and the board words them
    // differently, so the status has to survive the mapping rather than
    // collapsing into a null window.
    it('keeps CLOSED and UNKNOWN apart, both without minutes', () => {
      technicianStub.listLocationTechnicians.mockReturnValue(
        of({
          content: [
            { personId: 'closed', shiftStatus: 'CLOSED', shiftSource: 'LOCATION_HOURS' },
            { personId: 'unknown', shiftStatus: 'UNKNOWN', shiftSource: 'LOCATION_HOURS' },
          ],
        }),
      );
      const next = vi.fn();

      service.getTechnicianRoster('loc-1', '2026-04-18').subscribe(next);

      const shifts = next.mock.calls[0][0].shifts;
      expect(shifts.get('closed')).toEqual({ status: 'CLOSED', source: 'LOCATION_HOURS', minutes: null });
      expect(shifts.get('unknown')).toEqual({ status: 'UNKNOWN', source: 'LOCATION_HOURS', minutes: null });
    });
  });

  describe('getClockStates()', () => {
    it('keys clock state and the open session by person id', () => {
      peopleAvailabilityStub.listPeopleAvailability.mockReturnValue(
        of([
          { personId: 'p1', clockState: 'CLOCKED_IN', workSessionId: 'ws-1' },
          { personId: 'p2', clockState: 'ON_BREAK', workSessionId: 'ws-2' },
          { personId: 'p3', clockState: 'CLOCKED_OUT' },
        ]),
      );
      const next = vi.fn();

      service.getClockStates('loc-1', '2026-04-18').subscribe(next);

      expect(peopleAvailabilityStub.listPeopleAvailability).toHaveBeenCalledWith('loc-1', '2026-04-18');
      expect(next.mock.calls[0][0].get('p1')).toEqual({ state: 'CLOCKED_IN', workSessionId: 'ws-1' });
      expect(next.mock.calls[0][0].get('p2')).toEqual({ state: 'ON_BREAK', workSessionId: 'ws-2' });
      expect(next.mock.calls[0][0].get('p3')).toEqual({ state: 'CLOCKED_OUT', workSessionId: null });
    });

    // pos-people nulls clockState for a row the caller may not see rather than
    // refusing the whole read, so that row must be absent — not CLOCKED_OUT,
    // which would be the board asserting something it was not told.
    it('omits a row whose clock state the caller may not see', () => {
      peopleAvailabilityStub.listPeopleAvailability.mockReturnValue(
        of([{ personId: 'p1', clockState: 'CLOCKED_IN' }, { personId: 'hidden' }]),
      );
      const next = vi.fn();

      service.getClockStates('loc-1', '2026-04-18').subscribe(next);

      expect(next.mock.calls[0][0].has('hidden')).toBe(false);
      expect(next.mock.calls[0][0].size).toBe(1);
    });

    it('answers an empty map when the availability read fails', () => {
      peopleAvailabilityStub.listPeopleAvailability.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 503 })),
      );
      const next = vi.fn();
      const error = vi.fn();

      service.getClockStates('loc-1', '2026-04-18').subscribe({ next, error });

      expect(error).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------
  describe('assignMechanic()', () => {
    const assigned: TechnicianAssignmentResponse = { currentStatus: 'ASSIGNED', message: 'Technician assigned' };

    // assignTechnician refuses a workorder that already holds one and
    // reassignTechnician refuses one that does not, so the incumbent picks.
    // ADR-0035: each branch also emits what the SDK answered.
    it('uses assignTechnician when the workorder has nobody on it, and emits its response', () => {
      technicianAssignmentStub.assignTechnician.mockReturnValue(of(assigned));
      const next = vi.fn();

      service.assignMechanic('wo-1', 'tech-1', null).subscribe(next);

      // The third argument is the per-attempt idempotency key.
      expect(technicianAssignmentStub.assignTechnician).toHaveBeenCalledWith(
        'wo-1',
        { technicianId: 'tech-1' },
        expect.any(String),
      );
      expect(technicianAssignmentStub.reassignTechnician).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(assigned);
    });

    it('uses reassignTechnician when the workorder already has one, and emits its response', () => {
      const reassigned: TechnicianAssignmentResponse = { ...assigned, previousTechnicianId: 'tech-1' };
      technicianAssignmentStub.reassignTechnician.mockReturnValue(of(reassigned));
      const next = vi.fn();

      service.assignMechanic('wo-1', 'tech-2', 'tech-1').subscribe(next);

      expect(technicianAssignmentStub.reassignTechnician).toHaveBeenCalledWith(
        'wo-1',
        { newTechnicianId: 'tech-2' },
        expect.any(String),
      );
      expect(technicianAssignmentStub.assignTechnician).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(reassigned);
    });

    // One key per attempt: a retry after a lost response must not be read as
    // a replay of the write that landed.
    it('sends a fresh idempotency key on every attempt', () => {
      service.assignMechanic('wo-1', 'tech-1', null).subscribe();
      service.assignMechanic('wo-1', 'tech-1', null).subscribe();

      const keys = technicianAssignmentStub.assignTechnician.mock.calls.map(call => call[2]);
      expect(keys).toHaveLength(2);
      expect(keys[0]).not.toBe(keys[1]);
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

  // ADR-0035 for the remaining writes: the verb-and-target assertion each had
  // is kept, and the emitted value is asserted beside it.
  it('releaseMechanic() releases the current technician and completes with the SDK answer', () => {
    const next = vi.fn();
    const complete = vi.fn();

    service.releaseMechanic('wo-1').subscribe({ next, complete });

    expect(technicianAssignmentStub.releaseTechnician).toHaveBeenCalledWith('wo-1');
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(undefined);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('assignBay() places the workorder on a BAY position and emits the position it now holds', () => {
    const placed: ServicePositionResponse = {
      workorderId: 'wo-1',
      resourceType: ServicePositionResponseResourceTypeEnum.Bay,
      resourceId: 'bay-1',
    };
    servicePositionStub.assignServicePosition.mockReturnValue(of(placed));
    const next = vi.fn();

    service.assignBay('wo-1', 'bay-1').subscribe(next);

    expect(servicePositionStub.assignServicePosition).toHaveBeenCalledWith('wo-1', {
      resourceType: 'BAY',
      resourceId: 'bay-1',
    });
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(placed);
  });

  it('releaseBay() gives up the position the workorder holds and emits the released position', () => {
    const released: ServicePositionResponse = { workorderId: 'wo-1' };
    servicePositionStub.releaseServicePosition.mockReturnValue(of(released));
    const next = vi.fn();

    service.releaseBay('wo-1').subscribe(next);

    expect(servicePositionStub.releaseServicePosition).toHaveBeenCalledWith('wo-1');
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(released);
  });

  // Parking is not releasing, and HOLD takes no resourceId: the contract
  // defaults it to the workorder's own locationId and refuses anything else.
  it('parkWorkorder() puts the workorder on the site HOLD position with no resourceId, and emits it', () => {
    const parked: ServicePositionResponse = {
      workorderId: 'wo-1',
      resourceType: ServicePositionResponseResourceTypeEnum.Hold,
      resourceId: 'loc-1',
    };
    servicePositionStub.assignServicePosition.mockReturnValue(of(parked));
    const next = vi.fn();

    service.parkWorkorder('wo-1').subscribe(next);

    expect(servicePositionStub.assignServicePosition).toHaveBeenCalledWith('wo-1', {
      resourceType: 'HOLD',
    });
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(parked);
  });

  it('propagates a refusal from the position endpoints rather than swallowing it', () => {
    const refusal = new HttpErrorResponse({ status: 422, error: { code: 'SERVICE_POSITION_INVALID' } });
    servicePositionStub.assignServicePosition.mockReturnValue(throwError(() => refusal));
    const next = vi.fn();
    const error = vi.fn();

    service.assignBay('wo-1', 'bay-9').subscribe({ next, error });

    expect(next).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(refusal);
  });

  describe('the timekeeping clock', () => {
    it('clocks a person in by person id, and sends no actor', () => {
      service.clockIn('p-1').subscribe();

      // The controller ignores the body's actor and records the authenticated
      // username, so sending one would imply a choice the caller does not have.
      expect(workSessionStub.startWorkSession).toHaveBeenCalledWith({ personId: 'p-1' });
    });

    it('clocks a person out by person id, not by session id', () => {
      service.clockOut('p-1').subscribe();

      expect(workSessionStub.stopWorkSession).toHaveBeenCalledWith({ personId: 'p-1' });
    });

    // ADR-0035: what the caller receives is the contract, not just the call.
    it('emits the session the SDK answers', () => {
      const session = { sessionId: 'ws-9', personId: 'p-1', status: 'ACTIVE', startedAt: '2026-09-17T13:00:00Z' };
      workSessionStub.startWorkSession.mockReturnValue(of(session));
      const next = vi.fn();

      service.clockIn('p-1').subscribe(next);

      expect(next).toHaveBeenCalledWith(session);
    });

    it('propagates a refusal rather than swallowing it', () => {
      // The board reads these two refusals as the state it could not read, so
      // they have to reach it intact.
      const refusal = new HttpErrorResponse({ status: 409, error: { code: 'INVALID_STATE' } });
      workSessionStub.startWorkSession.mockReturnValue(throwError(() => refusal));
      const next = vi.fn();
      const error = vi.fn();

      service.clockIn('p-1').subscribe({ next, error });

      expect(next).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(refusal);
    });

    // Breaks key by the SESSION, unlike clock in and out which key by person.
    it('starts and ends a break by work session id', () => {
      service.startBreak('ws-9').subscribe();
      service.stopBreak('ws-9').subscribe();

      expect(workSessionStub.startWorkSessionBreak).toHaveBeenCalledWith('ws-9');
      expect(workSessionStub.stopWorkSessionBreak).toHaveBeenCalledWith('ws-9');
    });

    it('propagates a break refusal rather than swallowing it', () => {
      const refusal = new HttpErrorResponse({ status: 409, error: { code: 'INVALID_STATE' } });
      workSessionStub.stopWorkSessionBreak.mockReturnValue(throwError(() => refusal));
      const next = vi.fn();
      const error = vi.fn();

      service.stopBreak('ws-9').subscribe({ next, error });

      expect(next).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(refusal);
    });
  });
});
