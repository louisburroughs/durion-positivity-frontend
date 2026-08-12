import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { ProductDetailComponent } from './product-detail.component';
import { ProductCatalogService } from '../../../services/product-catalog.service';
import { SupplierAvailabilityService } from '../../../../positivity/services/supplier-availability.service';
import { SupplierDeliveryLocationService } from '../../../../positivity/services/supplier-delivery-location.service';
import { SupplierEnrichmentService } from '../../../../positivity/services/supplier-enrichment.service';

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

  it('loadProduct() calls listCostStructures with productId', () => {
    expect(mockCatalog.listCostStructures).toHaveBeenCalledWith('prod-123');
  });

  it('loadProduct() calls getAuditHistory with productId', () => {
    expect(mockCatalog.getAuditHistory).toHaveBeenCalledWith('prod-123');
  });
});

// ── Supplier section isolation (issues #190 / #195) ─────────────────────────────
//
// The guarantee under test: the supplier availability and manufacturer
// enrichment sections load independently, and *no* outcome of theirs — timeout,
// 500, 403, or a pos-location outage — may reach this page's own state machine
// (DECISION-POSITIVITY-004). These tests render the real child components with
// failing supplier services and assert that the page still reports `ready` with
// a null `errorKey`, and that the catalog-owned content is still on screen.

describe('ProductDetailComponent — supplier section isolation', () => {
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
    getProductById: vi.fn(),
    getProductLifecycle: vi.fn(),
    getReplacements: vi.fn(),
    listUomConversions: vi.fn(),
    getItemCosts: vi.fn(),
    listCostStructures: vi.fn(),
    getAuditHistory: vi.fn(),
    setLifecycleState: vi.fn(),
    addReplacementProduct: vi.fn(),
    createUomConversion: vi.fn(),
    updateUomConversion: vi.fn(),
    deactivateUomConversion: vi.fn(),
    updateStandardCost: vi.fn(),
  };

  const availabilityService = {
    getAvailabilityByProductId: vi.fn(),
    getAvailabilityBySku: vi.fn(),
  };
  const enrichmentService = { getProductEnrichment: vi.fn(), listUnmatchedEnrichment: vi.fn() };
  const selectedLocationId = signal<string | null>(null);
  const locationService = {
    listActiveLocations: vi.fn(),
    select: vi.fn((id: string | null) => selectedLocationId.set(id)),
    selectedLocationId,
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
        { provide: SupplierAvailabilityService, useValue: availabilityService },
        { provide: SupplierEnrichmentService, useValue: enrichmentService },
        { provide: SupplierDeliveryLocationService, useValue: locationService },
      ],
    }).compileComponents();

    const created = TestBed.createComponent(ProductDetailComponent);
    created.detectChanges();
    return created;
  }

  beforeEach(() => {
    selectedLocationId.set('loc-a');
    mockCatalog.getProductById.mockReturnValue(of(mockProduct));
    mockCatalog.getProductLifecycle.mockReturnValue(of(mockLifecycle));
    mockCatalog.getReplacements.mockReturnValue(of([]));
    mockCatalog.listUomConversions.mockReturnValue(of([]));
    mockCatalog.getItemCosts.mockReturnValue(
      of({ id: 'ic-1', itemId: 'prod-123', standardCost: 10, costStructures: [] }),
    );
    mockCatalog.listCostStructures.mockReturnValue(
      of([{ id: 'cs-1', itemId: 'prod-123', structures: [] }]),
    );
    mockCatalog.getAuditHistory.mockReturnValue(of([]));
    locationService.listActiveLocations.mockReturnValue(
      of([{ locationId: 'loc-a', name: 'Downtown Service Center' }]),
    );
    availabilityService.getAvailabilityByProductId.mockReturnValue(
      of({
        productId: 'prod-123',
        deliveryLocationId: 'loc-a',
        fetchedAt: '2026-08-12T11:59:00Z',
        stalenessThresholdMinutes: 60,
        vendors: [],
      }),
    );
    enrichmentService.getProductEnrichment.mockReturnValue(of(null));
  });

  afterEach(() => vi.clearAllMocks());

  it('renders the availability section and keeps the page ready', async () => {
    const isolated = await setup();
    const el = isolated.nativeElement as HTMLElement;

    expect(el.querySelector('app-supplier-availability-panel')).not.toBeNull();
    expect(isolated.componentInstance.state()).toBe('ready');
  });

  it('a supplier availability failure never flips the page into an error state', async () => {
    availabilityService.getAvailabilityByProductId.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 504, statusText: 'Gateway Timeout' })),
    );
    const isolated = await setup();

    expect(isolated.componentInstance.state()).toBe('ready');
    expect(isolated.componentInstance.errorKey()).toBeNull();
  });

  it('a supplier availability failure leaves the catalog-owned content on screen', async () => {
    availabilityService.getAvailabilityByProductId.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error' })),
    );
    const isolated = await setup();
    const el = isolated.nativeElement as HTMLElement;

    expect(el.querySelector('#product-detail-title')?.textContent?.trim()).toBe('Test Product');
    expect(el.querySelector('.tabs')).not.toBeNull();
    expect(isolated.componentInstance.product()).toEqual(mockProduct);
  });

  it('a 403 from the supplier API never flips the page into an error state', async () => {
    availabilityService.getAvailabilityByProductId.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    const isolated = await setup();

    expect(isolated.componentInstance.state()).toBe('ready');
    expect(isolated.componentInstance.errorKey()).toBeNull();
  });

  it('a pos-location outage degrades only the location picker, not the page', async () => {
    locationService.listActiveLocations.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 503, statusText: 'Service Unavailable' })),
    );
    const isolated = await setup();

    expect(isolated.componentInstance.state()).toBe('ready');
    expect(isolated.componentInstance.errorKey()).toBeNull();
  });

  it('an enrichment failure never flips the page into an error state', async () => {
    enrichmentService.getProductEnrichment.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error' })),
    );
    const isolated = await setup();

    expect(isolated.componentInstance.state()).toBe('ready');
    expect(isolated.componentInstance.errorKey()).toBeNull();
  });

  it('renders no enrichment markup at all for an unenriched product', async () => {
    const isolated = await setup();
    const el = isolated.nativeElement as HTMLElement;

    expect(el.querySelector('.enrich-panel')).toBeNull();
    expect(el.textContent).not.toContain('POSITIVITY.ENRICHMENT.TITLE');
  });

  it('holds no supplier state of its own — the sections are imported, not absorbed', async () => {
    const isolated = await setup();
    const keys = Object.keys(isolated.componentInstance as unknown as Record<string, unknown>);

    expect(keys.some(key => /supplier|availability|enrichment|vendor/i.test(key))).toBe(false);
  });
});
