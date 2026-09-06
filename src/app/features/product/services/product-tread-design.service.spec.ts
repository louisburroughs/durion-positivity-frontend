import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TreadDesignEnrichmentService } from '@durion-sdk/catalog';
import { ProductTreadDesignService } from './product-tread-design.service';

describe('ProductTreadDesignService', () => {
  let service: ProductTreadDesignService;

  const treadDesignSdkStub = {
    getTreadDesignForProduct: vi.fn(),
    listUnmatchedTreadDesigns: vi.fn(),
    listTreadDesignCandidates: vi.fn(),
    resolveTreadDesign: vi.fn(),
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
          matchState: 'MATCHED',
          matchStateAt: '2026-08-01T00:00:00Z',
          candidates: [],
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
        matchState: 'MATCHED',
        matchStateAt: '2026-08-01T00:00:00Z',
        candidates: [],
      });
    });

    it('defaults matchState/matchStateAt/candidates when the DTO omits them', () => {
      treadDesignSdkStub.getTreadDesignForProduct.mockReturnValueOnce(of({ id: 'td-1' }));

      let result: { matchState: unknown; matchStateAt: unknown; candidates: unknown } | undefined;
      service.getEnrichmentForProduct('prod-1').subscribe(value => (result = value as never));

      expect(result?.matchState).toBeNull();
      expect(result?.matchStateAt).toBeNull();
      expect(result?.candidates).toEqual([]);
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
    it('calls the SDK with matchState, vendorProfileId, page and size', () => {
      treadDesignSdkStub.listUnmatchedTreadDesigns.mockReturnValueOnce(
        of({ content: [], number: 0, size: 25, totalElements: 0, totalPages: 0 }),
      );

      service.listUnmatched(['UNMATCHED', 'REVIEW'], 'vendor-9', 2, 25).subscribe();

      expect(treadDesignSdkStub.listUnmatchedTreadDesigns).toHaveBeenCalledWith(
        ['UNMATCHED', 'REVIEW'],
        'vendor-9',
        2,
        25,
      );
    });

    it('passes an empty matchState selection through as undefined rather than an empty array', () => {
      treadDesignSdkStub.listUnmatchedTreadDesigns.mockReturnValueOnce(
        of({ content: [], number: 0, size: 25, totalElements: 0, totalPages: 0 }),
      );

      service.listUnmatched([], undefined, 0, 25).subscribe();

      expect(treadDesignSdkStub.listUnmatchedTreadDesigns).toHaveBeenCalledWith(
        undefined,
        undefined,
        0,
        25,
      );
    });

    it('blanks a whitespace-only vendorProfileId to undefined', () => {
      treadDesignSdkStub.listUnmatchedTreadDesigns.mockReturnValueOnce(
        of({ content: [], number: 0, size: 25, totalElements: 0, totalPages: 0 }),
      );

      service.listUnmatched(undefined, '', 0, 25).subscribe();

      expect(treadDesignSdkStub.listUnmatchedTreadDesigns).toHaveBeenCalledWith(
        undefined,
        undefined,
        0,
        25,
      );
    });

    it('maps a page of results, including embedded candidates, into the domain shape', () => {
      treadDesignSdkStub.listUnmatchedTreadDesigns.mockReturnValueOnce(
        of({
          content: [
            {
              id: 'td-9',
              brand: 'Vendor X',
              hasUnresolvedImages: false,
              matchState: 'REVIEW',
              matchStateAt: '2026-09-01T00:00:00Z',
              candidates: [{ productId: 'prod-1', score: 0.62, tier: 'REVIEW' }],
            },
          ],
          number: 0,
          size: 50,
          totalElements: 1,
          totalPages: 1,
        }),
      );

      let result: { items: readonly { id: string; matchState: unknown; candidates: unknown }[] } | undefined;
      service.listUnmatched().subscribe(value => (result = value as never));

      expect(result?.items).toHaveLength(1);
      expect(result?.items[0].id).toBe('td-9');
      expect(result?.items[0].matchState).toBe('REVIEW');
      expect(result?.items[0].candidates).toEqual([{ productId: 'prod-1', score: 0.62, tier: 'REVIEW' }]);
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

  describe('listCandidates()', () => {
    it('calls the SDK with the tread design id and maps every candidate', () => {
      treadDesignSdkStub.listTreadDesignCandidates.mockReturnValueOnce(
        of([
          { productId: 'prod-1', score: 0.91, tier: 'AUTO' },
          { productId: 'prod-2', score: 0.55, tier: 'REVIEW' },
        ]),
      );

      let result: unknown;
      service.listCandidates('td-1').subscribe(value => (result = value));

      expect(treadDesignSdkStub.listTreadDesignCandidates).toHaveBeenCalledWith('td-1');
      expect(result).toEqual([
        { productId: 'prod-1', score: 0.91, tier: 'AUTO' },
        { productId: 'prod-2', score: 0.55, tier: 'REVIEW' },
      ]);
    });

    it('defaults a missing candidates array to empty without throwing', () => {
      treadDesignSdkStub.listTreadDesignCandidates.mockReturnValueOnce(of(undefined));

      let result: unknown;
      service.listCandidates('td-2').subscribe(value => (result = value));

      expect(result).toEqual([]);
    });

    it('propagates a load failure (e.g. 404 unknown design) rather than swallowing it', () => {
      treadDesignSdkStub.listTreadDesignCandidates.mockReturnValueOnce(
        throwError(() => ({ status: 404 })),
      );

      let errored = false;
      service.listCandidates('td-missing').subscribe({ error: () => (errored = true) });

      expect(errored).toBe(true);
    });
  });

  describe('resolve()', () => {
    it('sends an ATTACH request with the selected product ids', () => {
      treadDesignSdkStub.resolveTreadDesign.mockReturnValueOnce(
        of({ id: 'td-1', matchState: 'MATCHED' }),
      );

      service.resolve('td-1', { action: 'ATTACH', productIds: ['prod-1', 'prod-2'], note: 'Confirmed' }).subscribe();

      expect(treadDesignSdkStub.resolveTreadDesign).toHaveBeenCalledWith('td-1', {
        action: 'ATTACH',
        productIds: ['prod-1', 'prod-2'],
        note: 'Confirmed',
        deferUntil: undefined,
      });
    });

    it('sends a REJECT request with no productIds', () => {
      treadDesignSdkStub.resolveTreadDesign.mockReturnValueOnce(
        of({ id: 'td-1', matchState: 'REJECTED' }),
      );

      service.resolve('td-1', { action: 'REJECT' }).subscribe();

      expect(treadDesignSdkStub.resolveTreadDesign).toHaveBeenCalledWith('td-1', {
        action: 'REJECT',
        productIds: undefined,
        note: undefined,
        deferUntil: undefined,
      });
    });

    it('sends a DEFER request with the given deferUntil instant', () => {
      treadDesignSdkStub.resolveTreadDesign.mockReturnValueOnce(
        of({ id: 'td-1', matchState: 'DEFERRED' }),
      );

      service.resolve('td-1', { action: 'DEFER', deferUntil: '2026-09-20T00:00:00.000Z' }).subscribe();

      expect(treadDesignSdkStub.resolveTreadDesign).toHaveBeenCalledWith('td-1', {
        action: 'DEFER',
        productIds: undefined,
        note: undefined,
        deferUntil: '2026-09-20T00:00:00.000Z',
      });
    });

    it('maps the response back into the domain shape', () => {
      treadDesignSdkStub.resolveTreadDesign.mockReturnValueOnce(
        of({ id: 'td-1', matchState: 'MATCHED', matchStateAt: '2026-09-06T00:00:00Z' }),
      );

      let result: { matchState: unknown } | undefined;
      service.resolve('td-1', { action: 'ATTACH', productIds: ['prod-1'] }).subscribe(value => (result = value as never));

      expect(result?.matchState).toBe('MATCHED');
    });

    it('propagates a failure (e.g. 409 conflict) rather than swallowing it', () => {
      treadDesignSdkStub.resolveTreadDesign.mockReturnValueOnce(
        throwError(() => ({ status: 409 })),
      );

      let errored = false;
      service.resolve('td-1', { action: 'ATTACH', productIds: ['prod-1'] }).subscribe({
        error: () => (errored = true),
      });

      expect(errored).toBe(true);
    });
  });
});
