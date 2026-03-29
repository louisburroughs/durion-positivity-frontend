import { CommonModule } from '@angular/common';
import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin, Subscription } from 'rxjs';
import { PriceBook, PriceRule } from '../../../models/pricing.models';
import { ProductCatalogService } from '../../../services/product-catalog.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-price-books',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './price-books.component.html',
  styleUrl: './price-books.component.css',
})
export class PriceBooksComponent {
  private readonly productCatalog = inject(ProductCatalogService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly selectedPriceBookId = signal<string | null>(null);
  readonly priceBooks = signal<PriceBook[]>([]);
  readonly rules = signal<PriceRule[]>([]);

  constructor() {
    effect((onCleanup) => {
      const selectedPriceBookId = this.selectedPriceBookId();
      if (!selectedPriceBookId) {
        this.rules.set([]);
        if (this.priceBooks().length === 0) {
          this.state.set('idle');
        }
        return;
      }

      this.state.set('loading');
      this.errorKey.set(null);

      const sub: Subscription = forkJoin({
        priceBook: this.productCatalog.getPriceBook(selectedPriceBookId),
        rules: this.productCatalog.listRules(selectedPriceBookId),
      })
        .subscribe({
          next: result => {
            this.upsertPriceBook(result.priceBook);
            this.rules.set(result.rules);
            this.state.set(result.rules.length > 0 || this.priceBooks().length > 0 ? 'ready' : 'empty');
          },
          error: () => {
            this.state.set('error');
            this.errorKey.set('PRODUCT.PRICING.PRICE_BOOKS.ERROR.LOAD');
          },
        });

      onCleanup(() => sub.unsubscribe());
    }, { allowSignalWrites: true });
  }

  selectPriceBook(priceBookId: string): void {
    this.selectedPriceBookId.set(priceBookId);
  }

  createPriceBook(priceBook: Partial<PriceBook>): void {
    this.productCatalog
      .createPriceBook(priceBook)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: created => {
          this.priceBooks.update(current => [...current, created]);
          this.selectedPriceBookId.set(created.id);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('PRODUCT.PRICING.PRICE_BOOKS.ERROR.CREATE');
        },
      });
  }

  updatePriceBook(priceBookId: string, update: Partial<PriceBook>): void {
    this.productCatalog
      .updatePriceBook(priceBookId, update)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.priceBooks.update(current =>
            current.map(entry => (entry.id === updated.id ? updated : entry)),
          );
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('PRODUCT.PRICING.PRICE_BOOKS.ERROR.UPDATE');
        },
      });
  }

  createRule(rule: Partial<PriceRule>): void {
    const priceBookId = this.selectedPriceBookId();
    if (!priceBookId) {
      return;
    }

    this.productCatalog
      .createRule(priceBookId, rule)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: created => {
          this.rules.update(current => [...current, created]);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('PRODUCT.PRICING.PRICE_BOOKS.ERROR.CREATE_RULE');
        },
      });
  }

  updateRule(ruleId: string, update: Partial<PriceRule>): void {
    const priceBookId = this.selectedPriceBookId();
    if (!priceBookId) {
      return;
    }

    this.productCatalog
      .updateRule(priceBookId, ruleId, update)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.rules.update(current => current.map(rule => (rule.id === updated.id ? updated : rule)));
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('PRODUCT.PRICING.PRICE_BOOKS.ERROR.UPDATE_RULE');
        },
      });
  }

  deactivateRule(ruleId: string): void {
    const priceBookId = this.selectedPriceBookId();
    if (!priceBookId) {
      return;
    }

    this.productCatalog
      .deactivateRule(priceBookId, ruleId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.rules.update(current => current.filter(rule => rule.id !== ruleId));
          this.state.set(this.rules().length > 0 ? 'ready' : 'empty');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('PRODUCT.PRICING.PRICE_BOOKS.ERROR.DEACTIVATE_RULE');
        },
      });
  }

  private upsertPriceBook(priceBook: PriceBook): void {
    this.priceBooks.update(current => {
      const index = current.findIndex(entry => entry.id === priceBook.id);
      if (index === -1) {
        return [...current, priceBook];
      }
      const copy = [...current];
      copy[index] = priceBook;
      return copy;
    });
  }
}
