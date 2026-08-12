import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import {
  SupplierStatusChipComponent,
  SupplierStatusTone,
} from '../../components/supplier-status-chip/supplier-status-chip.component';
import { SupplierExchangeAuditService } from '../../services/supplier-exchange-audit.service';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  ExchangeAuditFilter,
  ExchangeAuditRecord,
  ExchangeOutcome,
} from '../../models/supplier-exchange.models';
import { VendorProfileSummary } from '../../models/supplier-profile.models';
import {
  KNOWN_EXCHANGE_OUTCOMES,
  KNOWN_SUPPLIER_CAPABILITIES,
} from '../../utils/supplier-capability-keys';
import { mapSupplierError } from '../../utils/supplier-error.util';

/**
 * `prompt` is not an error and not an empty result: the contract requires a
 * vendor, so until one is chosen there is no query to run and nothing to say
 * about results that were never requested.
 */
type PageState = 'prompt' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

const OUTCOME_TONES: Readonly<Record<string, SupplierStatusTone>> = {
  SUCCESS: 'success',
  FAILURE: 'danger',
  TIMEOUT: 'warning',
  REJECTED: 'warning',
  CIRCUIT_OPEN: 'danger',
};

/** Default window: the last seven days, inclusive of today. */
const DEFAULT_WINDOW_DAYS = 7;

