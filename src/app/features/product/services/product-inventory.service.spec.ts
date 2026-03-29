import { TestBed } from '@angular/core/testing';
import { HttpParams } from '@angular/common/http';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { ProductInventoryService } from './product-inventory.service';

describe('ProductInventoryService', () => {
  let service: ProductInventoryService;

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
        ProductInventoryService,
        { provide: ApiBaseService, useValue: apiStub },
      ],
    });
    service = TestBed.inject(ProductInventoryService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── queryInventoryAvailability() ─────────────────────────────────────────────

  describe('queryInventoryAvailability()', () => {
    it('calls GET /inventory/v1/availability with sku param', () => {
      apiStub.get.mockReturnValueOnce(of({ sku: 'SKU-001', totalOnHand: 5, totalReserved: 0, totalAtp: 5, locationBreakdown: [] }));

      service.queryInventoryAvailability('SKU-001').subscribe();

      const [path, params] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/availability');
      expect((params as HttpParams).get('sku')).toBe('SKU-001');
    });

    it('includes locationId param when provided', () => {
      apiStub.get.mockReturnValueOnce(of({ sku: 'SKU-002', totalOnHand: 2, totalReserved: 0, totalAtp: 2, locationBreakdown: [] }));

      service.queryInventoryAvailability('SKU-002', 'loc-01').subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect((params as HttpParams).get('locationId')).toBe('loc-01');
    });

    it('does NOT include locationId param when omitted', () => {
      apiStub.get.mockReturnValueOnce(of({ sku: 'SKU-003', totalOnHand: 0, totalReserved: 0, totalAtp: 0, locationBreakdown: [] }));

      service.queryInventoryAvailability('SKU-003').subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect((params as HttpParams).has('locationId')).toBe(false);
    });
  });

  // ── queryAvailabilityBySku() ─────────────────────────────────────────────────

  describe('queryAvailabilityBySku()', () => {
    it('calls GET /inventory/v1/availability/by-sku with sku and sourceType params', () => {
      apiStub.get.mockReturnValueOnce(of([]));

      service.queryAvailabilityBySku('SKU-003', 'MFR').subscribe();

      const [path, params] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/availability/by-sku');
      expect((params as HttpParams).get('sku')).toBe('SKU-003');
      expect((params as HttpParams).get('sourceType')).toBe('MFR');
    });

    it('passes DISTRIBUTOR sourceType correctly', () => {
      apiStub.get.mockReturnValueOnce(of([]));

      service.queryAvailabilityBySku('SKU-003', 'DISTRIBUTOR').subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect((params as HttpParams).get('sourceType')).toBe('DISTRIBUTOR');
    });
  });

  // ── queryLeadTime() ──────────────────────────────────────────────────────────

  describe('queryLeadTime()', () => {
    it('calls GET /inventory/v1/lead-time with sku and sourceType params', () => {
      apiStub.get.mockReturnValueOnce(of([]));

      service.queryLeadTime('SKU-004', 'DISTRIBUTOR').subscribe();

      const [path, params] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/lead-time');
      expect((params as HttpParams).get('sku')).toBe('SKU-004');
      expect((params as HttpParams).get('sourceType')).toBe('DISTRIBUTOR');
    });
  });

  // ── getLocationInventory() ───────────────────────────────────────────────────

  describe('getLocationInventory()', () => {
    it('calls GET /inventory/v1/locations/{locationId}/inventory', () => {
      apiStub.get.mockReturnValueOnce(
        of({ locationId: 'LOC-1', locationName: 'Test', onHand: 0, reserved: 0, atp: 0 }),
      );

      service.getLocationInventory('LOC-1', 'SKU-001').subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toContain('LOC-1');
      expect(path).toBe('/inventory/v1/locations/LOC-1/inventory');
    });

    it('URL-encodes the locationId', () => {
      apiStub.get.mockReturnValueOnce(
        of({ locationId: 'LOC/1', locationName: 'Test', onHand: 0, reserved: 0, atp: 0 }),
      );

      service.getLocationInventory('LOC/1', 'SKU-001').subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/locations/LOC%2F1/inventory');
    });
  });
});
