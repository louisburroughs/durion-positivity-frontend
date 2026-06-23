import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, Subscription, of, forkJoin } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, map } from 'rxjs/operators';
import { LocationAPIService } from '@durion-sdk/location';
import type { LocationRef } from '@durion-sdk/location';
import { ProductsAPIService } from '@durion-sdk/catalog';
import type { ProductSummary } from '@durion-sdk/catalog';
import { InventoryRollupApiService } from '../../../services/inventory-rollup.service';
import type {
  RollupError,
  RollupQuantities,
} from '../../../models/inventory-rollup.models';


export type PageState = 'idle' | 'loading' | 'ready' | 'error';
export type RollupErrorKind = RollupError['kind'];

/** A location chosen for the multi-select tally. */
export interface SelectedLocation {
  id: string;
  name: string;
}

/** A product chosen for the multi-select tally. */
export interface SelectedProduct {
  sku: string;
  name: string;
}

/** One row of the results table: a (location × product) pair. */
export interface ResultRow {
  key: string;
  locationId: string;
  locationName: string;
  sku: string;
  productName: string;
  onHand: number;
  allocated: number;
  available: number;
  availableNegative: boolean;
}

/** Max suggestions shown in either typeahead. */
const MAX_SUGGESTIONS = 8;

/**
 * Location Inventory Overview page (CAP-218 story F3, extended).
 *
 * Cross-tabulates inventory across a multi-select of locations and products:
 * - Location typeahead (parent locations from the pos-location roster),
 *   multi-select as removable chips. The selection is mirrored in the
 *   `?locations=` query param so the view stays deep-linkable.
 * - Product "find by name or SKU" typeahead (catalog search), multi-select as
 *   removable chips.
 * - Results table: one row per (location × product), columns
 *   location / product / SKU / on-hand / allocated / available, with a totals
 *   row. The rollup endpoint filters by a single SKU at a single location, so
 *   the grid is fanned out one query per (location, SKU) pair and assembled
 *   client-side.
 * - Requires at least one location AND one product; otherwise an idle prompt.
 * - Error states per spec §5; i18n keys under INVENTORY.BY_LOCATION.*.
 * - State: Angular signals, component-local, OnPush.
 */
@Component({
  selector: 'app-location-inventory-overview-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './location-inventory-overview-page.component.html',
  styleUrl: './location-inventory-overview-page.component.css',
})
export class LocationInventoryOverviewPageComponent implements OnInit {
  private readonly rollupService = inject(InventoryRollupApiService);
  private readonly locationSdk = inject(LocationAPIService);
  private readonly productsApi = inject(ProductsAPIService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  // ── Location picker (multi-select) ───────────────────────────────────────

  /** All parent-type locations loaded once on init. */
  readonly allParentLocations = signal<LocationRef[]>([]);
  /** Current typeahead filter text for the location picker. */
  readonly locationQuery = signal('');
  /** Whether the location dropdown is open. */
  readonly locationPickerOpen = signal(false);
  /** True once the initial location list has finished loading. */
  readonly locationsLoaded = signal(false);
  /** Index of the keyboard-active location option (-1 = none). */
  readonly activeLocationIndex = signal(-1);
  /** Locations chosen for the tally (deduped by id). */
  readonly selectedLocations = signal<SelectedLocation[]>([]);

  readonly filteredLocations = computed<LocationRef[]>(() => {
    const q = this.locationQuery().trim().toLowerCase();
    const all = this.allParentLocations();
    const matches = q
      ? all.filter(loc => (loc.name ?? '').toLowerCase().includes(q))
      : all;
    return matches.slice(0, MAX_SUGGESTIONS);
  });

  // ── Product picker (multi-select, find by name or SKU) ───────────────────

  /** Free text in the product typeahead search box. */
  readonly productDisplayName = signal('');
  /** Current async suggestions from the catalog product search. */
  readonly productSuggestions = signal<ProductSummary[]>([]);
  /** Whether the product suggestions dropdown is open. */
  readonly showProductSuggestions = signal(false);
  /** Index of the keyboard-active product suggestion (-1 = none). */
  readonly activeProductIndex = signal(-1);
  /** Products chosen for the tally (deduped by SKU). */
  readonly selectedProducts = signal<SelectedProduct[]>([]);
  private readonly productSearch$ = new Subject<string>();

  // ── Results ──────────────────────────────────────────────────────────────

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly errorKind = signal<RollupErrorKind | null>(null);
  readonly showRetryBanner = signal(false);

  /** One row per (location × product). */
  readonly resultRows = signal<ResultRow[]>([]);

  readonly grandTotals = computed<RollupQuantities>(() =>
    this.resultRows().reduce(
      (acc, r) => ({
        onHand: acc.onHand + r.onHand,
        allocated: acc.allocated + r.allocated,
        available: acc.available + r.available,
      }),
      { onHand: 0, allocated: 0, available: 0 } as RollupQuantities,
    ),
  );

  readonly grandTotalNegative = computed<boolean>(() => this.grandTotals().available < 0);

  /** Both axes must have at least one selection to produce a tally. */
  readonly canTally = computed<boolean>(
    () => this.selectedLocations().length > 0 && this.selectedProducts().length > 0,
  );

  private rollupSub: Subscription | null = null;
  /**
   * Count of query-param navigations we triggered ourselves. Each produces a
   * `queryParamMap` emission that must NOT reconcile the selection (the signal
   * is already authoritative) — otherwise a stale in-order emission could
   * momentarily revert a rapid multi-select. Only external changes (back /
   * forward / deep link) fall through to reconciliation.
   */
  private pendingSelfNavigations = 0;

  // ── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadParentLocations();
    this.setupProductSearch();

    // The `?locations=` query param is the source of truth for the location
    // selection (deep-linkable). React to every emission so back/forward and
    // shared links reload the tally.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => this.onLocationsParam(params.get('locations')));

    // Back-compat: a legacy /by-location/:locationId deep link seeds the param.
    const legacyId = this.route.snapshot.paramMap.get('locationId');
    if (legacyId && !this.route.snapshot.queryParamMap.get('locations')) {
      void this.router.navigate(['/app/inventory/by-location'], {
        queryParams: { locations: legacyId },
        replaceUrl: true,
      });
    }
  }

