import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { DatePipe } from '@angular/common';
import { UnmatchedTreadDesign } from '../../../models/tread-design-enrichment.models';
import { ProductTreadDesignService } from '../../../services/product-tread-design.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

const PAGE_SIZE = 25;

/**
 * Unmatched vendor tread-design enrichment review worklist (#218), read-only.
 *
 * Lists tread designs that fuzzy matching could not resolve to any catalog
 * product. A design matching nothing is an ordinary outcome (per the
 * generated read's own docs), so an empty page renders the empty state, not
 * an error.
 *
 * No resolve/attach/reject/defer action exists here — that is a later phase
 * gated on backend #1645 (`matchState` filter, `listTreadDesignCandidates`,
 * `resolveTreadDesign`). This page only reads.
 */
@Component({
  selector: 'app-tread-design-unmatched-page',
  standalone: true,
  imports: [TranslatePipe, DatePipe],
  templateUrl: './tread-design-unmatched-page.component.html',
  styleUrl: './tread-design-unmatched-page.component.css',
})
export class TreadDesignUnmatchedPageComponent {
  private readonly treadDesignService = inject(ProductTreadDesignService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly items = signal<readonly UnmatchedTreadDesign[]>([]);
  readonly page = signal(0);
  readonly totalPages = signal(0);
  readonly totalElements = signal(0);

  constructor() {
    this.load(0);
  }

  load(page: number): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.treadDesignService
      .listUnmatched(page, PAGE_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.items.set(result.items);
          this.page.set(result.page);
          this.totalPages.set(result.totalPages);
          this.totalElements.set(result.totalElements);
          this.state.set(result.items.length === 0 ? 'empty' : 'ready');
        },
        error: () => {
          // ADR-0031: state first, then the key.
          this.state.set('error');
          this.errorKey.set('PRODUCT.CATALOG.ENRICHMENT.UNMATCHED.ERROR.LOAD');
        },
      });
  }

  nextPage(): void {
    if (this.page() + 1 < this.totalPages()) {
      this.load(this.page() + 1);
    }
  }

  previousPage(): void {
    if (this.page() > 0) {
      this.load(this.page() - 1);
    }
  }
}
