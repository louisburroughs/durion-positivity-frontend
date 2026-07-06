
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of, catchError } from 'rxjs';
import { ProductsAPIService, ProductSummary } from '@durion-sdk/catalog';
import { AvailabilityView } from '../../models/inventory.models';
import { InventoryDomainService } from '../../services/inventory.service';
import { LocationPickerComponent } from '../../../location/components/location-picker/location-picker.component';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

const MAX_SUGGESTIONS = 8;

@Component({
  selector: 'app-inventory-availability',
  standalone: true,
  imports: [TranslatePipe, FormsModule, LocationPickerComponent],
  templateUrl: './availability.component.html',
  styleUrls: ['./availability.component.css', '../../../../shared/styles/listbox.css'],
})
export class AvailabilityComponent {
  private readonly inventoryService = inject(InventoryDomainService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly productsApi = inject(ProductsAPIService);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly skuInput = signal('');
  readonly locationIdInput = signal('');
  readonly results = signal<AvailabilityView[]>([]);

  // ── Product typeahead ──────────────────────────────────────────────────────
  readonly productDisplayName = signal('');
  readonly productSuggestions = signal<ProductSummary[]>([]);
  readonly showProductSuggestions = signal(false);
  private readonly productSearch$ = new Subject<string>();

  constructor() {
    // Product search: debounce keystrokes, then call API
    this.productSearch$.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap(q => {
        if (!q.trim()) return of({ data: [] });
        return this.productsApi.searchProducts(
          q, undefined, undefined, undefined, undefined, String(MAX_SUGGESTIONS),
          'body', false, { transferCache: false },
        ).pipe(catchError(() => of({ data: [] })));
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(result => {
      this.productSuggestions.set((result as { data?: ProductSummary[] }).data ?? []);
    });

    // Pre-fill from query params
    const params = this.route.snapshot.queryParamMap;
    const sku = params.get('sku');
    const locationId = params.get('locationId') ?? undefined;
    if (sku) {
      this.skuInput.set(sku);
      this.productDisplayName.set(sku);
      if (locationId) this.locationIdInput.set(locationId);
      this.search();
    }
  }

  // ── Product typeahead handlers ─────────────────────────────────────────────
  onProductInput(value: string): void {
    this.productDisplayName.set(value);
    this.skuInput.set('');
    this.showProductSuggestions.set(true);
    this.productSearch$.next(value);
  }

  onProductFocus(): void {
    if (this.productSuggestions().length > 0) this.showProductSuggestions.set(true);
  }

  onProductBlur(): void {
    setTimeout(() => this.showProductSuggestions.set(false), 150);
  }

  selectProduct(product: ProductSummary): void {
    this.skuInput.set(product.sku ?? '');
    this.productDisplayName.set(product.name ? `${product.name} (${product.sku})` : (product.sku ?? ''));
    this.showProductSuggestions.set(false);
  }

  // ── Location typeahead ─────────────────────────────────────────────────────
  onLocationPicked(id: string): void {
    this.locationIdInput.set(id);
  }

  search(): void {
    const sku = this.skuInput().trim();
    if (!sku) return;
    const locationId = this.locationIdInput().trim() || undefined;

    this.state.set('loading');
    this.errorKey.set(null);

    this.inventoryService
      .queryAvailability(sku, locationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: rows => {
          this.results.set(rows);
          this.state.set(rows.length ? 'ready' : 'empty');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.AVAILABILITY.ERROR.LOAD');
        },
      });
  }
}
