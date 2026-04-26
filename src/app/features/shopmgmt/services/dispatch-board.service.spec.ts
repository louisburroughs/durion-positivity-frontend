import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { DispatchBoardService } from './dispatch-board.service';
import { DailyDispatchBoardDashboardService } from '@durion-sdk/workorder';

const dispatchDashboardStub = { getDashboard: vi.fn() };

describe('DispatchBoardService', () => {
  let service: DispatchBoardService;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatchDashboardStub.getDashboard.mockReturnValue(of({ workorders: [] }));

    TestBed.configureTestingModule({
      providers: [
        DispatchBoardService,
        { provide: DailyDispatchBoardDashboardService, useValue: dispatchDashboardStub },
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
});
