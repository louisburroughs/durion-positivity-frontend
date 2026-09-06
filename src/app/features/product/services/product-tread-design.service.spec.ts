import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TreadDesignEnrichmentService } from '@durion-sdk/catalog';
import { ProductTreadDesignService } from './product-tread-design.service';

describe('ProductTreadDesignService', () => {
  let service: ProductTreadDesignService;

  const treadDesignSdkStub = {
    getTreadDesignForProduct: vi.fn(),
    listUnmatchedTreadDesigns: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ProductTreadDesignService,
        { provide: TreadDesignEnrichmentService, useValue: treadDesignSdkStub },
      ],
    });
    service = TestBed.inject(ProductTreadDesignService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getEnrichmentForProduct()', () => {
    it('maps a full SDK response into the domain shape', () => {
      treadDesignSdkStub.getTreadDesignForProduct.mockReturnValueOnce(
        of({
          id: 'td-1',
          brand: 'Acme',
          treadDesign: 'Sierra',
          treadDesign2: null,
          productName: 'Sierra AT',
          vehicleType: 'LT',
          seasonality: 'ALL_SEASON',
          supplierRef: 'acme-inc',
          vendorProfileId: 'vp-1',
          vendorVariantId: 'var-1',
          updatedAt: '2026-08-01T00:00:00Z',
          hasUnresolvedImages: true,
          images: [{ imageId: 5, imageType: 'HERO', unresolved: true }],
          texts: [{ languageCode: 'en', name: 'Sierra AT', description: 'Rugged', footNotes: undefined }],
        }),
      );

      let result: unknown;
      service.getEnrichmentForProduct('prod-1').subscribe(value => (result = value));

      expect(treadDesignSdkStub.getTreadDesignForProduct).toHaveBeenCalledWith('prod-1');
      expect(result).toEqual({
        id: 'td-1',
        brand: 'Acme',
        treadDesign: 'Sierra',
        treadDesign2: null,
        productName: 'Sierra AT',
        vehicleType: 'LT',
        seasonality: 'ALL_SEASON',
        supplierRef: 'acme-inc',
        vendorProfileId: 'vp-1',
        vendorVariantId: 'var-1',
        updatedAt: '2026-08-01T00:00:00Z',
        hasUnresolvedImages: true,
        images: [{ imageId: 5, imageType: 'HERO', unresolved: true }],
        texts: [{ languageCode: 'en', name: 'Sierra AT', description: 'Rugged', footNotes: null }],
      });
    });

    it('maps a 404 (no match) to null rather than an error — an ordinary outcome', () => {
      treadDesignSdkStub.getTreadDesignForProduct.mockReturnValueOnce(
        throwError(() => ({ status: 404 })),
      );

      let result: unknown = 'unset';
      let errored = false;
      service.getEnrichmentForProduct('prod-2').subscribe({
        next: value => (result = value),
        error: () => (errored = true),
      });

      expect(errored).toBe(false);
      expect(result).toBeNull();
    });

    it('maps any other transport failure to null too — isolation from the rest of the page', () => {
      treadDesignSdkStub.getTreadDesignForProduct.mockReturnValueOnce(
        throwError(() => ({ status: 500 })),
      );

      let result: unknown = 'unset';
      let errored = false;
      service.getEnrichmentForProduct('prod-3').subscribe({
        next: value => (result = value),
        error: () => (errored = true),
      });

      expect(errored).toBe(false);
      expect(result).toBeNull();
    });
  });

  describe('listUnmatched()', () => {
    it('calls the SDK with page and size', () => {
      treadDesignSdkStub.listUnmatchedTreadDesigns.mockReturnValueOnce(
        of({ content: [], number: 0, size: 50, totalElements: 0, totalPages: 0 }),
      );

      service.listUnmatched(2, 25).subscribe();

      expect(treadDesignSdkStub.listUnmatchedTreadDesigns).toHaveBeenCalledWith(2, 25);
    });

    it('maps a page of results into the domain shape', () => {
      treadDesignSdkStub.listUnmatchedTreadDesigns.mockReturnValueOnce(
        of({
          content: [{ id: 'td-9', brand: 'Vendor X', hasUnresolvedImages: false }],
          number: 0,
          size: 50,
          totalElements: 1,
          totalPages: 1,
        }),
      );

      let result: { items: readonly { id: string }[] } | undefined;
      service.listUnmatched().subscribe(value => (result = value));

      expect(result?.items).toHaveLength(1);
      expect(result?.items[0].id).toBe('td-9');
    });

    it('defaults an empty content array without throwing', () => {
      treadDesignSdkStub.listUnmatchedTreadDesigns.mockReturnValueOnce(
        of({ number: 0, size: 50, totalElements: 0, totalPages: 0 }),
      );

      let result: { items: readonly unknown[] } | undefined;
      service.listUnmatched().subscribe(value => (result = value));

      expect(result?.items).toEqual([]);
    });
  });
});
