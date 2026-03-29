import { TestBed } from '@angular/core/testing';
import { HttpParams } from '@angular/common/http';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { ProductLocationService } from './product-location.service';

describe('ProductLocationService', () => {
  let service: ProductLocationService;

  const apiStub = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ProductLocationService,
        { provide: ApiBaseService, useValue: apiStub },
      ],
    });
    service = TestBed.inject(ProductLocationService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── getRoster() ──────────────────────────────────────────────────────────────

  describe('getRoster()', () => {
    it('calls GET /location/v1/roster', () => {
      apiStub.get.mockReturnValueOnce(of([]));

      service.getRoster().subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/location/v1/roster');
    });

    it('includes status param when filter is provided', () => {
      apiStub.get.mockReturnValueOnce(of([]));

      service.getRoster({ status: 'ACTIVE' }).subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect((params as HttpParams).get('status')).toBe('ACTIVE');
    });

    it('does NOT include status param when filter is omitted', () => {
      apiStub.get.mockReturnValueOnce(of([]));

      service.getRoster().subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect((params as HttpParams).has('status')).toBe(false);
    });

    it('does NOT include status param when filter.status is undefined', () => {
      apiStub.get.mockReturnValueOnce(of([]));

      service.getRoster({}).subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect((params as HttpParams).has('status')).toBe(false);
    });
  });

  // ── validateLocation() ───────────────────────────────────────────────────────

  describe('validateLocation()', () => {
    it('calls POST /location/v1/locations/{id}/validate', () => {
      const result = { locationId: 'loc-01', valid: true, errors: [], validatedAt: '2026-03-01T00:00:00Z' };
      apiStub.post.mockReturnValueOnce(of(result));

      service.validateLocation('loc-01').subscribe();

      const [path] = apiStub.post.mock.calls[0];
      expect(path).toBe('/location/v1/locations/loc-01/validate');
    });

    it('URL-encodes the location ID', () => {
      apiStub.post.mockReturnValueOnce(of({}));

      service.validateLocation('loc/01').subscribe();

      const [path] = apiStub.post.mock.calls[0];
      expect(path).toBe('/location/v1/locations/loc%2F01/validate');
    });

    it('returns the validation result', () => {
      const result = { locationId: 'loc-01', valid: false, errors: ['address missing'], validatedAt: '2026-03-01T00:00:00Z' };
      apiStub.post.mockReturnValueOnce(of(result));

      let observed: unknown;
      service.validateLocation('loc-01').subscribe(r => (observed = r));

      expect(observed).toEqual(result);
    });
  });

  // ── getAllLocations() ─────────────────────────────────────────────────────────

  describe('getAllLocations()', () => {
    it('calls GET /location/v1/locations', () => {
      apiStub.get.mockReturnValueOnce(of([]));

      service.getAllLocations().subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/location/v1/locations');
    });
  });
});
