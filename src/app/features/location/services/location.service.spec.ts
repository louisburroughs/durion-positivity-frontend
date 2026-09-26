import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ProductsAPIService } from '@durion-sdk/catalog';
import type { ServiceDto } from '@durion-sdk/catalog';
import {
  BayAPIService,
  CoverageRuleRequestRuleTypeEnum,
  CoverageRuleResponseRuleTypeEnum,
  MobileUnitRequestStatusEnum,
  MobileUnitResponseStatusEnum,
  LocationAPIService,
  MobileUnitAPIService,
  MobileUnitEligibilityControllerService,
  ServiceAreaAPIService,
  SiteDefaultsAPIService,
  StorageLocationAPIService,
  TravelBufferPolicyAPIService,
} from '@durion-sdk/location';
import type {
  BayRequest,
  BayResponse,
  CoverageRuleRequest,
  CoverageRuleResponse,
  MobileUnitResponse,
  ServiceAreaResponse,
  TravelBufferPolicyResponse,
} from '@durion-sdk/location';
import { LocationService, MobileUnitsRead } from './location.service';

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

const mobileUnit = (overrides: Partial<MobileUnitResponse> = {}): MobileUnitResponse => ({
  id: 'mu-1',
  name: 'Van 7',
  baseLocationId: 'loc-01',
  status: MobileUnitResponseStatusEnum.Inactive,
  serviceCapabilityCodes: [],
  ...overrides,
});

