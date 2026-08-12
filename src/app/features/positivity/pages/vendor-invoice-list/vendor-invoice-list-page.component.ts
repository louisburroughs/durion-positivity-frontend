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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription, catchError, of } from 'rxjs';
import { SupplierInvoiceService } from '../../services/supplier-invoice.service';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  SupplierInvoiceFilter,
  SupplierInvoiceFlag,
  SupplierInvoiceSummary,
  SupplierInvoiceType,
} from '../../models/supplier-invoice.models';
import { VendorProfileSummary } from '../../models/supplier-profile.models';
import { mapSupplierError } from '../../utils/supplier-error.util';
import { isNegativeAmount } from '../../utils/supplier-amount.util';
import { toDatePipeInput } from '../../utils/supplier-freshness.util';
import {
  SupplierStatusChipComponent,
  SupplierStatusTone,
} from '../../components/supplier-status-chip/supplier-status-chip.component';

type PageState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

/** Tone + glyph per exception flag. Colour is redundant with the text label. */
const FLAG_TONES: Readonly<Record<SupplierInvoiceFlag, SupplierStatusTone>> = {
  UNMATCHED: 'warning',
  DISCREPANCY: 'warning',
};

const FLAG_ICONS: Readonly<Record<SupplierInvoiceFlag, string>> = {
  UNMATCHED: 'link_off',
  DISCREPANCY: 'difference',
};

const TYPE_ICONS: Readonly<Record<SupplierInvoiceType, string>> = {
  INVOICE: 'receipt_long',
  CREDIT_NOTE: 'request_quote',
};

/**
 * Ingested vendor invoices, and the exception worklist over them (issue #192).
 *
 * ── Two routes, one component, one backend truth ────────────────────────────
 * `payables/vendor-invoices` lists everything that arrived;
 * `payables/vendor-invoices/exceptions` lists what the backend currently flags.
 * The exception mode is chosen by route `data`, and it calls a *different
 * endpoint* rather than filtering the full list client-side — a worklist that
 * shrinks because a page boundary fell between two flagged rows is worse than
 * no worklist, and "which invoices are exceptions" is backend state, not a
 * predicate this screen is entitled to evaluate.
 *
 * ── The row you cannot make go away ─────────────────────────────────────────
 * There is no dismiss, acknowledge, snooze or hide control here, and the
 * service behind it has no method that could implement one (#192 §6, §8 ruled
 * review-only in v1). An `UNMATCHED` or `DISCREPANCY` row persists until the
 * backend stops reporting the flag. That is the same discipline the PRICAT and
 * shipment worklists follow, and it exists because these two flags are the only
 * warning that an amount heading for a payment run is not trustworthy.
 *
 * ── Amounts ─────────────────────────────────────────────────────────────────
 * Rendered exactly as delivered, sign included, beside the delivered currency
 * code. No `CurrencyPipe`, no symbol substitution, no re-derived totals — a
 * credit note stays negative, and a list total is not this screen's to compute.
 * The negative sign is reinforced by a translated screen-reader cue so the
 * distinction never rests on a minus glyph alone (ADR-0029).
 *
 * ── Where this lives ────────────────────────────────────────────────────────
 * The component sits in `positivity/` and the accounting feature only
 * lazy-loads it, so no supplier HTTP call and no supplier model crosses into
 * the accounting domain (ADR-0010) — the same containment `inventory` got for
 * the transmission and shipment panels.
 */
