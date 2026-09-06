import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import {
  SupplierStatusChipComponent,
  SupplierStatusTone,
} from '../../components/supplier-status-chip/supplier-status-chip.component';
import { SupplierOrderTransmissionService } from '../../services/supplier-order-transmission.service';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  SupplierOrderTransmission,
  SupplierTransmissionSearchFilter,
  TransmissionResolutionAction,
} from '../../models/supplier-order-transmission.models';
import { VendorProfileSummary } from '../../models/supplier-profile.models';
import { mapSupplierError } from '../../utils/supplier-error.util';
import { toDatePipeInput } from '../../utils/supplier-freshness.util';

type PageState = 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

/** The three ADR-0052 §4 resolution actions, in the order offered to the operator. */
const RESOLUTION_ACTIONS: readonly TransmissionResolutionAction[] = [
  'CONFIRM_WITH_VENDOR_REFERENCE',
  'MARK_NOT_RECEIVED',
  'CANCEL',
];

const STATE_TONE: SupplierStatusTone = 'warning';

/**
 * Manual-review worklist for ambiguous supplier transmissions (issue #216;
 * #1638 decision 6).
 *
 * ── This is the whole queue, not one purchase order's history ──────────────
 * Every row is a transmission intent, across every purchase order, currently
 * stuck in `MANUAL_REVIEW` — the platform could not establish whether the
 * vendor received the order. Filtering is server-side
 * (`searchSupplierTransmissions`), not a client-side narrowing of a small list.
 *
 * ── No re-send action exists here, by decision ──────────────────────────────
 * Resolving a row records what an operator already established with the
 * vendor (`resolveTransmission`); it never contacts the vendor and there is no
 * retry/resend control anywhere on this page. A blind re-send is how one
 * purchase order becomes two deliveries.
 */
