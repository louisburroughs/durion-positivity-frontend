import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import {
  CostAuditEntry,
  CostStructure,
  ItemCost,
  StandardCostUpdate,
} from '../../../models/cost.models';
import {
  LifecycleStateTransition,
  Product,
  ProductLifecycle,
  ReplacementProduct,
  UomConversion,
} from '../../../models/product.models';
import { ProductCatalogService } from '../../../services/product-catalog.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './product-detail.component.html',
  styleUrl: './product-detail.component.css',
})
export class ProductDetailComponent {
  private readonly productCatalog = inject(ProductCatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly productId = signal<string | null>(null);
  readonly activeTab = signal<'lifecycle' | 'uom' | 'costs' | 'standard-cost'>('lifecycle');

  readonly product = signal<Product | null>(null);
  readonly lifecycle = signal<ProductLifecycle | null>(null);
  readonly replacements = signal<ReplacementProduct[]>([]);
  readonly uomConversions = signal<UomConversion[]>([]);
  readonly itemCost = signal<ItemCost | null>(null);
  readonly costStructure = signal<CostStructure | null>(null);
  readonly auditHistory = signal<CostAuditEntry[]>([]);

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const productId = params.get('productId');
      if (!productId) {
        this.state.set('error');
        this.errorKey.set('PRODUCT.CATALOG.ERROR.MISSING_PRODUCT_ID');
        return;
      }
      this.productId.set(productId);
      this.loadProduct(productId);
    });
  }

  setLifecycleState(transition: LifecycleStateTransition): void {
    const productId = this.productId();
    if (!productId) {
      return;
    }

    this.productCatalog
      .setLifecycleState(productId, transition)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: lifecycle => this.lifecycle.set(lifecycle),
        error: () => this.errorKey.set('PRODUCT.CATALOG.LIFECYCLE.ERROR.UPDATE'),
      });
  }

  addReplacement(replacement: Partial<ReplacementProduct>): void {
    const productId = this.productId();
    if (!productId) {
      return;
    }

    this.productCatalog
      .addReplacementProduct(productId, replacement)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: created => {
          this.replacements.update(current => [...current, created]);
        },
        error: () => this.errorKey.set('PRODUCT.CATALOG.REPLACEMENTS.ERROR.ADD'),
      });
  }

  createUomConversion(conversion: Partial<UomConversion>): void {
    const productId = this.productId();
    if (!productId) {
      return;
    }

    this.productCatalog
      .createUomConversion(productId, conversion)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: created => {
          this.uomConversions.update(current => [...current, created]);
        },
        error: () => this.errorKey.set('PRODUCT.CATALOG.UOM.ERROR.CREATE'),
      });
  }

  updateUomConversion(conversionId: string, update: Partial<UomConversion>): void {
    const productId = this.productId();
    if (!productId) {
      return;
    }

    this.productCatalog
      .updateUomConversion(productId, conversionId, update)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.uomConversions.update(current =>
            current.map(entry => (entry.id === updated.id ? updated : entry)),
          );
        },
        error: () => this.errorKey.set('PRODUCT.CATALOG.UOM.ERROR.UPDATE'),
      });
  }

  deactivateUomConversion(conversionId: string): void {
    const productId = this.productId();
    if (!productId) {
      return;
    }

    this.productCatalog
      .deactivateUomConversion(productId, conversionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.uomConversions.update(current =>
            current.map(entry =>
              entry.id === conversionId
                ? {
                    ...entry,
                    active: false,
                  }
                : entry,
            ),
          );
        },
        error: () => this.errorKey.set('PRODUCT.CATALOG.UOM.ERROR.DEACTIVATE'),
      });
  }

  updateStandardCost(update: StandardCostUpdate): void {
    const productId = this.productId();
    if (!productId) {
      return;
    }

    this.productCatalog
      .updateStandardCost(productId, update)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: itemCost => {
          this.itemCost.set(itemCost);
        },
        error: () => this.errorKey.set('PRODUCT.CATALOG.STANDARD_COST.ERROR.UPDATE'),
      });
  }

  private loadProduct(productId: string): void {
    this.state.set('loading');
    this.errorKey.set(null);

    forkJoin({
      product: this.productCatalog.getProductById(productId),
      lifecycle: this.productCatalog.getProductLifecycle(productId),
      replacements: this.productCatalog.getReplacements(productId),
      uomConversions: this.productCatalog.listUomConversions(productId),
      itemCost: this.productCatalog.getItemCosts(productId),
      costStructures: this.productCatalog.listCostStructures(productId),
      auditHistory: this.productCatalog.getAuditHistory(productId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.product.set(result.product);
          this.lifecycle.set(result.lifecycle);
          this.replacements.set(result.replacements);
          this.uomConversions.set(result.uomConversions);
          this.itemCost.set(result.itemCost);
          this.costStructure.set(result.costStructures[0] ?? null);
          this.auditHistory.set(result.auditHistory);

          this.state.set(result.product ? 'ready' : 'empty');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('PRODUCT.CATALOG.ERROR.LOAD');
        },
      });
  }
}
