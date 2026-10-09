import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { POSITIVITY_SECTION } from '../../../../core/security/route-permissions';
import { RevealedTaxRegistration, TaxRegistration, VENDOR_NOTE_MIN, VENDOR_REVEAL_REASON_MAX } from '../../models/supplier-vendor.models';
import { SupplierVendorService } from '../../services/supplier-vendor.service';
import { classifyVendorError } from '../../utils/supplier-vendor-error.util';
import { VendorCopy, noteValid } from '../../utils/supplier-vendor.util';

let nextId = 0;

/**
 * A vendor's tax registrations, masked (backend #2621; ADR-0072 RESTRICTED):
 * scheme, region and "•••• 1234", or "on file" when the number is too short to
 * have a `last4`.
 *
 * **Reveal** shows only with `supplier:vendor_tax_id:reveal` (ADMIN and
 * CONTROLLER) and asks for a reason of 10–500 characters; the server records who,
 * their roles and why before it answers. The number lives only in this
 * component's `revealed` signal while the dialog is open: closing the dialog, a
 * different vendor, or leaving the page clears it. It is never cached, logged,
 * put in a URL, or offered to any other component.
 */
@Component({
  selector: 'app-vendor-tax-registrations',
  standalone: true,
  imports: [TranslatePipe, ModalDialogDirective],
  templateUrl: './vendor-tax-registrations.component.html',
  styleUrls: ['../../vendors-shared.css', './vendor-tax-registrations.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorTaxRegistrationsComponent implements OnDestroy {
  private readonly service = inject(SupplierVendorService);
  private readonly destroyRef = inject(DestroyRef);

  readonly vendorId = input.required<string>();
  readonly registrations = input.required<readonly TaxRegistration[]>();
  /** `supplier:vendor_tax_id:reveal`, decided by the page. */
  readonly canReveal = input.required<boolean>();

  readonly id = `vendor-tax-${++nextId}`;
  readonly reasonMin = VENDOR_NOTE_MIN;
  readonly reasonMax = VENDOR_REVEAL_REASON_MAX;

  private revealSeq = 0;

  /** The registration whose dialog is open. */
  readonly target = signal<TaxRegistration | null>(null);
  readonly reason = signal('');
  readonly busy = signal(false);
  readonly error = signal<VendorCopy | null>(null);
  /** RESTRICTED: the revealed number, only while the dialog is open. */
  readonly revealed = signal<RevealedTaxRegistration | null>(null);

  readonly reasonValid = computed(() => noteValid(this.reason(), VENDOR_NOTE_MIN, VENDOR_REVEAL_REASON_MAX));

  constructor() {
    let trackedVendorId: string | null = null;
    effect(() => {
      const vendorId = this.vendorId();
      if (vendorId === trackedVendorId) return;
      trackedVendorId = vendorId;
      untracked(() => this.clear());
    });
  }

  openReveal(registration: TaxRegistration): void {
    if (!this.canReveal() || this.busy()) return;
    this.clear();
    this.target.set(registration);
  }

  closeReveal(): void {
    if (this.busy()) return;
    this.clear();
  }

  reveal(event?: Event): void {
    event?.preventDefault();
    const target = this.target();
    if (!target || !this.canReveal() || this.busy() || this.revealed() || !this.reasonValid()) return;
    const seq = ++this.revealSeq;
    this.busy.set(true);
    this.error.set(null);
    this.service
      .revealTaxRegistration(this.vendorId(), target.registrationId, this.reason().trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: revealed => {
          if (seq !== this.revealSeq) return;
          this.busy.set(false);
          this.revealed.set(revealed);
        },
        error: (err: unknown) => {
          if (seq !== this.revealSeq) return;
          this.busy.set(false);
          this.error.set(
            classifyVendorError(err, 'POSITIVITY.VENDORS.ERROR.REVEAL', POSITIVITY_SECTION.vendorTaxIdReveal[0]).message,
          );
        },
      });
  }

  text(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  ngOnDestroy(): void {
    this.revealSeq += 1;
    this.revealed.set(null);
  }

  /** Drops the number, the reason and any reveal in flight. */
  private clear(): void {
    this.revealSeq += 1;
    this.busy.set(false);
    this.revealed.set(null);
    this.target.set(null);
    this.reason.set('');
    this.error.set(null);
  }
}
