import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { LocationAPIService } from '@durion-sdk/location';
import { ProductLocationService } from './product-location.service';

describe('ProductLocationService', () => {
  let service: ProductLocationService;

  const locationSdkStub = {
    getLocationRoster: vi.fn(),
    listLocations: vi.fn(),
    validateLocation: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ProductLocationService,
        { provide: LocationAPIService, useValue: locationSdkStub },
      ],
    });
    service = TestBed.inject(ProductLocationService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── getRoster() ──────────────────────────────────────────────────────────────

  describe('getRoster()', () => {
    it('calls locationSdk.getRoster with no status when no filter provided', () => {
      locationSdkStub.getLocationRoster.mockReturnValueOnce(of([]));

      service.getRoster().subscribe();

      expect(locationSdkStub.getLocationRoster).toHaveBeenCalledWith(undefined);
    });

    it('passes status to locationSdk.getRoster when filter is provided', () => {
      locationSdkStub.getLocationRoster.mockReturnValueOnce(of([]));

      service.getRoster({ status: 'ACTIVE' }).subscribe();

      expect(locationSdkStub.getLocationRoster).toHaveBeenCalledWith('ACTIVE');
    });

    it('passes undefined status when filter is provided with no status', () => {
      locationSdkStub.getLocationRoster.mockReturnValueOnce(of([]));

      service.getRoster().subscribe();

      expect(locationSdkStub.getLocationRoster).toHaveBeenCalledWith(undefined);
    });

    it('passes undefined status when filter object has no status property', () => {
      locationSdkStub.getLocationRoster.mockReturnValueOnce(of([]));

      service.getRoster({}).subscribe();

      expect(locationSdkStub.getLocationRoster).toHaveBeenCalledWith(undefined);
    });
  });

  // ── validateLocation() ───────────────────────────────────────────────────────

  describe('validateLocation()', () => {
    it('calls locationSdk.validateLocation with the locationId', () => {
      const result = { locationId: 'loc-01', valid: true, errors: [], validatedAt: '2026-03-01T00:00:00Z' };
      locationSdkStub.validateLocation.mockReturnValueOnce(of(result));

      service.validateLocation('loc-01').subscribe();

      expect(locationSdkStub.validateLocation).toHaveBeenCalledWith('loc-01');
    });

    it('passes locationId as-is to the SDK', () => {
      locationSdkStub.validateLocation.mockReturnValueOnce(of({}));

      service.validateLocation('loc/01').subscribe();

      expect(locationSdkStub.validateLocation).toHaveBeenCalledWith('loc/01');
    });

    it('returns the validation result', () => {
      const sdkResponse = { locationId: 'loc-01', exists: false, active: false };
      locationSdkStub.validateLocation.mockReturnValueOnce(of(sdkResponse));

      let observed: unknown;
      service.validateLocation('loc-01').subscribe(r => (observed = r));

      expect(observed).toEqual({
        locationId: 'loc-01',
        valid: false,
        errors: [],
        validatedAt: '',
      });
    });
  });

  // ── getAllLocations() ─────────────────────────────────────────────────────────

  describe('getAllLocations()', () => {
    it('calls locationSdk.getAllLocations', () => {
      locationSdkStub.listLocations.mockReturnValueOnce(of([]));

      service.getAllLocations().subscribe();

      expect(locationSdkStub.listLocations).toHaveBeenCalled();
    });
  });
});
