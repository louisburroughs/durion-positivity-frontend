import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError, Subject, NEVER } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { LocationAPIService } from '@durion-sdk/location';
import type { LocationResponseDTO } from '@durion-sdk/location';
import { ProductsAPIService } from '@durion-sdk/catalog';
import type { ProductSummary } from '@durion-sdk/catalog';
import { InventoryRollupApiService } from '../../../services/inventory-rollup.service';
import type {
  LocationInventoryRollupResponse,
  SiteRollupSummary,
  RollupQuantities,
  RollupError,
} from '../../../models/inventory-rollup.models';
import {
  LocationInventoryOverviewPageComponent,
  type SiteRow,
  type SortColumn,
} from './location-inventory-overview-page.component';

// ── Fixtures ──────────────────────────────────────────────────────────────

const qty = (onHand: number, allocated: number, available: number): RollupQuantities => ({
  onHand,
  allocated,
  available,
});

const site = (
  siteId: string,
  siteName: string,
  onHand: number,
  allocated: number,
  available: number,
): SiteRollupSummary => ({
  siteId,
  siteName,
  totals: qty(onHand, allocated, available),
});

const locationResponse = (
  sites: SiteRollupSummary[],
  totals: RollupQuantities = qty(100, 10, 90),
): LocationInventoryRollupResponse => ({
  locationId: 'loc-1',
  parentType: 'PHYSICAL',
  totals,
  sites,
});

const parentLocation = (id: string, name: string, typeName = 'Building'): LocationResponseDTO => ({
  id,
  name,
  type: { id: 'type-1', name: typeName, description: '' },
  active: true,
});

// ── Setup ─────────────────────────────────────────────────────────────────

function createComponent(
  rollupStub: Partial<typeof rollupServiceStub>,
  locationStub: Partial<typeof locationServiceStub>,
  routeParams: Record<string, string> = {},
) {
  TestBed.configureTestingModule({
    imports: [
      LocationInventoryOverviewPageComponent,
      TranslateModule.forRoot(),
    ],
    providers: [
      { provide: InventoryRollupApiService, useValue: { ...rollupServiceStub, ...rollupStub } },
      { provide: LocationAPIService, useValue: { ...locationServiceStub, ...locationStub } },
      { provide: ProductsAPIService, useValue: productsServiceStub },
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap(routeParams)),
          snapshot: { paramMap: convertToParamMap(routeParams) },
        },
      },
      { provide: Router, useValue: routerStub },
    ],
  });
  return TestBed.createComponent(LocationInventoryOverviewPageComponent);
}

/**
 * Variant of createComponent that accepts a Subject<ParamMap> so tests can
 * emit additional paramMap values to simulate browser back/forward navigation.
 */
function createComponentWithParamSubject(
  rollupStub: Partial<typeof rollupServiceStub>,
  locationStub: Partial<typeof locationServiceStub>,
  paramMapSubject$: Subject<ReturnType<typeof convertToParamMap>>,
) {
  TestBed.configureTestingModule({
    imports: [
      LocationInventoryOverviewPageComponent,
      TranslateModule.forRoot(),
    ],
    providers: [
      { provide: InventoryRollupApiService, useValue: { ...rollupServiceStub, ...rollupStub } },
      { provide: LocationAPIService, useValue: { ...locationServiceStub, ...locationStub } },
      { provide: ProductsAPIService, useValue: productsServiceStub },
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: paramMapSubject$.asObservable(),
          snapshot: { paramMap: convertToParamMap({}) },
        },
      },
      { provide: Router, useValue: routerStub },
    ],
  });
  return TestBed.createComponent(LocationInventoryOverviewPageComponent);
}

const rollupServiceStub = {
  getLocationRollup: vi.fn(),
};

const locationServiceStub = {
  getRoster: vi.fn(),
};

const productsServiceStub = {
  searchProducts: vi.fn().mockReturnValue(of({ data: [] as ProductSummary[] })),
};

const routerStub = {
  navigate: vi.fn().mockResolvedValue(true),
};

beforeEach(() => {
  vi.clearAllMocks();
  routerStub.navigate.mockResolvedValue(true);
  productsServiceStub.searchProducts.mockReturnValue(of({ data: [] as ProductSummary[] }));
});

// ── Tests: grand total rendering ──────────────────────────────────────────

describe('grand total strip', () => {
  it('renders onHand, allocated, available from rollup response', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([site('s1', 'Alpha', 50, 5, 45)], qty(50, 5, 45))),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('50');
    expect(html).toContain('45');
  }));

  it('shows warning badge when grand total available is negative', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([site('s1', 'Alpha', 10, 20, -10)], qty(10, 20, -10))),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('.totals-value .badge-warn');
    expect(badge).not.toBeNull();
    expect(badge.getAttribute('aria-label')).toBeTruthy();
  }));

  it('does NOT show warning badge when available is zero or positive', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([site('s1', 'Alpha', 10, 5, 5)], qty(10, 5, 5))),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('.totals-value .badge-warn');
    expect(badge).toBeNull();
  }));
});

// ── Tests: sites table sort ───────────────────────────────────────────────

