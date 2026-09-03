import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MechanicRosterAPIService,
  MechanicRosterEntryResponseStatusEnum,
  type PagedModelMechanicRosterEntryResponse,
} from '@durion-sdk/shop-manager';

import { ShopmgmtRosterService } from './shopmgmt-roster.service';

const samplePage: PagedModelMechanicRosterEntryResponse = {
  content: [
    {
      mechanicId: 'mechanic-1',
      personId: 'person-1',
      firstName: 'Alex',
      lastName: 'Smith',
      status: MechanicRosterEntryResponseStatusEnum.Inactive,
      skills: ['BRAKES'],
    },
  ],
  page: { number: 2, size: 40, totalElements: 81, totalPages: 3 },
};

const mechanicRosterApiStub = {
  listMechanics: vi.fn(),
};

describe('ShopmgmtRosterService', () => {
  let service: ShopmgmtRosterService;

  beforeEach(() => {
    vi.clearAllMocks();
    mechanicRosterApiStub.listMechanics.mockReturnValue(of(samplePage));

    TestBed.configureTestingModule({
      providers: [
        ShopmgmtRosterService,
        { provide: MechanicRosterAPIService, useValue: mechanicRosterApiStub },
      ],
    });

    service = TestBed.inject(ShopmgmtRosterService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('forwards page, size, and status to the generated roster API and returns its page', () => {
    let result: PagedModelMechanicRosterEntryResponse | undefined;

    service
      .listMechanics({
        status: MechanicRosterEntryResponseStatusEnum.Inactive,
        page: 2,
        size: 40,
      })
      .subscribe((page) => {
        result = page;
      });

    // SDK 0.11 signature: listMechanics(status, skillCode, page, size, sort).
    // Argument order is the whole contract here — a page number landing in the
    // skillCode slot would silently return the unfiltered first page.
    expect(mechanicRosterApiStub.listMechanics).toHaveBeenCalledWith(
      MechanicRosterEntryResponseStatusEnum.Inactive,
      undefined,
      2,
      40,
    );
    expect(result).toBe(samplePage);
  });

  it('forwards each roster status unchanged', () => {
    for (const status of [
      MechanicRosterEntryResponseStatusEnum.Active,
      MechanicRosterEntryResponseStatusEnum.Inactive,
      MechanicRosterEntryResponseStatusEnum.OnLeave,
    ]) {
      service.listMechanics({ status, page: 0, size: 20 }).subscribe();

      expect(mechanicRosterApiStub.listMechanics).toHaveBeenLastCalledWith(status, undefined, 0, 20);
    }
  });
});
