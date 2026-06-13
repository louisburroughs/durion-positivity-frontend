import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { of, Subject, throwError } from 'rxjs';
import { SiteInventoryTreePageComponent, TreeRow, flattenNodes, collectNegativeAvailablePaths } from './site-inventory-tree-page.component';
import { InventoryRollupApiService } from '../../../services/inventory-rollup.service';
import { SkuFilterComponent } from '../../../components/sku-filter/sku-filter.component';
import {
  SiteInventoryRollupResponse,
  StorageLocationRollupNode,
  RollupError,
} from '../../../models/inventory-rollup.models';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FLOOR_NODE: StorageLocationRollupNode = {
  storageLocationId: 'floor-1',
  name: 'Floor 1',
  type: 'FLOOR',
  status: 'ACTIVE',
  own: { onHand: 100, allocated: 20, available: 80 },
  rolledUp: { onHand: 250, allocated: 50, available: 200 },
  children: [
    {
      storageLocationId: 'shelf-1',
      name: 'Shelf 1A',
      type: 'SHELF',
      status: 'ACTIVE',
      own: { onHand: 60, allocated: 10, available: 50 },
      rolledUp: { onHand: 90, allocated: 15, available: 75 },
      children: [
        {
          storageLocationId: 'bin-1',
          name: 'Bin 1A1',
          type: 'BIN',
          status: 'ACTIVE',
          own: { onHand: 30, allocated: 5, available: 25 },
          rolledUp: { onHand: 30, allocated: 5, available: 25 },
          children: [],
        },
      ],
    },
    {
      storageLocationId: 'shelf-2',
      name: 'Shelf 1B',
      type: 'SHELF',
      status: 'INACTIVE',
      own: { onHand: 90, allocated: 20, available: 70 },
      rolledUp: { onHand: 90, allocated: 20, available: 70 },
      children: [],
    },
  ],
};

const NEGATIVE_NODE: StorageLocationRollupNode = {
  storageLocationId: 'neg-floor',
  name: 'Floor 2',
  type: 'FLOOR',
  status: 'ACTIVE',
  own: { onHand: 5, allocated: 20, available: -15 },
  rolledUp: { onHand: 5, allocated: 20, available: -15 },
  children: [],
};

const SITE_RESPONSE: SiteInventoryRollupResponse = {
  siteId: 'site-1',
  totals: { onHand: 255, allocated: 70, available: 185 },
  nodes: [FLOOR_NODE, NEGATIVE_NODE],
};

const EMPTY_SITE_RESPONSE: SiteInventoryRollupResponse = {
  siteId: 'site-1',
  totals: { onHand: 0, allocated: 0, available: 0 },
  nodes: [],
};

const mockRollupService = {
  getSiteRollup: vi.fn(),
};

const mockRoute = {
  snapshot: {
    paramMap: {
      get: (key: string) => (key === 'siteId' ? 'site-1' : null),
    },
  },
};

// ── Helper ────────────────────────────────────────────────────────────────────

function createComponent() {
  const fixture = TestBed.createComponent(SiteInventoryTreePageComponent);
  fixture.detectChanges();
  return fixture;
}

function queryRows(fixture: { nativeElement: HTMLElement }): HTMLElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll<HTMLElement>('tr.tree-row'));
}

