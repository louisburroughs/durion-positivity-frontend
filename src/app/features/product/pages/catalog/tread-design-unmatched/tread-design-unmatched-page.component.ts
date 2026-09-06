import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { DatePipe, LowerCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TreadDesignMatchState, UnmatchedTreadDesign } from '../../../models/tread-design-enrichment.models';
import { ProductTreadDesignService } from '../../../services/product-tread-design.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

const PAGE_SIZE = 25;

/** Every match state the worklist can be filtered to, in the order offered to the operator. */
export const ALL_MATCH_STATES: readonly TreadDesignMatchState[] = [
  'UNMATCHED',
  'REVIEW',
  'MATCHED',
  'REJECTED',
  'DEFERRED',
];

/** States actually awaiting a decision — the worklist's default filter (ADR-0060 §7). */
const DEFAULT_MATCH_STATES: readonly TreadDesignMatchState[] = ['UNMATCHED', 'REVIEW'];

/**
 * Unmatched vendor tread-design enrichment review worklist (#218 phase 1;
 * phase 2 — backend #1645, ADR-0060 — adds the `matchState`/`vendorProfileId`
 * filters, the state/aged-since columns, and the row action into the review
 * detail page).
 *
 * A design matching nothing is an ordinary outcome (per the generated read's
 * own docs), so an empty page renders the empty state, not an error.
 *
 * This page itself still performs no mutation — resolving a row (ATTACH /
 * REJECT / DEFER) happens on `TreadDesignReviewPageComponent`, reached via the
 * row action. This page's own permission surface is `catalog:tread_design:view`
 * only, gated identically for every viewer of this route; the resolve
 * permission is checked on the review page, the same
 * `AuthService.hasAnyRole` mechanism used elsewhere in this domain
 * (`location-overrides.component.ts`).
 */
@Component({
  selector: 'app-tread-design-unmatched-page',
  standalone: true,
  imports: [TranslatePipe, DatePipe, LowerCasePipe, RouterLink],
  templateUrl: './tread-design-unmatched-page.component.html',
  styleUrl: './tread-design-unmatched-page.component.css',
})
export class TreadDesignUnmatchedPageComponent {
  private readonly treadDesignService = inject(ProductTreadDesignService);
  private readonly destroyRef = inject(DestroyRef);

  readonly allMatchStates = ALL_MATCH_STATES;

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly items = signal<readonly UnmatchedTreadDesign[]>([]);
  readonly page = signal(0);
  readonly totalPages = signal(0);
  readonly totalElements = signal(0);

  /** Defaults to the states actually awaiting a decision (ADR-0060 §7). */
  readonly selectedMatchStates = signal<readonly TreadDesignMatchState[]>(DEFAULT_MATCH_STATES);
  readonly vendorProfileIdFilter = signal('');

  constructor() {
    this.load(0);
  }

  isMatchStateSelected(matchState: TreadDesignMatchState): boolean {
    return this.selectedMatchStates().includes(matchState);
  }

  toggleMatchState(matchState: TreadDesignMatchState, checked: boolean): void {
    this.selectedMatchStates.update(current =>
      checked ? [...current, matchState] : current.filter(value => value !== matchState),
    );
  }

  setVendorProfileIdFilter(value: string): void {
    this.vendorProfileIdFilter.set(value);
  }

  applyFilters(): void {
    this.load(0);
  }

  clearFilters(): void {
    this.selectedMatchStates.set(DEFAULT_MATCH_STATES);
    this.vendorProfileIdFilter.set('');
    this.load(0);
  }

  load(page: number): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.treadDesignService
      .listUnmatched(this.selectedMatchStates(), this.vendorProfileIdFilter().trim() || undefined, page, PAGE_SIZE)
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
