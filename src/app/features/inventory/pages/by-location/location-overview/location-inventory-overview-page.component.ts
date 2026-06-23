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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, Subscription, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { LocationAPIService } from '@durion-sdk/location';
import type { LocationRef } from '@durion-sdk/location';
import { ProductsAPIService } from '@durion-sdk/catalog';
import type { ProductSummary } from '@durion-sdk/catalog';
import { InventoryRollupApiService } from '../../../services/inventory-rollup.service';
import type {
  LocationInventoryRollupResponse,
  RollupError,
  RollupQuantities,
} from '../../../models/inventory-rollup.models';


export type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';
export type RollupErrorKind = RollupError['kind'];

export interface SiteRow {
  siteId: string;
  siteName: string;
  onHand: number;
  allocated: number;
  available: number;
  availableNegative: boolean;
}

export type SortColumn = 'siteName' | 'onHand' | 'allocated' | 'available';
export type SortDir = 'asc' | 'desc';

/** Max product suggestions shown in the name/SKU typeahead. */
const MAX_PRODUCT_SUGGESTIONS = 8;

/**
 * Location Inventory Overview page (CAP-218 story F3).
 *
 * Screen 1 per SPEC-inventory-location-rollup-frontend.md §3:
 * - Typeahead location picker (parent locations from pos-location roster).
 * - Grand total strip: onHand / allocated / available (negative available
 *   renders warning badge — unclamped per spec §2).
 * - Sites table with sortable columns; row click navigates to Screen 2
 *   (/app/inventory/by-location/site/:siteId) with siteName in router state.
 * - Product filter: a "find by name or SKU" typeahead (debounced 250 ms)
 *   backed by the catalog product search. Selecting a suggestion resolves to
 *   its SKU and re-queries the rollup with sku=; clearing the input drops the
 *   filter and re-queries the full rollup.
 * - Error states per spec §5.
 * - i18n: keys under INVENTORY.BY_LOCATION.*.
 * - State: Angular signals, component-local, OnPush.
 */