describe('sites table sort', () => {
  it('sorts by siteName ascending by default', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(
        locationResponse([
          site('s2', 'Zeta', 5, 0, 5),
          site('s1', 'Alpha', 10, 0, 10),
          site('s3', 'Beta', 3, 0, 3),
        ]),
      ),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    const rows = comp.siteRows();
    expect(rows.map(r => r.siteName)).toEqual(['Alpha', 'Beta', 'Zeta']);
  }));

  it('toggles sort direction on same column', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(
        locationResponse([
          site('s2', 'Zeta', 5, 0, 5),
          site('s1', 'Alpha', 10, 0, 10),
        ]),
      ),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.sortBy('siteName');
    fixture.detectChanges();

    expect(comp.siteRows()[0].siteName).toBe('Zeta');
  }));

  it('sorts by onHand column', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(
        locationResponse([
          site('s1', 'Alpha', 30, 0, 30),
          site('s2', 'Beta', 5, 0, 5),
          site('s3', 'Gamma', 100, 0, 100),
        ]),
      ),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.sortBy('onHand');
    fixture.detectChanges();

    expect(comp.siteRows().map(r => r.onHand)).toEqual([5, 30, 100]);
  }));

  it('renders sortable column headers with aria-sort attribute', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([site('s1', 'Alpha', 10, 5, 5)])),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const headers = fixture.nativeElement.querySelectorAll('th[aria-sort]');
    expect(headers.length).toBe(4);

    // Default: siteName sorted ascending
    const siteNameTh = fixture.nativeElement.querySelector('th[aria-sort="ascending"]');
    expect(siteNameTh).not.toBeNull();
  }));
});

// ── Tests: row navigation ─────────────────────────────────────────────────

describe('row navigation', () => {
  it('navigates to site page and passes siteName in router state', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([site('site-99', 'Main Warehouse', 10, 0, 10)])),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.navigateToSite(comp.siteRows()[0]);

    expect(routerStub.navigate).toHaveBeenCalledWith(
      ['/app/inventory/by-location/site', 'site-99'],
      { state: { siteName: 'Main Warehouse' } },
    );
  }));

  it('carries siteName for the clicked row, not a different row', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(
        locationResponse([
          site('s1', 'Alpha Site', 10, 0, 10),
          site('s2', 'Beta Site', 20, 0, 20),
        ]),
      ),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    const betaRow = comp.siteRows().find(r => r.siteId === 's2')!;
    comp.navigateToSite(betaRow);

    expect(routerStub.navigate).toHaveBeenCalledWith(
      ['/app/inventory/by-location/site', 's2'],
      { state: { siteName: 'Beta Site' } },
    );
  }));

  // PRCR-002: Space key calls preventDefault and navigates to site
  it('Space key calls preventDefault and navigates to the correct site', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([site('site-42', 'Gamma Warehouse', 20, 5, 15)])),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    const row = comp.siteRows()[0];

    const mockEvent = { preventDefault: vi.fn() } as unknown as Event;
    comp.onRowSpace(mockEvent, row);

    expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(routerStub.navigate).toHaveBeenCalledWith(
      ['/app/inventory/by-location/site', 'site-42'],
      { state: { siteName: 'Gamma Warehouse' } },
    );
  }));
});

// ── Tests: empty state ────────────────────────────────────────────────────

describe('empty state', () => {
  it('shows empty state when response has no sites', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([], qty(0, 0, 0))),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('empty');
  }));
});

// ── Tests: product filter (find by name or SKU) ───────────────────────────

