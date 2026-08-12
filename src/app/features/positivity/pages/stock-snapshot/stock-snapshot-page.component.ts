import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription, catchError, of } from 'rxjs';
import { SupplierStockSnapshotService } from '../../services/supplier-stock-snapshot.service';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  SupplierStockSnapshot,
  SupplierStockSnapshotFilter,
  SupplierStockSnapshotLine,
} from '../../models/supplier-stock-snapshot.models';
import { VendorProfileSummary } from '../../models/supplier-profile.models';
import { mapSupplierError } from '../../utils/supplier-error.util';
import { StalenessIndicatorComponent } from '../../components/staleness-indicator/staleness-indicator.component';

/**
 * `prompt` is a first-class state, not an empty variant of `idle`: it is the
 * screen telling the user the one thing it needs is a vendor.
 */
type PageState = 'idle' | 'prompt' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

/** Scope vocabularies this UI can name. Open set — unknown types render verbatim. */
const SCOPE_TYPE_KEYS: Readonly<Record<string, string>> = {
  COUNTRY: 'POSITIVITY.STOCK_SNAPSHOT.SCOPE.COUNTRY',
  AGENCY: 'POSITIVITY.STOCK_SNAPSHOT.SCOPE.AGENCY',
  WAREHOUSE: 'POSITIVITY.STOCK_SNAPSHOT.SCOPE.WAREHOUSE',
};

/**
 * Vendor stock snapshot view (issue #193).
 *
 * ── Open question #193 §7, ruled: Supplier Connectivity, not Inventory ──────
 * The snapshot lives under `/app/positivity` (Administration → Supplier
 * Connectivity), not under Inventory. Everything on this screen is *vendor
 * reported*: it says what a supplier claims it holds in a country or agency, at
 * a time the vendor chose. Inventory screens answer a different question — what
 * this business owns, counted and costed. Filing vendor claims under Inventory
 * would put the two one tab apart and invite exactly the sum nobody should ever
 * compute. The route is admin-gated by the `/app/positivity` mount, like every
 * other supplier-connectivity surface.
 *
 * ── Not reported is not zero ────────────────────────────────────────────────
 * A line with a `null` quantity renders as "not reported", visually and
 * semantically distinct from an explicit `0`. A search that matches no line in
 * the snapshot renders an explicit "this vendor did not report that product"
 * message rather than an empty table, because an empty table reads as "none in
 * stock" — a claim the vendor never made.
 *
 * ── Supplier stock is never owned stock ─────────────────────────────────────
 * Every quantity column here is labelled as vendor-reported supplier stock, and
 * this page reads no owned-inventory service at all. There is no shared column,
 * no combined total, and nothing to sum: the two facts never meet.
 *
 * ── Staleness comes from the vendor's own snapshot time ─────────────────────
 * `asOf` drives the staleness verdict against the backend-delivered threshold;
 * the platform fetch time is displayed beside it as a separate labelled fact.
 * A snapshot pulled ten seconds ago can still be a day old, and the screen says
 * so. Both come from the shared `app-staleness-indicator` (wave B).
 */
@Component({
  selector: 'app-stock-snapshot-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, StalenessIndicatorComponent],
  templateUrl: './stock-snapshot-page.component.html',
  styleUrls: ['../../positivity-shared.css', './stock-snapshot-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockSnapshotPageComponent {
  private readonly service = inject(SupplierStockSnapshotService);
  private readonly profiles = inject(SupplierProfileService);
  private readonly destroyRef = inject(DestroyRef);

  /** Test seam for "now", forwarded to the freshness indicator. */
  readonly nowMs = signal<number | null>(null);

  readonly state = signal<PageState>('prompt');
  readonly errorKey = signal<string | null>(null);
  readonly snapshot = signal<SupplierStockSnapshot | null>(null);
  readonly vendorOptions = signal<VendorProfileSummary[]>([]);
  /** The search term the current result was obtained for, or null. */
  readonly appliedSearch = signal<string | null>(null);

  readonly filterForm = new FormGroup({
    vendorProfileId: new FormControl('', { nonNullable: true }),
    scopeCode: new FormControl('', { nonNullable: true }),
    search: new FormControl('', { nonNullable: true }),
  });

  readonly lines = computed<SupplierStockSnapshotLine[]>(() => this.snapshot()?.lines ?? []);

  readonly vendorFilterAvailable = computed(() => this.vendorOptions().length > 0);

  readonly scopeLabel = computed(() => this.snapshot()?.scope.label ?? null);

  readonly scopeTypeKey = computed(() => {
    const type = this.snapshot()?.scope.type;
    return type ? (SCOPE_TYPE_KEYS[type] ?? null) : null;
  });

  readonly scopeTypeText = computed(() => {
    const type = this.snapshot()?.scope.type ?? null;
    return this.scopeTypeKey() ? null : type;
  });

  /**
   * True when a search returned no line at all.
   *
   * Rendered as an explicit "not reported" statement, never as an empty table:
   * the vendor did not say zero, it said nothing.
   */
  readonly searchNotReported = computed(
    () => !!this.appliedSearch() && this.state() === 'ready' && this.lines().length === 0,
  );

  constructor() {
    effect(onCleanup => {
      const sub: Subscription = this.profiles
        .listProfiles()
        .pipe(catchError(() => of<VendorProfileSummary[]>([])))
        .subscribe(items => this.vendorOptions.set(items));

      onCleanup(() => sub.unsubscribe());
    });
  }

  /** True when the vendor reported no quantity for this product at all. */
  isNotReported(line: SupplierStockSnapshotLine): boolean {
    return line.quantity === null;
  }

  /** Translated scope label key, or null when the scope type is unrecognised. */
  scopeKeyFor(type: string): string | null {
    return SCOPE_TYPE_KEYS[type] ?? null;
  }

  load(): void {
    const raw = this.filterForm.getRawValue();
    const vendorProfileId = raw.vendorProfileId;

    if (!vendorProfileId) {
      this.state.set('prompt');
      this.errorKey.set(null);
      this.snapshot.set(null);
      this.appliedSearch.set(null);
      return;
    }

    const search = raw.search.trim();
    this.state.set('loading');
    this.errorKey.set(null);

    this.service
      .getLatestSnapshot(vendorProfileId, this.currentFilter())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: snapshot => {
          this.snapshot.set(snapshot);
          this.appliedSearch.set(search || null);
          // A search that matched nothing stays `ready` so the screen can say
          // "not reported" rather than falling into a generic empty state.
          this.state.set(snapshot.lines.length === 0 && !search ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          this.snapshot.set(null);
          this.appliedSearch.set(null);
          if (err instanceof HttpErrorResponse && err.status === 404) {
            // The vendor has published no snapshot. Not a failure, and not zero
            // stock either — simply nothing reported yet.
            this.state.set('empty');
            this.errorKey.set(null);
            return;
          }
          const outcome = mapSupplierError(err, 'POSITIVITY.STOCK_SNAPSHOT.ERROR.LOAD');
          // ADR-0031: state first, then the key.
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }

  applyFilter(): void {
    this.load();
  }

  clearFilter(): void {
    this.filterForm.reset({ vendorProfileId: '', scopeCode: '', search: '' });
    this.load();
  }

  private currentFilter(): SupplierStockSnapshotFilter {
    const raw = this.filterForm.getRawValue();
    return {
      scopeCode: raw.scopeCode.trim() || undefined,
      search: raw.search.trim() || undefined,
    };
  }
}