@Component({
  selector: 'app-vendor-invoice-list-page',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, TranslatePipe, SupplierStatusChipComponent],
  templateUrl: './vendor-invoice-list-page.component.html',
  styleUrls: ['../../positivity-shared.css', './vendor-invoice-list-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorInvoiceListPageComponent implements OnInit {
  private readonly service = inject(SupplierInvoiceService);
  private readonly profiles = inject(SupplierProfileService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly rows = signal<SupplierInvoiceSummary[]>([]);
  readonly totalCount = signal(0);
  readonly vendorOptions = signal<VendorProfileSummary[]>([]);

  /** True on the exception worklist route. Set from route `data` in `ngOnInit`. */
  readonly exceptionsOnly = signal(false);

  readonly filterForm = new FormGroup({
    vendorProfileId: new FormControl('', { nonNullable: true }),
    search: new FormControl('', { nonNullable: true }),
    type: new FormControl('', { nonNullable: true }),
    flag: new FormControl('', { nonNullable: true }),
    dateFrom: new FormControl('', { nonNullable: true }),
    dateTo: new FormControl('', { nonNullable: true }),
  });

  readonly vendorFilterAvailable = computed(() => this.vendorOptions().length > 0);

  readonly titleKey = computed(() =>
    this.exceptionsOnly()
      ? 'POSITIVITY.INVOICE.EXCEPTIONS.TITLE'
      : 'POSITIVITY.INVOICE.LIST.TITLE',
  );

  readonly subtitleKey = computed(() =>
    this.exceptionsOnly()
      ? 'POSITIVITY.INVOICE.EXCEPTIONS.SUBTITLE'
      : 'POSITIVITY.INVOICE.LIST.SUBTITLE',
  );

  readonly emptyKey = computed(() =>
    this.exceptionsOnly()
      ? 'POSITIVITY.INVOICE.EXCEPTIONS.EMPTY'
      : 'POSITIVITY.INVOICE.LIST.EMPTY',
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

  /** Unconditional one-shot read; an `effect` here would exist only to run once. */
  ngOnInit(): void {
    this.exceptionsOnly.set(this.route.snapshot.data['exceptionsOnly'] === true);
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.errorKey.set(null);

    const filter = this.currentFilter();
    const request$ = this.exceptionsOnly()
      ? this.service.listExceptions(filter)
      : this.service.listInvoices(filter);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: page => {
        this.rows.set(page.items);
        this.totalCount.set(page.totalCount);
        this.state.set(page.items.length === 0 ? 'empty' : 'ready');
      },
      error: (err: unknown) => {
        const outcome = mapSupplierError(err, 'POSITIVITY.INVOICE.ERROR.LOAD');
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
      search: '',
      type: '',
      flag: '',
      dateFrom: '',
      dateTo: '',
    });
    this.load();
  }

  /** Issue date prepared for `DatePipe` (ADR-0038). */
  issueDateFor(value: string | null | undefined): string | null {
    return toDatePipeInput(value);
  }

  /** True when the delivered amount is a credit. Read from the text, never computed. */
  isCredit(row: SupplierInvoiceSummary): boolean {
    return isNegativeAmount(row.amount);
  }

  typeLabelKey(type: SupplierInvoiceType): string {
    return `POSITIVITY.INVOICE.TYPE.${type}`;
  }

  typeIcon(type: SupplierInvoiceType): string {
    return TYPE_ICONS[type] ?? 'receipt_long';
  }

  typeTone(type: SupplierInvoiceType): SupplierStatusTone {
    return type === 'CREDIT_NOTE' ? 'info' : 'neutral';
  }

  flagLabelKey(flag: SupplierInvoiceFlag): string {
    return `POSITIVITY.INVOICE.FLAG.${flag}`;
  }

  flagIcon(flag: SupplierInvoiceFlag): string {
    return FLAG_ICONS[flag] ?? 'warning';
  }

  flagTone(flag: SupplierInvoiceFlag): SupplierStatusTone {
    return FLAG_TONES[flag] ?? 'warning';
  }

  private currentFilter(): SupplierInvoiceFilter {
    const raw = this.filterForm.getRawValue();
    return {
      vendorProfileId: raw.vendorProfileId || undefined,
      search: raw.search.trim() || undefined,
      type: (raw.type as SupplierInvoiceType) || undefined,
      // The exception worklist asks the backend for every flagged row; narrowing
      // it to one flag here would hide the other exception from the same screen.
      flag: this.exceptionsOnly() ? undefined : (raw.flag as SupplierInvoiceFlag) || undefined,
      dateFrom: raw.dateFrom || undefined,
      dateTo: raw.dateTo || undefined,
    };
  }
}
