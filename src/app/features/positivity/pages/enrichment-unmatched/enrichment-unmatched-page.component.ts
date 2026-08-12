import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription, catchError, of } from 'rxjs';
import { LocaleService } from '../../../../core/services/locale.service';
import { SupplierEnrichmentService } from '../../services/supplier-enrichment.service';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  SupplierEnrichmentUnmatchedReason,
  SupplierUnmatchedEnrichment,
  SupplierUnmatchedEnrichmentFilter,
} from '../../models/supplier-enrichment.models';
import { VendorProfileSummary } from '../../models/supplier-profile.models';
import { resolveLocalizedText } from '../../utils/enrichment-locale.util';
import { mapSupplierError } from '../../utils/supplier-error.util';

type PageState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

const REASONS: readonly SupplierEnrichmentUnmatchedReason[] = [
  'NO_EAN_MATCH',
  'NO_GTIN_MATCH',
  'NO_MPN_MATCH',
  'AMBIGUOUS_MATCH',
  'MISSING_IDENTIFIERS',
];

/**
 * Unmatched manufacturer-enrichment worklist (issue #195).
 *
 * ── A worklist, not an inbox ────────────────────────────────────────────────
 * Rows are owned by the backend and clear when a catalog fix makes them
 * matchable. v1 is deliberately **read-only**: there is no dismiss, ignore or
 * manual-match control, exactly as with the PRICAT worklist. Offering one would
 * let an administrator hide manufacturer content that is arriving for a product
 * the catalog does not know about — which is precisely the gap this report
 * exists to surface.
 *
 * ── Preview text is vendor data ─────────────────────────────────────────────
 * The content preview is manufacturer prose, not UI copy, so it is resolved
 * through `enrichment-locale.util` against the user's locale rather than
 * translated. A row whose preview resolves to nothing shows the row anyway: the
 * identifiers are the point of the report, and the preview is supporting detail.
 *
 * Filter dates are date-only `YYYY-MM-DD` values passed through untouched
 * (ADR-0038); no local `new Date(...)` parsing happens here.
 *
 * The vendor filter is a convenience: if the profile roster cannot be read the
 * filter is simply unavailable, and the worklist itself still loads. Losing a
 * filter must never cost the operator the report.
 */
@Component({
  selector: 'app-enrichment-unmatched-page',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './enrichment-unmatched-page.component.html',
  styleUrls: ['../../positivity-shared.css', './enrichment-unmatched-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnrichmentUnmatchedPageComponent implements OnInit {
  private readonly service = inject(SupplierEnrichmentService);
  private readonly profiles = inject(SupplierProfileService);
  private readonly locale = inject(LocaleService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly rows = signal<SupplierUnmatchedEnrichment[]>([]);
  readonly totalCount = signal(0);
  readonly vendorOptions = signal<VendorProfileSummary[]>([]);

  readonly filterForm = new FormGroup({
    vendorProfileId: new FormControl('', { nonNullable: true }),
    reason: new FormControl<SupplierEnrichmentUnmatchedReason | ''>('', { nonNullable: true }),
    search: new FormControl('', { nonNullable: true }),
    dateFrom: new FormControl('', { nonNullable: true }),
    dateTo: new FormControl('', { nonNullable: true }),
  });

  /** Read at access time, never in a class-field initialiser (see supplier-capability-keys). */
  get reasons(): readonly SupplierEnrichmentUnmatchedReason[] {
    return REASONS;
  }

  readonly vendorFilterAvailable = computed(() => this.vendorOptions().length > 0);

  constructor() {
    effect(onCleanup => {
      const sub: Subscription = this.profiles
        .listProfiles()
        .pipe(catchError(() => of<VendorProfileSummary[]>([])))
        .subscribe(items => this.vendorOptions.set(items));

      onCleanup(() => sub.unsubscribe());
    });
  }

  /**
   * The worklist read is an unconditional one-shot with no reactive input, so it
   * belongs in `ngOnInit` rather than an `effect`: an effect here would exist
   * only to run once, and its subscription would then need cleanup wiring that
   * says nothing about when it should re-run.
   */
  ngOnInit(): void {
    this.load();
  }

  /** Localized content preview for one row, or null when nothing usable was published. */
  previewFor(row: SupplierUnmatchedEnrichment): string | null {
    return resolveLocalizedText(row.descriptionPreview, this.locale.currentLocale());
  }

  load(): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.service
      .listUnmatchedEnrichment(this.currentFilter())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: page => {
          this.rows.set(page.items);
          this.totalCount.set(page.totalCount);
          this.state.set(page.items.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.ENRICHMENT.UNMATCHED.ERROR.LOAD');
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
    this.filterForm.reset({
      vendorProfileId: '',
      reason: '',
      search: '',
      dateFrom: '',
      dateTo: '',
    });
    this.load();
  }

  private currentFilter(): SupplierUnmatchedEnrichmentFilter {
    const raw = this.filterForm.getRawValue();
    return {
      vendorProfileId: raw.vendorProfileId || undefined,
      reason: raw.reason || undefined,
      search: raw.search.trim() || undefined,
      dateFrom: raw.dateFrom || undefined,
      dateTo: raw.dateTo || undefined,
    };
  }
}
