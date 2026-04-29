import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { DispatchBoardService } from './dispatch-board.service';
import { DailyDispatchBoardDashboardService } from '@durion-sdk/workorder';
import { PeopleAvailabilityAPIService } from '@durion-sdk/people';

const dispatchDashboardStub = { getDashboard: vi.fn() };
const peopleAvailabilityStub = {
  getCurrentUserPrimaryLocation: vi.fn(),
  getPeopleAvailability: vi.fn(),
};

describe('DispatchBoardService', () => {
  let service: DispatchBoardService;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatchDashboardStub.getDashboard.mockReturnValue(of({ workorders: [] }));
    peopleAvailabilityStub.getCurrentUserPrimaryLocation.mockReturnValue(of({ locationId: 'loc-primary' }));
    peopleAvailabilityStub.getPeopleAvailability.mockReturnValue(of([]));

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

    expect(dispatchDashboardStub.getDashboard).toHaveBeenCalledWith('loc-1', '2026-04-18');
  });

  it('trims whitespace from locationId before calling the SDK', () => {
    service.getDashboard(' loc-1 ', '2026-04-18').subscribe();

    expect(dispatchDashboardStub.getDashboard).toHaveBeenCalledWith('loc-1', '2026-04-18');
  });

  it('calls getCurrentUserPrimaryLocation for getPrimaryLocation()', () => {
    service.getPrimaryLocation().subscribe();

    expect(peopleAvailabilityStub.getCurrentUserPrimaryLocation).toHaveBeenCalledTimes(1);
  });

  it('calls getPeopleAvailability with locationId and date for getAvailability()', () => {
    service.getAvailability('loc-1', '2026-04-18').subscribe();

    expect(peopleAvailabilityStub.getPeopleAvailability).toHaveBeenCalledWith('loc-1', '2026-04-18');
  });

  it('trims whitespace from locationId in getAvailability()', () => {
    service.getAvailability(' loc-1 ', '2026-04-18').subscribe();

    expect(peopleAvailabilityStub.getPeopleAvailability).toHaveBeenCalledWith('loc-1', '2026-04-18');
  });
});