@Component({
  selector: 'app-manual-review-queue-page',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, TranslatePipe, SupplierStatusChipComponent],
  templateUrl: './manual-review-queue-page.component.html',
  styleUrls: ['../../positivity-shared.css', './manual-review-queue-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManualReviewQueuePageComponent {
  private readonly transmissionService = inject(SupplierOrderTransmissionService);
  private readonly profileService = inject(SupplierProfileService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('loading');
  readonly errorKey = signal<string | null>(null);
  readonly items = signal<SupplierOrderTransmission[]>([]);
  readonly totalCount = signal(0);
  readonly page = signal(0);
  readonly pageSize = signal(0);
  readonly totalPages = signal(0);
  readonly profiles = signal<VendorProfileSummary[]>([]);

  readonly stateTone = STATE_TONE;
  readonly resolutionActions = RESOLUTION_ACTIONS;

  /** Row currently expanded for resolution, or null when none is. */
  readonly expandedId = signal<string | null>(null);
  readonly resolving = signal(false);
  readonly resolveErrorKey = signal<string | null>(null);

  readonly filterForm = new FormGroup({
    vendorProfileId: new FormControl('', { nonNullable: true }),
    search: new FormControl('', { nonNullable: true }),
    dateFrom: new FormControl('', { nonNullable: true }),
    dateTo: new FormControl('', { nonNullable: true }),
  });

  readonly resolveForm = new FormGroup({
    action: new FormControl<TransmissionResolutionAction>('MARK_NOT_RECEIVED', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    evidence: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    supplierOrderNumber: new FormControl('', { nonNullable: true }),
  });

  readonly hasPreviousPage = computed(() => this.page() > 0);
  readonly hasNextPage = computed(() => this.page() + 1 < this.totalPages());
  /** 1-based page number for display; operators do not count from zero. */
  readonly pageNumber = computed(() => this.page() + 1);

  constructor() {
    this.loadProfiles();
    this.load(0);

    // The vendor-reference field only applies to one action; keep stale input
    // out of the payload rather than validating around it.
    this.resolveForm.controls.action.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(action => {
        const control = this.resolveForm.controls.supplierOrderNumber;
        if (action === 'CONFIRM_WITH_VENDOR_REFERENCE') {
          control.setValidators([Validators.required]);
        } else {
          control.setValidators([]);
          control.setValue('');
        }
        control.updateValueAndValidity();
      });
  }

  /**
   * A plain method, not a `computed()`: it reads a `FormControl` value, which
   * is not itself a signal, so a `computed()` here would cache its first
   * result and never see a later `patchValue`. Angular re-invokes a template
   * method call on every check, which is what keeps this current.
   */
  requiresVendorReference(): boolean {
    return this.resolveForm.controls.action.value === 'CONFIRM_WITH_VENDOR_REFERENCE';
  }

  vendorLabel(transmission: SupplierOrderTransmission): string {
    return (
      this.profiles().find(profile => transmission.supplierRef === profile.supplierRef)
        ?.displayName ??
      transmission.supplierRef ??
      ''
    );
  }

  /** Vendor-quoted delivery date prepared for `DatePipe` (ADR-0038). */
  deliveryDateFor(value: string | null | undefined): string | null {
    return toDatePipeInput(value);
  }

  isExpanded(transmission: SupplierOrderTransmission): boolean {
    return this.expandedId() === transmission.transmissionIntentId;
  }

  toggleRow(transmission: SupplierOrderTransmission): void {
    if (this.isExpanded(transmission)) {
      this.expandedId.set(null);
      return;
    }
    this.expandedId.set(transmission.transmissionIntentId);
    this.resolveErrorKey.set(null);
    this.resolveForm.reset({ action: 'MARK_NOT_RECEIVED', evidence: '', supplierOrderNumber: '' });
  }

  private currentFilter(): SupplierTransmissionSearchFilter {
    const raw = this.filterForm.getRawValue();
    return {
      vendorProfileId: raw.vendorProfileId || undefined,
      search: raw.search.trim() || undefined,
      dateFrom: raw.dateFrom || undefined,
      dateTo: raw.dateTo || undefined,
    };
  }

  private loadProfiles(): void {
    this.profileService
      .listProfiles()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: profiles => this.profiles.set(profiles),
        // Losing the vendor roster degrades the filter label only — the
        // worklist itself still loads and still names the vendor by its
        // supplierRef attribute.
        error: () => this.profiles.set([]),
      });
  }

  load(page = this.page()): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.transmissionService
      .searchManualReview(this.currentFilter(), page)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.items.set(result.items);
          this.totalCount.set(result.totalCount);
          this.page.set(result.page);
          this.pageSize.set(result.size);
          this.totalPages.set(result.totalPages);
          this.expandedId.set(null);
          this.state.set(result.items.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.MANUAL_REVIEW.ERROR.LOAD');
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }

  applyFilter(): void {
    this.load(0);
  }

  clearFilter(): void {
    this.filterForm.reset({ vendorProfileId: '', search: '', dateFrom: '', dateTo: '' });
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

  submitResolution(): void {
    const transmissionIntentId = this.expandedId();
    if (!transmissionIntentId || this.resolveForm.invalid) {
      this.resolveForm.markAllAsTouched();
      return;
    }

    const raw = this.resolveForm.getRawValue();
    this.resolving.set(true);
    this.resolveErrorKey.set(null);

    this.transmissionService
      .resolveTransmission(transmissionIntentId, {
        action: raw.action,
        evidence: raw.evidence.trim(),
        supplierOrderNumber:
          raw.action === 'CONFIRM_WITH_VENDOR_REFERENCE' ? raw.supplierOrderNumber.trim() : undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.resolving.set(false);
          // Resolved transmissions are terminal — they no longer belong in
          // this MANUAL_REVIEW-filtered worklist.
          this.load(this.page());
        },
        error: (err: unknown) => {
          this.resolving.set(false);
          const outcome = mapSupplierError(err, 'POSITIVITY.MANUAL_REVIEW.ERROR.RESOLVE');
          this.resolveErrorKey.set(outcome.errorKey);
        },
      });
  }
}
