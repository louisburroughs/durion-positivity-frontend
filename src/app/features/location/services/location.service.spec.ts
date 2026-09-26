import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ProductsAPIService } from '@durion-sdk/catalog';
import type { ServiceDto } from '@durion-sdk/catalog';
import {
  BayAPIService,
  LocationAPIService,
  MobileUnitAPIService,
  SiteDefaultsAPIService,
  StorageLocationAPIService,
} from '@durion-sdk/location';
import type { BayRequest, BayResponse } from '@durion-sdk/location';
import { LocationService } from './location.service';

const bayResponse = (overrides: Partial<BayResponse> = {}): BayResponse => ({
  id: 'bay-1',
  locationId: 'loc-01',
  name: 'Bay 01',
  bayType: 'GENERAL_SERVICE',
  status: 'ACTIVE',
  maxConcurrentVehicles: 1,
  serviceCapabilityCodes: [],
  ...overrides,
});

const catalogService = (overrides: Partial<ServiceDto> = {}): ServiceDto => ({
  id: 'svc-1',
  name: 'Wheel alignment, 4-wheel',
  operationCode: 'WHEEL-ALIGNMENT-4-WHEEL',
  ...overrides,
});

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
  const catalogProductsApiStub = {
    searchCatalogServices: vi.fn(),
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
        { provide: ProductsAPIService, useValue: catalogProductsApiStub },
      ],
    });
    service = TestBed.inject(LocationService);
  });

  it('maps replaceCoverageRules into a typed rules envelope instead of forwarding raw arrays', () => {
    mobileUnitApiStub.replaceCoverageRules.mockReturnValueOnce(of({ success: true }));

    service.replaceCoverageRules('mu-001', [
      {
        serviceAreaId: 'svc-1',
        ruleType: 'DISTANCE_TIER',
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
          ruleType: 'DISTANCE_TIER',
          priority: 1,
          validFrom: '2026-04-01',
          validTo: '2026-04-30',
          maxDistance: 25,
        },
      ],
    });
  });

  it('matches mobile-unit status and coverage rule type case-insensitively, as the contract does', () => {
    mobileUnitApiStub.createMobileUnit.mockReturnValueOnce(of({ id: 'mu-001' }));

    service.createMobileUnit({
      name: 'Truck 1',
      baseLocationId: 'loc-01',
      status: ' active ',
      coverageRules: [{ serviceAreaId: 'svc-1', ruleType: 'distance_tier', priority: 1 }],
    }).subscribe();

    expect(mobileUnitApiStub.createMobileUnit).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ACTIVE',
        coverageRules: [expect.objectContaining({ ruleType: 'DISTANCE_TIER' })],
      }),
    );
  });

  it('sends a coverage rule type pos-location does not accept as a service-area rule', () => {
    mobileUnitApiStub.replaceCoverageRules.mockReturnValueOnce(of([]));

    service.replaceCoverageRules('mu-001', [{ serviceAreaId: 'svc-1', ruleType: 'PRIMARY', priority: 1 }]).subscribe();

    expect(mobileUnitApiStub.replaceCoverageRules).toHaveBeenCalledWith('mu-001', {
      rules: [
        {
          serviceAreaId: 'svc-1',
          ruleType: 'SERVICE_AREA',
          priority: 1,
          validFrom: undefined,
          validTo: undefined,
          maxDistance: undefined,
        },
      ],
    });
  });

  it('reads one 500-row page of bays, every status, and unwraps its content (EXEMPLARS §4)', () => {
    const bay = bayResponse();
    bayApiStub.listBays.mockReturnValueOnce(of({ content: [bay], totalElements: 1 }));

    let result: BayResponse[] | undefined;
    service.listBays('loc-01').subscribe(r => (result = r));

    // No status filter: an out-of-service bay must still show on the setup page.
    expect(bayApiStub.listBays).toHaveBeenCalledWith('loc-01', undefined, undefined, 0, 500);
    expect(result).toEqual([bay]);
  });

  it('reads a page with no content as no bays', () => {
    bayApiStub.listBays.mockReturnValueOnce(of({}));
    let result: BayResponse[] | undefined;
    service.listBays('loc-01').subscribe(r => (result = r));
    expect(result).toEqual([]);
  });

  it('unwraps the Spring page content array from listMobileUnits', () => {
    const unit = { id: 'mu-1', name: 'Truck 1' };
    mobileUnitApiStub.listMobileUnits.mockReturnValueOnce(of({ content: [unit], totalElements: 1 }));

    let result: unknown[] | undefined;
    service.listMobileUnits().subscribe(r => (result = r));

    expect(result).toEqual([unit]);
  });

  it('returns an empty mobile-unit list for a missing page body', () => {
    mobileUnitApiStub.listMobileUnits.mockReturnValueOnce(of({}));
    let asEmpty: unknown[] | undefined;
    service.listMobileUnits().subscribe(r => (asEmpty = r));
    expect(asEmpty).toEqual([]);
  });

  it('sends a bay create request exactly as given (CAP-325)', () => {
    const request: BayRequest = {
      name: 'Rack 1',
      bayType: 'ALIGNMENT',
      capacity: { maxConcurrentVehicles: 1 },
      serviceCapabilityCodes: ['WHEEL-ALIGNMENT-4-WHEEL'],
      maxDutyClass: 3,
      status: 'ACTIVE',
    };
    bayApiStub.createBay.mockReturnValueOnce(of(bayResponse({ name: 'Rack 1' })));

    service.createBay('loc-01', request).subscribe();

    expect(bayApiStub.createBay).toHaveBeenCalledWith('loc-01', request);
  });

  it('sends a bay patch to the bay it names', () => {
    bayApiStub.patchBay.mockReturnValueOnce(of(bayResponse({ status: 'OUT_OF_SERVICE' })));

    service.patchBay('loc-01', 'bay-1', { status: 'OUT_OF_SERVICE' }).subscribe();

    expect(bayApiStub.patchBay).toHaveBeenCalledWith('loc-01', 'bay-1', { status: 'OUT_OF_SERVICE' });
  });

  describe('searchClaimableServices', () => {
    it('does not call the catalog for a blank query', () => {
      let result: { services: unknown[]; ok: boolean } | undefined;
      service.searchClaimableServices('   ').subscribe(r => (result = r));

      expect(catalogProductsApiStub.searchCatalogServices).not.toHaveBeenCalled();
      expect(result).toEqual({ services: [], ok: true });
    });

    it('searches by the trimmed name and keeps only services with an operation code', () => {
      catalogProductsApiStub.searchCatalogServices.mockReturnValueOnce(
        of([
          catalogService({ operationCategory: undefined }),
          catalogService({ id: 'svc-2', name: 'Loose note', operationCode: '  ' }),
          catalogService({ id: 'svc-3', name: undefined, operationCode: 'TIRE-ROTATION' }),
        ]),
      );

      let result: { services: unknown[]; ok: boolean } | undefined;
      service.searchClaimableServices('  align ').subscribe(r => (result = r));

      expect(catalogProductsApiStub.searchCatalogServices).toHaveBeenCalledWith('align', 20);
      expect(result).toEqual({
        ok: true,
        services: [
          { operationCode: 'WHEEL-ALIGNMENT-4-WHEEL', name: 'Wheel alignment, 4-wheel', operationCategory: null },
          // A nameless service falls back to its business code, never its id.
          { operationCode: 'TIRE-ROTATION', name: 'TIRE-ROTATION', operationCategory: null },
        ],
      });
    });

    it('reports a failed search as not ok rather than as no matches', () => {
      catalogProductsApiStub.searchCatalogServices.mockReturnValueOnce(throwError(() => new Error('down')));

      let result: { services: unknown[]; ok: boolean } | undefined;
      service.searchClaimableServices('align').subscribe(r => (result = r));

      expect(result).toEqual({ services: [], ok: false });
    });
  });

  it('sends a mobile unit\'s serviceCapabilityCodes as given (CAP-325 D14.2)', () => {
    mobileUnitApiStub.createMobileUnit.mockReturnValueOnce(of({ mobileUnitId: 'mu-002' }));

    service.createMobileUnit({
      name: 'Van 7',
      baseLocationId: 'loc-01',
      status: 'INACTIVE',
      serviceCapabilityCodes: ['OIL-CHANGE-FULL-SYNTHETIC', 'BATTERY-REPLACEMENT'],
    }).subscribe();

    expect(mobileUnitApiStub.createMobileUnit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Van 7',
        serviceCapabilityCodes: ['OIL-CHANGE-FULL-SYNTHETIC', 'BATTERY-REPLACEMENT'],
      }),
    );
  });

  it('maps mobile-unit coverageRules through the typed request mapper', () => {
    mobileUnitApiStub.createMobileUnit.mockReturnValueOnce(of({ mobileUnitId: 'mu-001' }));

    service.createMobileUnit({
      name: 'Truck 1',
      baseLocationId: 'loc-01',
      status: 'paused',
      coverageRules: [
        {
          serviceAreaId: 'svc-1',
          ruleType: 'SERVICE_AREA',
          priority: 1,
          maxDistance: 30,
        },
      ],
    }).subscribe();

    // A status pos-location doesn't accept is left out, so it defaults the unit to INACTIVE.
    expect(mobileUnitApiStub.createMobileUnit).toHaveBeenCalledWith({
      name: 'Truck 1',
      baseLocationId: 'loc-01',
      status: undefined,
      travelBufferPolicyId: undefined,
      notes: undefined,
      serviceCapabilityCodes: undefined,
      coverageRules: [
        {
          serviceAreaId: 'svc-1',
          ruleType: 'SERVICE_AREA',
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
