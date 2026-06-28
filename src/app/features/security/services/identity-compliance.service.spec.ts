import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { UserPersonLinkingAPIService } from '@durion-sdk/people';
import { IdentityComplianceService } from './identity-compliance.service';
import { IdentityComplianceFinding } from '../models/identity-compliance.models';

describe('IdentityComplianceService', () => {
  let service: IdentityComplianceService;

  const linkingSdkStub = {
    findActiveUsersForInactivePersons: vi.fn(),
  };

  const finding = {
    linkId: 'link-1',
    username: 'jdoe',
    personId: 'person-1',
    personStatus: 'DISABLED',
    personStatusEffectiveAt: '2026-01-01T00:00:00Z',
  } as unknown as IdentityComplianceFinding;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        IdentityComplianceService,
        { provide: UserPersonLinkingAPIService, useValue: linkingSdkStub },
      ],
    });
    service = TestBed.inject(IdentityComplianceService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls the SDK reconcile endpoint', () => {
    linkingSdkStub.findActiveUsersForInactivePersons.mockReturnValue(of([finding]));

    service.findActiveUsersForInactivePersons().subscribe(res => {
      expect(res).toEqual([finding]);
    });

    expect(linkingSdkStub.findActiveUsersForInactivePersons).toHaveBeenCalledTimes(1);
  });

  it('passes through an empty (compliant) result', () => {
    linkingSdkStub.findActiveUsersForInactivePersons.mockReturnValue(of([]));

    service.findActiveUsersForInactivePersons().subscribe(res => {
      expect(res).toEqual([]);
    });
  });
});
