import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
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

  it('calls getPeopleAvailability with locationId and date for getAvailability()', () => {
    service.getAvailability('loc-1', '2026-04-18').subscribe();

    expect(peopleAvailabilityStub.listPeopleAvailability).toHaveBeenCalledWith('loc-1', '2026-04-18');
  });

  it('trims whitespace from locationId in getAvailability()', () => {
    service.getAvailability(' loc-1 ', '2026-04-18').subscribe();

    expect(peopleAvailabilityStub.listPeopleAvailability).toHaveBeenCalledWith('loc-1', '2026-04-18');
  });
});
