import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { TranslatePipe } from '@ngx-translate/core';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { POSITIVITY_SECTION } from '../../../../core/security/route-permissions';
import { RemitToChange, VENDOR_NOTE_MIN, Vendor } from '../../models/supplier-vendor.models';
import { SupplierVendorService } from '../../services/supplier-vendor.service';
import { RemitToGroup, remitToGroup, remitToValues } from '../vendor-fields/vendor-form';
import { VendorRemitToFieldsComponent } from '../vendor-fields/vendor-remit-to-fields.component';
import { classifyVendorError } from '../../utils/supplier-vendor-error.util';
import { VendorCopy, compactRemitTo, displayActor, noteValid, remitToLines } from '../../utils/supplier-vendor.util';

type ReadStatus = 'PENDING' | 'OK' | 'FAILED';

let nextId = 0;

/**
 * A vendor's remit-to (CAP:550 S30, #469 item 5; §4.9 "a second person";
 * ADR-0070 Decision 7): the approved address and its version, the pending
 * change with Approve / Reject, **Request a change**, and the history.
 *
 * - Request a change (`supplier:vendor:write`) shows only once the changes read
 *   is `'OK'` and nothing is pending. A 409 `…REMIT_CHANGE_PENDING` re-reads.
 * - Approve and Reject (`supplier:vendor_remit:approve`) show only on a PENDING
 *   change. When the served requester is the signed-in `sub`, Approve stays
 *   visible, `aria-disabled`, with "You can't approve a change you requested"
 *   (P5) — a display hint only; the server's 403 is still classified.
 * - Every handler re-checks its code, the change's state and the hint at click
 *   time (ADR-0040 §6a). Each write emits `changed` so the page reads the vendor
 *   again: the remit-to and version shown are always the server's.
 */
