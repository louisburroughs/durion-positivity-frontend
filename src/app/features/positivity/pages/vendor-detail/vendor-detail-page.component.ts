import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { distinctUntilChanged, map } from 'rxjs';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { POSITIVITY_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { VendorConnectionsComponent } from '../../components/vendor-connections/vendor-connections.component';
import { VendorFieldsComponent } from '../../components/vendor-fields/vendor-fields.component';
import { VendorFieldsGroup, registrationsOf, termsOf, vendorFieldsGroup } from '../../components/vendor-fields/vendor-form';
import { VendorRemitToComponent } from '../../components/vendor-remit-to/vendor-remit-to.component';
import { VendorTaxRegistrationsComponent } from '../../components/vendor-tax-registrations/vendor-tax-registrations.component';
import { RemitToChange, VENDOR_NOTE_MAX, VENDOR_NOTE_MIN, Vendor } from '../../models/supplier-vendor.models';
import { SupplierVendorService } from '../../services/supplier-vendor.service';
import { VENDOR_FIELD_PATH, VendorFailure, classifyVendorError } from '../../utils/supplier-vendor-error.util';
import { VendorCopy, noteValid, paymentTermsCopy } from '../../utils/supplier-vendor.util';
import { supplierIdentityKey } from '../../utils/supplier-identity.util';

type PageState = 'idle' | 'loading' | 'ready' | 'error';
export type ReadStatus = 'PENDING' | 'OK' | 'FAILED';
export type StatusDialogMode = 'DEACTIVATE' | 'REACTIVATE';

const WRITE_PERMISSION = POSITIVITY_SECTION.vendorWrite[0];

/**
 * One vendor (CAP:550 S30, #469 item 5): identity, Edit, Deactivate /
 * Reactivate, the remit-to and its pending change, the remit-to history and the
 * vendor's connections. `/app/positivity/vendors/:vendorId` is the stable target
 * other pages (Bills to pay's "See the new details", S14 / S14b) link to.
 *
 * Two reads, each with its own sequence (ADR-0063 §2): the vendor (primary —
 * its failure is the page's error) and its remit-to changes (degradable — a
 * failure keeps the vendor on screen and only hides what needs it, ADR-0064).
 * Every write control and its handler gate on its own code (ADR-0040 §6a) and
 * on an `'OK'` read. A route or `tid|sub` change drops everything in flight.
 */
@Component({
  selector: 'app-vendor-detail-page',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    TranslatePipe,
    ModalDialogDirective,
    VendorConnectionsComponent,
    VendorFieldsComponent,
    VendorRemitToComponent,
    VendorTaxRegistrationsComponent,
  ],
  templateUrl: './vendor-detail-page.component.html',
  styleUrls: ['../../vendors-shared.css', './vendor-detail-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorDetailPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(SupplierVendorService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  private readonly identity = computed(() => supplierIdentityKey(this.auth.tenantId(), this.auth.currentUserClaims()?.sub));
  private trackedIdentity = this.identity();

  /** One counter per writer (ADR-0063 §2). */
  private vendorSeq = 0;
  private changesSeq = 0;
  private saveSeq = 0;
  private statusSeq = 0;

  readonly noteMin = VENDOR_NOTE_MIN;
  readonly noteMax = VENDOR_NOTE_MAX;
  readonly termsCopy = paymentTermsCopy;

  readonly vendorId = signal<string | null>(null);
  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<VendorCopy | null>(null);
  readonly vendor = signal<Vendor | null>(null);
  readonly changes = signal<readonly RemitToChange[]>([]);
  readonly changesRead = signal<ReadStatus>('PENDING');
  /** A page-level outcome of the last write (re-read message, refusal). */
  readonly notice = signal<VendorCopy | null>(null);

  readonly editOpen = signal(false);
  readonly editForm = signal<VendorFieldsGroup>(vendorFieldsGroup());
  readonly saving = signal(false);
  readonly editSubmitted = signal(false);
  readonly editFieldErrors = signal<Readonly<Record<string, string>>>({});
  readonly editError = signal<VendorCopy | null>(null);

  readonly statusDialog = signal<StatusDialogMode | null>(null);
  readonly statusReason = signal('');
  readonly statusBusy = signal(false);
  readonly statusError = signal<VendorCopy | null>(null);
  /** The server refused the reason itself (`reason` field error), shown on the textarea. */
  readonly statusReasonError = signal<string | null>(null);

  private readonly granted = (codes: readonly string[]) => () =>
    !this.auth.permissionsKnown() || this.auth.hasAnyPermission(codes);
  /** `supplier:vendor:write` — Edit, Deactivate / Reactivate, Request a change. */
  readonly canWrite = computed(this.granted(POSITIVITY_SECTION.vendorWrite));
  /** `supplier:vendor_remit:approve` — Approve and Reject. */
  readonly canApprove = computed(this.granted(POSITIVITY_SECTION.vendorRemitApprove));
  /** `supplier:vendor_tax_id:reveal` — Reveal (#2621). */
  readonly canReveal = computed(this.granted(POSITIVITY_SECTION.vendorTaxIdReveal));
  /** `supplier:profile:read` — Connections; hidden, not shown empty, without it. */
  readonly canReadProfiles = computed(this.granted(POSITIVITY_SECTION.profileRead));

  /** The signed-in subject, for the self-approval hint (display only; the server decides). */
  readonly subject = computed(() => this.auth.currentUserClaims()?.sub ?? null);

  /** Writes need the vendor read to be current and settled. */
  readonly vendorReady = computed(() => this.state() === 'ready' && this.vendor() !== null);
  readonly statusReasonValid = computed(() => noteValid(this.statusReason(), VENDOR_NOTE_MIN, VENDOR_NOTE_MAX));

  constructor() {
    this.route.paramMap
      .pipe(
        map(params => params.get('vendorId')),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(vendorId => {
        this.vendorId.set(vendorId);
        this.resetAndLoad();
      });

    effect(() => {
      const identity = this.identity();
      if (identity === this.trackedIdentity) return;
      this.trackedIdentity = identity;
      untracked(() => this.resetAndLoad());
    });
  }

  /** Read the vendor and its remit-to changes again. */
  reload(): void {
    const vendorId = this.vendorId();
    if (!vendorId) return;
    this.loadVendor(vendorId);
    this.loadChanges(vendorId);
  }

  // ── Edit ─────────────────────────────────────────────────────────────────

  openEdit(): void {
    const vendor = this.vendor();
    if (!this.canWrite() || !this.vendorReady() || !vendor) return;
    this.editForm.set(vendorFieldsGroup(vendor));
    this.editSubmitted.set(false);
    this.editFieldErrors.set({});
    this.editError.set(null);
    this.editOpen.set(true);
    // The Edit button is replaced by the form: land on its heading (ADR-0029 §8.7).
    this.focusAfterRender('#vendor-edit-title');
  }

  cancelEdit(): void {
    if (this.saving()) return;
    this.editOpen.set(false);
    this.focusAfterRender('[data-testid="vendor-edit"]');
  }

  saveEdit(event?: Event): void {
    event?.preventDefault();
    const vendor = this.vendor();
    const vendorId = this.vendorId();
    if (!this.canWrite() || !this.vendorReady() || !vendor || !vendorId || this.saving()) return;
    const form = this.editForm();
    this.editSubmitted.set(true);
    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }
    const raw = form.getRawValue();
    const seq = ++this.saveSeq;
    this.saving.set(true);
    this.editError.set(null);
    this.editFieldErrors.set({});
    this.notice.set(null);
    this.service
      .updateVendor(vendorId, {
        legalName: raw.legalName.trim(),
        displayName: raw.displayName.trim(),
        paymentTerms: termsOf(form),
        currency: raw.currency.trim().toUpperCase(),
        taxRegistrations: registrationsOf(form),
        version: vendor.version ?? 0,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          if (seq !== this.saveSeq) return;
          this.saving.set(false);
          this.vendor.set(updated);
          this.editOpen.set(false);
          this.notice.set({ key: 'POSITIVITY.VENDORS.EDIT.SAVED' });
          this.focusAfterRender('[data-testid="vendor-edit"]');
        },
        error: (err: unknown) => {
          if (seq !== this.saveSeq) return;
          this.saving.set(false);
          const failure = classifyVendorError(err, 'POSITIVITY.VENDORS.ERROR.SAVE', {
            writePermission: WRITE_PERMISSION,
            renders: field => VENDOR_FIELD_PATH.test(field),
            retryableKey: 'POSITIVITY.VENDORS.ERROR.RETRYABLE',
          });
          this.editError.set(failure.message);
          this.editFieldErrors.set(failure.fieldErrors);
          if (failure.reread) {
            this.rereadAfter(failure, vendorId);
          } else {
            this.focusAfterRender('[data-testid="vendor-edit-error"]');
          }
        },
      });
  }

  // ── Deactivate / Reactivate ──────────────────────────────────────────────

  openStatusDialog(): void {
    const vendor = this.vendor();
    if (!this.canWrite() || !this.vendorReady() || !vendor) return;
    this.statusReason.set('');
    this.statusError.set(null);
    this.statusReasonError.set(null);
    this.statusDialog.set(vendor.status === 'ACTIVE' ? 'DEACTIVATE' : 'REACTIVATE');
  }

  /** Esc or Cancel; `ModalDialogDirective` returns focus to the control that opened it. */
  closeStatusDialog(): void {
    if (this.statusBusy()) return;
    this.statusDialog.set(null);
    this.statusReason.set('');
    this.statusError.set(null);
    this.statusReasonError.set(null);
  }

  confirmStatus(event?: Event): void {
    event?.preventDefault();
    const mode = this.statusDialog();
    const vendorId = this.vendorId();
    if (!mode || !vendorId || !this.canWrite() || !this.vendorReady() || this.statusBusy() || !this.statusReasonValid()) return;
    const reason = this.statusReason().trim();
    const seq = ++this.statusSeq;
    this.statusBusy.set(true);
    this.statusError.set(null);
    this.statusReasonError.set(null);
    this.notice.set(null);
    const call =
      mode === 'DEACTIVATE' ? this.service.deactivateVendor(vendorId, reason) : this.service.reactivateVendor(vendorId, reason);
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: updated => {
        if (seq !== this.statusSeq) return;
        this.statusBusy.set(false);
        this.vendor.set(updated);
        this.statusDialog.set(null);
        this.statusReason.set('');
        this.notice.set({ key: mode === 'DEACTIVATE' ? 'POSITIVITY.VENDORS.STATUS_DIALOG.DEACTIVATED' : 'POSITIVITY.VENDORS.STATUS_DIALOG.REACTIVATED' });
        // The dialog returns focus to its opener, which stays (relabelled Reactivate / Deactivate).
      },
      error: (err: unknown) => {
        if (seq !== this.statusSeq) return;
        this.statusBusy.set(false);
        const failure = classifyVendorError(err, 'POSITIVITY.VENDORS.ERROR.STATUS_CHANGE', {
          writePermission: WRITE_PERMISSION,
          renders: field => field === 'reason',
          retryableKey: 'POSITIVITY.VENDORS.ERROR.RETRYABLE',
          staleKey: 'POSITIVITY.VENDORS.ERROR.STALE_STATUS',
        });
        if (failure.reread) {
          this.statusDialog.set(null);
          this.rereadAfter(failure, vendorId);
          return;
        }
        this.statusError.set(failure.message);
        this.statusReasonError.set(failure.fieldErrors['reason'] ?? null);
        this.focusAfterRender('[data-testid="vendor-status-error"]');
      },
    });
  }

  text(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  /** The remit-to section's write moved the server on: say so, read everything again, and land on the notice. */
  onRemitChanged(notice: VendorCopy | null): void {
    this.notice.set(notice);
    this.reload();
    this.focusNotice();
  }

  /** The reveal found the registration gone: say so and read the vendor again. */
  onRevealReread(notice: VendorCopy): void {
    this.onRemitChanged(notice);
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  private loadVendor(vendorId: string): void {
    const seq = ++this.vendorSeq;
    this.state.set('loading');
    this.errorKey.set(null);
    this.service
      .getVendorDetail(vendorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: vendor => {
          if (seq !== this.vendorSeq || this.vendorId() !== vendorId) return;
          this.vendor.set(vendor);
          this.state.set('ready');
          this.errorKey.set(null);
        },
        error: (err: unknown) => {
          if (seq !== this.vendorSeq || this.vendorId() !== vendorId) return;
          this.state.set('error');
          this.errorKey.set(classifyVendorError(err, 'POSITIVITY.VENDORS.ERROR.LOAD_DETAIL').message);
        },
      });
  }

  private loadChanges(vendorId: string): void {
    const seq = ++this.changesSeq;
    this.changesRead.set('PENDING');
    this.service
      .listRemitChanges(vendorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: changes => {
          if (seq !== this.changesSeq || this.vendorId() !== vendorId) return;
          this.changes.set(changes);
          this.changesRead.set('OK');
        },
        // ADR-0064 §2: keep what was shown; only the status flips.
        error: () => {
          if (seq !== this.changesSeq || this.vendorId() !== vendorId) return;
          this.changesRead.set('FAILED');
        },
      });
  }

  /** A write the server refused because its state moved on: say so, close the form, and read again. */
  private rereadAfter(failure: VendorFailure, vendorId: string): void {
    if (failure.code === 'STALE' && this.editOpen()) {
      // AC 11: the form keeps its message and shows the latest values after the re-read,
      // so the person checks and saves again.
      this.rereadIntoEdit(vendorId);
      this.loadChanges(vendorId);
      this.focusAfterRender('[data-testid="vendor-edit-error"]');
      return;
    }
    this.notice.set(failure.message);
    this.editOpen.set(false);
    this.reload();
    // The control that acted is gone or disabled during the re-read: land on the notice.
    this.focusNotice();
  }

  private rereadIntoEdit(vendorId: string): void {
    const seq = ++this.vendorSeq;
    this.service
      .getVendorDetail(vendorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: vendor => {
          if (seq !== this.vendorSeq || this.vendorId() !== vendorId) return;
          this.vendor.set(vendor);
          this.state.set('ready');
          this.errorKey.set(null);
          if (this.editOpen()) {
            this.editForm.set(vendorFieldsGroup(vendor));
            this.editSubmitted.set(false);
          }
        },
        error: (err: unknown) => {
          if (seq !== this.vendorSeq || this.vendorId() !== vendorId) return;
          this.editOpen.set(false);
          this.state.set('error');
          this.errorKey.set(classifyVendorError(err, 'POSITIVITY.VENDORS.ERROR.LOAD_DETAIL').message);
        },
      });
  }

  private resetAndLoad(): void {
    this.vendorSeq += 1;
    this.changesSeq += 1;
    this.saveSeq += 1;
    this.statusSeq += 1;
    this.saving.set(false);
    this.statusBusy.set(false);
    this.editOpen.set(false);
    this.statusDialog.set(null);
    this.statusReason.set('');
    this.notice.set(null);
    this.vendor.set(null);
    this.changes.set([]);
    this.changesRead.set('PENDING');
    this.state.set('idle');
    this.errorKey.set(null);
    this.reload();
  }

  private focusNotice(): void {
    this.focusAfterRender('[data-testid="vendor-notice-text"]', '#vendor-detail-title');
  }

  /** After the next render, focus the first of `selectors` present in this page (ADR-0029 §8.7). */
  private focusAfterRender(...selectors: string[]): void {
    afterNextRender(
      () => {
        for (const selector of selectors) {
          const element = this.host.nativeElement.querySelector<HTMLElement>(selector);
          if (element) {
            element.focus();
            return;
          }
        }
      },
      { injector: this.injector },
    );
  }
}
