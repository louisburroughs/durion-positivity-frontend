import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { InventoryAvailabilityService, InventoryLocationsService } from '@durion-sdk/inventory';
import { ProductInventoryService } from './product-inventory.service';

describe('ProductInventoryService', () => {
  let service: ProductInventoryService;

  const availSdkStub = { listAvailabilityBySku: vi.fn() };
  const locationsSdkStub = { getLocationInventory: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ProductInventoryService,
        { provide: InventoryAvailabilityService, useValue: availSdkStub },
        { provide: InventoryLocationsService, useValue: locationsSdkStub },
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

  // ── getLocationInventory() ───────────────────────────────────────────────────

  describe('getLocationInventory()', () => {
    it('calls InventoryLocationsService.getLocationInventory(locationId, sku) [issue #370]', () => {
      locationsSdkStub.getLocationInventory.mockReturnValueOnce(
        of({ locationId: 'LOC-1', onHandQuantity: 4, availableToPromiseQuantity: 3 }),
      );

      let result;
      service.getLocationInventory('LOC-1', 'SKU-001').subscribe(value => (result = value));

      expect(locationsSdkStub.getLocationInventory).toHaveBeenCalledWith('LOC-1', 'SKU-001');
      expect(result).toEqual({
        locationId: 'LOC-1',
        locationName: undefined,
        onHand: 4,
        reserved: undefined,
        atp: 3,
      });
    });

    it('omits locationName/reserved rather than fabricating them (backend #2206)', () => {
      locationsSdkStub.getLocationInventory.mockReturnValueOnce(
        of({ locationId: 'LOC-1', onHandQuantity: 0 }),
      );

      let result: { locationName?: string; reserved?: number } | undefined;
      service.getLocationInventory('LOC-1', 'SKU-001').subscribe(value => (result = value));

      expect(result?.locationName).toBeUndefined();
      expect(result?.reserved).toBeUndefined();
    });
  });
});