function dispatchKeydown(el: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SiteInventoryTreePageComponent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [SiteInventoryTreePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryRollupApiService, useValue: mockRollupService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();
  });

  it('should create and load data', () => {
    mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
    const fixture = createComponent();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  describe('3-level tree rendering with own vs rolledUp', () => {
    it('flattens a 3-level tree correctly', () => {
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const fixture = createComponent();
      const comp = fixture.componentInstance;

      const all = comp.allRows();
      // floor-1, shelf-1, bin-1, shelf-2, neg-floor = 5 rows
      expect(all).toHaveLength(5);

      const floorRow = all.find(r => r.node.storageLocationId === 'floor-1')!;
      const shelfRow = all.find(r => r.node.storageLocationId === 'shelf-1')!;
      const binRow = all.find(r => r.node.storageLocationId === 'bin-1')!;

      expect(floorRow.depth).toBe(1);
      expect(shelfRow.depth).toBe(2);
      expect(binRow.depth).toBe(3);

      expect(floorRow.node.own.onHand).toBe(100);
      expect(floorRow.node.rolledUp.onHand).toBe(250);
      expect(shelfRow.node.own.onHand).toBe(60);
      expect(shelfRow.node.rolledUp.onHand).toBe(90);
    });

    it('all depth<=2 nodes are auto-expanded by default', () => {
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const fixture = createComponent();
      const comp = fixture.componentInstance;

      // floor-1 (depth 1) should be expanded — it has children
      expect(comp.isExpanded('floor-1')).toBe(true);
      // shelf-1 (depth 2) should be expanded — it has children
      expect(comp.isExpanded('shelf-1')).toBe(true);
    });
  });

  describe('negative available badge + auto-expand path', () => {
    it('marks negative-available nodes with hasNegativeAvailable', () => {
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const fixture = createComponent();
      const comp = fixture.componentInstance;

      const negRow = comp.allRows().find(r => r.node.storageLocationId === 'neg-floor')!;
      expect(negRow.hasNegativeAvailable).toBe(true);

      const floorRow = comp.allRows().find(r => r.node.storageLocationId === 'floor-1')!;
      expect(floorRow.hasNegativeAvailable).toBe(false);
    });

    it('counts over-allocated nodes in overAllocatedCount', () => {
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const fixture = createComponent();
      expect(fixture.componentInstance.overAllocatedCount()).toBe(1);
    });

    it('auto-expands ancestors of negative-available nodes', () => {
      // Build a response with a negative node deep in the tree
      const deepNeg: StorageLocationRollupNode = {
        storageLocationId: 'deep-neg',
        name: 'Deep Neg Bin',
        type: 'BIN',
        status: 'ACTIVE',
        own: { onHand: 0, allocated: 5, available: -5 },
        rolledUp: { onHand: 0, allocated: 5, available: -5 },
        children: [],
      };
      const shelf: StorageLocationRollupNode = {
        storageLocationId: 'shelf-neg',
        name: 'Shelf with neg',
        type: 'SHELF',
        status: 'ACTIVE',
        own: { onHand: 0, allocated: 0, available: 0 },
        rolledUp: { onHand: 0, allocated: 5, available: -5 },
        children: [deepNeg],
      };
      const floor: StorageLocationRollupNode = {
        storageLocationId: 'floor-neg',
        name: 'Floor with neg',
        type: 'FLOOR',
        status: 'ACTIVE',
        own: { onHand: 0, allocated: 0, available: 0 },
        rolledUp: { onHand: 0, allocated: 5, available: -5 },
        children: [shelf],
      };

      const resp: SiteInventoryRollupResponse = {
        siteId: 'site-1',
        totals: { onHand: 0, allocated: 5, available: -5 },
        nodes: [floor],
      };

      mockRollupService.getSiteRollup.mockReturnValue(of(resp));
      const fixture = createComponent();
      const comp = fixture.componentInstance;

      // The path to deep-neg should be expanded (floor-neg, shelf-neg)
      expect(comp.isExpanded('floor-neg')).toBe(true);
      expect(comp.isExpanded('shelf-neg')).toBe(true);
    });
  });

  describe('non-ACTIVE-with-stock badge', () => {
    it('marks inactive locations with stock as hasStockInInactiveLocation', () => {
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const fixture = createComponent();
      const comp = fixture.componentInstance;

      const inactiveShelf = comp.allRows().find(r => r.node.storageLocationId === 'shelf-2')!;
      expect(inactiveShelf.node.status).toBe('INACTIVE');
      expect(inactiveShelf.hasStockInInactiveLocation).toBe(true);

      const activeFloor = comp.allRows().find(r => r.node.storageLocationId === 'floor-1')!;
      expect(activeFloor.hasStockInInactiveLocation).toBe(false);
    });
  });

  describe('includeEmpty toggle re-query', () => {
    it('re-queries with includeEmpty=true when toggle changes', () => {
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const fixture = createComponent();
      const comp = fixture.componentInstance;

      // Initial call — includeEmpty = false
      expect(mockRollupService.getSiteRollup).toHaveBeenCalledWith(
        'site-1',
        expect.objectContaining({ includeEmpty: false }),
      );

      comp.onIncludeEmptyChange(true);

      expect(mockRollupService.getSiteRollup).toHaveBeenCalledWith(
        'site-1',
        expect.objectContaining({ includeEmpty: true }),
      );
    });
  });

  describe('SKU re-query with expand-state preservation', () => {
    it('preserves expanded IDs when SKU filter changes', () => {
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const fixture = createComponent();
      const comp = fixture.componentInstance;

      // Manually expand a node
      comp.expandedIds.update(s => new Set([...s, 'shelf-2']));
      const expandedBefore = new Set(comp.expandedIds());

      // Change SKU
      comp.onSkuChange('SKU-99');

      // Expanded state is preserved (not cleared by re-query)
      expect(comp.expandedIds().has('shelf-2')).toBe(true);
    });

    it('re-queries with SKU parameter', () => {
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const fixture = createComponent();
      const comp = fixture.componentInstance;

      comp.onSkuChange('SKU-XYZ');

      expect(mockRollupService.getSiteRollup).toHaveBeenCalledWith(
        'site-1',
        expect.objectContaining({ sku: 'SKU-XYZ' }),
      );
    });
  });

  describe('keyboard navigation (DOM-dispatched)', () => {
    // Default render order with depth<=2 defaults expanded:
    // [0] floor-1, [1] shelf-1, [2] bin-1, [3] shelf-2, [4] neg-floor
    function renderTree() {
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const fixture = createComponent();
      fixture.detectChanges();
      return fixture;
    }

    it('Enter on a row with children toggles expanded state', () => {
      const fixture = renderTree();
      const comp = fixture.componentInstance;
      expect(comp.isExpanded('floor-1')).toBe(true);

      const event = dispatchKeydown(queryRows(fixture)[0], 'Enter');

      expect(comp.isExpanded('floor-1')).toBe(false);
      expect(event.defaultPrevented).toBe(true);
      fixture.detectChanges();
      // Children of floor-1 are no longer rendered
      const ids = queryRows(fixture).map(r => r.querySelector('.tree-row__name')!.textContent!.trim());
      expect(ids).toEqual(['Floor 1', 'Floor 2']);
    });

    it('ArrowRight expands a collapsed row with children', () => {
      const fixture = renderTree();
      const comp = fixture.componentInstance;

      // Collapse floor-1 via Enter, then re-expand via ArrowRight on the same row
      dispatchKeydown(queryRows(fixture)[0], 'Enter');
      fixture.detectChanges();
      expect(comp.isExpanded('floor-1')).toBe(false);

      dispatchKeydown(queryRows(fixture)[0], 'ArrowRight');

      expect(comp.isExpanded('floor-1')).toBe(true);
      fixture.detectChanges();
      expect(queryRows(fixture)).toHaveLength(5);
    });

    it('ArrowLeft collapses an expanded row', () => {
      const fixture = renderTree();
      const comp = fixture.componentInstance;
      expect(comp.isExpanded('floor-1')).toBe(true);

      dispatchKeydown(queryRows(fixture)[0], 'ArrowLeft');

      expect(comp.isExpanded('floor-1')).toBe(false);
    });

    it('ArrowDown moves focus to the next visible row, ArrowUp back', () => {
      const fixture = renderTree();
      const rows = queryRows(fixture);
      rows[0].focus();
      expect(document.activeElement).toBe(rows[0]);

      const down = dispatchKeydown(rows[0], 'ArrowDown');
      expect(document.activeElement).toBe(rows[1]);
      expect(down.defaultPrevented).toBe(true);

      const up = dispatchKeydown(rows[1], 'ArrowUp');
      expect(document.activeElement).toBe(rows[0]);
      expect(up.defaultPrevented).toBe(true);
    });

    it('ArrowUp on the first row and ArrowDown on the last row do not move focus', () => {
      const fixture = renderTree();
      const rows = queryRows(fixture);

      rows[0].focus();
      dispatchKeydown(rows[0], 'ArrowUp');
      expect(document.activeElement).toBe(rows[0]);

      const last = rows[rows.length - 1];
      last.focus();
      dispatchKeydown(last, 'ArrowDown');
      expect(document.activeElement).toBe(last);
    });

    it('Home jumps to the first visible row and End to the last', () => {
      const fixture = renderTree();
      const rows = queryRows(fixture);
      rows[2].focus();

      const end = dispatchKeydown(rows[2], 'End');
      expect(document.activeElement).toBe(rows[rows.length - 1]);
      expect(end.defaultPrevented).toBe(true);

      const home = dispatchKeydown(rows[rows.length - 1], 'Home');
      expect(document.activeElement).toBe(rows[0]);
      expect(home.defaultPrevented).toBe(true);
    });

    it('roving tabindex: exactly one row tabbable, follows focus after ArrowDown', () => {
      const fixture = renderTree();
      let rows = queryRows(fixture);

      // Initially the first visible row carries tabindex=0, all others -1
      expect(rows[0].getAttribute('tabindex')).toBe('0');
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].getAttribute('tabindex')).toBe('-1');
      }

      rows[0].focus();
      dispatchKeydown(rows[0], 'ArrowDown');
      fixture.detectChanges();

      rows = queryRows(fixture);
      expect(rows[1].getAttribute('tabindex')).toBe('0');
      for (let i = 0; i < rows.length; i++) {
        if (i !== 1) {
          expect(rows[i].getAttribute('tabindex')).toBe('-1');
        }
      }
    });

    it('roving tabindex falls back to the first visible row when the active row is hidden by collapse', () => {
      const fixture = renderTree();
      let rows = queryRows(fixture);

      // Focus bin-1 (index 2, child of shelf-1 under floor-1)
      rows[2].focus();
      fixture.detectChanges();
      rows = queryRows(fixture);
      expect(rows[2].getAttribute('tabindex')).toBe('0');

      // Collapse floor-1 — bin-1 disappears from the visible set
      fixture.componentInstance.toggleRow('floor-1');
      fixture.detectChanges();

      rows = queryRows(fixture);
      expect(rows).toHaveLength(2);
      expect(rows[0].getAttribute('tabindex')).toBe('0');
      expect(rows[1].getAttribute('tabindex')).toBe('-1');
    });
  });

  describe('empty site state', () => {
    it('shows empty state when site has no nodes', () => {
      mockRollupService.getSiteRollup.mockReturnValue(of(EMPTY_SITE_RESPONSE));
      const fixture = createComponent();
      const comp = fixture.componentInstance;

      expect(comp.state()).toBe('empty');
      expect(comp.response()?.totals.onHand).toBe(0);
    });
  });

  describe('error states', () => {
    it('not-found error sets state=error with correct errorKey', () => {
      const err: RollupError = { kind: 'not-found', message: 'Site not found' };
      mockRollupService.getSiteRollup.mockReturnValue(throwError(() => err));
      const fixture = createComponent();
      const comp = fixture.componentInstance;

      expect(comp.state()).toBe('error');
      expect(comp.errorKey()).toBe('INVENTORY.BY_LOCATION.SITE_TREE.ERROR.NOT_FOUND');
      expect(comp.rollupError()?.kind).toBe('not-found');
    });

    it('forbidden error sets state=error with forbidden errorKey', () => {
      const err: RollupError = { kind: 'forbidden', message: 'No permission' };
      mockRollupService.getSiteRollup.mockReturnValue(throwError(() => err));
      const fixture = createComponent();
      const comp = fixture.componentInstance;

      expect(comp.state()).toBe('error');
      expect(comp.errorKey()).toBe('INVENTORY.BY_LOCATION.SITE_TREE.ERROR.FORBIDDEN');
    });

    it('upstream-down with no existing data shows error state and banner', () => {
      const err: RollupError = { kind: 'upstream-down', message: 'down', retryable: true };
      mockRollupService.getSiteRollup.mockReturnValue(throwError(() => err));
      const fixture = createComponent();
      const comp = fixture.componentInstance;

      expect(comp.state()).toBe('error');
      expect(comp.showUpstreamBanner()).toBe(true);
    });

    it('upstream-down with existing data keeps state=ready and shows banner', () => {
      // First load succeeds
      mockRollupService.getSiteRollup.mockReturnValueOnce(of(SITE_RESPONSE));
      const fixture = createComponent();
      const comp = fixture.componentInstance;
      expect(comp.state()).toBe('ready');

      // Second query fails with upstream-down
      const err: RollupError = { kind: 'upstream-down', message: 'down', retryable: true };
      mockRollupService.getSiteRollup.mockReturnValue(throwError(() => err));
      comp.refresh();

      expect(comp.state()).toBe('ready');  // keep last data
      expect(comp.showUpstreamBanner()).toBe(true);
    });

    it('unknown error sets state=error and logs', () => {
      const err: RollupError = { kind: 'unknown', message: 'oops' };
      mockRollupService.getSiteRollup.mockReturnValue(throwError(() => err));
      const fixture = createComponent();
      const comp = fixture.componentInstance;

      expect(comp.state()).toBe('error');
      expect(comp.errorKey()).toBe('INVENTORY.BY_LOCATION.SITE_TREE.ERROR.UNKNOWN');
    });
  });

  describe('pipeline recovery after error (regression for dead-pipeline bug)', () => {
    it('retry button after upstream-down error fires a new request and recovers to ready', () => {
      const err: RollupError = { kind: 'upstream-down', message: 'down', retryable: true };
      mockRollupService.getSiteRollup.mockReturnValueOnce(throwError(() => err));
      const fixture = createComponent();
      const comp = fixture.componentInstance;

      expect(comp.state()).toBe('error');
      expect(mockRollupService.getSiteRollup).toHaveBeenCalledTimes(1);

      // Backend comes back; user clicks the retry button in the error card
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const retryBtn = fixture.nativeElement.querySelector(
        'section.state-card button.btn-secondary',
      ) as HTMLButtonElement;
      expect(retryBtn).not.toBeNull();
      retryBtn.click();
      fixture.detectChanges();

      expect(mockRollupService.getSiteRollup).toHaveBeenCalledTimes(2);
      expect(comp.state()).toBe('ready');
      expect(comp.response()).toEqual(SITE_RESPONSE);
      expect(comp.showUpstreamBanner()).toBe(false);
      expect(queryRows(fixture)).toHaveLength(5);
    });

    it('SKU change after an unknown error fires a new request and recovers to ready', () => {
      const err: RollupError = { kind: 'unknown', message: 'boom' };
      mockRollupService.getSiteRollup.mockReturnValueOnce(throwError(() => err));
      const fixture = createComponent();
      const comp = fixture.componentInstance;

      expect(comp.state()).toBe('error');
      expect(mockRollupService.getSiteRollup).toHaveBeenCalledTimes(1);

      // Emit a SKU change through the child filter component output
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const skuFilter = fixture.debugElement.query(By.directive(SkuFilterComponent));
      (skuFilter.componentInstance as SkuFilterComponent).skuChange.emit('SKU-RECOVER');
      fixture.detectChanges();

      expect(mockRollupService.getSiteRollup).toHaveBeenCalledTimes(2);
      expect(mockRollupService.getSiteRollup).toHaveBeenLastCalledWith(
        'site-1',
        expect.objectContaining({ sku: 'SKU-RECOVER' }),
      );
      expect(comp.state()).toBe('ready');
      expect(queryRows(fixture)).toHaveLength(5);
    });

    it('survives consecutive errors and still recovers on a later refresh', () => {
      const err: RollupError = { kind: 'upstream-down', message: 'down', retryable: true };
      mockRollupService.getSiteRollup
        .mockReturnValueOnce(throwError(() => err))
        .mockReturnValueOnce(throwError(() => err))
        .mockReturnValue(of(SITE_RESPONSE));
      const fixture = createComponent();
      const comp = fixture.componentInstance;

      expect(comp.state()).toBe('error');
      comp.refresh();
      expect(comp.state()).toBe('error');
      comp.refresh();

      expect(mockRollupService.getSiteRollup).toHaveBeenCalledTimes(3);
      expect(comp.state()).toBe('ready');
      expect(comp.response()).toEqual(SITE_RESPONSE);
    });
  });

  describe('siteName from navigation state', () => {
    it('renders the siteName provided via persisted history state in breadcrumb and header', () => {
      TestBed.overrideProvider(Location, {
        useValue: { getState: () => ({ siteName: 'Central Warehouse' }) },
      });
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const fixture = createComponent();

      const title = fixture.nativeElement.querySelector('h1#site-tree-title') as HTMLElement;
      expect(title.textContent!.trim()).toBe('Central Warehouse');
      const crumb = fixture.nativeElement.querySelector('.breadcrumb__current') as HTMLElement;
      expect(crumb.textContent!.trim()).toBe('Central Warehouse');
    });

    it('falls back to a short form of siteId when no navigation/history state exists', () => {
      TestBed.overrideProvider(Location, { useValue: { getState: () => null } });
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const fixture = createComponent();

      const title = fixture.nativeElement.querySelector('h1#site-tree-title') as HTMLElement;
      expect(title.textContent!.trim()).toBe('site-1');
    });

    it('falls back to short siteId when history state exists but has no siteName', () => {
      TestBed.overrideProvider(Location, {
        useValue: { getState: () => ({ navigationId: 7 }) },
      });
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const fixture = createComponent();

      const title = fixture.nativeElement.querySelector('h1#site-tree-title') as HTMLElement;
      expect(title.textContent!.trim()).toBe('site-1');
    });
  });

  describe('collapse-state preservation across re-queries', () => {
    it('keeps a depth-1 node collapsed after a SKU re-query (depth-2 defaults are first-load only)', () => {
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const fixture = createComponent();
      fixture.detectChanges();
      const comp = fixture.componentInstance;

      // Depth-2 defaults applied on first load
      expect(comp.isExpanded('floor-1')).toBe(true);
      expect(comp.isExpanded('shelf-1')).toBe(true);

      // User collapses floor-1 via its toggle button in the DOM
      const toggle = queryRows(fixture)[0].querySelector('.tree-row__toggle') as HTMLButtonElement;
      toggle.click();
      fixture.detectChanges();
      expect(comp.isExpanded('floor-1')).toBe(false);

      // New response arrives for a SKU change — collapse choice must survive
      comp.onSkuChange('SKU-99');
      fixture.detectChanges();

      expect(mockRollupService.getSiteRollup).toHaveBeenCalledTimes(2);
      expect(comp.isExpanded('floor-1')).toBe(false);
      // Still rendered collapsed: only the two root rows visible
      expect(queryRows(fixture)).toHaveLength(2);
      // The user's other expand state is untouched
      expect(comp.isExpanded('shelf-1')).toBe(true);
    });

    it('re-applies negative-available auto-expand on every response, even after a manual collapse', () => {
      const deepNeg: StorageLocationRollupNode = {
        storageLocationId: 'deep-neg',
        name: 'Deep Neg Bin',
        type: 'BIN',
        status: 'ACTIVE',
        own: { onHand: 0, allocated: 5, available: -5 },
        rolledUp: { onHand: 0, allocated: 5, available: -5 },
        children: [],
      };
      const shelf: StorageLocationRollupNode = {
        storageLocationId: 'shelf-neg',
        name: 'Shelf with neg',
        type: 'SHELF',
        status: 'ACTIVE',
        own: { onHand: 0, allocated: 0, available: 0 },
        rolledUp: { onHand: 0, allocated: 5, available: -5 },
        children: [deepNeg],
      };
      const floor: StorageLocationRollupNode = {
        storageLocationId: 'floor-neg',
        name: 'Floor with neg',
        type: 'FLOOR',
        status: 'ACTIVE',
        own: { onHand: 0, allocated: 0, available: 0 },
        rolledUp: { onHand: 0, allocated: 5, available: -5 },
        children: [shelf],
      };
      const resp: SiteInventoryRollupResponse = {
        siteId: 'site-1',
        totals: { onHand: 0, allocated: 5, available: -5 },
        nodes: [floor],
      };
      mockRollupService.getSiteRollup.mockReturnValue(of(resp));
      const fixture = createComponent();
      const comp = fixture.componentInstance;

      expect(comp.isExpanded('floor-neg')).toBe(true);
      expect(comp.isExpanded('shelf-neg')).toBe(true);

      // User collapses the path to the negative node
      comp.toggleRow('floor-neg');
      comp.toggleRow('shelf-neg');
      expect(comp.isExpanded('floor-neg')).toBe(false);

      // Next response re-reveals the over-allocated node
      comp.refresh();

      expect(comp.isExpanded('floor-neg')).toBe(true);
      expect(comp.isExpanded('shelf-neg')).toBe(true);
    });
  });

  describe('distinct badge glyphs', () => {
    it('over-allocated and inactive-stock badges render visibly distinct glyphs', () => {
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const fixture = createComponent();
      fixture.detectChanges();

      const errorIcon = fixture.nativeElement.querySelector(
        '.tree-row__badge.badge--error .tree-row__badge-icon',
      ) as HTMLElement;
      const warningIcon = fixture.nativeElement.querySelector(
        '.tree-row__badge.badge--warning .tree-row__badge-icon',
      ) as HTMLElement;

      expect(errorIcon).not.toBeNull();
      expect(warningIcon).not.toBeNull();

      const errorGlyph = errorIcon.textContent!.trim();
      const warningGlyph = warningIcon.textContent!.trim();
      expect(errorGlyph.length).toBeGreaterThan(0);
      expect(warningGlyph.length).toBeGreaterThan(0);
      // Visible content differs — distinction does not rely on color or aria-label alone
      expect(errorGlyph).not.toBe(warningGlyph);
    });

    it('badges also carry distinct accessible labels', () => {
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const fixture = createComponent();
      fixture.detectChanges();

      const errorBadge = fixture.nativeElement.querySelector('.tree-row__badge.badge--error') as HTMLElement;
      const warningBadge = fixture.nativeElement.querySelector('.tree-row__badge.badge--warning') as HTMLElement;
      expect(errorBadge.getAttribute('aria-label')).not.toBe(warningBadge.getAttribute('aria-label'));
    });
  });

  describe('a11y role/aria assertions', () => {
    it('renders treegrid role on the table', () => {
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const fixture = createComponent();
      fixture.detectChanges();

      const table = fixture.nativeElement.querySelector('[role="treegrid"]');
      expect(table).not.toBeNull();
    });

    it('rows have aria-level attributes', () => {
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const fixture = createComponent();
      fixture.detectChanges();

      const rows = fixture.nativeElement.querySelectorAll('tr[aria-level]');
      expect(rows.length).toBeGreaterThan(0);
    });

    it('expanded rows have aria-expanded attribute', () => {
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const fixture = createComponent();
      fixture.detectChanges();

      const expandedRows = fixture.nativeElement.querySelectorAll('tr[aria-expanded="true"]');
      expect(expandedRows.length).toBeGreaterThan(0);
    });

    it('badges have aria-label text not only color', () => {
      mockRollupService.getSiteRollup.mockReturnValue(of(SITE_RESPONSE));
      const fixture = createComponent();
      fixture.detectChanges();

      // neg-floor should have badge with aria-label
      const badges = fixture.nativeElement.querySelectorAll('.badge.badge--error[aria-label]');
      expect(badges.length).toBeGreaterThan(0);
    });
  });
});

