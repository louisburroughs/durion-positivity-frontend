import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { LocationAPIService } from '@durion-sdk/location';
import type { LocationRef } from '@durion-sdk/location';
import { ProductsAPIService } from '@durion-sdk/catalog';
import type { ProductSummary } from '@durion-sdk/catalog';
import { InventoryRollupApiService } from '../../../services/inventory-rollup.service';
import type {
  LocationInventoryRollupResponse,
  RollupQuantities,
} from '../../../models/inventory-rollup.models';
import { LocationInventoryOverviewPageComponent } from './location-inventory-overview-page.component';

// ── Fixtures ──────────────────────────────────────────────────────────────

const qty = (onHand: number, allocated: number, available: number): RollupQuantities => ({
  onHand,
  allocated,
  available,
});

const rollup = (totals: RollupQuantities): LocationInventoryRollupResponse => ({
  locationId: 'loc',
  parentType: 'PHYSICAL',
  totals,
  sites: [],
});

const product = (sku: string, name: string): ProductSummary => ({
  productId: `prod-${sku}`,
  sku,
  name,
});

const location = (id: string, name: string): LocationRef => ({ id, name } as LocationRef);

// ── Setup ─────────────────────────────────────────────────────────────────

const rollupServiceStub = { getLocationRollup: vi.fn() };
const locationServiceStub = { getRoster: vi.fn() };
const productsServiceStub = { searchProducts: vi.fn() };
const routerStub = { navigate: vi.fn().mockResolvedValue(true) };

function createComponent(routeQuery: Record<string, string> = {}, routePath: Record<string, string> = {}) {
  TestBed.configureTestingModule({
    imports: [LocationInventoryOverviewPageComponent, TranslateModule.forRoot()],
    providers: [
      { provide: InventoryRollupApiService, useValue: rollupServiceStub },
      { provide: LocationAPIService, useValue: locationServiceStub },
      { provide: ProductsAPIService, useValue: productsServiceStub },
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: of(convertToParamMap(routeQuery)),
          snapshot: {
            paramMap: convertToParamMap(routePath),
            queryParamMap: convertToParamMap(routeQuery),
          },
        },
      },
      { provide: Router, useValue: routerStub },
    ],
  });
  return TestBed.createComponent(LocationInventoryOverviewPageComponent);
}

beforeEach(() => {
  vi.clearAllMocks();
  routerStub.navigate.mockResolvedValue(true);
  locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
  rollupServiceStub.getLocationRollup.mockReturnValue(of(rollup(qty(0, 0, 0))));
  productsServiceStub.searchProducts.mockReturnValue(of({ data: [] as ProductSummary[] }));
});

// ── Idle / gating ───────────────────────────────────────────────────────

describe('idle gating (require ≥1 location and ≥1 product)', () => {
  it('is idle with no selections', fakeAsync(() => {
    const fixture = createComponent();
    fixture.detectChanges();
    tick();
    expect(fixture.componentInstance.state()).toBe('idle');
    expect(fixture.componentInstance.canTally()).toBe(false);
  }));

  it('stays idle with a location but no product', fakeAsync(() => {
    const fixture = createComponent();
    fixture.detectChanges();
    tick();

    const comp = fixture.componentInstance;
    comp.selectLocation(location('l1', 'HQ'));
    tick();

    expect(comp.selectedLocations().length).toBe(1);
    expect(comp.state()).toBe('idle');
    expect(rollupServiceStub.getLocationRollup).not.toHaveBeenCalled();
  }));
});

// ── Tally grid ────────────────────────────────────────────────────────────

