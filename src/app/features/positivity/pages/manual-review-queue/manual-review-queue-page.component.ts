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
import { SupplierOrderTransmissionService } from '../../services/supplier-order-transmission.service';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  SupplierManualReviewFilter,
  SupplierManualReviewItem,
} from '../../models/supplier-order-transmission.models';
import { VendorProfileSummary } from '../../models/supplier-profile.models';
import { mapSupplierError } from '../../utils/supplier-error.util';
import { SupplierManualReviewActionsComponent } from '../../components/supplier-manual-review-actions/supplier-manual-review-actions.component';
import { SupplierStatusChipComponent } from '../../components/supplier-status-chip/supplier-status-chip.component';

type PageState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

/** Per-row transient notice keys, keyed by purchase-order id. */
type RowNotices = Readonly<Record<string, string>>;

/**
 * Manual-review queue for ambiguous vendor transmissions (issue #191).
 *
 * ── Administration → Supplier Connectivity → Orders ─────────────────────────
 * Mounted under `/app/positivity`, which carries `data: { roles: ['ROLE_ADMIN'] }`
 * in `app.routes.ts`, so the whole surface is admin-gated by `rolesChildGuard`.
 * Finer permission boundaries are the backend's call: a caller who may read the
 * queue but not resolve simply receives rows with an empty `resolutionActions`
 * list, and no control is rendered.
 *
 * ── The queue exists so ambiguity cannot become a duplicate order ───────────
 * Every row here is a transmission where the platform cannot tell whether the
 * vendor holds the order. Nothing on this screen re-sends anything: the only
 * operations offered are the backend's own resolution tokens, each behind a
 * confirmation that names the risk of getting it wrong. A "retry transmission"
 * button here would be the single most expensive mistake available on this
 * screen — it would order the parts twice.
 *
 * ── A raced resolution refreshes the row ────────────────────────────────────
 * `409` means the vendor moved while the operator was deciding. The row is
 * re-read and replaced in place with a translated notice, rather than leaving a
 * page-level error banner over a queue whose other rows are still fine. The
 * resolution POST is idempotent in intent, so re-reading is always safe.
 */
@Component({
  selector: 'app-manual-review-queue-page',
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    SupplierManualReviewActionsComponent,
    SupplierStatusChipComponent,
  ],
  templateUrl: './manual-review-queue-page.component.html',
  styleUrls: ['../../positivity-shared.css', './manual-review-queue-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManualReviewQueuePageComponent implements OnInit {
  private readonly service = inject(SupplierOrderTransmissionService);
  private readonly profiles = inject(SupplierProfileService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly rows = signal<SupplierManualReviewItem[]>([]);
  readonly totalCount = signal(0);
  readonly vendorOptions = signal<VendorProfileSummary[]>([]);
  readonly resolvingId = signal<string | null>(null);
  readonly rowNotices = signal<RowNotices>({});

  readonly filterForm = new FormGroup({
    vendorProfileId: new FormControl('', { nonNullable: true }),
    search: new FormControl('', { nonNullable: true }),
    dateFrom: new FormControl('', { nonNullable: true }),
    dateTo: new FormControl('', { nonNullable: true }),
  });

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
   * The queue read is an unconditional one-shot with no reactive input, so it
   * belongs in `ngOnInit` rather than an `effect` that exists only to run once.
   */
  ngOnInit(): void {
    this.load();
  }

  noticeFor(purchaseOrderId: string): string | null {
    return this.rowNotices()[purchaseOrderId] ?? null;
  }

  isResolving(purchaseOrderId: string): boolean {
    return this.resolvingId() === purchaseOrderId;
  }

  load(): void {
    this.state.set('loading');
    this.errorKey.set(null);
    this.rowNotices.set({});

    this.service
      .listManualReview(this.currentFilter())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: page => {
          this.rows.set(page.items);
          this.totalCount.set(page.totalCount);
          this.state.set(page.items.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.MANUAL_REVIEW.ERROR.LOAD');
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
    this.filterForm.reset({ vendorProfileId: '', search: '', dateFrom: '', dateTo: '' });
    this.load();
  }

  /**
   * Apply one backend-delivered resolution to one row.
   *
   * The action token came from the backend and is posted back untouched, so this
   * screen can never ask for an operation the backend did not offer.
   */
  resolve(row: SupplierManualReviewItem, action: string): void {
    if (this.resolvingId()) {
      return;
    }

    this.resolvingId.set(row.purchaseOrderId);
    this.clearNotice(row.purchaseOrderId);

    this.service
      .resolveManualReview(row.purchaseOrderId, action)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.resolvingId.set(null);
          this.replaceRow(updated);
          this.setNotice(updated.purchaseOrderId, 'POSITIVITY.MANUAL_REVIEW.NOTICE.RESOLVED');
        },
        error: (err: unknown) => {
          this.resolvingId.set(null);
          const outcome = mapSupplierError(err, 'POSITIVITY.MANUAL_REVIEW.ERROR.RESOLVE');
          if (outcome.kind === 'conflict') {
            // The vendor moved first. Refresh the row rather than arguing with it.
            this.refreshRow(row.purchaseOrderId);
            return;
          }
          // ADR-0031: state first, then the key.
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }

  /** Re-read one row after a `409`, replacing it in place. */
  private refreshRow(purchaseOrderId: string): void {
    this.setNotice(purchaseOrderId, 'POSITIVITY.MANUAL_REVIEW.NOTICE.RACED_BY_VENDOR');

    this.service
      .getManualReviewItem(purchaseOrderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => this.replaceRow(updated),
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.MANUAL_REVIEW.ERROR.LOAD');
          // ADR-0031: state first, then the key.
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }

  private replaceRow(updated: SupplierManualReviewItem): void {
    this.rows.update(items =>
      items.map(item =>
        item.purchaseOrderId === updated.purchaseOrderId ? updated : item,
      ),
    );
  }

  private setNotice(purchaseOrderId: string, key: string): void {
    this.rowNotices.update(current => ({ ...current, [purchaseOrderId]: key }));
  }

  private clearNotice(purchaseOrderId: string): void {
    this.rowNotices.update(current => {
      const next = { ...current };
      delete next[purchaseOrderId];
      return next;
    });
  }

  private currentFilter(): SupplierManualReviewFilter {
    const raw = this.filterForm.getRawValue();
    return {
      vendorProfileId: raw.vendorProfileId || undefined,
      search: raw.search.trim() || undefined,
      dateFrom: raw.dateFrom || undefined,
      dateTo: raw.dateTo || undefined,
    };
  }
}
