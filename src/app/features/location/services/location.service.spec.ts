import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  BayAPIService,
  LocationAPIService,
  MobileUnitAPIService,
  SiteDefaultsAPIService,
  StorageLocationAPIService,
} from '@durion-sdk/location';
import { LocationService } from './location.service';

describe('LocationService', () => {
  let service: LocationService;

  const locationApiStub = {
    createLocation: vi.fn(),
    getAllLocations: vi.fn(),
    getLocationById: vi.fn(),
    patchLocation: vi.fn(),
    updateLocation: vi.fn(),
  };
  const bayApiStub = {
    listBays: vi.fn(),
    createBay: vi.fn(),
    getBay: vi.fn(),
    patchBay: vi.fn(),
  };
  const mobileUnitApiStub = {
    listMobileUnits: vi.fn(),
    createMobileUnit: vi.fn(),
    replaceCoverageRules: vi.fn(),
  };
  const siteDefaultsApiStub = {
    getDefaults: vi.fn(),
    configureDefaults: vi.fn(),
  };
  const storageLocationApiStub = {
    list2: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        LocationService,
        { provide: LocationAPIService, useValue: locationApiStub },
        { provide: BayAPIService, useValue: bayApiStub },
        { provide: MobileUnitAPIService, useValue: mobileUnitApiStub },
        { provide: SiteDefaultsAPIService, useValue: siteDefaultsApiStub },
        { provide: StorageLocationAPIService, useValue: storageLocationApiStub },
      ],
    });
    service = TestBed.inject(LocationService);
  });

  it('maps replaceCoverageRules into a typed rules envelope instead of forwarding raw arrays', () => {
    mobileUnitApiStub.replaceCoverageRules.mockReturnValueOnce(of({ success: true }));

    service.replaceCoverageRules('mu-001', [
      {
        serviceAreaId: 'svc-1',
        ruleType: 'PRIMARY',
        priority: 1,
        validFrom: '2026-04-01',
        validTo: '2026-04-30',
        maxDistance: 25,
      },
    ]).subscribe();

    expect(mobileUnitApiStub.replaceCoverageRules).toHaveBeenCalledWith('mu-001', {
      rules: [
        {
          serviceAreaId: 'svc-1',
          ruleType: 'PRIMARY',
          priority: 1,
          validFrom: '2026-04-01',
          validTo: '2026-04-30',
          maxDistance: 25,
        },
      ],
    });
  });

  it('maps mobile-unit coverageRules through the typed request mapper', () => {
    mobileUnitApiStub.createMobileUnit.mockReturnValueOnce(of({ mobileUnitId: 'mu-001' }));

    service.createMobileUnit({
      name: 'Truck 1',
      baseLocationId: 'loc-01',
      coverageRules: [
        {
          serviceAreaId: 'svc-1',
          ruleType: 'PRIMARY',
          priority: 1,
          maxDistance: 30,
        },
      ],
    }).subscribe();

    expect(mobileUnitApiStub.createMobileUnit).toHaveBeenCalledWith({
      name: 'Truck 1',
      baseLocationId: 'loc-01',
      status: undefined,
      travelBufferPolicyId: undefined,
      notes: undefined,
      capabilityIds: undefined,
      coverageRules: [
        {
          serviceAreaId: 'svc-1',
          ruleType: 'PRIMARY',
          priority: 1,
          validFrom: undefined,
          validTo: undefined,
          maxDistance: 30,
        },
      ],
    });
  });
});