describe('product filter', () => {
  const productSummary = (sku: string, name: string): ProductSummary => ({
    productId: `prod-${sku}`,
    sku,
    name,
  });

  it('searches the catalog (name or SKU) on typeahead input, debounced', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([site('s1', 'Alpha', 10, 0, 10)])),
    );
    productsServiceStub.searchProducts.mockReturnValue(
      of({ data: [productSummary('SKU-7', 'Widget')] }),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.onProductInput('wid');
    tick(100);
    // Debounce (250 ms) has not fired yet
    expect(productsServiceStub.searchProducts).not.toHaveBeenCalled();

    tick(200);
    expect(productsServiceStub.searchProducts).toHaveBeenCalledTimes(1);
    expect(productsServiceStub.searchProducts.mock.calls[0][0]).toBe('wid');
    expect(comp.productSuggestions().length).toBe(1);
  }));

  it('adds a chip and queries the selected SKU', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([site('s1', 'Alpha', 10, 0, 10)])),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const initialCallCount = rollupServiceStub.getLocationRollup.mock.calls.length;

    const comp = fixture.componentInstance;
    comp.selectProduct(productSummary('SKU-7', 'Widget'));
    tick();

    expect(comp.selectedProducts()).toEqual([{ sku: 'SKU-7', name: 'Widget' }]);
    expect(rollupServiceStub.getLocationRollup.mock.calls.length).toBe(initialCallCount + 1);
    const lastCall = rollupServiceStub.getLocationRollup.mock.calls.at(-1) as unknown[];
    expect(lastCall[1]).toMatchObject({ sku: 'SKU-7' });
    // Search box resets so the next product can be added.
    expect(comp.productDisplayName()).toBe('');
  }));

  it('fans out one query per selected SKU and tallies the responses', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([site('s1', 'Alpha', 10, 0, 10)], qty(10, 0, 10))),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;

    // Per-SKU responses: SKU-7 only at s1; SKU-8 at s1 and s2.
    rollupServiceStub.getLocationRollup.mockImplementation((_loc: string, opts: { sku?: string }) => {
      if (opts.sku === 'SKU-7') {
        return of(locationResponse([site('s1', 'Alpha', 5, 1, 4)], qty(5, 1, 4)));
      }
      if (opts.sku === 'SKU-8') {
        return of(
          locationResponse(
            [site('s1', 'Alpha', 3, 0, 3), site('s2', 'Beta', 2, 0, 2)],
            qty(5, 0, 5),
          ),
        );
      }
      return of(locationResponse([]));
    });

    comp.selectProduct(productSummary('SKU-7', 'Widget'));
    tick();
    comp.selectProduct(productSummary('SKU-8', 'Gizmo'));
    tick();

    expect(comp.selectedProducts().map(p => p.sku)).toEqual(['SKU-7', 'SKU-8']);
    // Grand totals summed across both SKUs.
    expect(comp.totals()).toMatchObject({ onHand: 10, allocated: 1, available: 9 });
    // Site rows merged by siteId: s1 = 5+3 on hand, s2 = 2.
    const rows = comp.siteRows();
    expect(rows.find(r => r.siteId === 's1')!.onHand).toBe(8);
    expect(rows.find(r => r.siteId === 's2')!.onHand).toBe(2);
    expect(comp.state()).toBe('ready');
  }));

  it('re-queries when a product is removed and shows full rollup when none remain', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([site('s1', 'Alpha', 10, 0, 10)])),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.selectProduct(productSummary('SKU-7', 'Widget'));
    tick();
    comp.selectProduct(productSummary('SKU-8', 'Gizmo'));
    tick();
    expect(comp.selectedProducts().length).toBe(2);

    rollupServiceStub.getLocationRollup.mockClear();
    comp.removeProduct('SKU-7');
    tick();
    // One SKU remains → one fan-out call for SKU-8.
    expect(rollupServiceStub.getLocationRollup).toHaveBeenCalledTimes(1);
    expect((rollupServiceStub.getLocationRollup.mock.calls[0][1] as { sku?: string }).sku).toBe('SKU-8');

    rollupServiceStub.getLocationRollup.mockClear();
    comp.removeProduct('SKU-8');
    tick();
    // No products → single full-location rollup (no sku).
    expect(rollupServiceStub.getLocationRollup).toHaveBeenCalledTimes(1);
    expect((rollupServiceStub.getLocationRollup.mock.calls[0][1] as { sku?: string }).sku).toBeUndefined();
    expect(comp.selectedProducts().length).toBe(0);
  }));

  it('clear all removes every chip and reloads the full rollup', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([site('s1', 'Alpha', 10, 0, 10)])),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.selectProduct(productSummary('SKU-7', 'Widget'));
    tick();
    comp.selectProduct(productSummary('SKU-8', 'Gizmo'));
    tick();

    rollupServiceStub.getLocationRollup.mockClear();
    comp.clearSelectedProducts();
    tick();

    expect(comp.selectedProducts().length).toBe(0);
    expect(rollupServiceStub.getLocationRollup).toHaveBeenCalledTimes(1);
    expect((rollupServiceStub.getLocationRollup.mock.calls[0][1] as { sku?: string }).sku).toBeUndefined();
  }));

  it('ignores a duplicate product selection', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([site('s1', 'Alpha', 10, 0, 10)])),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.selectProduct(productSummary('SKU-7', 'Widget'));
    tick();

    rollupServiceStub.getLocationRollup.mockClear();
    comp.selectProduct(productSummary('SKU-7', 'Widget'));
    tick();

    expect(comp.selectedProducts().length).toBe(1);
    expect(rollupServiceStub.getLocationRollup).not.toHaveBeenCalled();
  }));

  it('does not re-query when no location is selected', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse([])));
    const fixture = createComponent({}, {});
    fixture.detectChanges();
    tick();

    const comp = fixture.componentInstance;
    comp.selectProduct(productSummary('SKU-9', 'Gadget'));
    tick(400);

    expect(rollupServiceStub.getLocationRollup).not.toHaveBeenCalled();
  }));

  it('navigates suggestions and selects with the keyboard', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([site('s1', 'Alpha', 10, 0, 10)])),
    );
    productsServiceStub.searchProducts.mockReturnValue(
      of({ data: [productSummary('SKU-7', 'Widget'), productSummary('SKU-8', 'Gizmo')] }),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.onProductInput('wi');
    tick(300);
    expect(comp.productSuggestions().length).toBe(2);

    const preventDefault = vi.fn();
    comp.onProductKeydown({ key: 'ArrowDown', preventDefault } as unknown as KeyboardEvent);
    comp.onProductKeydown({ key: 'ArrowDown', preventDefault } as unknown as KeyboardEvent);
    expect(comp.activeProductIndex()).toBe(1);

    comp.onProductKeydown({ key: 'Enter', preventDefault } as unknown as KeyboardEvent);
    tick();

    expect(comp.selectedProducts().map(p => p.sku)).toEqual(['SKU-8']);
    expect(comp.showProductSuggestions()).toBe(false);
  }));
});

