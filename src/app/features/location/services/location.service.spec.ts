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
    listLocations: vi.fn(),
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
    getSiteDefaults: vi.fn(),
    configureSiteDefaults: vi.fn(),
  };
  const storageLocationApiStub = {
    listStorageLocations: vi.fn(),
    createStorageLocation: vi.fn(),
    patchStorageLocation: vi.fn(),
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

  it('unwraps the Spring page content array from listBays', () => {
    const bay = { id: 'bay-1', name: 'Bay 01' };
    bayApiStub.listBays.mockReturnValueOnce(of({ content: [bay], totalElements: 1 }));

    let result: unknown[] | undefined;
    service.listBays('loc-01').subscribe(r => (result = r));

    expect(result).toEqual([bay]);
  });

  it('unwraps the Spring page content array from listMobileUnits', () => {
    const unit = { id: 'mu-1', name: 'Truck 1' };
    mobileUnitApiStub.listMobileUnits.mockReturnValueOnce(of({ content: [unit], totalElements: 1 }));

    let result: unknown[] | undefined;
    service.listMobileUnits().subscribe(r => (result = r));

    expect(result).toEqual([unit]);
  });

  it('returns a bare array unchanged and empty for a missing page body', () => {
    bayApiStub.listBays.mockReturnValueOnce(of([{ id: 'bay-1' }]));
    let asArray: unknown[] | undefined;
    service.listBays('loc-01').subscribe(r => (asArray = r));
    expect(asArray).toEqual([{ id: 'bay-1' }]);

    mobileUnitApiStub.listMobileUnits.mockReturnValueOnce(of({}));
    let asEmpty: unknown[] | undefined;
    service.listMobileUnits().subscribe(r => (asEmpty = r));
    expect(asEmpty).toEqual([]);
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
  // ── SDK delegation (ADR-0035 minimum coverage for migrated methods) ────────

  describe('getAllLocations()', () => {
    it('delegates to LocationAPIService.listLocations and emits the response', () => {
      const locations = [{ locationId: 'loc-1', name: 'Main' }];
      locationApiStub.listLocations.mockReturnValueOnce(of(locations));

      let result: unknown[] | undefined;
      service.getAllLocations().subscribe(r => (result = r));

      expect(locationApiStub.listLocations).toHaveBeenCalledWith();
      expect(result).toEqual(locations);
    });
  });

  describe('getLocationDefaults()', () => {
    it('delegates to SiteDefaultsAPIService.getSiteDefaults with the locationId', () => {
      siteDefaultsApiStub.getSiteDefaults.mockReturnValueOnce(of({ taxRate: 7 }));

      let result: unknown;
      service.getLocationDefaults('loc-1').subscribe(r => (result = r));

      expect(siteDefaultsApiStub.getSiteDefaults).toHaveBeenCalledWith('loc-1');
      expect(result).toEqual({ taxRate: 7 });
    });
  });

  describe('configureLocationDefaults()', () => {
    it('forwards the body to SiteDefaultsAPIService.configureSiteDefaults', () => {
      siteDefaultsApiStub.configureSiteDefaults.mockReturnValueOnce(of(undefined));

      service.configureLocationDefaults('loc-1', { taxRate: 8 }).subscribe();

      expect(siteDefaultsApiStub.configureSiteDefaults).toHaveBeenCalledWith('loc-1', { taxRate: 8 });
    });
  });

  describe('listStorageLocations()', () => {
    it('passes siteId, status and paging as the SDK positional parameters', () => {
      storageLocationApiStub.listStorageLocations.mockReturnValueOnce(of({ content: [] }));

      service.listStorageLocations('site-1', { status: 'ACTIVE', pageIndex: 2, pageSize: 50 }).subscribe();

      expect(storageLocationApiStub.listStorageLocations).toHaveBeenCalledWith(
        'site-1',
        undefined,
        'ACTIVE',
        2,
        50,
      );
    });

    it('omits status and paging when no params are supplied', () => {
      storageLocationApiStub.listStorageLocations.mockReturnValueOnce(of({ content: [] }));

      service.listStorageLocations('site-1').subscribe();

      expect(storageLocationApiStub.listStorageLocations).toHaveBeenCalledWith(
        'site-1',
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });
  });

  describe('createStorageLocation()', () => {
    it('maps the loose body into a typed StorageLocationRequest', () => {
      storageLocationApiStub.createStorageLocation.mockReturnValueOnce(of({ id: 'sl-1' }));

      service.createStorageLocation('site-1', {
        name: 'Bin A',
        type: 'BIN',
        barcode: 'BC-1',
        parentStorageLocationId: 'sl-parent',
      }).subscribe();

      expect(storageLocationApiStub.createStorageLocation).toHaveBeenCalledWith('site-1', {
        name: 'Bin A',
        type: 'BIN',
        barcode: 'BC-1',
        parentStorageLocationId: 'sl-parent',
      });
    });
  });

  describe('deactivateStorageLocation()', () => {
    it('patches status to INACTIVE and forwards the relocation destination', () => {
      storageLocationApiStub.patchStorageLocation.mockReturnValueOnce(of(undefined));

      service.deactivateStorageLocation('site-1', 'sl-1', {
        destinationStorageLocationId: 'sl-2',
      }).subscribe();

      expect(storageLocationApiStub.patchStorageLocation).toHaveBeenCalledWith('site-1', 'sl-1', {
        status: 'INACTIVE',
        destinationStorageLocationId: 'sl-2',
      });
    });
  });
});
