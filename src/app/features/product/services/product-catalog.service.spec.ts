import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  ProductsAPIService,
  ItemCostAPIService,
  PriceBookAPIService,
  UOMConversionAPIService,
  ProductMSRPAPIService,
  ProductSummaryLifecycleStateEnum,
} from '@durion-sdk/catalog';
import type { CatalogSearchResultDto } from '@durion-sdk/catalog';
import { ProductCatalogService } from './product-catalog.service';
import type { Product, ProductSummary, LifecycleStateTransition } from '../models/product.models';
import type { GuardrailPolicy, LocationPriceOverride } from '../models/pricing.models';

describe('ProductCatalogService', () => {
  let service: ProductCatalogService;

  const productsSdkStub = {
    searchCatalogProducts: vi.fn(),
    createProduct: vi.fn(),
    getProductById: vi.fn(),
    updateProduct: vi.fn(),
    getProductLifecycle: vi.fn(),
    updateProductLifecycle: vi.fn(),
    listProductReplacements: vi.fn(),
    addProductReplacement: vi.fn(),
    createLocationPriceOverride: vi.fn(),
    getEffectiveLocationPrice: vi.fn(),
    approveLocationPriceOverride: vi.fn(),
    rejectLocationPriceOverride: vi.fn(),
    upsertLocationGuardrailPolicy: vi.fn(),
  };
  const itemCostSdkStub = { getItemCosts: vi.fn(), updateStandardItemCost: vi.fn(), getItemCostAuditHistory: vi.fn() };
  const priceBookSdkStub = { createPriceBook: vi.fn(), getPriceBook: vi.fn(), updatePriceBook: vi.fn(), listPriceBookRules: vi.fn(), createPriceBookRule: vi.fn(), updatePriceBookRule: vi.fn(), deactivatePriceBookRule: vi.fn() };
  const uomSdkStub = { listUomConversions: vi.fn(), createUomConversion: vi.fn(), updateUomConversion: vi.fn(), deactivateUomConversion: vi.fn() };
  const msrpSdkStub = { listProductMsrpHistory: vi.fn(), createProductMsrp: vi.fn(), updateProductMsrp: vi.fn(), getActiveProductMsrp: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ProductCatalogService,
        { provide: ProductsAPIService, useValue: productsSdkStub },
        { provide: ItemCostAPIService, useValue: itemCostSdkStub },
        { provide: PriceBookAPIService, useValue: priceBookSdkStub },
        { provide: UOMConversionAPIService, useValue: uomSdkStub },
        { provide: ProductMSRPAPIService, useValue: msrpSdkStub },
      ],
    });
    service = TestBed.inject(ProductCatalogService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── searchProducts() ─────────────────────────────────────────────────────────

  describe('searchProducts()', () => {
    it('calls productsSdk.searchProducts with the query string', () => {
      productsSdkStub.searchCatalogProducts.mockReturnValueOnce(of([]));

      service.searchProducts('widget').subscribe();

      expect(productsSdkStub.searchCatalogProducts).toHaveBeenCalledWith('widget');
    });

    it('returns the products array as an Observable', () => {
      const sdkItem = { id: 'p1', sku: 'SKU-001', name: 'Widget' };
      productsSdkStub.searchCatalogProducts.mockReturnValueOnce(of({ data: [sdkItem] }));

      let result: ProductSummary[] | undefined;
      service.searchProducts('widget').subscribe(r => (result = r));

      expect(result?.length).toBe(1);
    });
  });

  // ── searchProductsDetailed() ──────────────────────────────────────────────────

  describe('searchProductsDetailed()', () => {
    it('requests detailed=true and maps inline lifecycle + MSRP fields in a single call', () => {
      const searchResult: CatalogSearchResultDto = {
        data: [
          {
            productId: 'p1',
            sku: 'SKU-001',
            name: 'Widget',
            category: 'Parts',
            lifecycleState: ProductSummaryLifecycleStateEnum.Active,
            lifecycleStateEffectiveAt: '2026-01-01T00:00:00Z',
            msrpAmount: '9.99',
            msrpCurrency: 'USD',
          },
        ],
        limit: 20,
      };
      productsSdkStub.searchCatalogProducts.mockReturnValueOnce(of(searchResult));

      let result: ProductSummary[] | undefined;
      service.searchProductsDetailed('widget').subscribe(r => (result = r));

      // detailed flag is the 7th positional arg of the SDK searchProducts signature
      expect(productsSdkStub.searchCatalogProducts).toHaveBeenCalledWith(
        'widget', undefined, undefined, undefined, undefined, undefined, true,
      );
      // no per-row enrichment fan-out
      expect(productsSdkStub.getProductById).not.toHaveBeenCalled();
      expect(msrpSdkStub.getActiveProductMsrp).not.toHaveBeenCalled();
      expect(result?.[0]).toMatchObject({
        id: 'p1',
        lifecycleState: 'ACTIVE',
        effectiveAt: '2026-01-01T00:00:00Z',
        msrp: 9.99,
        msrpCurrency: 'USD',
      });
    });

    it('maps a row with no active MSRP to a null price', () => {
      const searchResult: CatalogSearchResultDto = {
        data: [
          {
            productId: 'p1',
            sku: 'SKU-001',
            name: 'Widget',
            category: 'Parts',
            lifecycleState: ProductSummaryLifecycleStateEnum.Active,
          },
        ],
        limit: 20,
      };
      productsSdkStub.searchCatalogProducts.mockReturnValueOnce(of(searchResult));

      let result: ProductSummary[] | undefined;
      service.searchProductsDetailed('widget').subscribe(r => (result = r));

      expect(result?.[0]).toMatchObject({ lifecycleState: 'ACTIVE', msrp: null, msrpCurrency: 'USD' });
    });

    it('treats a blank or non-numeric MSRP amount as null, not $0', () => {
      const searchResult: CatalogSearchResultDto = {
        data: [
          { productId: 'p1', sku: 'SKU-001', name: 'Widget', category: 'Parts', msrpAmount: '', msrpCurrency: 'USD' },
        ],
        limit: 20,
      };
      productsSdkStub.searchCatalogProducts.mockReturnValueOnce(of(searchResult));

      let result: ProductSummary[] | undefined;
      service.searchProductsDetailed('widget').subscribe(r => (result = r));

      expect(result?.[0].msrp).toBeNull();
    });

    it('returns an empty array when search yields nothing', () => {
      const emptySearch: CatalogSearchResultDto = { data: [], limit: 20 };
      productsSdkStub.searchCatalogProducts.mockReturnValueOnce(of(emptySearch));

      let result: ProductSummary[] | undefined;
      service.searchProductsDetailed('widget').subscribe(r => (result = r));

      expect(result).toEqual([]);
    });
  });

  // ── createProduct() ──────────────────────────────────────────────────────────

  describe('createProduct()', () => {
    it('calls productsSdk.createProduct with the product payload', () => {
      const payload: Partial<Product> = { name: 'New Product', sku: 'SKU-NEW', category: 'Parts' };
      productsSdkStub.createProduct.mockReturnValueOnce(of({ id: 'p-new', name: 'New Product', sku: 'SKU-NEW' }));

      service.createProduct(payload).subscribe();

      expect(productsSdkStub.createProduct).toHaveBeenCalledWith({
        name: 'New Product',
        sku: 'SKU-NEW',
        description: '',
        unitOfMeasure: '',
        mpn: '',
      });
    });
  });

  // ── getProductLifecycle() ────────────────────────────────────────────────────

  describe('getProductLifecycle()', () => {
    it('calls productsSdk.getProductLifecycle with the productId', () => {
      productsSdkStub.getProductLifecycle.mockReturnValueOnce(of({ productId: 'prod-123', currentState: 'ACTIVE' }));

      service.getProductLifecycle('prod-123').subscribe();

      expect(productsSdkStub.getProductLifecycle).toHaveBeenCalledWith('prod-123');
    });

    it('passes the productId as-is to the SDK', () => {
      productsSdkStub.getProductLifecycle.mockReturnValueOnce(of({}));

      service.getProductLifecycle('prod/with-slash').subscribe();

      expect(productsSdkStub.getProductLifecycle).toHaveBeenCalledWith('prod/with-slash');
    });
  });

  // ── setLifecycleState() ──────────────────────────────────────────────────────

  describe('setLifecycleState()', () => {
    it('calls productsSdk.setLifecycleState with productId and transition', () => {
      const transition: LifecycleStateTransition = { targetState: 'INACTIVE', effectiveAt: '2026-03-01T00:00:00Z' };
      productsSdkStub.updateProductLifecycle.mockReturnValueOnce(of({ productId: 'prod-123', currentState: 'INACTIVE' }));

      service.setLifecycleState('prod-123', transition).subscribe();

      expect(productsSdkStub.updateProductLifecycle).toHaveBeenCalledWith('prod-123', {
        lifecycleState: 'INACTIVE',
        effectiveAt: '2026-03-01T00:00:00Z',
        overrideReason: undefined,
      });
    });
  });

  // ── getItemCosts() ───────────────────────────────────────────────────────────

  describe('getItemCosts()', () => {
    it('calls itemCostSdk.getItemCosts with the itemId', () => {
      itemCostSdkStub.getItemCosts.mockReturnValueOnce(of({ standardCost: 10 }));

      service.getItemCosts('item-abc').subscribe();

      expect(itemCostSdkStub.getItemCosts).toHaveBeenCalledWith('item-abc');
    });
  });

  // ── listMsrp() ───────────────────────────────────────────────────────────────

  describe('listMsrp()', () => {
    it('calls msrpSdk.listMsrp with the productSku', () => {
      msrpSdkStub.listProductMsrpHistory.mockReturnValueOnce(of([]));

      service.listMsrp('SKU-001').subscribe();

      expect(msrpSdkStub.listProductMsrpHistory).toHaveBeenCalledWith('SKU-001');
    });
  });

  // ── createLocationPriceOverride() ────────────────────────────────────────────

  describe('createLocationPriceOverride()', () => {
    it('calls productsSdk.createLocationPriceOverride with the override payload', () => {
      const override: Partial<LocationPriceOverride> = { locationId: 'loc-1', productSku: 'SKU-001', overridePrice: 9.99 };
      productsSdkStub.createLocationPriceOverride.mockReturnValueOnce(of({ id: 'ovr-1', locationId: 'loc-1', overridePrice: 9.99 }));

      service.createLocationPriceOverride(override).subscribe();

      expect(productsSdkStub.createLocationPriceOverride).toHaveBeenCalledWith({
        locationId: 'loc-1',
        productId: 'SKU-001',
        basePrice: 0,
        overridePrice: 9.99,
        createdByUserId: '',
      });
    });
  });

  // ── upsertLocationGuardrailPolicy() ─────────────────────────────────────────

  describe('upsertLocationGuardrailPolicy()', () => {
    it('calls productsSdk.upsertLocationGuardrailPolicy with the policy', () => {
      const policy: GuardrailPolicy = {
        locationId: 'loc-1',
        minPricePercent: 0.85,
        maxPricePercent: 1.15,
        requiresApprovalAbovePercent: 0.5,
      };
      productsSdkStub.upsertLocationGuardrailPolicy.mockReturnValueOnce(of({ scopeId: 'loc-1', id: 'guardrail-1' }));

      service.upsertLocationGuardrailPolicy(policy).subscribe();

      expect(productsSdkStub.upsertLocationGuardrailPolicy).toHaveBeenCalledWith({
        scopeId: 'loc-1',
        minMarginPercent: 0.85,
        maxDiscountPercent: 1.15,
        autoApprovalThresholdPercent: 0.5,
      });
    });
  });
});