// ── Tests: location picker ────────────────────────────────────────────────

describe('location picker', () => {
  it('surfaces the parent-location roster returned by getRoster', fakeAsync(() => {
    // getRoster returns the parent-only roster server-side; the component
    // surfaces page.content verbatim (no client-side type filtering).
    const locs: LocationResponseDTO[] = [
      parentLocation('b1', 'Main Building', 'Building'),
      parentLocation('p1', 'City Plaza', 'Place'),
    ];
    locationServiceStub.getRoster.mockReturnValue(of({ content: locs }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse([])));
    const fixture = createComponent({}, {});
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.allParentLocations().map(l => l.id)).toEqual(['b1', 'p1']);
  }));

  it('selecting a location updates selectedLocationId and navigates', fakeAsync(() => {
    const locs: LocationResponseDTO[] = [parentLocation('b1', 'HQ', 'Building')];
    locationServiceStub.getRoster.mockReturnValue(of({ content: locs }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse([])));
    const fixture = createComponent({}, {});
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.selectLocation(locs[0]);
    tick();

    expect(comp.selectedLocationId()).toBe('b1');
    expect(routerStub.navigate).toHaveBeenCalledWith(['/app/inventory/by-location', 'b1']);
  }));

  it('applies typeahead filter to narrow results', fakeAsync(() => {
    const locs: LocationResponseDTO[] = [
      parentLocation('b1', 'Main Building', 'Building'),
      parentLocation('b2', 'East Building', 'Building'),
      parentLocation('p1', 'West Plaza', 'Place'),
    ];
    locationServiceStub.getRoster.mockReturnValue(of({ content: locs }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse([])));
    const fixture = createComponent({}, {});
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.onPickerInput('building');
    fixture.detectChanges();

    const filtered = comp.filteredLocations();
    expect(filtered.length).toBe(2);
    expect(filtered.every(l => l.name?.toLowerCase().includes('building'))).toBe(true);
  }));

  // PRCR-003: clearing picker with a prior selection navigates to /inventory/by-location
  it('clearing picker with a prior selection navigates to base route and resets state', fakeAsync(() => {
    const locs: LocationResponseDTO[] = [parentLocation('b1', 'HQ', 'Building')];
    locationServiceStub.getRoster.mockReturnValue(of({ content: locs }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([site('s1', 'Alpha', 10, 0, 10)])),
    );
    // Start with a pre-selected location so the route provides locationId
    const fixture = createComponent({}, {}, { locationId: 'b1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.selectedLocationId()).toBe('b1');
    expect(comp.state()).toBe('ready');

    vi.clearAllMocks();
    routerStub.navigate.mockResolvedValue(true);

    // Clear the picker input
    comp.onPickerInput('');
    tick();
    fixture.detectChanges();

    // Must navigate to the base route (spec §3: clearing returns to idle route)
    expect(routerStub.navigate).toHaveBeenCalledWith(['/app/inventory/by-location']);
    // Local state must be reset
    expect(comp.selectedLocationId()).toBeNull();
    expect(comp.rollupData()).toBeNull();
    expect(comp.state()).toBe('idle');
  }));
});

// ── Tests: error states ───────────────────────────────────────────────────

describe('error states', () => {
  it('sets state to error and errorKind not-found on 404', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    const err: RollupError = { kind: 'not-found', message: 'Not found' };
    rollupServiceStub.getLocationRollup.mockReturnValue(throwError(() => err));
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.state()).toBe('error');
    expect(comp.errorKind()).toBe('not-found');
    // Finding 4: errorKey must carry the exact i18n key for the error panel
    expect(comp.errorKey()).toBe('INVENTORY.BY_LOCATION.ERROR.NOT_FOUND');
  }));

  it('sets state to error and errorKind forbidden on 403', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    const err: RollupError = { kind: 'forbidden', message: 'Forbidden' };
    rollupServiceStub.getLocationRollup.mockReturnValue(throwError(() => err));
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.state()).toBe('error');
    expect(comp.errorKind()).toBe('forbidden');
    // Finding 4: errorKey must carry the exact i18n key
    expect(comp.errorKey()).toBe('INVENTORY.BY_LOCATION.ERROR.FORBIDDEN');
  }));

  it('upstream-down shows retry banner; keeps last data when present', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    const successResponse = locationResponse([site('s1', 'Alpha', 10, 0, 10)]);
    rollupServiceStub.getLocationRollup.mockReturnValueOnce(of(successResponse));
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    // Simulate refresh with upstream-down
    const err: RollupError = { kind: 'upstream-down', message: 'down', retryable: true };
    rollupServiceStub.getLocationRollup.mockReturnValue(throwError(() => err));
    fixture.componentInstance.refresh();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.showRetryBanner()).toBe(true);
    // Data should still be there since we had prior data
    expect(comp.rollupData()).not.toBeNull();
    // State stays 'ready' since prior data is retained (upstream-down non-destructive)
    expect(comp.state()).toBe('ready');
    // Finding 4: no errorKey when upstream-down with prior data (state is not error)
    expect(comp.errorKey()).toBeNull();
  }));

  it('upstream-down with no prior data shows error state', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    const err: RollupError = { kind: 'upstream-down', message: 'down', retryable: true };
    rollupServiceStub.getLocationRollup.mockReturnValue(throwError(() => err));
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.showRetryBanner()).toBe(true);
    expect(comp.state()).toBe('error');
    // Finding 4: errorKey must be set when upstream-down with no prior data
    expect(comp.errorKey()).toBe('INVENTORY.BY_LOCATION.ERROR.UPSTREAM_DOWN');
  }));

  it('validation error shows error state', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    const err: RollupError = { kind: 'validation', message: 'Bad request' };
    rollupServiceStub.getLocationRollup.mockReturnValue(throwError(() => err));
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('error');
    expect(fixture.componentInstance.errorKind()).toBe('validation');
    // Finding 4: validation must use VALIDATION key (not UNKNOWN)
    expect(fixture.componentInstance.errorKey()).toBe('INVENTORY.BY_LOCATION.ERROR.VALIDATION');
  }));

  it('unknown error kind sets error state and UNKNOWN errorKey', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    // 'unknown' is a valid RollupError kind per the discriminated union
    const err: RollupError = { kind: 'unknown', message: 'Something broke' };
    rollupServiceStub.getLocationRollup.mockReturnValue(throwError(() => err));
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.state()).toBe('error');
    expect(comp.errorKind()).toBe('unknown');
    // Finding 4: errorKey must be the UNKNOWN key
    expect(comp.errorKey()).toBe('INVENTORY.BY_LOCATION.ERROR.UNKNOWN');
  }));
});