const coverageRule = (overrides: Partial<CoverageRuleResponse> = {}): CoverageRuleResponse => ({
  id: 'rule-1',
  mobileUnitId: 'mu-1',
  serviceAreaId: 'area-1',
  ruleType: CoverageRuleResponseRuleTypeEnum.ServiceArea,
  priority: 1,
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
    patchMobileUnit: vi.fn(),
    replaceCoverageRules: vi.fn(),
  };
  const eligibilityApiStub = { findEligibleMobileUnits: vi.fn() };
  const serviceAreaApiStub = {
    listServiceAreas: vi.fn(),
    createServiceArea: vi.fn(),
    patchServiceArea: vi.fn(),
    replaceServiceAreaPostalCodes: vi.fn(),
  };
  const travelBufferPolicyApiStub = {
    listTravelBufferPolicies: vi.fn(),
    createTravelBufferPolicy: vi.fn(),
    patchTravelBufferPolicy: vi.fn(),
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
        { provide: MobileUnitEligibilityControllerService, useValue: eligibilityApiStub },
        { provide: ServiceAreaAPIService, useValue: serviceAreaApiStub },
        { provide: TravelBufferPolicyAPIService, useValue: travelBufferPolicyApiStub },
        { provide: SiteDefaultsAPIService, useValue: siteDefaultsApiStub },
        { provide: StorageLocationAPIService, useValue: storageLocationApiStub },
        { provide: ProductsAPIService, useValue: catalogProductsApiStub },
      ],
    });
    service = TestBed.inject(LocationService);
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

  describe('mobile units', () => {
    it("reads one shop's units and their coverage rules in one request", () => {
      const rules = [coverageRule()];
      mobileUnitApiStub.listMobileUnits.mockReturnValueOnce(
        of({ content: [mobileUnit({ coverageRules: rules }), mobileUnit({ id: 'mu-2', coverageRules: [] })] }),
      );

      let read: MobileUnitsRead | undefined;
      service.listMobileUnits('loc-01').subscribe(r => (read = r));

      expect(mobileUnitApiStub.listMobileUnits).toHaveBeenCalledWith(0, 500, 'loc-01', undefined, ['coverageRules']);
      expect(read?.units.map(unit => unit.id)).toEqual(['mu-1', 'mu-2']);
      expect([...read!.coverage]).toEqual([
        ['mu-1', rules],
        ['mu-2', []],
      ]);
      expect(read?.coverageOk).toBe(true);
    });

    it('marks coverage unread when a unit comes back without its rules', () => {
      mobileUnitApiStub.listMobileUnits.mockReturnValueOnce(of({ content: [mobileUnit()] }));
      let read: MobileUnitsRead | undefined;
      service.listMobileUnits('loc-01').subscribe(r => (read = r));
      expect(read?.coverage.size).toBe(0);
      expect(read?.coverageOk).toBe(false);
    });

    it('reads a page with no content as no units', () => {
      mobileUnitApiStub.listMobileUnits.mockReturnValueOnce(of({}));
      let read: MobileUnitsRead | undefined;
      service.listMobileUnits('loc-01').subscribe(r => (read = r));
      expect(read).toEqual({ units: [], coverage: new Map(), coverageOk: true });
    });

    it('creates and patches a unit with the request as given', () => {
      mobileUnitApiStub.createMobileUnit.mockReturnValueOnce(of(mobileUnit()));
      mobileUnitApiStub.patchMobileUnit.mockReturnValueOnce(of(mobileUnit({ status: MobileUnitResponseStatusEnum.Active })));

      service
        .createMobileUnit({ name: 'Van 7', baseLocationId: 'loc-01', status: MobileUnitRequestStatusEnum.Inactive, serviceCapabilityCodes: ['TPMS-SENSOR-SERVICE'] })
        .subscribe();
      service.patchMobileUnit('mu-1', { status: 'ACTIVE' }).subscribe();

      expect(mobileUnitApiStub.createMobileUnit).toHaveBeenCalledWith({
        name: 'Van 7',
        baseLocationId: 'loc-01',
        status: 'INACTIVE',
        serviceCapabilityCodes: ['TPMS-SENSOR-SERVICE'],
      });
      expect(mobileUnitApiStub.patchMobileUnit).toHaveBeenCalledWith('mu-1', { status: 'ACTIVE' });
    });

    it('wraps replacement coverage rules in the { rules } envelope', () => {
      const rules: CoverageRuleRequest[] = [{ serviceAreaId: 'area-1', ruleType: CoverageRuleRequestRuleTypeEnum.ServiceArea, priority: 1 }];
      mobileUnitApiStub.replaceCoverageRules.mockReturnValueOnce(of([coverageRule()]));

      let saved: CoverageRuleResponse[] | undefined;
      service.replaceCoverageRules('mu-1', rules).subscribe(r => (saved = r));

      expect(mobileUnitApiStub.replaceCoverageRules).toHaveBeenCalledWith('mu-1', { rules });
      expect(saved).toEqual([coverageRule()]);
    });

    it('checks eligibility with the postal code, country and instant as positional args', () => {
      eligibilityApiStub.findEligibleMobileUnits.mockReturnValueOnce(of([]));
      service.findEligibleMobileUnits('78701', 'US', '2026-10-01T12:00:00Z').subscribe();
      expect(eligibilityApiStub.findEligibleMobileUnits).toHaveBeenCalledWith('78701', 'US', '2026-10-01T12:00:00Z');
    });

    it('degrades the service-area and policy reads to empty, not ok', () => {
      serviceAreaApiStub.listServiceAreas.mockReturnValueOnce(throwError(() => new Error('403')));
      travelBufferPolicyApiStub.listTravelBufferPolicies.mockReturnValueOnce(
        of([{ id: 'p-1', name: 'Standard', bufferType: 'FLAT_MINUTES', bufferValue: 15 } satisfies TravelBufferPolicyResponse]),
      );

      let areas: { areas: ServiceAreaResponse[]; ok: boolean } | undefined;
      let policies: { policies: TravelBufferPolicyResponse[]; ok: boolean } | undefined;
      service.listServiceAreas().subscribe(r => (areas = r));
      service.listTravelBufferPolicies().subscribe(r => (policies = r));

      expect(areas).toEqual({ areas: [], ok: false });
      expect(policies?.ok).toBe(true);
      expect(policies?.policies.map(p => p.name)).toEqual(['Standard']);
    });
  });

  describe('service areas and travel buffer policies', () => {
    it('sends service-area writes to the SDK as given, wrapping postal codes in their envelope', () => {
      const area: ServiceAreaResponse = { id: 'area-1', name: 'North' };
      serviceAreaApiStub.createServiceArea.mockReturnValueOnce(of(area));
      serviceAreaApiStub.patchServiceArea.mockReturnValueOnce(of(area));
      serviceAreaApiStub.replaceServiceAreaPostalCodes.mockReturnValueOnce(of(area));
      const postalCodes = [{ postalCode: '78701', countryCode: 'US' }];

      service.createServiceArea({ name: 'North', active: true, postalCodes }).subscribe();
      service.patchServiceArea('area-1', { active: false }).subscribe();
      service.replaceServiceAreaPostalCodes('area-1', postalCodes).subscribe();

      expect(serviceAreaApiStub.createServiceArea).toHaveBeenCalledWith({ name: 'North', active: true, postalCodes });
      expect(serviceAreaApiStub.patchServiceArea).toHaveBeenCalledWith('area-1', { active: false });
      expect(serviceAreaApiStub.replaceServiceAreaPostalCodes).toHaveBeenCalledWith('area-1', { postalCodes });
    });

    it('sends travel-buffer-policy writes to the SDK as given', () => {
      const policy: TravelBufferPolicyResponse = { id: 'p-1', name: 'Standard' };
      travelBufferPolicyApiStub.createTravelBufferPolicy.mockReturnValueOnce(of(policy));
      travelBufferPolicyApiStub.patchTravelBufferPolicy.mockReturnValueOnce(of(policy));

      service.createTravelBufferPolicy({ name: 'Standard', bufferType: 'FLAT_MINUTES', bufferValue: 15 }).subscribe();
      service.patchTravelBufferPolicy('p-1', { bufferValue: null }).subscribe();

      expect(travelBufferPolicyApiStub.createTravelBufferPolicy).toHaveBeenCalledWith({
        name: 'Standard',
        bufferType: 'FLAT_MINUTES',
        bufferValue: 15,
      });
      expect(travelBufferPolicyApiStub.patchTravelBufferPolicy).toHaveBeenCalledWith('p-1', { bufferValue: null });
    });
  });

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
