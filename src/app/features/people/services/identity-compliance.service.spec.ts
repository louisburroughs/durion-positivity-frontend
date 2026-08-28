import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  InactivePersonActiveUserResponsePersonStatusEnum,
  PeopleComplianceAPIService,
} from '@durion-sdk/people';
import { IdentityComplianceService } from './identity-compliance.service';
import { IdentityComplianceFinding } from '../models/identity-compliance.models';

describe('IdentityComplianceService', () => {
  let service: IdentityComplianceService;

  const complianceSdkStub = {
    listInactivePersonActiveUsers: vi.fn(),
  };

  const finding: IdentityComplianceFinding = {
    linkId: '01960012-0000-7000-8000-000000000001',
    username: 'jdoe',
    personId: '01960011-0000-7000-8000-000000000001',
    personStatus: InactivePersonActiveUserResponsePersonStatusEnum.Disabled,
    personStatusEffectiveAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        IdentityComplianceService,
        { provide: PeopleComplianceAPIService, useValue: complianceSdkStub },
      ],
    });
    service = TestBed.inject(IdentityComplianceService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls the SDK compliance endpoint', () => {
    complianceSdkStub.listInactivePersonActiveUsers.mockReturnValue(of([finding]));

    service.findActiveUsersForInactivePersons().subscribe(res => {
      expect(res).toEqual([finding]);
    });

    expect(complianceSdkStub.listInactivePersonActiveUsers).toHaveBeenCalledTimes(1);
  });

  it('passes through an empty (compliant) result', () => {
    complianceSdkStub.listInactivePersonActiveUsers.mockReturnValue(of([]));

    service.findActiveUsersForInactivePersons().subscribe(res => {
      expect(res).toEqual([]);
    });
  });
});
