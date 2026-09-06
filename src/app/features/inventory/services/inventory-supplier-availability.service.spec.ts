import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SupplierStockAvailabilityService } from '@durion-sdk/supplier';
import { InventorySupplierAvailabilityService } from './inventory-supplier-availability.service';

describe('InventorySupplierAvailabilityService', () => {
  let service: InventorySupplierAvailabilityService;

  const stockSdkStub = { getSupplierStockAvailability: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        InventorySupplierAvailabilityService,
        { provide: SupplierStockAvailabilityService, useValue: stockSdkStub },
      ],
    });
    service = TestBed.inject(InventorySupplierAvailabilityService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('checkAvailability()', () => {
    it('calls the SDK with deliveryLocationId, sku and quantity for a PO line', () => {
      stockSdkStub.getSupplierStockAvailability.mockReturnValueOnce(of({ vendors: [] }));

      service
        .checkAvailability({ sku: 'SKU-9', deliveryLocationId: 'loc-9', quantity: 10 })
        .subscribe();

      expect(stockSdkStub.getSupplierStockAvailability).toHaveBeenCalledWith(
        'loc-9',
        undefined,
        'SKU-9',
        10,
      );
    });

    it('maps a full SDK response into the domain shape', () => {
      stockSdkStub.getSupplierStockAvailability.mockReturnValueOnce(
        of({
          productId: 'prod-9',
          deliveryLocationId: 'loc-9',
          requestedQuantity: 10,
          stalenessThreshold: 'PT2H',
          vendors: [
            {
              vendorProfileId: 'vp-9',
              vendorDisplayName: 'North Vendor',
              status: 'OK',
              fetchedAt: '2026-09-01T00:00:00Z',
              asOf: '2026-08-31T23:00:00Z',
              stale: true,
              lines: [
                {
                  status: 'AVAILABLE',
                  availableQuantity: 40,
                  currency: 'USD',
                  earliestDeliveryDate: '2026-09-10',
                  quotedUnitPrice: 12.75,
                },
              ],
            },
          ],
        }),
      );

      let result: unknown;
      service
        .checkAvailability({ sku: 'SKU-9', deliveryLocationId: 'loc-9', quantity: 10 })
        .subscribe(value => (result = value));

      expect(result).toEqual({
        productId: 'prod-9',
        deliveryLocationId: 'loc-9',
        requestedQuantity: 10,
        stalenessThreshold: 'PT2H',
        vendors: [
          {
            vendorProfileId: 'vp-9',
            vendorDisplayName: 'North Vendor',
            status: 'OK',
            fetchedAt: '2026-09-01T00:00:00Z',
            asOf: '2026-08-31T23:00:00Z',
            stale: true,
            lines: [
              {
                status: 'AVAILABLE',
                availableQuantity: 40,
                currency: 'USD',
                earliestDeliveryDate: '2026-09-10',
                quotedUnitPrice: 12.75,
              },
            ],
          },
        ],
      });
    });

    it('does not error on an empty vendors list — no configured vendor is a valid answer', () => {
      stockSdkStub.getSupplierStockAvailability.mockReturnValueOnce(
        of({ productId: 'prod-9', deliveryLocationId: 'loc-9' }),
      );

      let result: { vendors: readonly unknown[] } | undefined;
      service
        .checkAvailability({ sku: 'SKU-9', deliveryLocationId: 'loc-9' })
        .subscribe(value => (result = value));

      expect(result?.vendors).toEqual([]);
    });
  });
});
