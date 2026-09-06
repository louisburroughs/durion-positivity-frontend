import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe, LowerCasePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../../../core/services/auth.service';
import {
  TreadDesignCandidate,
  TreadDesignResolveAction,
  UnmatchedTreadDesign,
} from '../../../models/tread-design-enrichment.models';
import { ProductTreadDesignService } from '../../../services/product-tread-design.service';
import { startOfLocalDayIso } from '../../../utils/date-only.util';

type CandidatesState = 'loading' | 'ready' | 'empty' | 'error';

/**
 * Roles allowed to submit `resolveTreadDesign` (`catalog:tread_design:resolve`).
 *
 * The frontend has no fine-grained-permission read of its own (same
 * constraint documented on `ExchangeAuditDetailPageComponent`): the mechanism
 * this domain already uses to gate a write action client-side is
 * `AuthService.hasAnyRole` behind a `computed()` flag
 * (`location-overrides.component.ts`), reused here rather than inventing a
 * second one. The backend re-enforces the authority regardless — this is a
 * UX gate only, same as `invoice-detail-page.component.ts`.
 */
const RESOLVE_ROLES: readonly string[] = ['ROLE_ADMIN', 'ROLE_CATALOG_MANAGER'];

/**
 * Tread-design review detail (#218 phase 2, backend #1645, ADR-0060).
 *
 * ── No "get one design by id" read exists ─────────────────────────────────
 * The generated contract offers `listUnmatchedTreadDesigns` (a worklist page)
 * and `getTreadDesignForProduct` (needs a product id, not a design id) — no
 * operation fetches one design's own fields by its id. This page is reached
 * from a worklist row, which already has every field this page displays, so
 * that row travels here via `Router` navigation state (the same
 * avoid-a-refetch pattern `party-detail.component.ts` /
 * `customer-list.component.ts` use in the CRM domain) instead of a second
 * network call this contract has no operation for.
 *
 * Router state does not survive a direct link or a refresh. When it is
 * absent this page still works — `listTreadDesignCandidates` and
 * `resolveTreadDesign` both take only the id in the URL — it just cannot
 * show the design's own brand/name/vehicle-type/etc. fields, and says so
 * rather than guessing at a fetch the contract doesn't offer.
 *
 * ── Candidates are the complete list, not the worklist row's top 20 ───────
 * `listTreadDesignCandidates` is always called here, even when the passed-in
 * row already carries an embedded (truncated to 20) candidate list.
 *
 * ── Mutation error handling follows the inline-mutation pattern ──────────
 * Per ADR-0031's inline-mutation exclusion (also documented on
 * `vendor-invoices-exceptions-page.component.ts`): a resolve failure clears
 * `busyAction` and sets `resolveErrorKey` inline; it never touches this
 * page's `state`/`errorKey` (which track the candidates load only).
 */
@Component({
  selector: 'app-tread-design-review-page',
  standalone: true,
  imports: [DatePipe, LowerCasePipe, ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './tread-design-review-page.component.html',
  styleUrl: './tread-design-review-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreadDesignReviewPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly treadDesignService = inject(ProductTreadDesignService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly treadDesignId = this.route.snapshot.paramMap.get('treadDesignId') ?? '';

  /** See the class doc's "No 'get one design by id' read exists" note. */
  readonly design = signal<UnmatchedTreadDesign | null>(
    (this.router.getCurrentNavigation()?.extras.state?.['treadDesign'] as UnmatchedTreadDesign | undefined) ?? null,
  );

  readonly canResolve = computed(() => this.authService.hasAnyRole(RESOLVE_ROLES));

  readonly state = signal<CandidatesState>('loading');
  readonly errorKey = signal<string | null>(null);
  readonly candidates = signal<readonly TreadDesignCandidate[]>([]);

  readonly selectedProductIds = signal<readonly string[]>([]);
  readonly canAttach = computed(() => this.selectedProductIds().length > 0);

  readonly noteControl = new FormControl('', { nonNullable: true });
  readonly deferUntilControl = new FormControl('', { nonNullable: true });

  /** Which of the three actions is currently submitting, or null when none is. */
  readonly busyAction = signal<TreadDesignResolveAction | null>(null);
  readonly resolveErrorKey = signal<string | null>(null);

  constructor() {
    this.loadCandidates();
  }

  isSelected(productId: string | null): boolean {
    return !!productId && this.selectedProductIds().includes(productId);
  }

  toggleCandidate(productId: string | null, checked: boolean): void {
    if (!productId) {
      return;
    }
    this.selectedProductIds.update(current =>
      checked ? [...current, productId] : current.filter(id => id !== productId),
    );
  }

  attach(): void {
    if (!this.canResolve() || !this.canAttach() || this.busyAction()) {
      return;
    }
    this.submit({ action: 'ATTACH', productIds: this.selectedProductIds(), note: this.trimmedNote() });
  }

  reject(): void {
    if (!this.canResolve() || this.busyAction()) {
      return;
    }
    this.submit({ action: 'REJECT', note: this.trimmedNote() });
  }

  defer(): void {
    if (!this.canResolve() || this.busyAction()) {
      return;
    }
    const deferUntil = startOfLocalDayIso(this.deferUntilControl.value.trim()) ?? undefined;
    this.submit({ action: 'DEFER', note: this.trimmedNote(), deferUntil });
  }

  private loadCandidates(): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.treadDesignService
      .listCandidates(this.treadDesignId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: candidates => {
          this.candidates.set(candidates);
          this.state.set(candidates.length === 0 ? 'empty' : 'ready');
        },
        error: () => {
          // ADR-0031: state first, then the key.
          this.state.set('error');
          this.errorKey.set('PRODUCT.CATALOG.ENRICHMENT.REVIEW.CANDIDATES.ERROR.LOAD');
        },
      });
  }

  private trimmedNote(): string | undefined {
    const value = this.noteControl.value.trim();
    return value ? value : undefined;
  }

  private submit(request: {
    action: TreadDesignResolveAction;
    productIds?: readonly string[];
    note?: string;
    deferUntil?: string;
  }): void {
    this.busyAction.set(request.action);
    this.resolveErrorKey.set(null);

    this.treadDesignService
      .resolve(this.treadDesignId, request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busyAction.set(null);
          // Resolved designs leave the default worklist filter — returning
          // there re-constructs the page, which reloads from page 0.
          this.router.navigate(['/app/product/catalog/enrichment/unmatched']);
        },
        error: (error: HttpErrorResponse) => {
          this.busyAction.set(null);
          this.resolveErrorKey.set(this.resolveErrorKeyFor(error));
        },
      });
  }

  private resolveErrorKeyFor(error: HttpErrorResponse): string {
    if (error.status === 409) {
      return 'PRODUCT.CATALOG.ENRICHMENT.REVIEW.RESOLVE.ERROR.CONFLICT';
    }
    if (error.status === 400) {
      return 'PRODUCT.CATALOG.ENRICHMENT.REVIEW.RESOLVE.ERROR.INVALID';
    }
    if (error.status === 404) {
      return 'PRODUCT.CATALOG.ENRICHMENT.REVIEW.RESOLVE.ERROR.NOT_FOUND';
    }
    return 'PRODUCT.CATALOG.ENRICHMENT.REVIEW.RESOLVE.ERROR.SUBMIT';
  }
}
