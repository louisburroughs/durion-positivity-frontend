import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { DispatchBoardService } from './dispatch-board.service';
import { DailyDispatchBoardDashboardService } from '@durion-sdk/workorder';
import { PeopleAvailabilityAPIService } from '@durion-sdk/people';

const dispatchDashboardStub = { getDispatchDashboard: vi.fn() };
const peopleAvailabilityStub = {
  getMyPrimaryLocation: vi.fn(),
  listPeopleAvailability: vi.fn(),
};

describe('DispatchBoardService', () => {
  let service: DispatchBoardService;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatchDashboardStub.getDispatchDashboard.mockReturnValue(of({ workorders: [] }));
    peopleAvailabilityStub.getMyPrimaryLocation.mockReturnValue(of({ locationId: 'loc-primary' }));
    peopleAvailabilityStub.listPeopleAvailability.mockReturnValue(of([]));

    TestBed.configureTestingModule({
      providers: [
        DispatchBoardService,
        { provide: DailyDispatchBoardDashboardService, useValue: dispatchDashboardStub },
        { provide: PeopleAvailabilityAPIService, useValue: peopleAvailabilityStub },
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
});
