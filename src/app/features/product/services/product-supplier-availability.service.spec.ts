import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierStockAvailabilityService } from '@durion-sdk/supplier';
import { ProductSupplierAvailabilityService } from './product-supplier-availability.service';

describe('ProductSupplierAvailabilityService', () => {
  let service: ProductSupplierAvailabilityService;

  const stockSdkStub = { getSupplierStockAvailability: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ProductSupplierAvailabilityService,
        { provide: SupplierStockAvailabilityService, useValue: stockSdkStub },
      ],
    });
    service = TestBed.inject(ProductSupplierAvailabilityService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('checkAvailability()', () => {
    it('calls the SDK with deliveryLocationId, productId, sku and quantity in order', () => {
      stockSdkStub.getSupplierStockAvailability.mockReturnValueOnce(of({ vendors: [] }));

      service
        .checkAvailability({ productId: 'prod-1', deliveryLocationId: 'loc-1', quantity: 3 })
        .subscribe();

      expect(stockSdkStub.getSupplierStockAvailability).toHaveBeenCalledWith(
        'loc-1',
        'prod-1',
        undefined,
        3,
      );
    });

    it('passes sku through when productId is omitted', () => {
      stockSdkStub.getSupplierStockAvailability.mockReturnValueOnce(of({ vendors: [] }));

      service.checkAvailability({ sku: 'SKU-1', deliveryLocationId: 'loc-1' }).subscribe();

      expect(stockSdkStub.getSupplierStockAvailability).toHaveBeenCalledWith(
        'loc-1',
        undefined,
        'SKU-1',
        undefined,
      );
    });

    it('maps a full SDK response into the domain shape', () => {
      stockSdkStub.getSupplierStockAvailability.mockReturnValueOnce(
        of({
          productId: 'prod-1',
          deliveryLocationId: 'loc-1',
          requestedQuantity: 5,
          stalenessThreshold: 'PT4H',
          vendors: [
            {
              vendorProfileId: 'vp-1',
              vendorDisplayName: 'Acme Tires',
              status: 'OK',
              fetchedAt: '2026-09-01T10:00:00Z',
              asOf: '2026-09-01T09:00:00Z',
              stale: false,
              lines: [
                {
                  status: 'AVAILABLE',
                  availableQuantity: 12,
                  currency: 'USD',
                  earliestDeliveryDate: '2026-09-05',
                  quotedUnitPrice: 45.5,
                },
              ],
            },
          ],
        }),
      );

      let result: unknown;
      service
        .checkAvailability({ productId: 'prod-1', deliveryLocationId: 'loc-1', quantity: 5 })
        .subscribe(value => (result = value));

      expect(result).toEqual({
        productId: 'prod-1',
        deliveryLocationId: 'loc-1',
        requestedQuantity: 5,
        stalenessThreshold: 'PT4H',
        vendors: [
          {
            vendorProfileId: 'vp-1',
            vendorDisplayName: 'Acme Tires',
            status: 'OK',
            fetchedAt: '2026-09-01T10:00:00Z',
            asOf: '2026-09-01T09:00:00Z',
            stale: false,
            lines: [
              {
                status: 'AVAILABLE',
                availableQuantity: 12,
                currency: 'USD',
                earliestDeliveryDate: '2026-09-05',
                quotedUnitPrice: 45.5,
              },
            ],
          },
        ],
      });
    });

    it('defaults an empty vendors list to [] rather than erroring — no configured vendor is a valid answer', () => {
      stockSdkStub.getSupplierStockAvailability.mockReturnValueOnce(
        of({ productId: 'prod-1', deliveryLocationId: 'loc-1' }),
      );

      let result: { vendors: readonly unknown[] } | undefined;
      service
        .checkAvailability({ productId: 'prod-1', deliveryLocationId: 'loc-1' })
        .subscribe(value => (result = value));

      expect(result?.vendors).toEqual([]);
    });

    it('maps a partial vendor (SUPPLIER_UNAVAILABLE, no answer) without throwing', () => {
      stockSdkStub.getSupplierStockAvailability.mockReturnValueOnce(
        of({
          productId: 'prod-1',
          deliveryLocationId: 'loc-1',
          vendors: [
            {
              vendorProfileId: 'vp-2',
              vendorDisplayName: 'Slow Vendor',
              status: 'SUPPLIER_UNAVAILABLE',
            },
          ],
        }),
      );

      let result: { vendors: ReadonlyArray<{ fetchedAt: unknown; stale: unknown; lines: unknown }> } | undefined;
      service
        .checkAvailability({ productId: 'prod-1', deliveryLocationId: 'loc-1' })
        .subscribe(value => (result = value));

      expect(result?.vendors[0].fetchedAt).toBeNull();
      expect(result?.vendors[0].stale).toBeNull();
      expect(result?.vendors[0].lines).toEqual([]);
    });
  });

  /**
   * Whitelisting (#212): the mapper checks every SDK status token against a
   * known set rather than casting it straight through, so a status the SDK
   * enum grows later — and any typo/garbage token — becomes `null` instead
   * of silently flowing into a template that switches on it by string.
   */
  describe('vendor and line status whitelisting', () => {
    const KNOWN_VENDOR_STATUSES = [
      'OK',
      'SUPPLIER_UNAVAILABLE',
      'NOT_LISTED',
      'CAPABILITY_NOT_CONFIGURED',
      'CONFIGURATION_ERROR',
    ] as const;

    const KNOWN_LINE_STATUSES = ['AVAILABLE', 'UNAVAILABLE', 'NOT_LISTED', 'NOT_ANSWERED'] as const;

    function responseWithVendorStatus(status: string) {
      return of({
        productId: 'prod-1',
        deliveryLocationId: 'loc-1',
        vendors: [{ vendorProfileId: 'vp-1', vendorDisplayName: 'Acme Tires', status, lines: [] }],
      });
    }

    function responseWithLineStatus(status: string) {
      return of({
        productId: 'prod-1',
        deliveryLocationId: 'loc-1',
        vendors: [
          {
            vendorProfileId: 'vp-1',
            vendorDisplayName: 'Acme Tires',
            status: 'OK',
            lines: [{ status }],
          },
        ],
      });
    }

    it.each(KNOWN_VENDOR_STATUSES)('maps known vendor status %s to itself', status => {
      stockSdkStub.getSupplierStockAvailability.mockReturnValueOnce(responseWithVendorStatus(status));

      let result: { vendors: ReadonlyArray<{ status: unknown }> } | undefined;
      service
        .checkAvailability({ productId: 'prod-1', deliveryLocationId: 'loc-1' })
        .subscribe(value => (result = value));

      expect(result?.vendors[0].status).toBe(status);
    });

    it('maps an unknown vendor status token to null rather than casting it through', () => {
      stockSdkStub.getSupplierStockAvailability.mockReturnValueOnce(
        responseWithVendorStatus('VENDOR_STATUS_NOT_IN_SDK_ENUM'),
      );

      let result: { vendors: ReadonlyArray<{ status: unknown }> } | undefined;
      service
        .checkAvailability({ productId: 'prod-1', deliveryLocationId: 'loc-1' })
        .subscribe(value => (result = value));

      expect(result?.vendors[0].status).toBeNull();
    });

    it.each(KNOWN_LINE_STATUSES)('maps known line status %s to itself', status => {
      stockSdkStub.getSupplierStockAvailability.mockReturnValueOnce(responseWithLineStatus(status));

      let result: { vendors: ReadonlyArray<{ lines: ReadonlyArray<{ status: unknown }> }> } | undefined;
      service
        .checkAvailability({ productId: 'prod-1', deliveryLocationId: 'loc-1' })
        .subscribe(value => (result = value));

      expect(result?.vendors[0].lines[0].status).toBe(status);
    });

    it('maps an unknown line status token to null rather than casting it through', () => {
      stockSdkStub.getSupplierStockAvailability.mockReturnValueOnce(
        responseWithLineStatus('LINE_STATUS_NOT_IN_SDK_ENUM'),
      );

      let result: { vendors: ReadonlyArray<{ lines: ReadonlyArray<{ status: unknown }> }> } | undefined;
      service
        .checkAvailability({ productId: 'prod-1', deliveryLocationId: 'loc-1' })
        .subscribe(value => (result = value));

      expect(result?.vendors[0].lines[0].status).toBeNull();
    });
  });
});