// ── Unit tests for pure helpers ───────────────────────────────────────────────

describe('flattenNodes', () => {
  it('produces rows at correct depths', () => {
    const rows: TreeRow[] = [];
    flattenNodes([FLOOR_NODE], 1, null, new Set(['floor-1', 'shelf-1']), rows, true);
    // floor-1 (d1), shelf-1 (d2), bin-1 (d3), shelf-2 (d2)
    expect(rows).toHaveLength(4);
    expect(rows.find(r => r.node.storageLocationId === 'floor-1')?.depth).toBe(1);
    expect(rows.find(r => r.node.storageLocationId === 'shelf-1')?.depth).toBe(2);
    expect(rows.find(r => r.node.storageLocationId === 'bin-1')?.depth).toBe(3);
  });

  it('children of collapsed nodes are not visible', () => {
    const rows: TreeRow[] = [];
    // floor-1 not expanded
    flattenNodes([FLOOR_NODE], 1, null, new Set(), rows, true);

    const shelfRow = rows.find(r => r.node.storageLocationId === 'shelf-1')!;
    expect(shelfRow.visible).toBe(false);
  });

  it('children of expanded nodes are visible', () => {
    const rows: TreeRow[] = [];
    flattenNodes([FLOOR_NODE], 1, null, new Set(['floor-1']), rows, true);

    const shelfRow = rows.find(r => r.node.storageLocationId === 'shelf-1')!;
    expect(shelfRow.visible).toBe(true);
    // bin-1 parent (shelf-1) not expanded
    const binRow = rows.find(r => r.node.storageLocationId === 'bin-1')!;
    expect(binRow.visible).toBe(false);
  });
});

