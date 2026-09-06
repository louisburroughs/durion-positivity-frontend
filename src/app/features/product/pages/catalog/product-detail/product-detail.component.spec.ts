import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { ProductDetailComponent } from './product-detail.component';
import { ProductCatalogService } from '../../../services/product-catalog.service';
import { ProductTreadDesignService } from '../../../services/product-tread-design.service';

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
    TestBed.resetTestingModule();

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

    expect(component.state()).toBe('error');
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

  it('loadProduct() calls getAuditHistory with productId', () => {
    expect(mockCatalog.getAuditHistory).toHaveBeenCalledWith('prod-123');
  });
});

// ── Manufacturer enrichment panel (#195; restored #218) ─────────────────────
//
// The enrichment panel now renders via TreadDesignEnrichmentPanelComponent,
// which owns its own fetch and never raises to this page — see that
// component's spec for its isolation and "absence renders nothing" coverage.
// These tests only confirm ProductDetailComponent hosts it and never gates
// its own state on it.
describe('ProductDetailComponent — enrichment panel hosting (#218)', () => {
  const mockCatalog = {
    getProductById: vi.fn().mockReturnValue(
      of({ id: 'prod-123', sku: 'SKU-001', name: 'Test Product', category: 'Parts', description: 'x', status: 'ACTIVE', msrp: null }),
    ),
    getProductLifecycle: vi.fn().mockReturnValue(
      of({ productId: 'prod-123', currentState: 'ACTIVE', effectiveAt: '2026-01-01T00:00:00Z', lastChangedBy: 'system', lastChangedAt: '2026-01-01T00:00:00Z' }),
    ),
    getReplacements: vi.fn().mockReturnValue(of([])),
    listUomConversions: vi.fn().mockReturnValue(of([])),
    getItemCosts: vi.fn().mockReturnValue(of([])),
    getAuditHistory: vi.fn().mockReturnValue(of([])),
    setLifecycleState: vi.fn(),
    addReplacementProduct: vi.fn(),
    createUomConversion: vi.fn(),
    updateUomConversion: vi.fn(),
    deactivateUomConversion: vi.fn(),
    updateStandardCost: vi.fn(),
  };

  async function setup(
    treadDesignService: { getEnrichmentForProduct: ReturnType<typeof vi.fn> },
  ): Promise<ComponentFixture<ProductDetailComponent>> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ProductDetailComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ productId: 'prod-123' })) },
        },
        { provide: ProductCatalogService, useValue: mockCatalog },
        { provide: ProductTreadDesignService, useValue: treadDesignService },
      ],
    }).compileComponents();

    const created = TestBed.createComponent(ProductDetailComponent);
    created.detectChanges();
    return created;
  }

  it('hosts the enrichment panel and stays ready even when there is no match', async () => {
    const treadDesignService = { getEnrichmentForProduct: vi.fn().mockReturnValue(of(null)) };
    const isolated = await setup(treadDesignService);
    const el = isolated.nativeElement as HTMLElement;

    expect(el.querySelector('app-tread-design-enrichment-panel')).not.toBeNull();
    expect(el.querySelector('.enrichment-panel')).toBeNull();
    expect(isolated.componentInstance.state()).toBe('ready');
  });

  it('hosts the enrichment panel with content and never gates page state on it', async () => {
    const treadDesignService = {
      getEnrichmentForProduct: vi.fn().mockReturnValue(
        of({
          id: 'td-1',
          brand: 'Acme',
          treadDesign: null,
          treadDesign2: null,
          productName: null,
          vehicleType: null,
          seasonality: null,
          supplierRef: null,
          vendorProfileId: null,
          vendorVariantId: null,
          updatedAt: null,
          hasUnresolvedImages: false,
          images: [],
          texts: [],
        }),
      ),
    };
    const isolated = await setup(treadDesignService);
    const el = isolated.nativeElement as HTMLElement;

    expect(el.querySelector('.enrichment-panel')).not.toBeNull();
    expect(isolated.componentInstance.state()).toBe('ready');
    expect(isolated.componentInstance.errorKey()).toBeNull();
  });
});

// ── Supplier availability panel (#212) ──────────────────────────────────────────

describe('ProductDetailComponent — availability tab (#212)', () => {
  const availabilityMockProduct = {
    id: 'prod-123',
    sku: 'SKU-001',
    name: 'Test Product',
    category: 'Parts',
    description: 'A test product',
    status: 'ACTIVE',
    msrp: null,
  };

  const availabilityMockLifecycle = {
    productId: 'prod-123',
    currentState: 'ACTIVE' as const,
    effectiveAt: '2026-01-01T00:00:00Z',
    lastChangedBy: 'system',
    lastChangedAt: '2026-01-01T00:00:00Z',
  };

  const mockCatalog = {
    getProductById: vi.fn().mockReturnValue(of(availabilityMockProduct)),
    getProductLifecycle: vi.fn().mockReturnValue(of(availabilityMockLifecycle)),
    getReplacements: vi.fn().mockReturnValue(of([])),
    listUomConversions: vi.fn().mockReturnValue(of([])),
    getItemCosts: vi.fn().mockReturnValue(
      of({ id: 'ic-1', itemId: 'prod-123', standardCost: 10, costStructures: [] }),
    ),
    getAuditHistory: vi.fn().mockReturnValue(of([])),
  };

  async function setup(): Promise<ComponentFixture<ProductDetailComponent>> {
    TestBed.resetTestingModule();
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

    const created = TestBed.createComponent(ProductDetailComponent);
    created.detectChanges();
    return created;
  }

  it('renders the availability panel once the availability tab is active', async () => {
    const isolated = await setup();
    isolated.componentInstance.activeTab.set('availability');
    isolated.detectChanges();

    const el = isolated.nativeElement as HTMLElement;
    expect(el.querySelector('app-supplier-availability-panel')).not.toBeNull();
  });

  it('does not render the availability panel on other tabs', async () => {
    const isolated = await setup();

    const el = isolated.nativeElement as HTMLElement;
    expect(el.querySelector('app-supplier-availability-panel')).toBeNull();
  });
});