describe('tally grid (location × product)', () => {
  it('builds one row for a single location and product', fakeAsync(() => {
    rollupServiceStub.getLocationRollup.mockReturnValue(of(rollup(qty(10, 3, 7))));
    const fixture = createComponent();
    fixture.detectChanges();
    tick();

    const comp = fixture.componentInstance;
    comp.selectLocation(location('l1', 'HQ'));
    tick();
    comp.selectProduct(product('SKU-7', 'Widget'));
    tick();

    const rows = comp.resultRows();
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      locationName: 'HQ',
      productName: 'Widget',
      sku: 'SKU-7',
      onHand: 10,
      allocated: 3,
      available: 7,
    });
    expect(comp.state()).toBe('ready');
  }));

  it('fans out one query per (location × product) and tallies totals', fakeAsync(() => {
    rollupServiceStub.getLocationRollup.mockImplementation(
      (loc: string, opts: { sku?: string }) => {
        // Distinct quantity per cell so the grid + totals are unambiguous.
        const map: Record<string, RollupQuantities> = {
          'l1|SKU-7': qty(5, 1, 4),
          'l1|SKU-8': qty(3, 0, 3),
          'l2|SKU-7': qty(2, 0, 2),
          'l2|SKU-8': qty(10, 4, 6),
        };
        return of(rollup(map[`${loc}|${opts.sku}`] ?? qty(0, 0, 0)));
      },
    );
    const fixture = createComponent();
    fixture.detectChanges();
    tick();

    const comp = fixture.componentInstance;
    comp.selectLocation(location('l1', 'HQ'));
    tick();
    comp.selectLocation(location('l2', 'Depot'));
    tick();
    comp.selectProduct(product('SKU-7', 'Widget'));
    tick();
    comp.selectProduct(product('SKU-8', 'Gizmo'));
    tick();

    const rows = comp.resultRows();
    // 2 locations × 2 products
    expect(rows.length).toBe(4);
    expect(rows.map(r => r.key)).toEqual(['l1|SKU-7', 'l1|SKU-8', 'l2|SKU-7', 'l2|SKU-8']);
    // Totals = sum of all cells: onHand 20, allocated 5, available 15.
    expect(comp.grandTotals()).toEqual({ onHand: 20, allocated: 5, available: 15 });
  }));

  it('flags negative available on a row and in totals', fakeAsync(() => {
    rollupServiceStub.getLocationRollup.mockReturnValue(of(rollup(qty(5, 9, -4))));
    const fixture = createComponent();
    fixture.detectChanges();
    tick();

    const comp = fixture.componentInstance;
    comp.selectLocation(location('l1', 'HQ'));
    tick();
    comp.selectProduct(product('SKU-7', 'Widget'));
    tick();

    expect(comp.resultRows()[0].availableNegative).toBe(true);
    expect(comp.grandTotalNegative()).toBe(true);
  }));
});

// ── Selection management ─────────────────────────────────────────────────

describe('selection management', () => {
  function ready(fixture: ReturnType<typeof createComponent>) {
    const comp = fixture.componentInstance;
    comp.selectLocation(location('l1', 'HQ'));
    tick();
    comp.selectLocation(location('l2', 'Depot'));
    tick();
    comp.selectProduct(product('SKU-7', 'Widget'));
    tick();
    return comp;
  }

  it('ignores duplicate location selection', fakeAsync(() => {
    const fixture = createComponent();
    fixture.detectChanges();
    tick();
    const comp = ready(fixture);

    rollupServiceStub.getLocationRollup.mockClear();
    comp.selectLocation(location('l1', 'HQ'));
    tick();

    expect(comp.selectedLocations().length).toBe(2);
    expect(rollupServiceStub.getLocationRollup).not.toHaveBeenCalled();
  }));

  it('re-tallies when a location is removed; idle once none remain', fakeAsync(() => {
    const fixture = createComponent();
    fixture.detectChanges();
    tick();
    const comp = ready(fixture);

    comp.removeLocation('l1');
    tick();
    expect(comp.resultRows().length).toBe(1);
    expect(comp.resultRows()[0].locationId).toBe('l2');

    comp.removeLocation('l2');
    tick();
    expect(comp.state()).toBe('idle');
    expect(comp.resultRows().length).toBe(0);
  }));

  it('clears all products → idle', fakeAsync(() => {
    const fixture = createComponent();
    fixture.detectChanges();
    tick();
    const comp = ready(fixture);

    comp.clearSelectedProducts();
    tick();
    expect(comp.selectedProducts().length).toBe(0);
    expect(comp.state()).toBe('idle');
  }));

  it('writes the location selection to the ?locations query param', fakeAsync(() => {
    const fixture = createComponent();
    fixture.detectChanges();
    tick();

    fixture.componentInstance.selectLocation(location('l1', 'HQ'));
    tick();
    fixture.componentInstance.selectLocation(location('l2', 'Depot'));
    tick();

    const lastNav = routerStub.navigate.mock.calls.at(-1)!;
    expect(lastNav[0]).toEqual(['/app/inventory/by-location']);
    expect((lastNav[1] as { queryParams: { locations: string } }).queryParams.locations).toBe('l1,l2');
  }));
});