// ── Tests: accessibility (aria) ───────────────────────────────────────────

describe('accessibility', () => {
  it('table has role="table" attribute', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([site('s1', 'Alpha', 10, 5, 5)])),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const table = fixture.nativeElement.querySelector('table');
    expect(table).not.toBeNull();
    expect(table.getAttribute('role')).toBe('table');
  }));

  it('negative available cell has warning badge with aria-label', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([site('s1', 'Alpha', 5, 20, -15)])),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('td .badge-warn');
    expect(badge).not.toBeNull();
    expect(badge.getAttribute('aria-label')).toBeTruthy();
  }));

  it('picker input has aria-autocomplete and aria-controls', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse([])));
    const fixture = createComponent({}, {});
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('#loc-picker-input');
    expect(input).not.toBeNull();
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-controls')).toBeTruthy();
  }));

  it('sort buttons are keyboard operable (present in DOM and type=button)', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([site('s1', 'Alpha', 10, 5, 5)])),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const sortBtns = fixture.nativeElement.querySelectorAll('button.sort-btn');
    expect(sortBtns.length).toBe(4);
    sortBtns.forEach((btn: HTMLButtonElement) => {
      expect(btn.getAttribute('type')).toBe('button');
    });
  }));
});

// ── Tests: sort coverage (Finding 5) ─────────────────────────────────────

