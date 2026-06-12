import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError, Subject } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { LocationAPIService } from '@durion-sdk/location';
import type { LocationResponseDTO } from '@durion-sdk/location';
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
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: (k: string) => routeParams[k] ?? null } } },
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
  getAllLocations: vi.fn(),
};

const routerStub = {
  navigate: vi.fn().mockResolvedValue(true),
};

beforeEach(() => {
  vi.clearAllMocks();
  routerStub.navigate.mockResolvedValue(true);
});

// ── Tests: grand total rendering ──────────────────────────────────────────

describe('grand total strip', () => {
  it('renders onHand, allocated, available from rollup response', fakeAsync(() => {
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
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
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
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
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
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
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
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
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
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
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
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
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
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
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
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
      ['/inventory/by-location/site', 'site-99'],
      { state: { siteName: 'Main Warehouse' } },
    );
  }));

  it('carries siteName for the clicked row, not a different row', fakeAsync(() => {
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
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
      ['/inventory/by-location/site', 's2'],
      { state: { siteName: 'Beta Site' } },
    );
  }));
});

// ── Tests: empty state ────────────────────────────────────────────────────

describe('empty state', () => {
  it('shows empty state when response has no sites', fakeAsync(() => {
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
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

// ── Tests: SKU filter debounce and re-query ───────────────────────────────

describe('SKU filter', () => {
  it('debounces 300 ms and re-queries rollup with sku', fakeAsync(() => {
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
    rollupServiceStub.getLocationRollup.mockReturnValue(
      of(locationResponse([site('s1', 'Alpha', 10, 0, 10)])),
    );
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick(500);
    fixture.detectChanges();

    const initialCallCount = rollupServiceStub.getLocationRollup.mock.calls.length;

    const comp = fixture.componentInstance;
    comp.onSkuInput('SKU-7');
    tick(100);
    // Not called yet — debounce hasn't fired
    expect(rollupServiceStub.getLocationRollup.mock.calls.length).toBe(initialCallCount);

    tick(300);
    // Now it should have re-queried
    expect(rollupServiceStub.getLocationRollup.mock.calls.length).toBe(initialCallCount + 1);
    const lastCall = rollupServiceStub.getLocationRollup.mock.calls.at(-1) as unknown[];
    expect(lastCall[1]).toMatchObject({ sku: 'SKU-7' });
  }));

  it('does not re-query when no location is selected', fakeAsync(() => {
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse([])));
    const fixture = createComponent({}, {});
    fixture.detectChanges();
    tick();

    const comp = fixture.componentInstance;
    comp.onSkuInput('SKU-9');
    tick(400);

    expect(rollupServiceStub.getLocationRollup).not.toHaveBeenCalled();
  }));
});

// ── Tests: location picker ────────────────────────────────────────────────

describe('location picker', () => {
  it('filters to parent-type locations only (Building/Place)', fakeAsync(() => {
    const locs: LocationResponseDTO[] = [
      parentLocation('b1', 'Main Building', 'Building'),
      parentLocation('p1', 'City Plaza', 'Place'),
      parentLocation('s1', 'Site A', 'Site'), // should be excluded
      { id: 'x1', name: 'No Type', type: undefined }, // should be excluded
    ];
    locationServiceStub.getAllLocations.mockReturnValue(of(locs));
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
    locationServiceStub.getAllLocations.mockReturnValue(of(locs));
    rollupServiceStub.getLocationRollup.mockReturnValue(of(locationResponse([])));
    const fixture = createComponent({}, {});
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.selectLocation(locs[0]);
    tick();

    expect(comp.selectedLocationId()).toBe('b1');
    expect(routerStub.navigate).toHaveBeenCalledWith(['/inventory/by-location', 'b1']);
  }));

  it('applies typeahead filter to narrow results', fakeAsync(() => {
    const locs: LocationResponseDTO[] = [
      parentLocation('b1', 'Main Building', 'Building'),
      parentLocation('b2', 'East Building', 'Building'),
      parentLocation('p1', 'West Plaza', 'Place'),
    ];
    locationServiceStub.getAllLocations.mockReturnValue(of(locs));
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
});

// ── Tests: error states ───────────────────────────────────────────────────

describe('error states', () => {
  it('sets state to error and errorKind not-found on 404', fakeAsync(() => {
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
    const err: RollupError = { kind: 'not-found', message: 'Not found' };
    rollupServiceStub.getLocationRollup.mockReturnValue(throwError(() => err));
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.state()).toBe('error');
    expect(comp.errorKind()).toBe('not-found');
  }));

  it('sets state to error and errorKind forbidden on 403', fakeAsync(() => {
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
    const err: RollupError = { kind: 'forbidden', message: 'Forbidden' };
    rollupServiceStub.getLocationRollup.mockReturnValue(throwError(() => err));
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.state()).toBe('error');
    expect(comp.errorKind()).toBe('forbidden');
  }));

  it('upstream-down shows retry banner; keeps last data when present', fakeAsync(() => {
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
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
  }));

  it('upstream-down with no prior data shows error state', fakeAsync(() => {
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
    const err: RollupError = { kind: 'upstream-down', message: 'down', retryable: true };
    rollupServiceStub.getLocationRollup.mockReturnValue(throwError(() => err));
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.showRetryBanner()).toBe(true);
    expect(comp.state()).toBe('error');
  }));

  it('validation error shows error state', fakeAsync(() => {
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
    const err: RollupError = { kind: 'validation', message: 'Bad request' };
    rollupServiceStub.getLocationRollup.mockReturnValue(throwError(() => err));
    const fixture = createComponent({}, {}, { locationId: 'loc-1' });
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('error');
    expect(fixture.componentInstance.errorKind()).toBe('validation');
  }));
});

// ── Tests: accessibility (aria) ───────────────────────────────────────────

describe('accessibility', () => {
  it('table has role="table" attribute', fakeAsync(() => {
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
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
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
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
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
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
    locationServiceStub.getAllLocations.mockReturnValue(of([]));
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
