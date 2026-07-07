import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import {
  ProductsAPIService,
  ItemCostAPIService,
  PriceBookAPIService,
  UOMConversionAPIService,
  SupplierItemCostAPIService,
  SupplierItemCostListAPIService,
  ProductMSRPAPIService,
  ProductDtoLifecycleStateEnum,
} from '@durion-sdk/catalog';
import type {
  CatalogSearchResultDto,
  ProductDto,
  ProductMsrpDto,
} from '@durion-sdk/catalog';
import { ProductCatalogService } from './product-catalog.service';
import type { Product, ProductSummary, LifecycleStateTransition } from '../models/product.models';
import type { GuardrailPolicy, LocationPriceOverride } from '../models/pricing.models';

describe('ProductCatalogService', () => {
  let service: ProductCatalogService;

  const productsSdkStub = {
    searchProducts: vi.fn(),
    createProduct: vi.fn(),
    getProductById: vi.fn(),
    updateProduct: vi.fn(),
    getProductLifecycle: vi.fn(),
    setLifecycleState: vi.fn(),
    getReplacements: vi.fn(),
    addReplacementProduct: vi.fn(),
    createLocationPriceOverride: vi.fn(),
    getEffectiveLocationPrice: vi.fn(),
    approveLocationPriceOverride: vi.fn(),
    rejectLocationPriceOverride: vi.fn(),
    upsertLocationGuardrailPolicy: vi.fn(),
  };
  const itemCostSdkStub = { getItemCosts: vi.fn(), updateStandardCost: vi.fn(), getAuditHistory: vi.fn() };
  const priceBookSdkStub = { createPriceBook: vi.fn(), getPriceBook: vi.fn(), updatePriceBook: vi.fn(), listRules: vi.fn(), createRule: vi.fn(), updateRule: vi.fn(), deactivateRule: vi.fn() };
  const uomSdkStub = { listUomConversions: vi.fn(), createUomConversion: vi.fn(), updateUomConversion: vi.fn(), deactivateUomConversion: vi.fn() };
  const supplierCostSdkStub = { getCostStructure: vi.fn(), createCostStructure: vi.fn(), updateCostStructure: vi.fn(), deleteCostStructure: vi.fn() };
  const supplierCostListSdkStub = { listCostStructures: vi.fn() };
  const msrpSdkStub = { listMsrp: vi.fn(), createMsrp: vi.fn(), updateMsrp: vi.fn(), getActiveMsrp: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ProductCatalogService,
        { provide: ProductsAPIService, useValue: productsSdkStub },
        { provide: ItemCostAPIService, useValue: itemCostSdkStub },
        { provide: PriceBookAPIService, useValue: priceBookSdkStub },
        { provide: UOMConversionAPIService, useValue: uomSdkStub },
        { provide: SupplierItemCostAPIService, useValue: supplierCostSdkStub },
        { provide: SupplierItemCostListAPIService, useValue: supplierCostListSdkStub },
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
      productsSdkStub.searchProducts.mockReturnValueOnce(of([]));

      service.searchProducts('widget').subscribe();

      expect(productsSdkStub.searchProducts).toHaveBeenCalledWith('widget');
    });

    it('returns the products array as an Observable', () => {
      const sdkItem = { id: 'p1', sku: 'SKU-001', name: 'Widget' };
      productsSdkStub.searchProducts.mockReturnValueOnce(of({ data: [sdkItem] }));

      let result: ProductSummary[] | undefined;
      service.searchProducts('widget').subscribe(r => (result = r));

      expect(result?.length).toBe(1);
    });
  });

  // ── searchProductsDetailed() ──────────────────────────────────────────────────

  describe('searchProductsDetailed()', () => {
    const oneRowSearch: CatalogSearchResultDto = {
      data: [{ productId: 'p1', sku: 'SKU-001', name: 'Widget', category: 'Parts' }],
      limit: 20,
    };

    it('enriches each summary with lifecycle state, effective date, and active MSRP', () => {
      const detail: ProductDto = {
        id: 'p1',
        name: 'Widget',
        lifecycleState: ProductDtoLifecycleStateEnum.Active,
        lifecycleStateEffectiveAt: '2026-01-01T00:00:00Z',
      };
      const activeMsrp: ProductMsrpDto = {
        msrpId: 'm1',
        productId: 'p1',
        amount: '9.99',
        currency: 'USD',
        effectiveStartDate: '2026-01-01',
        createdAt: '2026-01-01T00:00:00Z',
        version: 0,
      };
      productsSdkStub.searchProducts.mockReturnValueOnce(of(oneRowSearch));
      productsSdkStub.getProductById.mockReturnValueOnce(of(detail));
      msrpSdkStub.getActiveMsrp.mockReturnValueOnce(of(activeMsrp));

      let result: ProductSummary[] | undefined;
      service.searchProductsDetailed('widget').subscribe(r => (result = r));

      expect(productsSdkStub.getProductById).toHaveBeenCalledWith('p1');
      expect(msrpSdkStub.getActiveMsrp).toHaveBeenCalledWith('p1');
      expect(result?.[0]).toMatchObject({
        id: 'p1',
        lifecycleState: 'ACTIVE',
        effectiveAt: '2026-01-01T00:00:00Z',
        msrp: 9.99,
        msrpCurrency: 'USD',
      });
    });

    it('degrades gracefully when a product has no active MSRP', () => {
      const detail: ProductDto = {
        id: 'p1',
        name: 'Widget',
        lifecycleState: ProductDtoLifecycleStateEnum.Active,
      };
      productsSdkStub.searchProducts.mockReturnValueOnce(of(oneRowSearch));
      productsSdkStub.getProductById.mockReturnValueOnce(of(detail));
      msrpSdkStub.getActiveMsrp.mockReturnValueOnce(throwError(() => new Error('404')));

      let result: ProductSummary[] | undefined;
      service.searchProductsDetailed('widget').subscribe(r => (result = r));

      expect(result?.[0]).toMatchObject({ lifecycleState: 'ACTIVE', msrp: null, msrpCurrency: 'USD' });
    });

    it('treats a blank or non-numeric MSRP amount as null, not $0', () => {
      const detail: ProductDto = { id: 'p1', name: 'Widget', lifecycleState: ProductDtoLifecycleStateEnum.Active };
      const blankMsrp: ProductMsrpDto = {
        msrpId: 'm1',
        productId: 'p1',
        amount: '',
        currency: 'USD',
        effectiveStartDate: '2026-01-01',
        createdAt: '2026-01-01T00:00:00Z',
        version: 0,
      };
      productsSdkStub.searchProducts.mockReturnValueOnce(of(oneRowSearch));
      productsSdkStub.getProductById.mockReturnValueOnce(of(detail));
      msrpSdkStub.getActiveMsrp.mockReturnValueOnce(of(blankMsrp));

      let result: ProductSummary[] | undefined;
      service.searchProductsDetailed('widget').subscribe(r => (result = r));

      expect(result?.[0].msrp).toBeNull();
    });

    it('returns an empty array without enrichment calls when search yields nothing', () => {
      const emptySearch: CatalogSearchResultDto = { data: [], limit: 20 };
      productsSdkStub.searchProducts.mockReturnValueOnce(of(emptySearch));

      let result: ProductSummary[] | undefined;
      service.searchProductsDetailed('widget').subscribe(r => (result = r));

      expect(result).toEqual([]);
      expect(productsSdkStub.getProductById).not.toHaveBeenCalled();
      expect(msrpSdkStub.getActiveMsrp).not.toHaveBeenCalled();
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
      productsSdkStub.setLifecycleState.mockReturnValueOnce(of({ productId: 'prod-123', currentState: 'INACTIVE' }));

      service.setLifecycleState('prod-123', transition).subscribe();

      expect(productsSdkStub.setLifecycleState).toHaveBeenCalledWith('prod-123', {
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

  it('listCostStructures calls supplierCostListSdk.listCostStructures with pageable and itemId', () => {
    supplierCostListSdkStub.listCostStructures.mockReturnValue(of({ content: [] }));

    service.listCostStructures('item-1').subscribe();

    expect(supplierCostListSdkStub.listCostStructures).toHaveBeenCalledWith(
      { page: 0, size: 50 },
      'item-1',
    );
  });

  // ── listMsrp() ───────────────────────────────────────────────────────────────

  describe('listMsrp()', () => {
    it('calls msrpSdk.listMsrp with the productSku', () => {
      msrpSdkStub.listMsrp.mockReturnValueOnce(of([]));

      service.listMsrp('SKU-001').subscribe();

      expect(msrpSdkStub.listMsrp).toHaveBeenCalledWith('SKU-001');
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