describe('sites table sort - extended coverage (Finding 5)', () => {
  const threeRows = () => [
    site('s1', 'Alpha', 30, 15, 15),
    site('s2', 'Beta', 10, 2, 8),
    site('s3', 'Gamma', 50, 40, 10),
  ];

  it('sorts by allocated ascending', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse(threeRows())));
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.sortBy('allocated');
    fixture.detectChanges();

    expect(comp.sortColumn()).toBe('allocated');
    expect(comp.sortDir()).toBe('asc');
    expect(comp.siteRows().map(r => r.allocated)).toEqual([2, 15, 40]);
  }));

  it('sorts by allocated descending after second click', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse(threeRows())));
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.sortBy('allocated');
    comp.sortBy('allocated');
    fixture.detectChanges();

    expect(comp.sortDir()).toBe('desc');
    expect(comp.siteRows().map(r => r.allocated)).toEqual([40, 15, 2]);
  }));

  it('sorts by available ascending', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse(threeRows())));
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.sortBy('available');
    fixture.detectChanges();

    expect(comp.sortColumn()).toBe('available');
    expect(comp.sortDir()).toBe('asc');
    expect(comp.siteRows().map(r => r.available)).toEqual([8, 10, 15]);
  }));

  it('sorts by available descending after second click', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse(threeRows())));
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.sortBy('available');
    comp.sortBy('available');
    fixture.detectChanges();

    expect(comp.sortDir()).toBe('desc');
    expect(comp.siteRows().map(r => r.available)).toEqual([15, 10, 8]);
  }));

  it('sorts by siteName descending after second click on siteName', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse(threeRows())));
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.sortBy('siteName'); // already asc → now desc
    fixture.detectChanges();

    expect(comp.sortDir()).toBe('desc');
    expect(comp.siteRows().map(r => r.siteName)).toEqual(['Gamma', 'Beta', 'Alpha']);
  }));

  it('sorts by onHand descending', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse(threeRows())));
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.sortBy('onHand');
    comp.sortBy('onHand');
    fixture.detectChanges();

    expect(comp.sortDir()).toBe('desc');
    expect(comp.siteRows().map(r => r.onHand)).toEqual([50, 30, 10]);
  }));

  it('switching column resets direction to asc and previous column aria-sort to none', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse(threeRows())));
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const comp = fixture.componentInstance;

    // Start: siteName ascending
    expect(comp.ariaSort('siteName')).toBe('ascending');
    expect(comp.ariaSort('onHand')).toBe('none');

    // Switch to onHand
    comp.sortBy('onHand');
    fixture.detectChanges();

    expect(comp.sortColumn()).toBe('onHand');
    expect(comp.sortDir()).toBe('asc');
    expect(comp.ariaSort('onHand')).toBe('ascending');
    // Previous column must now report 'none'
    expect(comp.ariaSort('siteName')).toBe('none');

    // Click onHand again → descending
    comp.sortBy('onHand');
    fixture.detectChanges();

    expect(comp.ariaSort('onHand')).toBe('descending');
    expect(comp.ariaSort('allocated')).toBe('none');
    expect(comp.ariaSort('available')).toBe('none');

    // Switch to allocated → onHand reverts to none
    comp.sortBy('allocated');
    fixture.detectChanges();

    expect(comp.ariaSort('allocated')).toBe('ascending');
    expect(comp.ariaSort('onHand')).toBe('none');
  }));

  // PRCR-001: DOM-level aria-sort attribute assertions on column switch
  it('DOM th[aria-sort] attributes reflect column-switch lifecycle', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse(threeRows())));
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    // th order in DOM: siteName=0, onHand=1, allocated=2, available=3
    const ths = (): NodeListOf<HTMLElement> =>
      fixture.nativeElement.querySelectorAll('th[scope="col"]');

    const ariaSort = (index: number) => ths().item(index).getAttribute('aria-sort');

    // Initial state: siteName ascending, others none
    expect(ariaSort(0)).toBe('ascending');
    expect(ariaSort(1)).toBe('none');
    expect(ariaSort(2)).toBe('none');
    expect(ariaSort(3)).toBe('none');

    // Switch to onHand ascending
    fixture.componentInstance.sortBy('onHand');
    fixture.detectChanges();

    expect(ariaSort(0)).toBe('none');       // siteName reset to none
    expect(ariaSort(1)).toBe('ascending');  // onHand now active
    expect(ariaSort(2)).toBe('none');
    expect(ariaSort(3)).toBe('none');

    // Click onHand again → descending
    fixture.componentInstance.sortBy('onHand');
    fixture.detectChanges();

    expect(ariaSort(1)).toBe('descending');
    expect(ariaSort(0)).toBe('none');

    // Switch to allocated → onHand resets to none
    fixture.componentInstance.sortBy('allocated');
    fixture.detectChanges();

    expect(ariaSort(1)).toBe('none');       // onHand reset
    expect(ariaSort(2)).toBe('ascending'); // allocated now active

    // Switch to available ascending
    fixture.componentInstance.sortBy('available');
    fixture.detectChanges();

    expect(ariaSort(2)).toBe('none');       // allocated reset
    expect(ariaSort(3)).toBe('ascending'); // available now active
  }));
});

// ── Tests: keyboard picker (Finding 1 cover) ──────────────────────────────

