import { TestBed } from '@angular/core/testing';
import { HttpParams } from '@angular/common/http';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  ProductsAPIService,
  ItemCostAPIService,
  PriceBookAPIService,
  UOMConversionAPIService,
  SupplierItemCostAPIService,
  ProductMSRPAPIService,
} from '@durion-sdk/catalog';
import { ProductCatalogService } from './product-catalog.service';

describe('ProductCatalogService', () => {
  let service: ProductCatalogService;

  const apiStub = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

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
  const msrpSdkStub = { listMsrp: vi.fn(), createMsrp: vi.fn(), updateMsrp: vi.fn(), getActiveMsrp: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ProductCatalogService,
        { provide: ApiBaseService, useValue: apiStub },
        { provide: ProductsAPIService, useValue: productsSdkStub },
        { provide: ItemCostAPIService, useValue: itemCostSdkStub },
        { provide: PriceBookAPIService, useValue: priceBookSdkStub },
        { provide: UOMConversionAPIService, useValue: uomSdkStub },
        { provide: SupplierItemCostAPIService, useValue: supplierCostSdkStub },
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
      const products = [{ id: 'p1', sku: 'SKU-001', name: 'Widget', category: 'Parts', lifecycleState: 'ACTIVE', msrp: null }];
      productsSdkStub.searchProducts.mockReturnValueOnce(of(products));

      let result: unknown;
      service.searchProducts('widget').subscribe(r => (result = r));

      expect(result).toEqual(products);
    });
  });

  // ── createProduct() ──────────────────────────────────────────────────────────

  describe('createProduct()', () => {
    it('calls productsSdk.createProduct with the product payload', () => {
      const payload = { name: 'New Product', sku: 'SKU-NEW', category: 'Parts' };
      productsSdkStub.createProduct.mockReturnValueOnce(of({ id: 'p-new', ...payload }));

      service.createProduct(payload as any).subscribe();

      expect(productsSdkStub.createProduct).toHaveBeenCalledWith(payload);
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
      const transition = { targetState: 'INACTIVE', effectiveAt: '2026-03-01T00:00:00Z' };
      productsSdkStub.setLifecycleState.mockReturnValueOnce(of({ productId: 'prod-123', currentState: 'INACTIVE' }));

      service.setLifecycleState('prod-123', transition as any).subscribe();

      expect(productsSdkStub.setLifecycleState).toHaveBeenCalledWith('prod-123', transition);
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

  it('listCostStructures calls GET /catalog/v1/supplier-costs with itemId param', () => {
    apiStub.get.mockReturnValue(of([]));

    service.listCostStructures('item-1').subscribe();

    const [path, params] = apiStub.get.mock.calls.at(-1)!;
    expect(path).toBe('/catalog/v1/supplier-costs');
    expect((params as HttpParams)?.get('itemId')).toBe('item-1');
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
      const override = { locationId: 'loc-1', productSku: 'SKU-001', overridePrice: 9.99 };
      productsSdkStub.createLocationPriceOverride.mockReturnValueOnce(of({ id: 'ovr-1', ...override }));

      service.createLocationPriceOverride(override as any).subscribe();

      expect(productsSdkStub.createLocationPriceOverride).toHaveBeenCalledWith(override);
    });
  });

  // ── upsertLocationGuardrailPolicy() ─────────────────────────────────────────

  describe('upsertLocationGuardrailPolicy()', () => {
    it('calls productsSdk.upsertLocationGuardrailPolicy with the policy', () => {
      const policy = { locationId: 'loc-1', floorPct: 0.85, ceilPct: 1.15 };
      productsSdkStub.upsertLocationGuardrailPolicy.mockReturnValueOnce(of({ ...policy, id: 'guardrail-1' }));

      service.upsertLocationGuardrailPolicy(policy as any).subscribe();

      expect(productsSdkStub.upsertLocationGuardrailPolicy).toHaveBeenCalledWith(policy);
    });
  });
});
