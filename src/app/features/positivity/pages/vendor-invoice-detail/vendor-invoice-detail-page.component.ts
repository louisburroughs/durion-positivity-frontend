import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription, distinctUntilChanged, map } from 'rxjs';
import { SupplierInvoiceService } from '../../services/supplier-invoice.service';
import {
  SupplierInvoiceDetail,
  SupplierInvoiceFlag,
  SupplierInvoiceType,
  SupplierInvoiceVersion,
} from '../../models/supplier-invoice.models';
import { mapSupplierError } from '../../utils/supplier-error.util';
import { isNegativeAmount } from '../../utils/supplier-amount.util';
import { toDatePipeInput } from '../../utils/supplier-freshness.util';
import { StalenessIndicatorComponent } from '../../components/staleness-indicator/staleness-indicator.component';
import {
  SupplierStatusChipComponent,
  SupplierStatusTone,
} from '../../components/supplier-status-chip/supplier-status-chip.component';

type PageState = 'idle' | 'loading' | 'ready' | 'error' | 'forbidden';

const FLAG_ICONS: Readonly<Record<SupplierInvoiceFlag, string>> = {
  UNMATCHED: 'link_off',
  DISCREPANCY: 'difference',
};

const TYPE_ICONS: Readonly<Record<SupplierInvoiceType, string>> = {
  INVOICE: 'receipt_long',
  CREDIT_NOTE: 'request_quote',
};

/**
 * One ingested vendor invoice: lines, versions and linkage (issue #192).
 *
 * ── The voucher reference is text, and that is the honest rendering ─────────
 * #192 §7 asks for "voucher and purchase-order links [that] navigate to their
 * owning screens". The purchase-order half is real: `po-detail` exists, and the
 * link below is a `routerLink` onto the platform PO UUID (ADR-0037). The
 * voucher half has no destination — this frontend has no voucher or AP-bill
 * screen; the accounting SDK exposes `/v1/accounting/ap/bills` but nothing
 * consumes it. So the voucher reference renders as a selectable identifier the
 * AP user can search for in the system of record, and **not** as a link. A link
 * that lands nowhere costs the user a navigation, a back-press and their trust
 * in every other link on the page; an identifier costs them a copy-paste. When
 * an AP-bill screen exists, this becomes a one-line change and the model
 * already carries the reference. Recorded as a follow-up, deliberately not
 * built here.
 *
 * ── A missing voucher is a state, not a chore ───────────────────────────────
 * `voucherStatus: 'PENDING'` is the backend saying the voucher has not been
 * created yet. It renders as a pending chip with no action, because there is no
 * client-side act that would create one (#192 §5).
 *
 * ── A DISCREPANCY shows two documents, not a diff ───────────────────────────
 * Both delivered versions render with their own reference, issue date and
 * amounts, in the order delivered. Nothing merges them, nothing hides the
 * earlier one, and no difference is computed: the arithmetic that would produce
 * one is exactly the recomputation #192 §5 forbids, and an AP user reconciling
 * a re-issued invoice needs the two documents rather than this screen's opinion
 * of the gap between them.
 *
 * ── Read-only ───────────────────────────────────────────────────────────────
 * There is no acknowledge, dismiss or edit control on this page, and the
 * service behind it has no method that could implement one.
 */
@Component({
  selector: 'app-vendor-invoice-detail-page',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    TranslatePipe,
    StalenessIndicatorComponent,
    SupplierStatusChipComponent,
  ],
  templateUrl: './vendor-invoice-detail-page.component.html',
  styleUrls: ['../../positivity-shared.css', './vendor-invoice-detail-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorInvoiceDetailPageComponent {
  private readonly service = inject(SupplierInvoiceService);
  private readonly route = inject(ActivatedRoute);

  /** Test seam for "now", forwarded to the freshness indicator. */
  readonly nowMs = input<number | null>(null);

  /** Platform invoice UUID resolved from the route. */
  readonly invoiceId = signal<string | null>(null);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly invoice = signal<SupplierInvoiceDetail | null>(null);

  private readonly reloadToken = signal(0);

  readonly lines = computed(() => this.invoice()?.lines ?? []);

  readonly hasLines = computed(() => this.lines().length > 0);

  readonly flags = computed(() => this.invoice()?.flags ?? []);

  readonly isUnmatched = computed(() => this.flags().includes('UNMATCHED'));

  readonly hasDiscrepancy = computed(() => this.flags().includes('DISCREPANCY'));

  /**
   * Every delivered version, in the delivered order.
   *
   * A copy is never sorted or de-duplicated here: the backend's order is the
   * record of what arrived when, and rearranging it would quietly answer the
   * question the AP user opened this page to answer for themselves.
   */
  readonly versions = computed<SupplierInvoiceVersion[]>(() => this.invoice()?.versions ?? []);

  readonly showVersions = computed(() => this.versions().length > 1 || this.hasDiscrepancy());

  readonly voucherPending = computed(
    () => this.invoice()?.voucherStatus !== 'LINKED' || !this.invoice()?.voucherReference,
  );

  readonly purchaseOrderId = computed(() => this.invoice()?.purchaseOrderId ?? null);

  constructor() {
    effect(onCleanup => {
      const sub: Subscription = this.route.paramMap
        .pipe(
          map(params => params.get('invoiceId')),
          distinctUntilChanged(),
        )
        .subscribe(invoiceId => this.invoiceId.set(invoiceId));

      onCleanup(() => sub.unsubscribe());
    });

    effect(onCleanup => {
      this.reloadToken();
      const invoiceId = this.invoiceId();

      if (!invoiceId) {
        this.state.set('idle');
        this.errorKey.set(null);
        this.invoice.set(null);
        return;
      }

      this.state.set('loading');
      this.errorKey.set(null);

      const sub: Subscription = this.service.getInvoice(invoiceId).subscribe({
        next: detail => {
          this.invoice.set(detail);
          this.state.set('ready');
        },
        error: (err: unknown) => {
          this.invoice.set(null);
          const outcome = mapSupplierError(err, 'POSITIVITY.INVOICE.ERROR.LOAD_DETAIL');
          // ADR-0031: state first, then the key.
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });

      onCleanup(() => sub.unsubscribe());
    });
  }

  /** Re-read the invoice. Re-runs the effect, cancelling anything in flight. */
  reload(): void {
    this.reloadToken.update(value => value + 1);
  }

  /** Date-only issue date prepared for `DatePipe` (ADR-0038). */
  issueDateFor(value: string | null | undefined): string | null {
    return toDatePipeInput(value);
  }

  /** True when the delivered amount is a credit. Read from the text, never computed. */
  isCredit(amount: string | null | undefined): boolean {
    return isNegativeAmount(amount);
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
}