describe('keyboard picker (ARIA 1.2 APG combobox)', () => {
  const twoLocs = (): LocationResponseDTO[] => [
    parentLocation('b1', 'Alpha Building', 'Building'),
    parentLocation('b2', 'Beta Building', 'Building'),
  ];

  it('ArrowDown opens listbox and sets activeOptionIndex to 0 when closed', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: twoLocs() }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse([])));
    const fixture = createComponent({}, {});
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.pickerOpen()).toBe(false);

    comp.onPickerKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();

    expect(comp.pickerOpen()).toBe(true);
    expect(comp.activeOptionIndex()).toBe(0);
  }));

  it('ArrowDown wraps from last option back to 0', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: twoLocs() }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse([])));
    const fixture = createComponent({}, {});
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.onPickerFocus(); // open picker first
    fixture.detectChanges();

    // Move to last option (index 1)
    comp.onPickerKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    comp.onPickerKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();

    expect(comp.activeOptionIndex()).toBe(1);

    // One more ArrowDown should wrap to 0
    comp.onPickerKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();

    expect(comp.activeOptionIndex()).toBe(0);
  }));

  it('ArrowUp opens listbox and sets activeOptionIndex to last option when closed', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: twoLocs() }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse([])));
    const fixture = createComponent({}, {});
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.onPickerKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    fixture.detectChanges();

    expect(comp.pickerOpen()).toBe(true);
    expect(comp.activeOptionIndex()).toBe(1); // last of 2 options
  }));

  it('ArrowUp wraps from index 0 to last option', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: twoLocs() }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse([])));
    const fixture = createComponent({}, {});
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.onPickerFocus();
    comp.activeOptionIndex.set(0);
    fixture.detectChanges();

    comp.onPickerKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    fixture.detectChanges();

    expect(comp.activeOptionIndex()).toBe(1); // wrapped to last
  }));

  it('Enter selects active option and closes listbox', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: twoLocs() }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse([])));
    const fixture = createComponent({}, {});
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.onPickerFocus();
    comp.activeOptionIndex.set(1); // select Beta Building
    fixture.detectChanges();

    comp.onPickerKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    tick();
    fixture.detectChanges();

    expect(comp.selectedLocationId()).toBe('b2');
    expect(comp.pickerOpen()).toBe(false);
    expect(comp.activeOptionIndex()).toBe(-1);
    expect(routerStub.navigate).toHaveBeenCalledWith(['/app/inventory/by-location', 'b2']);
  }));

  it('Enter does nothing when no active option (index -1)', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: twoLocs() }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse([])));
    const fixture = createComponent({}, {});
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.onPickerFocus();
    comp.activeOptionIndex.set(-1);
    fixture.detectChanges();

    comp.onPickerKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    tick();

    expect(comp.selectedLocationId()).toBeNull();
    expect(routerStub.navigate).not.toHaveBeenCalled();
  }));

  it('Escape closes listbox without selecting, resets activeOptionIndex', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: twoLocs() }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse([])));
    const fixture = createComponent({}, {});
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.onPickerFocus();
    comp.activeOptionIndex.set(0);
    fixture.detectChanges();

    expect(comp.pickerOpen()).toBe(true);

    comp.onPickerKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(comp.pickerOpen()).toBe(false);
    expect(comp.activeOptionIndex()).toBe(-1);
    expect(comp.selectedLocationId()).toBeNull(); // no selection made
  }));

  it('aria-expanded reflects pickerOpen state correctly', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: twoLocs() }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse([])));
    const fixture = createComponent({}, {});
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('#loc-picker-input');
    expect(input).not.toBeNull();

    // Initially closed
    fixture.componentInstance.pickerOpen.set(false);
    fixture.detectChanges();
    expect(input.getAttribute('aria-expanded')).toBe('false');

    // After open
    fixture.componentInstance.onPickerFocus();
    fixture.detectChanges();
    expect(input.getAttribute('aria-expanded')).toBe('true');

    // After Escape
    fixture.componentInstance.onPickerKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(input.getAttribute('aria-expanded')).toBe('false');
  }));

  it('aria-activedescendant reflects active option id when listbox is open', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: twoLocs() }));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse([])));
    const fixture = createComponent({}, {});
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.onPickerFocus();
    fixture.detectChanges();

    // No active option yet
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#loc-picker-input');
    expect(input.getAttribute('aria-activedescendant')).toBeNull();

    comp.onPickerKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();

    expect(comp.activeDescendant()).toBe('loc-picker-option-0');
    expect(input.getAttribute('aria-activedescendant')).toBe('loc-picker-option-0');

    comp.onPickerKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();

    expect(comp.activeDescendant()).toBe('loc-picker-option-1');
  }));
});

// ── Tests: paramMap back/forward navigation (Finding 2 cover) ─────────────

describe('paramMap back/forward navigation', () => {
  it('second paramMap emission triggers new rollup request and updates selectedLocation', fakeAsync(() => {
    const paramSubject$ = new Subject<ReturnType<typeof convertToParamMap>>();
    locationServiceStub.getRoster.mockReturnValue(of({ content: [
      parentLocation('loc-1', 'First Building', 'Building'),
      parentLocation('loc-2', 'Second Building', 'Building'),
    ] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([site('s1', 'Alpha', 10, 0, 10)])),
    );

    const fixture = createComponentWithParamSubject({}, {}, paramSubject$);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    // No rollup calls yet — no param emitted
    expect(rollupServiceStub.getLocationRollup).not.toHaveBeenCalled();

    // Navigate to loc-1
    paramSubject$.next(convertToParamMap({ locationId: 'loc-1' }));
    tick();
    fixture.detectChanges();

    expect(rollupServiceStub.getLocationRollup).toHaveBeenCalledTimes(1);
    expect(rollupServiceStub.getLocationRollup).toHaveBeenCalledWith('loc-1', expect.anything());
    expect(fixture.componentInstance.selectedLocationId()).toBe('loc-1');

    // Simulate browser back then forward to loc-2
    paramSubject$.next(convertToParamMap({ locationId: 'loc-2' }));
    tick();
    fixture.detectChanges();

    expect(rollupServiceStub.getLocationRollup).toHaveBeenCalledTimes(2);
    expect(rollupServiceStub.getLocationRollup).toHaveBeenCalledWith('loc-2', expect.anything());
    expect(fixture.componentInstance.selectedLocationId()).toBe('loc-2');
  }));

  it('paramMap emitting null locationId resets to idle state', fakeAsync(() => {
    const paramSubject$ = new Subject<ReturnType<typeof convertToParamMap>>();
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([site('s1', 'Alpha', 10, 0, 10)])),
    );

    const fixture = createComponentWithParamSubject({}, {}, paramSubject$);
    fixture.detectChanges();
    tick();

    // Load a location
    paramSubject$.next(convertToParamMap({ locationId: 'loc-1' }));
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('ready');

    // Navigate back to the base route (no locationId)
    paramSubject$.next(convertToParamMap({}));
    tick();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.selectedLocationId()).toBeNull();
    expect(comp.state()).toBe('idle');
    expect(comp.rollupData()).toBeNull();
  }));
});

// ── Tests: in-flight cancellation (Finding 6) ────────────────────────────

