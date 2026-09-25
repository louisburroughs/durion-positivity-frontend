import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { WorkexecService } from '../../services/workexec.service';
import { EstimateItemResponse, EstimateResponse, PageState } from '../../models/workexec.models';
import {
  CatalogProductSummary as ProductSummary,
  PRODUCT_CATALOG_SOURCE,
} from '../../../../shared/product-catalog/product-catalog-source.tokens';

/**
 * EstimatePartsPageComponent — Story 238 (CAP-002)
 * Route: /app/workexec/estimates/:estimateId/parts
 * operationIds: addEstimateItem, calculateEstimateTotals, getEstimateById, updateEstimateItem
 */
@Component({
  selector: 'app-estimate-parts-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './estimate-parts-page.component.html',
  styleUrl: './estimate-parts-page.component.css',
})
export class EstimatePartsPageComponent implements OnInit {
  private readonly translate = inject(TranslateService);
  private readonly workexec    = inject(WorkexecService);
  private readonly catalog      = inject(PRODUCT_CATALOG_SOURCE);
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
  readonly searchResults = signal<readonly ProductSummary[]>([]);
  readonly selectedPart  = signal<ProductSummary | null>(null);
  readonly priceState    = signal<'idle' | 'loading' | 'filled' | 'none'>('idle');
  readonly activeIndex   = signal(-1);
  private readonly searchChanges$ = new Subject<string>();

  // Owns `unitPrice`/`priceState`: bumped on every selection (and on clear), so
  // an in-flight active-MSRP lookup for a part the user has since replaced can
  // never land and patch the now-selected (or SKU-less/cleared) part's price.
  private msrpLookupSeq = 0;

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
    this.activeIndex.set(-1);
    this.searchChanges$.next(query);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    const results = this.searchResults();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.set(Math.min(this.activeIndex() + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.set(Math.max(this.activeIndex() - 1, 0));
    } else if (event.key === 'Enter') {
      const idx = this.activeIndex();
      if (idx >= 0 && idx < results.length) {
        event.preventDefault();
        this.selectPart(results[idx]);
      }
    } else if (event.key === 'Escape') {
      this.searchResults.set([]);
      this.searchState.set('idle');
      this.activeIndex.set(-1);
    }
  }

  private runPartSearch(query: string): void {
    if (!query.trim()) {
      this.searchResults.set([]);
      this.searchState.set('idle');
      this.activeIndex.set(-1);
      return;
    }
    this.searchState.set('loading');
    this.catalog.searchProducts(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: products => {
          this.searchResults.set(products);
          this.activeIndex.set(-1);
          this.searchState.set(products.length > 0 ? 'ready' : 'empty');
        },
        error: () => {
          this.searchResults.set([]);
          this.searchState.set('error');
        },
      });
  }

  selectPart(part: ProductSummary): void {
    // Own the lookup by this selection (ADR-0063 §1) — bumped before the
    // SKU-less early return too, so a later stale MSRP response can never
    // land against whatever selection replaced this one.
    const lookupSeq = ++this.msrpLookupSeq;

    this.selectedPart.set(part);
    this.addForm.patchValue({ description: part.name, productId: part.id });
    this.searchResults.set([]);
    this.searchState.set('idle');
    this.activeIndex.set(-1);
    this.searchQuery.set(part.sku ? `${part.name} (${part.sku})` : part.name);

    // Auto-fill unit price from the product's active MSRP (no price on the summary/product).
    // getActiveMsrpAmount is SKU-keyed — a part with no SKU has no price to look up.
    if (!part.sku) {
      this.priceState.set('none');
      return;
    }

    this.priceState.set('loading');
    this.catalog.getActiveMsrpAmount(part.sku)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: amount => {
          if (lookupSeq !== this.msrpLookupSeq) return; // superseded by a later selection/clear
          if (amount != null) {
            this.addForm.patchValue({ unitPrice: amount });
            this.priceState.set('filled');
          } else {
            this.priceState.set('none');
          }
        },
        // No active MSRP (e.g. 404) — leave the user-entered price untouched.
        error: () => {
          if (lookupSeq !== this.msrpLookupSeq) return;
          this.priceState.set('none');
        },
      });
  }

  clearSelectedPart(): void {
    this.msrpLookupSeq++; // orphan any in-flight lookup for the part being cleared
    this.selectedPart.set(null);
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.searchState.set('idle');
    this.priceState.set('idle');
    this.activeIndex.set(-1);
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
          this.errorMessage.set(err.status === 404 ? this.translate.instant('WORKEXEC.ERROR.ESTIMATE_NOT_FOUND') : this.translate.instant('WORKEXEC.ERROR.LOAD_ESTIMATE'));
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
          this.errorMessage.set(this.translate.instant('WORKEXEC.ERROR.ESTIMATE_NOT_DRAFT'));
        } else {
          this.errorMessage.set(body?.message ?? this.translate.instant('WORKEXEC.ERROR.ADD_PART'));
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