  // ── Location picker handlers ─────────────────────────────────────────────

  onLocationInput(value: string): void {
    this.locationQuery.set(value);
    this.locationPickerOpen.set(true);
    this.activeLocationIndex.set(-1);
  }

  onLocationFocus(): void {
    this.locationPickerOpen.set(true);
  }

  onLocationBlur(): void {
    setTimeout(() => {
      this.locationPickerOpen.set(false);
      this.activeLocationIndex.set(-1);
    }, 150);
  }

  onLocationKeydown(event: KeyboardEvent): void {
    const options = this.filteredLocations();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.locationPickerOpen()) {
          this.locationPickerOpen.set(true);
          this.activeLocationIndex.set(options.length > 0 ? 0 : -1);
          return;
        }
        if (options.length === 0) return;
        this.activeLocationIndex.set((this.activeLocationIndex() + 1) % options.length);
        break;
      case 'ArrowUp': {
        event.preventDefault();
        if (options.length === 0) return;
        const current = this.activeLocationIndex();
        this.activeLocationIndex.set(current <= 0 ? options.length - 1 : current - 1);
        break;
      }
      case 'Enter': {
        const index = this.activeLocationIndex();
        if (this.locationPickerOpen() && index >= 0 && index < options.length) {
          event.preventDefault();
          this.selectLocation(options[index]);
        }
        break;
      }
      case 'Escape':
        if (this.locationPickerOpen()) {
          event.preventDefault();
          this.locationPickerOpen.set(false);
          this.activeLocationIndex.set(-1);
        }
        break;
      default:
        break;
    }
  }

  locationOptionId(index: number): string {
    return `loc-picker-option-${index}`;
  }

  activeLocationDescendant(): string | null {
    const index = this.activeLocationIndex();
    return this.locationPickerOpen() && index >= 0 ? this.locationOptionId(index) : null;
  }

  isLocationSelected(id: string | undefined): boolean {
    return !!id && this.selectedLocations().some(l => l.id === id);
  }

  selectLocation(loc: LocationRef): void {
    const id = loc.id ?? '';
    if (id && !this.isLocationSelected(id)) {
      this.selectedLocations.update(list => [...list, { id, name: loc.name ?? id }]);
      this.loadTally();
      this.pushLocationsToUrl();
    }
    this.locationQuery.set('');
    this.locationPickerOpen.set(false);
    this.activeLocationIndex.set(-1);
  }

  removeLocation(id: string): void {
    const before = this.selectedLocations().length;
    this.selectedLocations.update(list => list.filter(l => l.id !== id));
    if (this.selectedLocations().length !== before) {
      this.loadTally();
      this.pushLocationsToUrl();
    }
  }

  clearLocations(): void {
    if (this.selectedLocations().length === 0) return;
    this.selectedLocations.set([]);
    this.loadTally();
    this.pushLocationsToUrl();
  }

  // ── Product picker handlers ──────────────────────────────────────────────

  onProductInput(value: string): void {
    this.productDisplayName.set(value);
    this.showProductSuggestions.set(true);
    this.activeProductIndex.set(-1);
    this.productSearch$.next(value);
  }

  onProductFocus(): void {
    if (this.productSuggestions().length > 0) {
      this.showProductSuggestions.set(true);
    }
  }

  onProductBlur(): void {
    setTimeout(() => {
      this.showProductSuggestions.set(false);
      this.activeProductIndex.set(-1);
    }, 150);
  }

  onProductKeydown(event: KeyboardEvent): void {
    const options = this.productSuggestions();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.showProductSuggestions() && options.length > 0) {
          this.showProductSuggestions.set(true);
          this.activeProductIndex.set(0);
          return;
        }
        if (options.length === 0) return;
        this.activeProductIndex.set((this.activeProductIndex() + 1) % options.length);
        break;
      case 'ArrowUp': {
        event.preventDefault();
        if (options.length === 0) return;
        const current = this.activeProductIndex();
        this.activeProductIndex.set(current <= 0 ? options.length - 1 : current - 1);
        break;
      }
      case 'Enter': {
        const index = this.activeProductIndex();
        if (this.showProductSuggestions() && index >= 0 && index < options.length) {
          event.preventDefault();
          this.selectProduct(options[index]);
        }
        break;
      }
      case 'Escape':
        if (this.showProductSuggestions()) {
          event.preventDefault();
          this.showProductSuggestions.set(false);
          this.activeProductIndex.set(-1);
        }
        break;
      default:
        break;
    }
  }

  productOptionId(index: number): string {
    return `product-filter-option-${index}`;
  }

  activeProductDescendant(): string | null {
    const index = this.activeProductIndex();
    return this.showProductSuggestions() && index >= 0 ? this.productOptionId(index) : null;
  }

  isProductSelected(sku: string | undefined): boolean {
    return !!sku && this.selectedProducts().some(p => p.sku === sku);
  }

  selectProduct(product: ProductSummary): void {
    const sku = product.sku ?? '';
    if (sku && !this.isProductSelected(sku)) {
      this.selectedProducts.update(list => [...list, { sku, name: product.name ?? sku }]);
      this.loadTally();
    }
    this.productDisplayName.set('');
    this.productSuggestions.set([]);
    this.showProductSuggestions.set(false);
    this.activeProductIndex.set(-1);
  }

  removeProduct(sku: string): void {
    const before = this.selectedProducts().length;
    this.selectedProducts.update(list => list.filter(p => p.sku !== sku));
    if (this.selectedProducts().length !== before) {
      this.loadTally();
    }
  }

  clearSelectedProducts(): void {
    if (this.selectedProducts().length === 0) return;
    this.selectedProducts.set([]);
    this.loadTally();
  }

  // ── Refresh / retry ──────────────────────────────────────────────────────

  refresh(): void {
    this.loadTally();
  }

  retry(): void {
    this.showRetryBanner.set(false);
    this.loadTally();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /** Reacts to a `locations` query-param emission (source of truth). */
  private onLocationsParam(csv: string | null): void {
    // Skip emissions caused by our own navigations; the selection signal is
    // already up to date for those.
    if (this.pendingSelfNavigations > 0) {
      this.pendingSelfNavigations--;
      return;
    }

    const ids = (csv ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const currentIds = this.selectedLocations().map(l => l.id);
    if (sameMembers(ids, currentIds)) return;

    const roster = this.allParentLocations();
    this.selectedLocations.set(
      ids.map(id => {
        const match = roster.find(l => l.id === id);
        return { id, name: match?.name ?? id };
      }),
    );
    this.loadTally();
  }

  private pushLocationsToUrl(): void {
    const ids = this.selectedLocations().map(l => l.id);
    this.pendingSelfNavigations++;
    void this.router.navigate(['/app/inventory/by-location'], {
      queryParams: { locations: ids.length ? ids.join(',') : null },
      queryParamsHandling: 'merge',
    });
  }

  private loadParentLocations(): void {
    this.locationSdk
      .getRoster({ page: 0, size: 500 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          const locations: LocationRef[] = page.content ?? [];
          this.allParentLocations.set(locations);
          this.locationsLoaded.set(true);

          // Back-fill display names for selections seeded from the URL before
          // the roster arrived.
          const needsName = this.selectedLocations().some(l => l.name === l.id);
          if (needsName) {
            this.selectedLocations.update(list =>
              list.map(l => {
                if (l.name !== l.id) return l;
                const match = locations.find(r => r.id === l.id);
                return match ? { id: l.id, name: match.name ?? l.id } : l;
              }),
            );
          }
        },
        error: () => {
          console.warn('[LocationInventoryOverview] Failed to load parent locations');
          this.locationsLoaded.set(true);
        },
      });
  }

  private setupProductSearch(): void {
    this.productSearch$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap(q => {
          if (!q.trim()) return of({ data: [] as ProductSummary[] });
          return this.productsApi
            .searchProducts(
              q,
              undefined,
              undefined,
              undefined,
              undefined,
              String(MAX_SUGGESTIONS),
              'body',
              false,
              { transferCache: false },
            )
            .pipe(catchError(() => of({ data: [] as ProductSummary[] })));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(result => {
        this.productSuggestions.set((result as { data?: ProductSummary[] }).data ?? []);
        this.activeProductIndex.set(-1);
      });
  }

  /**
   * Fans out one rollup query per (location, SKU) pair and assembles the
   * results table. The endpoint filters by a single SKU at a single location,
   * so each cell of the location × product grid is its own request.
   */
  private loadTally(): void {
    this.rollupSub?.unsubscribe();

    const locations = this.selectedLocations();
    const products = this.selectedProducts();

    if (locations.length === 0 || products.length === 0) {
      this.resultRows.set([]);
      this.state.set('idle');
      this.errorKey.set(null);
      this.errorKind.set(null);
      this.showRetryBanner.set(false);
      return;
    }

    this.state.set('loading');
    this.errorKey.set(null);
    this.errorKind.set(null);
    this.showRetryBanner.set(false);

    const pairs: { loc: SelectedLocation; prod: SelectedProduct }[] = [];
    for (const loc of locations) {
      for (const prod of products) {
        pairs.push({ loc, prod });
      }
    }

    this.rollupSub = forkJoin(
      pairs.map(({ loc, prod }) =>
        this.rollupService
          .getLocationRollup(loc.id, { sku: prod.sku })
          .pipe(map(resp => this.toRow(loc, prod, resp.totals))),
      ),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows: ResultRow[]) => {
          this.resultRows.set(rows);
          this.state.set('ready');
        },
        error: (err: RollupError) => {
          this.handleRollupError(err);
        },
      });
  }

  private toRow(
    loc: SelectedLocation,
    prod: SelectedProduct,
    totals: RollupQuantities | undefined,
  ): ResultRow {
    const available = totals?.available ?? 0;
    return {
      key: `${loc.id}|${prod.sku}`,
      locationId: loc.id,
      locationName: loc.name,
      sku: prod.sku,
      productName: prod.name,
      onHand: totals?.onHand ?? 0,
      allocated: totals?.allocated ?? 0,
      available,
      availableNegative: available < 0,
    };
  }

  private handleRollupError(err: RollupError): void {
    this.errorKind.set(err.kind);
    switch (err.kind) {
      case 'not-found':
        this.state.set('error');
        this.errorKey.set('INVENTORY.BY_LOCATION.ERROR.NOT_FOUND');
        break;
      case 'forbidden':
        this.state.set('error');
        this.errorKey.set('INVENTORY.BY_LOCATION.ERROR.FORBIDDEN');
        break;
      case 'upstream-down':
        // Non-destructive: keep previously loaded rows visible; show banner.
        this.showRetryBanner.set(true);
        if (!this.resultRows().length) {
          this.state.set('error');
          this.errorKey.set('INVENTORY.BY_LOCATION.ERROR.UPSTREAM_DOWN');
        } else {
          this.state.set('ready');
        }
        break;
      case 'validation':
        this.state.set('error');
        this.errorKey.set('INVENTORY.BY_LOCATION.ERROR.VALIDATION');
        console.error('[LocationInventoryOverview] Rollup validation error:', err);
        break;
      default:
        this.state.set('error');
        this.errorKey.set('INVENTORY.BY_LOCATION.ERROR.UNKNOWN');
        console.error('[LocationInventoryOverview] Unexpected rollup error:', err);
        break;
    }
  }
}

/** Order-insensitive set equality for two string id lists. */
function sameMembers(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every(id => setB.has(id));
}