/** Local `YYYY-MM-DD` for a date, built from local getters (ADR-0038). */
function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Exchange audit viewer — the filterable list half (issue #188).
 *
 * Exchange rows are historical commercial records used to settle disputes, so
 * this screen is strictly read-only: no retry, no replay, no edit. A replay
 * button here would let an operator re-send a real order to a vendor from a
 * screen whose whole purpose is to explain what already happened.
 *
 * ── Vendor and window are required ───────────────────────────────────────────
 * `listExchanges` takes `vendorProfileId`, `from` and `to` as required
 * arguments. The window is pre-filled with the last seven days so the screen is
 * useful immediately; the vendor has no sensible default, so until one is chosen
 * the page renders a prompt and **issues no request** rather than firing a call
 * it knows the contract will reject.
 *
 * Filter dates are date-only `YYYY-MM-DD` (ADR-0038); the conversion to the
 * contract's half-open instant window happens at the service boundary.
 *
 * ── Outcome filtering is honest about its scope ──────────────────────────────
 * There is no `outcome` query parameter — outcome is a row field only. The
 * filter below therefore narrows **the rows already loaded**, and the UI says
 * exactly that. Presenting it as a server-side filter would silently under-report
 * failures whenever they fell on a later page.
 */
@Component({
  selector: 'app-exchange-audit-list-page',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, TranslatePipe, SupplierStatusChipComponent],
  templateUrl: './exchange-audit-list-page.component.html',
  styleUrls: ['../../positivity-shared.css', './exchange-audit-list-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExchangeAuditListPageComponent {
  private readonly auditService = inject(SupplierExchangeAuditService);
  private readonly profileService = inject(SupplierProfileService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('prompt');
  readonly errorKey = signal<string | null>(null);
  /** Rows as returned by the server, before the client-side outcome filter. */
  readonly loadedExchanges = signal<ExchangeAuditRecord[]>([]);
  readonly totalCount = signal(0);
  readonly page = signal(0);
  readonly pageSize = signal(0);
  readonly totalPages = signal(0);
  readonly profiles = signal<VendorProfileSummary[]>([]);

  /** Read at access time — see `utils/supplier-capability-keys.ts`. */
  get outcomes(): readonly ExchangeOutcome[] {
    return KNOWN_EXCHANGE_OUTCOMES;
  }

  get capabilities(): readonly string[] {
    return KNOWN_SUPPLIER_CAPABILITIES;
  }

  readonly filterForm = new FormGroup({
    vendorProfileId: new FormControl('', { nonNullable: true }),
    capability: new FormControl('', { nonNullable: true }),
    outcome: new FormControl<ExchangeOutcome>('', { nonNullable: true }),
    dateFrom: new FormControl('', { nonNullable: true }),
    dateTo: new FormControl('', { nonNullable: true }),
  });

  /** The outcome currently narrowing the loaded rows, or '' for all. */
  private readonly activeOutcome = signal<ExchangeOutcome>('');

  /**
   * Rows after the client-side outcome filter.
   *
   * Applies to the loaded page only — see the class comment.
   */
  readonly exchanges = computed<ExchangeAuditRecord[]>(() => {
    const outcome = this.activeOutcome();
    if (!outcome) {
      return this.loadedExchanges();
    }
    return this.loadedExchanges().filter(record => record.outcome === outcome);
  });

  readonly outcomeFilterActive = computed(() => this.activeOutcome() !== '');

  /** True when the outcome filter hid every row the server actually returned. */
  readonly hiddenByOutcomeFilter = computed(
    () => this.loadedExchanges().length > 0 && this.exchanges().length === 0,
  );

  readonly hasPreviousPage = computed(() => this.page() > 0);
  readonly hasNextPage = computed(() => this.page() + 1 < this.totalPages());
  /** 1-based page number for display; operators do not count from zero. */
  readonly pageNumber = computed(() => this.page() + 1);

  constructor() {
    const today = new Date();
    const start = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - (DEFAULT_WINDOW_DAYS - 1),
    );
    this.filterForm.patchValue({
      dateFrom: toDateOnly(start),
      dateTo: toDateOnly(today),
    });

    this.loadProfiles();
  }

  outcomeTone(outcome: ExchangeOutcome): SupplierStatusTone {
    return OUTCOME_TONES[outcome] ?? 'neutral';
  }

  /** True when this UI has translated copy for the key; unknown keys render verbatim. */
  isKnownOutcome(outcome: ExchangeOutcome): boolean {
    return KNOWN_EXCHANGE_OUTCOMES.includes(outcome);
  }

  isKnownCapability(capability: string): boolean {
    return KNOWN_SUPPLIER_CAPABILITIES.includes(capability);
  }

  /** Display name for a vendor, falling back to the exchange's own alias snapshot. */
  vendorLabel(record: ExchangeAuditRecord): string {
    return (
      this.profiles().find(profile => profile.vendorProfileId === record.vendorProfileId)
        ?.displayName ??
      record.supplierRef ??
      record.vendorProfileId
    );
  }

  /** Null when the contract requirements are not met — the caller must not query. */
  private currentFilter(): ExchangeAuditFilter | null {
    const raw = this.filterForm.getRawValue();
    if (!raw.vendorProfileId || !raw.dateFrom || !raw.dateTo) {
      return null;
    }
    return {
      vendorProfileId: raw.vendorProfileId,
      dateFrom: raw.dateFrom,
      dateTo: raw.dateTo,
      capability: raw.capability || undefined,
    };
  }

  private loadProfiles(): void {
    this.profileService
      .listProfiles()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: profiles => this.profiles.set(profiles),
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.AUDIT.ERROR.LOAD_VENDORS');
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }

  load(page = this.page()): void {
    const filter = this.currentFilter();
    if (!filter) {
      // No vendor (or no window) means no query the contract would accept.
      this.state.set('prompt');
      this.errorKey.set(null);
      this.loadedExchanges.set([]);
      return;
    }

    this.state.set('loading');
    this.errorKey.set(null);
    this.activeOutcome.set(this.filterForm.getRawValue().outcome);

    this.auditService
      .listExchanges(filter, page)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.loadedExchanges.set(result.items);
          this.totalCount.set(result.totalCount);
          this.page.set(result.page);
          this.pageSize.set(result.size);
          this.totalPages.set(result.totalPages);
          this.state.set(result.items.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.AUDIT.ERROR.LOAD');
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }

  /** Applying filters always restarts at the first page. */
  applyFilter(): void {
    this.load(0);
  }

  previousPage(): void {
    if (this.hasPreviousPage()) {
      this.load(this.page() - 1);
    }
  }

  nextPage(): void {
    if (this.hasNextPage()) {
      this.load(this.page() + 1);
    }
  }

  clearFilter(): void {
    const today = new Date();
    const start = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - (DEFAULT_WINDOW_DAYS - 1),
    );
    this.filterForm.reset({
      vendorProfileId: '',
      capability: '',
      outcome: '',
      dateFrom: toDateOnly(start),
      dateTo: toDateOnly(today),
    });
    this.activeOutcome.set('');
    this.load(0);
  }
}
