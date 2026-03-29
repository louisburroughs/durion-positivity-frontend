import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { ProductDetailComponent } from './product-detail.component';
import { ProductCatalogService } from '../../../services/product-catalog.service';

describe('ProductDetailComponent', () => {
  let fixture: ComponentFixture<ProductDetailComponent>;
  let component: ProductDetailComponent;

  const mockProduct = {
    id: 'prod-123',
    sku: 'SKU-001',
    name: 'Test Product',
    category: 'Parts',
    description: 'A test product',
    status: 'ACTIVE',
    msrp: null,
  };

  const mockLifecycle = {
    productId: 'prod-123',
    currentState: 'ACTIVE' as const,
    effectiveAt: '2026-01-01T00:00:00Z',
    lastChangedBy: 'system',
    lastChangedAt: '2026-01-01T00:00:00Z',
  };

  const mockCatalog = {
    getProductById: vi.fn().mockReturnValue(of(mockProduct)),
    getProductLifecycle: vi.fn().mockReturnValue(of(mockLifecycle)),
    getReplacements: vi.fn().mockReturnValue(of([])),
    listUomConversions: vi.fn().mockReturnValue(of([])),
    getItemCosts: vi.fn().mockReturnValue(of({ id: 'ic-1', itemId: 'prod-123', standardCost: 10, costStructures: [] })),
    listCostStructures: vi.fn().mockReturnValue(of([{ id: 'cs-1', itemId: 'prod-123', structures: [] }])),
    getAuditHistory: vi.fn().mockReturnValue(of([])),
    setLifecycleState: vi.fn().mockReturnValue(of({ ...mockLifecycle, currentState: 'INACTIVE' as const })),
    addReplacementProduct: vi.fn().mockReturnValue(of({})),
    createUomConversion: vi.fn().mockReturnValue(of({})),
    updateUomConversion: vi.fn().mockReturnValue(of({})),
    deactivateUomConversion: vi.fn().mockReturnValue(of(undefined)),
    updateStandardCost: vi.fn().mockReturnValue(of({})),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductDetailComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ productId: 'prod-123' })) },
        },
        { provide: ProductCatalogService, useValue: mockCatalog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductDetailComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Initialization ────────────────────────────────────────────────────────────

  it('initializes productId from route param', () => {
    expect(component.productId()).toBe('prod-123');
  });

  it('transitions to "ready" after loading product data', () => {
    expect(component.state()).toBe('ready');
  });

  it('stores product in product() signal after load', () => {
    expect(component.product()).toEqual(mockProduct);
  });

  it('stores lifecycle in lifecycle() signal after load', () => {
    expect(component.lifecycle()).toEqual(mockLifecycle);
  });

  it('sets state to "error" when productId param is missing', async () => {
    await TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [ProductDetailComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({})) },
        },
        { provide: ProductCatalogService, useValue: mockCatalog },
      ],
    }).compileComponents();

    const noIdFixture = TestBed.createComponent(ProductDetailComponent);
    const noIdComponent = noIdFixture.componentInstance;

    expect(noIdComponent.state()).toBe('error');
    expect(noIdComponent.errorKey()).toBe('PRODUCT.CATALOG.ERROR.MISSING_PRODUCT_ID');
  });

  // ── setLifecycleState() ───────────────────────────────────────────────────────

  it('setLifecycleState() calls service with productId and transition', () => {
    const transition = { targetState: 'INACTIVE' as const, effectiveAt: '2026-03-01T00:00:00Z' };
    component.setLifecycleState(transition);

    expect(mockCatalog.setLifecycleState).toHaveBeenCalledWith('prod-123', transition);
  });

  it('setLifecycleState() updates lifecycle signal on success', () => {
    const transition = { targetState: 'INACTIVE' as const, effectiveAt: '2026-03-01T00:00:00Z' };
    component.setLifecycleState(transition);

    expect(component.lifecycle()?.currentState).toBe('INACTIVE');
  });

  it('setLifecycleState() sets errorKey on failure', () => {
    mockCatalog.setLifecycleState.mockReturnValueOnce(throwError(() => new Error('server error')));
    const transition = { targetState: 'DISCONTINUED' as const, effectiveAt: '2026-03-01T00:00:00Z' };
    component.setLifecycleState(transition);

    expect(component.errorKey()).toBe('PRODUCT.CATALOG.LIFECYCLE.ERROR.UPDATE');
  });

  // ── deactivateUomConversion() ─────────────────────────────────────────────────

  it('deactivateUomConversion() updates matching entry to active: false', () => {
    component.uomConversions.set([
      { id: 'conv-1', fromUom: 'EA', toUom: 'CASE', conversionFactor: 12, active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'conv-2', fromUom: 'EA', toUom: 'BOX', conversionFactor: 6, active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    ]);

    component.deactivateUomConversion('conv-1');

    const conversions = component.uomConversions();
    expect(conversions.find(c => c.id === 'conv-1')?.active).toBe(false);
    expect(conversions.find(c => c.id === 'conv-2')?.active).toBe(true);
  });

  it('deactivateUomConversion() leaves other conversions unchanged', () => {
    component.uomConversions.set([
      { id: 'conv-1', fromUom: 'EA', toUom: 'CASE', conversionFactor: 12, active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    ]);

    component.deactivateUomConversion('conv-1');

    expect(component.uomConversions()).toHaveLength(1);
  });

  // ── loadProduct() initial service calls ───────────────────────────────────────

  it('loadProduct() calls listCostStructures with productId', () => {
    expect(mockCatalog.listCostStructures).toHaveBeenCalledWith('prod-123');
  });

  it('loadProduct() calls getAuditHistory with productId', () => {
    expect(mockCatalog.getAuditHistory).toHaveBeenCalledWith('prod-123');
  });
});
