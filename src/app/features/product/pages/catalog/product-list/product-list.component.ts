import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ProductSummary } from '../../../models/product.models';
import { ProductCatalogService } from '../../../services/product-catalog.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.css',
})
export class ProductListComponent {
  private readonly productCatalog = inject(ProductCatalogService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly queryChanges$ = new Subject<string>();

  readonly query = signal('');
  readonly state = signal<PageState>('idle');
  readonly products = signal<ProductSummary[]>([]);
  readonly errorKey = signal<string | null>(null);

  constructor() {
    this.queryChanges$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(query => this.runSearch(query));
  }

  onQueryChange(query: string): void {
    this.query.set(query);
    this.queryChanges$.next(query);
  }

  search(): void {
    this.queryChanges$.next(this.query());
  }

  createProduct(): void {
    this.router.navigate(['/app/product/catalog'], { queryParams: { mode: 'new' } });
  }

  selectProduct(id: string): void {
    this.router.navigate(['/app/product/catalog', id]);
  }

  private runSearch(query: string): void {
    if (!query.trim()) {
      this.products.set([]);
      this.state.set('idle');
      this.errorKey.set(null);
      return;
    }

    this.state.set('loading');
    this.errorKey.set(null);

    this.productCatalog
      .searchProducts(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: products => {
          this.products.set(products);
          this.state.set(products.length > 0 ? 'ready' : 'empty');
        },
        error: () => {
          this.products.set([]);
          this.state.set('error');
          this.errorKey.set('PRODUCT.LIST.ERROR.LOAD');
        },
      });
  }
}
