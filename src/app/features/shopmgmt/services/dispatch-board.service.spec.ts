import { TestBed } from '@angular/core/testing';
import { HttpParams } from '@angular/common/http';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { DispatchBoardService } from './dispatch-board.service';
import { ApiBaseService } from '../../../core/services/api-base.service';

const apiMock = {
  get: vi.fn(),
};

describe('DispatchBoardService', () => {
  let service: DispatchBoardService;

  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockReturnValue(of({ workorders: [] }));

    TestBed.configureTestingModule({
      providers: [
        DispatchBoardService,
        { provide: ApiBaseService, useValue: apiMock },
      ],
    });

    service = TestBed.inject(DispatchBoardService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls GET /v1/workexec/dashboard/today', () => {
    service.getDashboard('loc-1', '2026-04-18').subscribe();

    expect(apiMock.get).toHaveBeenCalledOnce();
    expect(apiMock.get.mock.calls[0][0]).toBe('/v1/workexec/dashboard/today');
  });

  it('passes required locationId and date as query params', () => {
    service.getDashboard(' loc-1 ', '2026-04-18').subscribe();

    const params: HttpParams = apiMock.get.mock.calls[0][1];
    expect(params).toBeInstanceOf(HttpParams);
    expect(params.get('locationId')).toBe('loc-1');
    expect(params.get('date')).toBe('2026-04-18');
  });
});
