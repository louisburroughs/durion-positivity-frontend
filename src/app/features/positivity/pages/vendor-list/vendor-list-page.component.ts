import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { POSITIVITY_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { VENDOR_LIST_PAGE_SIZE, VendorPage, VendorStatusFilter } from '../../models/supplier-vendor.models';
import { SupplierVendorService } from '../../services/supplier-vendor.service';
import { classifyVendorError } from '../../utils/supplier-vendor-error.util';
import { VendorCopy, paymentTermsCopy } from '../../utils/supplier-vendor.util';
import { supplierIdentityKey } from '../../utils/supplier-identity.util';

type PageState = 'idle' | 'loading' | 'ready' | 'error';

/** The status filter, in the order the buttons show (story item 2). */
export const VENDOR_STATUS_FILTERS: readonly VendorStatusFilter[] = ['ACTIVE', 'INACTIVE', 'ALL'];

/**
 * Vendors (CAP:550 S30, #469 item 2): the pos-supplier vendor master, searched by
 * number or name and filtered by status, one server page at a time.
 *
 * Admitted on `supplier:vendor:read`; **Add vendor** shows only for
 * `supplier:vendor:write` (P5, ADR-0040 §6a). Reads are sequence-guarded and a
 * `tid|sub` change drops everything and reads again (ADR-0063 §1, §7).
 */
@Component({
  selector: 'app-vendor-list-page',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './vendor-list-page.component.html',
  styleUrls: ['../../vendors-shared.css', './vendor-list-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorListPageComponent {
  private readonly service = inject(SupplierVendorService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly identity = computed(() => supplierIdentityKey(this.auth.tenantId(), this.auth.currentUserClaims()?.sub));
  private trackedIdentity = this.identity();
  private loadSeq = 0;

  readonly filters = VENDOR_STATUS_FILTERS;
  readonly pageSize = VENDOR_LIST_PAGE_SIZE;

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<VendorCopy | null>(null);
  readonly result = signal<VendorPage | null>(null);
  /** The search box's text; applied on submit. */
  readonly query = signal('');
  /** The search the shown page answers. */
  readonly appliedQuery = signal('');
  readonly status = signal<VendorStatusFilter>('ACTIVE');
  readonly page = signal(0);

  /** `supplier:vendor:write`; a token without `perm_bits` keeps the legacy open behaviour, as `canAccess()` does. */
  readonly canWrite = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(POSITIVITY_SECTION.vendorWrite),
  );

  readonly rows = computed(() => this.result()?.items ?? []);
  readonly hasPrevious = computed(() => this.page() > 0);
  readonly hasNext = computed(() => {
    const result = this.result();
    return !!result && this.page() + 1 < result.totalPages;
  });

  readonly termsCopy = paymentTermsCopy;

  constructor() {
    this.load();
    // ADR-0063 §7: another tenant or person drops every read in flight and the page, then reads again.
    effect(() => {
      const identity = this.identity();
      if (identity === this.trackedIdentity) return;
      this.trackedIdentity = identity;
      untracked(() => {
        this.result.set(null);
        this.page.set(0);
        this.load();
      });
    });
  }

  search(event: Event): void {
    event.preventDefault();
    this.appliedQuery.set(this.query().trim());
    this.page.set(0);
    this.load();
  }

  setStatus(filter: VendorStatusFilter): void {
    if (this.status() === filter) return;
    this.status.set(filter);
    this.page.set(0);
    this.load();
  }

  previousPage(): void {
    if (!this.hasPrevious() || this.state() === 'loading') return;
    this.page.update(page => page - 1);
    this.load();
  }

  nextPage(): void {
    if (!this.hasNext() || this.state() === 'loading') return;
    this.page.update(page => page + 1);
    this.load();
  }

  load(): void {
    const seq = ++this.loadSeq;
    const q = this.appliedQuery() || undefined;
    const filter = this.status();
    this.state.set('loading');
    this.errorKey.set(null);
    this.service
      .listVendors(q, filter === 'ALL' ? undefined : filter, this.page(), this.pageSize)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: page => {
          if (seq !== this.loadSeq) return;
          this.result.set(page);
          this.state.set('ready');
          this.errorKey.set(null);
        },
        error: (err: unknown) => {
          if (seq !== this.loadSeq) return;
          this.state.set('error');
          this.errorKey.set(classifyVendorError(err, 'POSITIVITY.VENDORS.ERROR.LOAD_LIST').message);
        },
      });
  }

  filterKey(filter: VendorStatusFilter): string {
    return `POSITIVITY.VENDORS.FILTER.${filter}`;
  }

  text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
