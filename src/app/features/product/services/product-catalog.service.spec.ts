import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  ProductsAPIService,
  ItemCostAPIService,
  PriceBookAPIService,
  UOMConversionAPIService,
  SupplierItemCostAPIService,
  SupplierItemCostListAPIService,
  ProductMSRPAPIService,
} from '@durion-sdk/catalog';
import { ProductCatalogService } from './product-catalog.service';

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

      let result: unknown;
      service.searchProducts('widget').subscribe(r => (result = r));

      expect((result as any[]).length).toBe(1);
    });
  });

  // ── createProduct() ──────────────────────────────────────────────────────────

  describe('createProduct()', () => {
    it('calls productsSdk.createProduct with the product payload', () => {
      const payload = { name: 'New Product', sku: 'SKU-NEW', category: 'Parts' };
      productsSdkStub.createProduct.mockReturnValueOnce(of({ id: 'p-new', name: 'New Product', sku: 'SKU-NEW' }));

      service.createProduct(payload as any).subscribe();

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
      const transition = { targetState: 'INACTIVE', effectiveAt: '2026-03-01T00:00:00Z' };
      productsSdkStub.setLifecycleState.mockReturnValueOnce(of({ productId: 'prod-123', currentState: 'INACTIVE' }));

      service.setLifecycleState('prod-123', transition as any).subscribe();

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
      const override = { locationId: 'loc-1', productSku: 'SKU-001', overridePrice: 9.99 };
      productsSdkStub.createLocationPriceOverride.mockReturnValueOnce(of({ id: 'ovr-1', locationId: 'loc-1', overridePrice: 9.99 }));

      service.createLocationPriceOverride(override as any).subscribe();

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
      const policy = { locationId: 'loc-1', minPricePercent: 0.85, maxPricePercent: 1.15 };
      productsSdkStub.upsertLocationGuardrailPolicy.mockReturnValueOnce(of({ scopeId: 'loc-1', id: 'guardrail-1' }));

      service.upsertLocationGuardrailPolicy(policy as any).subscribe();

      expect(productsSdkStub.upsertLocationGuardrailPolicy).toHaveBeenCalledWith({
        scopeId: 'loc-1',
        minMarginPercent: 0.85,
        maxDiscountPercent: 1.15,
        autoApprovalThresholdPercent: undefined,
      });
    });
  });
});
