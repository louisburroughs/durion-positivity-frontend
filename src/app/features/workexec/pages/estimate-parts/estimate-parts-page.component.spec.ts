import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { map } from 'rxjs/operators';
import { EstimatePartsPageComponent } from './estimate-parts-page.component';
import { BASE_PATH } from '@durion-sdk/workorder';
import { environment } from '../../../../../environments/environment';
import { ProductCatalogService } from '../../../product/services/product-catalog.service';
import { PRODUCT_CATALOG_SOURCE } from '../../../../shared/product-catalog/product-catalog-source.tokens';

const BASE = environment.apiBaseUrl;

const mockActivatedRoute = {
  snapshot: { paramMap: { get: (k: string) => k === 'estimateId' ? 'est-123' : null } },
};

describe('EstimatePartsPageComponent [Story 238]', () => {
  let fixture: ComponentFixture<EstimatePartsPageComponent>;
  let component: EstimatePartsPageComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EstimatePartsPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: BASE_PATH, useValue: environment.apiBaseUrl },
        // Real ProductCatalogService (real HTTP, captured by HttpTestingController
        // below), wired synchronously instead of through the app's lazy `import()`
        // adapter (provideProductCatalogSource) — see estimate-detail-page's spec
        // for why. The adapter's own mapping is covered by
        // product-catalog-source.provider.spec.ts.
        {
          provide: PRODUCT_CATALOG_SOURCE,
          useFactory: (catalog: ProductCatalogService) => ({
            searchServices: (query: string) => catalog.searchServices(query),
            searchProducts: (query: string) => catalog.searchProducts(query),
            getActiveMsrpAmount: (sku: string) =>
              catalog.getActiveMsrp(sku).pipe(map(msrp => msrp?.amount ?? null)),
          }),
          deps: [ProductCatalogService],
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EstimatePartsPageComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should create the component', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({
      id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: [],
    });
    expect(component).toBeTruthy();
  });

  it('should load estimate on init', () => {
    fixture.detectChanges();
    const req = http.expectOne(`${BASE}/v1/workorders/estimates/est-123`);
    req.flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: [] });
    fixture.detectChanges();
    expect(component.state()).toBe('ready');
    expect(component.estimate()?.id).toBe('est-123');
  });

  it('should not submit add form when fields empty', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({
      id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: [],
    });
    component.addItem();
    http.expectNone(`${BASE}/v1/workorders/estimates/est-123/items`);
    expect(component.saveState()).toBe('idle');
  });

  it('should POST addEstimateItem then recalculate and reload on valid add', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({
      id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: [],
    });

    component.addForm.setValue({ description: 'Brake pad', quantity: 2, unitPrice: 49.99, taxCode: '', productId: '' });
    component.addItem();

    const addReq = http.expectOne(`${BASE}/v1/workorders/estimates/est-123/items`);
    expect(addReq.request.body['itemType']).toBe('PART');
    addReq.flush({ id: 'item-1', estimateId: 'est-123', itemType: 'PART', quantity: 2, unitPrice: 49.99 });

    const calcReq = http.expectOne(`${BASE}/v1/workorders/estimates/est-123/calculate`);
    calcReq.flush({ subtotal: 99.98, taxAmount: 8.5, total: 108.48 });

    const reloadReq = http.expectOne(`${BASE}/v1/workorders/estimates/est-123`);
    reloadReq.flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: [
      { id: 'item-1', estimateId: 'est-123', itemType: 'PART', quantity: 2, unitPrice: 49.99, lineTotal: 99.98 }
    ]});

    expect(component.saveState()).toBe('success');
    expect(component.items().length).toBe(1);
  });

  it('should show 409 conflict error when estimate is not DRAFT', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({
      id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: [],
    });

    component.addForm.setValue({ description: 'Part', quantity: 1, unitPrice: 10, taxCode: '', productId: '' });
    component.addItem();

    const addReq = http.expectOne(`${BASE}/v1/workorders/estimates/est-123/items`);
    addReq.flush({ code: 'INVALID_STATE' }, { status: 409, statusText: 'Conflict' });

    expect(component.saveState()).toBe('error');
    expect(component.errorMessage()).toContain('DRAFT');
  });

  it('looks up active MSRP by SKU, not by id, for a product whose id differs from its SKU (#366 followup)', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({
      id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: [],
    });

    component.selectPart({ id: 'product-uuid-1', sku: 'SKU-999', name: 'Brake Pad', category: 'parts' });

    const req = http.expectOne(r => r.url.includes('/msrp/active'));
    expect(req.request.url).toContain('SKU-999');
    expect(req.request.url).not.toContain('product-uuid-1');
    req.flush({ msrpId: 'm-1', productId: 'SKU-999', amount: '24.99', currency: 'USD', effectiveStartDate: '2024-01-01' });

    expect(component.addForm.getRawValue().unitPrice).toBe(24.99);
    expect(component.priceState()).toBe('filled');
  });

  it('skips the MSRP lookup when the selected part has no SKU', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({
      id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: [],
    });

    component.selectPart({ id: 'product-uuid-2', name: 'Unlabeled part', category: 'parts' });

    http.expectNone(req => req.url.includes('/msrp/active'));
    expect(component.priceState()).toBe('none');
  });

  /**
   * PR #367 followup: an in-flight active-MSRP lookup for a previously-selected
   * SKU part must not land after the user has since selected a different,
   * SKU-less part and patch that (unrelated) part's unitPrice/priceState. The
   * lookup is owned by the selection that issued it via a sequence counter.
   */
  it('ignores a stale MSRP response for a part selection the user has since replaced', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({
      id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: [],
    });

    // Select part A (has a SKU) — kicks off an MSRP lookup that stays pending
    // until flushed below, standing in for the RxJS Subject the project's
    // ordering-test convention (ADR-0035 §6) otherwise drives directly.
    component.selectPart({ id: 'a-uuid', sku: 'SKU-A', name: 'Part A', category: 'parts' });
    const lookupA = http.expectOne(r => r.url.includes('/msrp/active'));
    expect(component.priceState()).toBe('loading');

    // Before A's lookup resolves, the user selects a SKU-less part B — the
    // early-return branch, which still must own the price fields going forward.
    component.selectPart({ id: 'b-uuid', name: 'Part B', category: 'parts' });
    http.expectNone(r => r.url.includes('/msrp/active'));
    expect(component.priceState()).toBe('none');
    expect(component.selectedPart()?.id).toBe('b-uuid');
    const unitPriceBeforeResolve = component.addForm.getRawValue().unitPrice;

    // A's stale lookup finally resolves — must be ignored, not applied to B.
    lookupA.flush({ msrpId: 'm-1', productId: 'SKU-A', amount: '24.99', currency: 'USD', effectiveStartDate: '2024-01-01' });

    expect(component.priceState()).toBe('none');
    expect(component.addForm.getRawValue().unitPrice).toBe(unitPriceBeforeResolve);
    expect(component.selectedPart()?.id).toBe('b-uuid');
  });
});