describe('collectNegativeAvailablePaths', () => {
  it('returns empty set when no negatives exist', () => {
    const result = collectNegativeAvailablePaths([FLOOR_NODE]);
    // shelf-2 has available=70 (positive), floor-1 has available=80
    // No negative node — but note shelf-1 has children expanded to bin-1 (available=25)
    expect(result.size).toBe(0);
  });

  it('collects ancestor IDs for a negative node', () => {
    const deepNeg: StorageLocationRollupNode = {
      storageLocationId: 'bin-neg',
      name: 'Neg bin',
      type: 'BIN',
      status: 'ACTIVE',
      own: { onHand: 0, allocated: 10, available: -10 },
      rolledUp: { onHand: 0, allocated: 10, available: -10 },
      children: [],
    };
    const shelf: StorageLocationRollupNode = {
      ...FLOOR_NODE.children![0],
      storageLocationId: 'shelf-neg-test',
      children: [deepNeg],
    };
    const floor: StorageLocationRollupNode = {
      ...FLOOR_NODE,
      storageLocationId: 'floor-neg-test',
      children: [shelf],
    };

    const result = collectNegativeAvailablePaths([floor]);
    // floor-neg-test and shelf-neg-test must be in the expand set
    expect(result.has('floor-neg-test')).toBe(true);
    expect(result.has('shelf-neg-test')).toBe(true);
    // bin-neg itself is the leaf, no children to expand
  });
});