@Component({
  selector: 'app-location-inventory-overview-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslatePipe, RouterLink],
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

  // ── Location picker ──────────────────────────────────────────────────────

  /** All parent-type locations loaded once on init. */
  readonly allParentLocations = signal<LocationRef[]>([]);
  /** Current typeahead filter text (also displays selected name). */
  readonly pickerQuery = signal('');
  /** Whether the typeahead dropdown is open. */
  readonly pickerOpen = signal(false);
  /** True once the initial location list has finished loading. */
  readonly locationsLoaded = signal(false);
  /** Index of the keyboard-active option in the listbox (-1 = none). */
  readonly activeOptionIndex = signal(-1);

  readonly filteredLocations = computed<LocationRef[]>(() => {
    const q = this.pickerQuery().trim().toLowerCase();
    if (!q) return this.allParentLocations().slice(0, 20);
    return this.allParentLocations()
      .filter(loc => (loc.name ?? '').toLowerCase().includes(q))
      .slice(0, 20);
  });

  // ── Selected location ────────────────────────────────────────────────────

  readonly selectedLocationId = signal<string | null>(null);
  readonly selectedLocationName = signal<string>('');

  // ── Rollup data ──────────────────────────────────────────────────────────

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly errorKind = signal<RollupErrorKind | null>(null);

  /** Last successfully loaded rollup response — retained for upstream-down. */
  readonly rollupData = signal<LocationInventoryRollupResponse | null>(null);

  readonly totals = computed<RollupQuantities | null>(() => this.rollupData()?.totals ?? null);

  readonly grandTotalNegative = computed<boolean>(() => {
    const t = this.totals();
    return t !== null && t.available < 0;
  });

  // ── Upstream-down non-destructive banner ─────────────────────────────────

  readonly showRetryBanner = signal(false);

  // ── Product filter (find by name or SKU) ─────────────────────────────────

  /** Resolved SKU passed to the rollup query ('' = no filter). */
  readonly skuInput = signal('');
  /** Free text shown in the typeahead input (product name, SKU, or "name (sku)"). */
  readonly productDisplayName = signal('');
  /** Current async suggestions from the catalog product search. */
  readonly productSuggestions = signal<ProductSummary[]>([]);
  /** Whether the suggestions dropdown is open. */
  readonly showProductSuggestions = signal(false);
  /** Index of the keyboard-active suggestion (-1 = none). */
  readonly activeProductIndex = signal(-1);
  private readonly productSearch$ = new Subject<string>();
  private rollupSub: Subscription | null = null;

  // ── Sites table sort ─────────────────────────────────────────────────────

  readonly sortColumn = signal<SortColumn>('siteName');
  readonly sortDir = signal<SortDir>('asc');

  readonly siteRows = computed<SiteRow[]>(() => {
    const data = this.rollupData();
    if (!data?.sites?.length) return [];
    const rows: SiteRow[] = data.sites.map(s => ({
      siteId: s.siteId,
      siteName: s.siteName ?? s.siteId,
      onHand: s.totals.onHand,
      allocated: s.totals.allocated,
      available: s.totals.available,
      availableNegative: s.totals.available < 0,
    }));
    return this.sortRows(rows, this.sortColumn(), this.sortDir());
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadParentLocations();
    this.setupProductSearch();

    // URL is the single source of truth for the selected location (spec §3,
    // ADR-0037): react to every paramMap emission so browser back/forward
    // between /:locationId values reloads the rollup even when the router
    // reuses this component instance.
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => this.onLocationParam(params.get('locationId')));
  }

  // ── Picker handlers ──────────────────────────────────────────────────────

  onPickerInput(value: string): void {
    this.pickerQuery.set(value);
    this.pickerOpen.set(true);
    this.activeOptionIndex.set(-1);
    if (!value.trim()) {
      const hadSelection = this.selectedLocationId() !== null;
      this.selectedLocationId.set(null);
      this.selectedLocationName.set('');
      this.rollupData.set(null);
      this.state.set('idle');
      if (hadSelection) {
        // Clearing the picker returns to the idle route so the URL does not
        // keep pointing at the cleared location (spec §3).
        void this.router.navigate(['/app/inventory/by-location']);
      }
    }
  }

  onPickerFocus(): void {
    this.pickerOpen.set(true);
  }

  onPickerBlur(): void {
    // Delay so that a click on a dropdown option can register before close.
    setTimeout(() => {
      this.pickerOpen.set(false);
      this.activeOptionIndex.set(-1);
    }, 150);
  }

  onPickerKeydown(event: KeyboardEvent): void {
    const options = this.filteredLocations();
    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        if (!this.pickerOpen()) {
          this.pickerOpen.set(true);
          this.activeOptionIndex.set(options.length > 0 ? 0 : -1);
          return;
        }
        if (options.length === 0) return;
        this.activeOptionIndex.set((this.activeOptionIndex() + 1) % options.length);
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        if (!this.pickerOpen()) {
          this.pickerOpen.set(true);
          this.activeOptionIndex.set(options.length - 1);
          return;
        }
        if (options.length === 0) return;
        const current = this.activeOptionIndex();
        this.activeOptionIndex.set(current <= 0 ? options.length - 1 : current - 1);
        break;
      }
      case 'Enter': {
        const index = this.activeOptionIndex();
        if (this.pickerOpen() && index >= 0 && index < options.length) {
          event.preventDefault();
          this.selectLocation(options[index]);
        }
        break;
      }
      case 'Escape': {
        if (this.pickerOpen()) {
          event.preventDefault();
          this.pickerOpen.set(false);
          this.activeOptionIndex.set(-1);
        }
        break;
      }
      default:
        break;
    }
  }

  optionId(index: number): string {
    return `loc-picker-option-${index}`;
  }

  activeDescendant(): string | null {
    const index = this.activeOptionIndex();
    return this.pickerOpen() && index >= 0 ? this.optionId(index) : null;
  }

  selectLocation(loc: LocationRef): void {
    const id = loc.id ?? '';
    this.selectedLocationId.set(id);
    this.selectedLocationName.set(loc.name ?? id);
    this.pickerQuery.set(loc.name ?? id);
    this.pickerOpen.set(false);
    this.activeOptionIndex.set(-1);
    this.resetProductFilter();
    // Navigation is the single trigger for loading: the paramMap subscription
    // reacts to this URL change and calls loadRollup().
    void this.router.navigate(['/app/inventory/by-location', id]);
  }

  // ── Product filter (find by name or SKU) ─────────────────────────────────

  onProductInput(value: string): void {
    this.productDisplayName.set(value);
    this.showProductSuggestions.set(true);
    this.activeProductIndex.set(-1);
    // Editing away from a resolved product clears the active filter and
    // re-queries the full rollup once.
    const hadSku = this.skuInput() !== '';
    this.skuInput.set('');
    this.productSearch$.next(value);
    if (hadSku && this.selectedLocationId()) {
      this.loadRollup();
    }
  }

  onProductFocus(): void {
    if (this.productSuggestions().length > 0) {
      this.showProductSuggestions.set(true);
    }
  }

  onProductBlur(): void {
    // Delay so a mousedown on a suggestion registers before the list closes.
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

  selectProduct(product: ProductSummary): void {
    const sku = product.sku ?? '';
    this.skuInput.set(sku);
    this.productDisplayName.set(product.name ? `${product.name} (${sku})` : sku);
    this.showProductSuggestions.set(false);
    this.activeProductIndex.set(-1);
    if (this.selectedLocationId()) {
      this.loadRollup();
    }
  }

  private resetProductFilter(): void {
    this.skuInput.set('');
    this.productDisplayName.set('');
    this.productSuggestions.set([]);
    this.showProductSuggestions.set(false);
    this.activeProductIndex.set(-1);
  }

  // ── Table sort ───────────────────────────────────────────────────────────

  sortBy(col: SortColumn): void {
    if (this.sortColumn() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(col);
      this.sortDir.set('asc');
    }
  }

  ariaSort(col: SortColumn): 'ascending' | 'descending' | 'none' {
    if (this.sortColumn() !== col) return 'none';
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  // ── Row navigation ───────────────────────────────────────────────────────

  navigateToSite(row: SiteRow): void {
    void this.router.navigate(['/app/inventory/by-location/site', row.siteId], {
      state: { siteName: row.siteName },
    });
  }

  onRowSpace(event: Event, row: SiteRow): void {
    // Prevent the default page scroll triggered by Space on a focused row.
    event.preventDefault();
    this.navigateToSite(row);
  }

  // ── Refresh / retry ──────────────────────────────────────────────────────

  refresh(): void {
    this.loadRollup();
  }

  retry(): void {
    this.showRetryBanner.set(false);
    this.loadRollup();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /** Reacts to a `locationId` route-param emission (URL is source of truth). */
  private onLocationParam(locationId: string | null): void {
    if (!locationId) {
      this.selectedLocationId.set(null);
      this.selectedLocationName.set('');
      this.pickerQuery.set('');
      this.rollupData.set(null);
      this.state.set('idle');
      return;
    }

    if (locationId !== this.selectedLocationId()) {
      this.selectedLocationId.set(locationId);
      this.resetProductFilter();
      const match = this.allParentLocations().find(l => l.id === locationId);
      if (match) {
        this.selectedLocationName.set(match.name ?? locationId);
        this.pickerQuery.set(match.name ?? locationId);
      } else {
        // Direct URL entry before the roster loads: loadParentLocations()
        // back-fills the display name once locations arrive.
        this.selectedLocationName.set('');
      }
    }
    this.loadRollup();
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

          // Back-fill display name when arriving via direct URL.
          const id = this.selectedLocationId();
          if (id && !this.selectedLocationName()) {
            const match = locations.find((l: LocationRef) => l.id === id);
            if (match) {
              this.selectedLocationName.set(match.name ?? id);
              this.pickerQuery.set(match.name ?? id);
            }
          }
        },
        error: () => {
          // Non-fatal: picker simply shows nothing; log and move on.
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
              String(MAX_PRODUCT_SUGGESTIONS),
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

  private loadRollup(): void {
    const locationId = this.selectedLocationId();
    if (!locationId) return;

    // Cancel any in-flight request before issuing a new one.
    this.rollupSub?.unsubscribe();

    this.state.set('loading');
    this.errorKey.set(null);
    this.errorKind.set(null);
    this.showRetryBanner.set(false);

    const sku = this.skuInput().trim() || undefined;

    this.rollupSub = this.rollupService
      .getLocationRollup(locationId, { sku })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response: LocationInventoryRollupResponse) => {
          this.rollupData.set(response);
          this.state.set(response.sites?.length ? 'ready' : 'empty');
        },
        error: (err: RollupError) => {
          this.handleRollupError(err);
        },
      });
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
        // Non-destructive: keep previously loaded data visible; show banner.
        this.showRetryBanner.set(true);
        if (!this.rollupData()) {
          this.state.set('error');
          this.errorKey.set('INVENTORY.BY_LOCATION.ERROR.UPSTREAM_DOWN');
        } else {
          // Restore 'ready' — loadRollup set it to 'loading' before the error.
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

  private sortRows(rows: SiteRow[], col: SortColumn, dir: SortDir): SiteRow[] {
    return [...rows].sort((a, b) => {
      const cmp = col === 'siteName' ? a.siteName.localeCompare(b.siteName) : a[col] - b[col];
      return dir === 'asc' ? cmp : -cmp;
    });
  }
}