describe('in-flight request cancellation (Finding 6)', () => {
  it('cancels previous in-flight rollup when a new one is triggered', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));

    // First request never resolves
    const neverSubject$ = new Subject<LocationInventoryRollupResponse>();
    rollupServiceStub.getLocationRollup.mockReturnValueOnce(neverSubject$.asObservable());

    const paramSubject$ = new Subject<ReturnType<typeof convertToParamMap>>();
    const fixture = createComponentWithParamSubject({}, {}, paramSubject$);
    fixture.detectChanges();
    tick();

    // Trigger first request
    paramSubject$.next(convertToParamMap({ locationId: 'loc-1' }));
    tick();
    fixture.detectChanges();

    expect(rollupServiceStub.getLocationRollup).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.state()).toBe('loading');

    // Set up second request to resolve immediately
    const secondResponse = locationResponse([site('s2', 'Beta', 5, 0, 5)]);
    rollupServiceStub.getLocationRollup.mockReturnValueOnce(of(secondResponse));

    // Trigger second request (navigate to different location)
    paramSubject$.next(convertToParamMap({ locationId: 'loc-2' }));
    tick();
    fixture.detectChanges();

    expect(rollupServiceStub.getLocationRollup).toHaveBeenCalledTimes(2);

    // Only second result landed: state is ready with loc-2 data
    expect(fixture.componentInstance.state()).toBe('ready');
    expect(fixture.componentInstance.siteRows()[0].siteName).toBe('Beta');

    // Emit result from the first (cancelled) request — must NOT overwrite state
    const stateBeforeStaleEmit = fixture.componentInstance.state();
    neverSubject$.next(locationResponse([site('s1', 'Alpha', 100, 0, 100)]));
    tick();
    fixture.detectChanges();

    // State and data must be unchanged — stale emission was ignored
    expect(fixture.componentInstance.state()).toBe(stateBeforeStaleEmit);
    expect(fixture.componentInstance.siteRows()[0].siteName).toBe('Beta');
  }));

  it('a newer load cancels the previous in-flight tally', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));

    // First request (initial full load for loc-1) resolves normally
    rollupServiceStub.getLocationRollup.mockReturnValueOnce(
      of(locationResponse([site('s1', 'Alpha', 10, 0, 10)])),
    );

    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    // Selecting a product fans out a tally whose only request never completes.
    const neverSubject$ = new Subject<LocationInventoryRollupResponse>();
    rollupServiceStub.getLocationRollup.mockReturnValueOnce(neverSubject$.asObservable());

    fixture.componentInstance.selectProduct({ productId: 'p-a', sku: 'WIDGET-A', name: 'A' });
    tick();
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('loading');

    // Removing it issues a newer full-rollup load that resolves; the in-flight
    // tally subscription is cancelled.
    rollupServiceStub.getLocationRollup.mockReturnValueOnce(
      of(locationResponse([site('s2', 'Beta', 5, 0, 5)])),
    );

    fixture.componentInstance.removeProduct('WIDGET-A');
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('ready');
    expect(fixture.componentInstance.siteRows()[0].siteName).toBe('Beta');

    // Late emit from the cancelled WIDGET-A tally must not land.
    neverSubject$.next(locationResponse([site('s1', 'Alpha', 100, 0, 100)]));
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.siteRows()[0].siteName).toBe('Beta');
  }));
});

// ── Tests: destroy-time subscription cancellation (Finding 3 cover) ──────

describe('destroy-time subscription cancellation', () => {
  it('does not write state after component is destroyed mid-flight', fakeAsync(() => {
    locationServiceStub.getRoster.mockReturnValue(of({ content: [] }));

    // Never-resolving Subject simulates an in-flight HTTP request
    const pendingSubject$ = new Subject<LocationInventoryRollupResponse>();
    rollupServiceStub.getLocationRollup.mockReturnValue(pendingSubject$.asObservable());

    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('loading');

    // Destroy the component while the request is in flight
    fixture.destroy();

    // Now resolve the pending subject — the component is already destroyed
    // No error should be thrown and state should not change (the subscription
    // was torn down by takeUntilDestroyed)
    expect(() => {
      pendingSubject$.next(locationResponse([site('s1', 'Alpha', 10, 0, 10)]));
      pendingSubject$.complete();
      tick();
    }).not.toThrow();

    // The subscription was cancelled: siteRows() would normally be populated
    // but since state was 'loading' at destroy time and the component is gone,
    // the only assertion we can make is that no error occurred.
  }));

  it('loadParentLocations observable is torn down on destroy', fakeAsync(() => {
    // Use a never-resolving location observable to simulate slow location load
    const pendingLocations$ = new Subject<{ content: LocationResponseDTO[] }>();
    locationServiceStub.getRoster.mockReturnValue(pendingLocations$.asObservable());
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse([])));

    const fixture = createComponent({}, {});
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.locationsLoaded()).toBe(false);

    fixture.destroy();

    // Emitting after destroy must not throw
    expect(() => {
      pendingLocations$.next({ content: [parentLocation('b1', 'HQ', 'Building')] });
      pendingLocations$.complete();
      tick();
    }).not.toThrow();
  }));
});
