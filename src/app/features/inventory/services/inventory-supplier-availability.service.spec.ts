import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
        productId: 'prod-9',
        deliveryLocationId: 'loc-9',
        vendors: [{ vendorProfileId: 'vp-9', vendorDisplayName: 'North Vendor', status, lines: [] }],
      });
    }

    function responseWithLineStatus(status: string) {
      return of({
        productId: 'prod-9',
        deliveryLocationId: 'loc-9',
        vendors: [
          {
            vendorProfileId: 'vp-9',
            vendorDisplayName: 'North Vendor',
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
        .checkAvailability({ sku: 'SKU-9', deliveryLocationId: 'loc-9' })
        .subscribe(value => (result = value));

      expect(result?.vendors[0].status).toBe(status);
    });

    it('maps an unknown vendor status token to null rather than casting it through', () => {
      stockSdkStub.getSupplierStockAvailability.mockReturnValueOnce(
        responseWithVendorStatus('VENDOR_STATUS_NOT_IN_SDK_ENUM'),
      );

      let result: { vendors: ReadonlyArray<{ status: unknown }> } | undefined;
      service
        .checkAvailability({ sku: 'SKU-9', deliveryLocationId: 'loc-9' })
        .subscribe(value => (result = value));

      expect(result?.vendors[0].status).toBeNull();
    });

    it.each(KNOWN_LINE_STATUSES)('maps known line status %s to itself', status => {
      stockSdkStub.getSupplierStockAvailability.mockReturnValueOnce(responseWithLineStatus(status));

      let result: { vendors: ReadonlyArray<{ lines: ReadonlyArray<{ status: unknown }> }> } | undefined;
      service
        .checkAvailability({ sku: 'SKU-9', deliveryLocationId: 'loc-9' })
        .subscribe(value => (result = value));

      expect(result?.vendors[0].lines[0].status).toBe(status);
    });

    it('maps an unknown line status token to null rather than casting it through', () => {
      stockSdkStub.getSupplierStockAvailability.mockReturnValueOnce(
        responseWithLineStatus('LINE_STATUS_NOT_IN_SDK_ENUM'),
      );

      let result: { vendors: ReadonlyArray<{ lines: ReadonlyArray<{ status: unknown }> }> } | undefined;
      service
        .checkAvailability({ sku: 'SKU-9', deliveryLocationId: 'loc-9' })
        .subscribe(value => (result = value));

      expect(result?.vendors[0].lines[0].status).toBeNull();
    });
  });
});
