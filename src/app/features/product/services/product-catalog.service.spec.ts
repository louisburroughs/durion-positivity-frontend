import { TestBed } from '@angular/core/testing';
import { HttpParams } from '@angular/common/http';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
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

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ProductCatalogService,
        { provide: ApiBaseService, useValue: apiStub },
      ],
    });
    service = TestBed.inject(ProductCatalogService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── searchProducts() ─────────────────────────────────────────────────────────

  describe('searchProducts()', () => {
    it('calls GET /catalog/v1/products with q param', () => {
      apiStub.get.mockReturnValueOnce(of([]));

      service.searchProducts('widget').subscribe();

      const [path, params] = apiStub.get.mock.calls[0];
      expect(path).toBe('/catalog/v1/products');
      expect((params as HttpParams).get('q')).toBe('widget');
    });

    it('returns the products array as an Observable', () => {
      const products = [{ id: 'p1', sku: 'SKU-001', name: 'Widget', category: 'Parts', lifecycleState: 'ACTIVE', msrp: null }];
      apiStub.get.mockReturnValueOnce(of(products));

      let result: unknown;
      service.searchProducts('widget').subscribe(r => (result = r));

      expect(result).toEqual(products);
    });
  });

  // ── createProduct() ──────────────────────────────────────────────────────────

  describe('createProduct()', () => {
    it('calls POST /catalog/v1/products', () => {
      const payload = { name: 'New Product', sku: 'SKU-NEW', category: 'Parts' };
      apiStub.post.mockReturnValueOnce(of({ id: 'p-new', ...payload }));

      service.createProduct(payload as any).subscribe();

      const [path, body] = apiStub.post.mock.calls[0];
      expect(path).toBe('/catalog/v1/products');
      expect(body).toEqual(payload);
    });
  });

  // ── getProductLifecycle() ────────────────────────────────────────────────────

  describe('getProductLifecycle()', () => {
    it('calls GET /catalog/v1/products/{id}/lifecycle', () => {
      apiStub.get.mockReturnValueOnce(of({ productId: 'prod-123', currentState: 'ACTIVE' }));

      service.getProductLifecycle('prod-123').subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/catalog/v1/products/prod-123/lifecycle');
    });

    it('URL-encodes the product ID', () => {
      apiStub.get.mockReturnValueOnce(of({}));

      service.getProductLifecycle('prod/with-slash').subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/catalog/v1/products/prod%2Fwith-slash/lifecycle');
    });
  });

  // ── setLifecycleState() ──────────────────────────────────────────────────────

  describe('setLifecycleState()', () => {
    it('calls PUT /catalog/v1/products/{id}/lifecycle', () => {
      const transition = { targetState: 'INACTIVE', effectiveAt: '2026-03-01T00:00:00Z' };
      apiStub.put.mockReturnValueOnce(of({ productId: 'prod-123', currentState: 'INACTIVE' }));

      service.setLifecycleState('prod-123', transition as any).subscribe();

      const [path, body] = apiStub.put.mock.calls[0];
      expect(path).toBe('/catalog/v1/products/prod-123/lifecycle');
      expect(body).toEqual(transition);
    });
  });

  // ── getItemCosts() ───────────────────────────────────────────────────────────

  describe('getItemCosts()', () => {
    it('calls GET /catalog/v1/items/{id}/costs', () => {
      apiStub.get.mockReturnValueOnce(of({ standardCost: 10 }));

      service.getItemCosts('item-abc').subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/catalog/v1/items/item-abc/costs');
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
    it('calls GET /catalog/v1/msrp with productSku param', () => {
      apiStub.get.mockReturnValueOnce(of([]));

      service.listMsrp('SKU-001').subscribe();

      const [path, params] = apiStub.get.mock.calls[0];
      expect(path).toBe('/catalog/v1/msrp');
      expect((params as HttpParams).get('productSku')).toBe('SKU-001');
    });
  });

  // ── createLocationPriceOverride() ────────────────────────────────────────────

  describe('createLocationPriceOverride()', () => {
    it('calls POST /catalog/v1/location-price-overrides', () => {
      const override = { locationId: 'loc-1', productSku: 'SKU-001', overridePrice: 9.99 };
      apiStub.post.mockReturnValueOnce(of({ id: 'ovr-1', ...override }));

      service.createLocationPriceOverride(override as any).subscribe();

      const [path, body] = apiStub.post.mock.calls[0];
      expect(path).toBe('/catalog/v1/location-price-overrides');
      expect(body).toEqual(override);
    });
  });

  // ── upsertLocationGuardrailPolicy() ─────────────────────────────────────────

  describe('upsertLocationGuardrailPolicy()', () => {
    it('calls PUT /catalog/v1/location-price-overrides/guardrails', () => {
      const policy = { locationId: 'loc-1', floorPct: 0.85, ceilPct: 1.15 };
      apiStub.put.mockReturnValueOnce(of({ ...policy, id: 'guardrail-1' }));

      service.upsertLocationGuardrailPolicy(policy as any).subscribe();

      const [path, body] = apiStub.put.mock.calls[0];
      expect(path).toBe('/catalog/v1/location-price-overrides/guardrails');
      expect(body).toEqual(policy);
    });
  });
});
