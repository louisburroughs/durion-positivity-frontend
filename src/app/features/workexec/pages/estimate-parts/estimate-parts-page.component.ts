import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { WorkexecService } from '../../services/workexec.service';
import { EstimateItemResponse, EstimateResponse, PageState } from '../../models/workexec.models';
import { ProductCatalogService } from '../../../product/services/product-catalog.service';
import { ProductSummary } from '../../../product/models/product.models';

/**
 * EstimatePartsPageComponent — Story 238 (CAP-002)
 * Route: /app/workexec/estimates/:estimateId/parts
 * operationIds: addEstimateItem, calculateEstimateTotals, getEstimateById, updateEstimateItem
 */
@Component({
  selector: 'app-estimate-parts-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './estimate-parts-page.component.html',
  styleUrl: './estimate-parts-page.component.css',
})
export class EstimatePartsPageComponent implements OnInit {
  private readonly workexec    = inject(WorkexecService);
  private readonly catalog      = inject(ProductCatalogService);
  private readonly route       = inject(ActivatedRoute);
  private readonly router      = inject(Router);
  private readonly fb          = inject(FormBuilder);
  private readonly destroyRef  = inject(DestroyRef);

  readonly state         = signal<PageState>('loading');
  readonly saveState     = signal<'idle' | 'saving' | 'success' | 'error'>('idle');
  readonly estimate      = signal<EstimateResponse | null>(null);
  readonly items         = signal<EstimateItemResponse[]>([]);
  readonly errorMessage  = signal<string | null>(null);
  readonly fieldErrors   = signal<Record<string, string>>({});

  // Catalog part search (name / SKU) — mirrors the product catalog list search.
  readonly searchQuery   = signal('');
  readonly searchState   = signal<'idle' | 'loading' | 'empty' | 'ready' | 'error'>('idle');
  readonly searchResults = signal<ProductSummary[]>([]);
  readonly selectedPart  = signal<ProductSummary | null>(null);
  readonly priceState    = signal<'idle' | 'loading' | 'filled' | 'none'>('idle');
  private readonly searchChanges$ = new Subject<string>();

  estimateId = '';

  readonly addForm = this.fb.nonNullable.group({
    description: ['', Validators.required],
    quantity:    [1, [Validators.required, Validators.min(0.0001)]],
    unitPrice:   [0, [Validators.required, Validators.min(0)]],
    taxCode:     [''],
    productId:   [''],
  });

  constructor() {
    this.searchChanges$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(query => this.runPartSearch(query));
  }

  ngOnInit(): void {
    this.estimateId = this.route.snapshot.paramMap.get('estimateId') ?? '';
    this.loadEstimate();
  }

  onSearchChange(query: string): void {
    this.searchQuery.set(query);
    this.searchChanges$.next(query);
  }

  private runPartSearch(query: string): void {
    if (!query.trim()) {
      this.searchResults.set([]);
      this.searchState.set('idle');
      return;
    }
    this.searchState.set('loading');
    this.catalog.searchProducts(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: products => {
          this.searchResults.set(products);
          this.searchState.set(products.length > 0 ? 'ready' : 'empty');
        },
        error: () => {
          this.searchResults.set([]);
          this.searchState.set('error');
        },
      });
  }

  selectPart(part: ProductSummary): void {
    this.selectedPart.set(part);
    this.addForm.patchValue({ description: part.name, productId: part.id });
    this.searchResults.set([]);
    this.searchState.set('idle');
    this.searchQuery.set(part.sku ? `${part.name} (${part.sku})` : part.name);

    // Auto-fill unit price from the product's active MSRP (no price on the summary/product).
    this.priceState.set('loading');
    this.catalog.getActiveMsrp(part.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: msrp => {
          if (msrp?.amount != null) {
            this.addForm.patchValue({ unitPrice: msrp.amount });
            this.priceState.set('filled');
          } else {
            this.priceState.set('none');
          }
        },
        // No active MSRP (e.g. 404) — leave the user-entered price untouched.
        error: () => this.priceState.set('none'),
      });
  }

  clearSelectedPart(): void {
    this.selectedPart.set(null);
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.searchState.set('idle');
    this.priceState.set('idle');
    this.addForm.patchValue({ productId: '' });
  }

  loadEstimate(): void {
    this.state.set('loading');
    this.workexec.getEstimateById(this.estimateId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: est => {
          this.estimate.set(est);
          this.items.set(est.items ?? []);
          this.state.set('ready');
        },
        error: err => {
          this.state.set('error');
          this.errorMessage.set(err.status === 404 ? 'Estimate not found.' : 'Failed to load estimate.');
        },
      });
  }

  addItem(): void {
    if (this.addForm.invalid) {
      this.addForm.markAllAsTouched();
      return;
    }
    this.saveState.set('saving');
    this.errorMessage.set(null);
    this.fieldErrors.set({});

    const { description, quantity, unitPrice, taxCode, productId } = this.addForm.getRawValue();

    this.workexec.addEstimateItem(this.estimateId, {
      itemType: 'PART',
      description,
      quantity,
      unitPrice,
      taxCode: taxCode || undefined,
      productId: productId || undefined,
    }).pipe(
      switchMap(() => this.workexec.calculateEstimateTotals(this.estimateId)),
      switchMap(() => this.workexec.getEstimateById(this.estimateId)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: est => {
        this.estimate.set(est);
        this.items.set(est.items ?? []);
        this.saveState.set('success');
        this.addForm.reset({ quantity: 1, unitPrice: 0 });
        this.selectedPart.set(null);
        this.searchQuery.set('');
        this.searchResults.set([]);
        this.searchState.set('idle');
        this.priceState.set('idle');
      },
      error: err => {
        this.saveState.set('error');
        const body = err.error;
        if (body?.fieldErrors?.length) {
          const map: Record<string, string> = {};
          for (const fe of body.fieldErrors) map[fe.field] = fe.message;
          this.fieldErrors.set(map);
        } else if (err.status === 409) {
          this.errorMessage.set('Estimate is not in DRAFT status and cannot be edited.');
        } else {
          this.errorMessage.set(body?.message ?? 'Failed to add part.');
        }
      },
    });
  }

  fieldError(name: string): string | null {
    return this.fieldErrors()[name] ?? null;
  }

  goBack(): void {
    this.router.navigate(['/app/workexec/estimates', this.estimateId]);
  }
}