@Component({
  selector: 'app-vendor-remit-to',
  standalone: true,
  imports: [DatePipe, TranslatePipe, ModalDialogDirective, VendorRemitToFieldsComponent],
  templateUrl: './vendor-remit-to.component.html',
  styleUrls: ['../../vendors-shared.css', './vendor-remit-to.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorRemitToComponent {
  private readonly service = inject(SupplierVendorService);
  private readonly destroyRef = inject(DestroyRef);

  readonly vendor = input.required<Vendor>();
  readonly changes = input.required<readonly RemitToChange[]>();
  readonly changesRead = input.required<ReadStatus>();
  readonly vendorReady = input.required<boolean>();
  readonly canWrite = input.required<boolean>();
  readonly canApprove = input.required<boolean>();
  /** The signed-in subject (JWT `sub`), for the self-approval hint. */
  readonly subject = input<string | null>(null);

  /** A write landed or the server refused it because its state moved on; the page reads again. */
  readonly changed = output<VendorCopy | null>();
  readonly retryChanges = output<void>();

  readonly id = `vendor-remit-${++nextId}`;
  readonly noteMin = VENDOR_NOTE_MIN;
  readonly lines = remitToLines;
  readonly actor = displayActor;

  private requestSeq = 0;
  private decideSeq = 0;

  private readonly requestBusy = signal(false);
  private readonly decideBusy = signal(false);
  /** One write in flight across the section (§8.2). */
  readonly busy = computed(() => this.requestBusy() || this.decideBusy());
  readonly requestOpen = signal(false);
  readonly requestForm = signal<RemitToGroup>(remitToGroup());
  readonly requestReason = signal('');
  readonly requestError = signal<VendorCopy | null>(null);
  readonly requestFieldErrors = signal<Readonly<Record<string, string>>>({});
  /** Bumped on the request form's value changes so OnPush validity re-reads. */
  private readonly requestRevision = signal(0);

  readonly verificationNote = signal('');
  readonly approveError = signal<VendorCopy | null>(null);
  readonly rejectOpen = signal(false);
  readonly rejectNote = signal('');
  readonly rejectError = signal<VendorCopy | null>(null);

  readonly pending = computed(() => this.changes().find(change => change.status === 'PENDING') ?? null);
  readonly history = computed(() => this.changes());

  /** Request a change: the write code, a settled vendor and changes read, and nothing pending. */
  readonly requestVisible = computed(
    () => this.canWrite() && this.vendorReady() && this.changesRead() === 'OK' && this.pending() === null,
  );
  /** The signed-in person requested the pending change (display hint; the server decides). */
  readonly selfRequested = computed(() => {
    const pending = this.pending();
    const subject = this.subject()?.trim();
    return !!pending && !!subject && pending.requestedBy?.trim() === subject;
  });
  readonly decideVisible = computed(() => this.canApprove() && this.changesRead() === 'OK' && this.pending() !== null);
  readonly approveAllowed = computed(() => this.decideVisible() && !this.selfRequested());

  readonly requestValid = computed(() => {
    this.requestRevision();
    return noteValid(this.requestReason()) && compactRemitTo(remitToValues(this.requestForm())) !== null;
  });
  readonly approveValid = computed(() => noteValid(this.verificationNote()));
  readonly rejectValid = computed(() => noteValid(this.rejectNote()));

  constructor() {
    toObservable(this.requestForm)
      .pipe(
        switchMap(form => form.valueChanges),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.requestRevision.update(value => value + 1));
    // Another vendor: whatever was in flight or typed belonged to the previous one (ADR-0063 §3).
    let trackedVendorId: string | null = null;
    effect(() => {
      const vendorId = this.vendor().vendorId;
      if (vendorId === trackedVendorId) return;
      trackedVendorId = vendorId;
      untracked(() => this.resetWrites());
    });
    // A decided or replaced pending change: its notes and errors no longer apply.
    let trackedChangeId: string | null = null;
    effect(() => {
      const changeId = this.pending()?.changeId ?? null;
      if (changeId === trackedChangeId) return;
      trackedChangeId = changeId;
      untracked(() => {
        this.decideSeq += 1;
        this.decideBusy.set(false);
        this.verificationNote.set('');
        this.approveError.set(null);
        this.rejectOpen.set(false);
        this.rejectNote.set('');
        this.rejectError.set(null);
      });
    });
  }

  // ── Request a change ─────────────────────────────────────────────────────

  openRequest(): void {
    if (!this.requestVisible() || this.busy()) return;
    const form = remitToGroup();
    const current = this.vendor().remitTo;
    if (current) {
      form.setValue({
        payeeName: current.payeeName ?? '',
        addressLine1: current.addressLine1 ?? '',
        addressLine2: current.addressLine2 ?? '',
        city: current.city ?? '',
        region: current.region ?? '',
        postalCode: current.postalCode ?? '',
        countryCode: current.countryCode ?? '',
        remittanceEmail: current.remittanceEmail ?? '',
      });
    }
    this.requestForm.set(form);
    this.requestReason.set('');
    this.requestError.set(null);
    this.requestFieldErrors.set({});
    this.requestOpen.set(true);
  }

  closeRequest(): void {
    if (this.busy()) return;
    this.requestOpen.set(false);
  }

  submitRequest(event?: Event): void {
    event?.preventDefault();
    // Re-checked at click time: the code, the reads, and that nothing became pending meanwhile.
    if (!this.requestVisible() || this.busy() || !this.requestValid()) return;
    const remitTo = compactRemitTo(remitToValues(this.requestForm()));
    if (!remitTo) return;
    const vendorId = this.vendor().vendorId;
    const seq = ++this.requestSeq;
    this.requestBusy.set(true);
    this.requestError.set(null);
    this.requestFieldErrors.set({});
    this.service
      .requestRemitChange(vendorId, remitTo, this.requestReason().trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (seq !== this.requestSeq) return;
          this.requestBusy.set(false);
          this.requestOpen.set(false);
          this.changed.emit({ key: 'POSITIVITY.VENDORS.REMIT.REQUESTED' });
        },
        error: (err: unknown) => {
          if (seq !== this.requestSeq) return;
          this.requestBusy.set(false);
          const failure = classifyVendorError(err, 'POSITIVITY.VENDORS.ERROR.REMIT_REQUEST', POSITIVITY_SECTION.vendorWrite[0]);
          if (failure.reread) {
            // AC 6: a change is already pending — close, and the re-read shows it.
            this.requestOpen.set(false);
            this.changed.emit(failure.message);
            return;
          }
          this.requestError.set(failure.message);
          this.requestFieldErrors.set(failure.fieldErrors);
        },
      });
  }

  // ── Approve / Reject ─────────────────────────────────────────────────────

  approve(event?: Event): void {
    event?.preventDefault();
    const pending = this.pending();
    if (!pending || !this.approveAllowed() || this.busy() || !this.approveValid()) return;
    this.decide(pending, 'APPROVE', this.verificationNote().trim());
  }

  openReject(): void {
    if (!this.decideVisible() || this.busy()) return;
    this.rejectNote.set('');
    this.rejectError.set(null);
    this.rejectOpen.set(true);
  }

  closeReject(): void {
    if (this.busy()) return;
    this.rejectOpen.set(false);
  }

  confirmReject(event?: Event): void {
    event?.preventDefault();
    const pending = this.pending();
    if (!pending || !this.decideVisible() || this.busy() || !this.rejectValid()) return;
    this.decide(pending, 'REJECT', this.rejectNote().trim());
  }

  text(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  private decide(pending: RemitToChange, kind: 'APPROVE' | 'REJECT', note: string): void {
    const vendorId = this.vendor().vendorId;
    const seq = ++this.decideSeq;
    this.decideBusy.set(true);
    this.approveError.set(null);
    this.rejectError.set(null);
    const call =
      kind === 'APPROVE'
        ? this.service.approveRemitChange(vendorId, pending.changeId, note)
        : this.service.rejectRemitChange(vendorId, pending.changeId, note);
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        if (seq !== this.decideSeq) return;
        this.decideBusy.set(false);
        this.rejectOpen.set(false);
        this.verificationNote.set('');
        this.changed.emit({ key: kind === 'APPROVE' ? 'POSITIVITY.VENDORS.REMIT.APPROVED' : 'POSITIVITY.VENDORS.REMIT.REJECTED' });
      },
      error: (err: unknown) => {
        if (seq !== this.decideSeq) return;
        this.decideBusy.set(false);
        const failure = classifyVendorError(err, 'POSITIVITY.VENDORS.ERROR.REMIT_DECIDE', POSITIVITY_SECTION.vendorRemitApprove[0]);
        if (failure.reread) {
          // Someone else decided it first: close, and the re-read shows the decision.
          this.rejectOpen.set(false);
          this.changed.emit(failure.message);
          return;
        }
        if (kind === 'APPROVE') this.approveError.set(failure.message);
        else this.rejectError.set(failure.message);
      },
    });
  }

  private resetWrites(): void {
    this.requestSeq += 1;
    this.decideSeq += 1;
    this.requestBusy.set(false);
    this.decideBusy.set(false);
    this.requestOpen.set(false);
    this.requestReason.set('');
    this.requestError.set(null);
    this.verificationNote.set('');
    this.approveError.set(null);
    this.rejectOpen.set(false);
    this.rejectNote.set('');
    this.rejectError.set(null);
  }
}
