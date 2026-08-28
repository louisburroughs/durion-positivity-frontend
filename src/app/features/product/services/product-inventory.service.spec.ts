import { TestBed } from '@angular/core/testing';
import { HttpParams } from '@angular/common/http';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { InventoryAvailabilityService } from '@durion-sdk/inventory';
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

  const availSdkStub = { listAvailabilityBySku: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ProductInventoryService,
        { provide: ApiBaseService, useValue: apiStub },
        { provide: InventoryAvailabilityService, useValue: availSdkStub },
      ],
    });
    service = TestBed.inject(ProductInventoryService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── queryInventoryAvailability() ─────────────────────────────────────────────

  describe('queryInventoryAvailability()', () => {
    it('calls availSdk.getInventoryAvailability with the sku', () => {
      availSdkStub.listAvailabilityBySku.mockReturnValueOnce(of({ sku: 'SKU-001', totalOnHand: 5, totalReserved: 0, totalAtp: 5, locationBreakdown: [] }));

      service.queryInventoryAvailability('SKU-001').subscribe();

      expect(availSdkStub.listAvailabilityBySku).toHaveBeenCalledWith('SKU-001');
    });

    it('passes only the sku to the SDK even when locationId is provided', () => {
      availSdkStub.listAvailabilityBySku.mockReturnValueOnce(of({ sku: 'SKU-002', totalOnHand: 2, totalReserved: 0, totalAtp: 2, locationBreakdown: [] }));

      service.queryInventoryAvailability('SKU-002', 'loc-01').subscribe();

      expect(availSdkStub.listAvailabilityBySku).toHaveBeenCalledWith('SKU-002');
    });

    it('filters list-based SDK responses to the requested location and recomputes totals', () => {
      availSdkStub.listAvailabilityBySku.mockReturnValueOnce(of([
        { locationId: 'loc-01', locationName: 'North', onHandQuantity: 2, availableToPromiseQuantity: 1 },
        { locationId: 'loc-02', locationName: 'South', onHandQuantity: 5, availableToPromiseQuantity: 4 },
      ]));

      let result;
      service.queryInventoryAvailability('SKU-002', 'loc-02').subscribe(value => {
        result = value;
      });

      expect(result).toEqual({
        sku: 'SKU-002',
        totalOnHand: 5,
        totalReserved: 0,
        totalAtp: 4,
        locationBreakdown: [
          { locationId: 'loc-02', locationName: 'South', onHand: 5, reserved: 0, atp: 4 },
        ],
      });
    });

    it('filters aggregated SDK responses to the requested location and preserves matching rows only', () => {
      availSdkStub.listAvailabilityBySku.mockReturnValueOnce(of({
        sku: 'SKU-002',
        totalOnHand: 7,
        totalReserved: 1,
        totalAtp: 6,
        locationBreakdown: [
          { locationId: 'loc-01', locationName: 'North', onHand: 2, reserved: 1, atp: 1 },
          { locationId: 'loc-02', locationName: 'South', onHand: 5, reserved: 0, atp: 5 },
        ],
      }));

      let result;
      service.queryInventoryAvailability('SKU-002', 'loc-01').subscribe(value => {
        result = value;
      });

      expect(result).toEqual({
        sku: 'SKU-002',
        totalOnHand: 2,
        totalReserved: 1,
        totalAtp: 1,
        locationBreakdown: [
          { locationId: 'loc-01', locationName: 'North', onHand: 2, reserved: 1, atp: 1 },
        ],
      });
    });

    it('does NOT pass locationId to the SDK when omitted', () => {
      availSdkStub.listAvailabilityBySku.mockReturnValueOnce(of({ sku: 'SKU-003', totalOnHand: 0, totalReserved: 0, totalAtp: 0, locationBreakdown: [] }));

      service.queryInventoryAvailability('SKU-003').subscribe();

      expect(availSdkStub.listAvailabilityBySku).toHaveBeenCalledWith('SKU-003');
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
