import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { ProductListComponent } from './product-list.component';
import { ProductCatalogService } from '../../../services/product-catalog.service';

describe('ProductListComponent', () => {
  let fixture: ComponentFixture<ProductListComponent>;
  let component: ProductListComponent;

  const mockCatalog = {
    searchProducts: vi.fn().mockReturnValue(of([])),
    createProduct: vi.fn().mockReturnValue(of({})),
    getProductById: vi.fn().mockReturnValue(of({})),
  };

  const sampleProducts = [
    { id: 'p1', sku: 'SKU-001', name: 'Widget A', category: 'Parts', lifecycleState: 'ACTIVE', msrp: null },
    { id: 'p2', sku: 'SKU-002', name: 'Widget B', category: 'Parts', lifecycleState: 'ACTIVE', msrp: 9.99 },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductListComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ProductCatalogService, useValue: mockCatalog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductListComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Initial state ─────────────────────────────────────────────────────────────

  it('initializes with state "idle"', () => {
    expect(component.state()).toBe('idle');
  });

  it('initializes with an empty products list', () => {
    expect(component.products()).toHaveLength(0);
  });

  // ── State: loading ────────────────────────────────────────────────────────────

  it('transitions to "loading" when a non-empty query is submitted', fakeAsync(() => {
    const pending$ = new Subject<any>();
    mockCatalog.searchProducts.mockReturnValue(pending$);

    component.query.set('widget');
    component.search();
    tick(300);

    expect(component.state()).toBe('loading');
    pending$.complete();
  }));

  // ── State: ready ──────────────────────────────────────────────────────────────

  it('transitions to "ready" when service returns non-empty results', fakeAsync(() => {
    mockCatalog.searchProducts.mockReturnValue(of(sampleProducts));

    component.query.set('widget');
    component.search();
    tick(300);

    expect(component.state()).toBe('ready');
    expect(component.products()).toEqual(sampleProducts);
  }));

  // ── State: empty ──────────────────────────────────────────────────────────────

  it('transitions to "empty" when service returns an empty array', fakeAsync(() => {
    mockCatalog.searchProducts.mockReturnValue(of([]));

    component.query.set('noresults');
    component.search();
    tick(300);

    expect(component.state()).toBe('empty');
    expect(component.products()).toHaveLength(0);
  }));

  // ── State: error ──────────────────────────────────────────────────────────────

  it('transitions to "error" when service throws', fakeAsync(() => {
    mockCatalog.searchProducts.mockReturnValue(throwError(() => new Error('network error')));

    component.query.set('widget');
    component.search();
    tick(300);

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PRODUCT.LIST.ERROR.LOAD');
  }));

  // ── Back to idle ──────────────────────────────────────────────────────────────

  it('resets to "idle" when query is cleared after a prior search', fakeAsync(() => {
    mockCatalog.searchProducts.mockReturnValue(of(sampleProducts));
    component.query.set('widget');
    component.search();
    tick(300);
    expect(component.state()).toBe('ready');

    component.query.set('');
    component.search();
    tick(300);

    expect(component.state()).toBe('idle');
    expect(component.products()).toHaveLength(0);
  }));
});