// ── Deep link ────────────────────────────────────────────────────────────

describe('deep link via ?locations', () => {
  it('seeds the selection from the query param and back-fills names from the roster', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(
      of({ content: [location('l1', 'HQ'), location('l2', 'Depot')] }),
    );
    rollupServiceStub.getLocationRollup.mockReturnValue(of(rollup(qty(1, 0, 1))));

    const fixture = createComponent({ locations: 'l1,l2' });
    fixture.detectChanges();
    tick();

    const comp = fixture.componentInstance;
    expect(comp.selectedLocations().map(l => l.id)).toEqual(['l1', 'l2']);
    expect(comp.selectedLocations().map(l => l.name)).toEqual(['HQ', 'Depot']);
    // No products yet → idle.
    expect(comp.state()).toBe('idle');

    comp.selectProduct(product('SKU-7', 'Widget'));
    tick();
    expect(comp.resultRows().length).toBe(2);
  }));
});

// ── Product typeahead ────────────────────────────────────────────────────

describe('product typeahead', () => {
  it('searches the catalog (name or SKU), debounced', fakeAsync(() => {
    productsServiceStub.searchProducts.mockReturnValue(of({ data: [product('SKU-7', 'Widget')] }));
    const fixture = createComponent();
    fixture.detectChanges();
    tick();

    const comp = fixture.componentInstance;
    comp.onProductInput('wid');
    tick(100);
    expect(productsServiceStub.searchProducts).not.toHaveBeenCalled();
    tick(200);
    expect(productsServiceStub.searchProducts).toHaveBeenCalledTimes(1);
    expect(comp.productSuggestions().length).toBe(1);
  }));

  it('navigates suggestions and selects with the keyboard', fakeAsync(() => {
    productsServiceStub.searchProducts.mockReturnValue(
      of({ data: [product('SKU-7', 'Widget'), product('SKU-8', 'Gizmo')] }),
    );
    const fixture = createComponent();
    fixture.detectChanges();
    tick();

    const comp = fixture.componentInstance;
    comp.selectLocation(location('l1', 'HQ'));
    tick();
    comp.onProductInput('gi');
    tick(300);

    const preventDefault = vi.fn();
    comp.onProductKeydown({ key: 'ArrowDown', preventDefault } as unknown as KeyboardEvent);
    comp.onProductKeydown({ key: 'ArrowDown', preventDefault } as unknown as KeyboardEvent);
    expect(comp.activeProductIndex()).toBe(1);
    comp.onProductKeydown({ key: 'Enter', preventDefault } as unknown as KeyboardEvent);
    tick();

    expect(comp.selectedProducts().map(p => p.sku)).toEqual(['SKU-8']);
  }));
});

// ── Errors & cancellation ────────────────────────────────────────────────

describe('errors and cancellation', () => {
  it('surfaces a forbidden error', fakeAsync(() => {
    const fixture = createComponent();
    fixture.detectChanges();
    tick();

    const comp = fixture.componentInstance;
    comp.selectLocation(location('l1', 'HQ'));
    tick();

    rollupServiceStub.getLocationRollup.mockReturnValue(
      throwError(() => ({ kind: 'forbidden', message: 'nope' })),
    );
    comp.selectProduct(product('SKU-7', 'Widget'));
    tick();

    expect(comp.state()).toBe('error');
    expect(comp.errorKind()).toBe('forbidden');
  }));

  it('a newer load cancels the previous in-flight tally', fakeAsync(() => {
    const fixture = createComponent();
    fixture.detectChanges();
    tick();
    const comp = fixture.componentInstance;

    comp.selectLocation(location('l1', 'HQ'));
    tick();

    // First product: never-completing request → stays loading.
    const never$ = new Subject<LocationInventoryRollupResponse>();
    rollupServiceStub.getLocationRollup.mockReturnValue(never$.asObservable());
    comp.selectProduct(product('SKU-7', 'Widget'));
    tick();
    expect(comp.state()).toBe('loading');

    // Removing it issues a newer load (now no products) → idle; the in-flight
    // tally subscription is cancelled.
    comp.removeProduct('SKU-7');
    tick();
    expect(comp.state()).toBe('idle');

    // Late emit from the cancelled request must not resurrect a tally.
    never$.next(rollup(qty(99, 0, 99)));
    tick();
    expect(comp.state()).toBe('idle');
    expect(comp.resultRows().length).toBe(0);
  }));
});
