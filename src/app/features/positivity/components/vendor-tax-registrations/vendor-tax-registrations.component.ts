import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnDestroy,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { POSITIVITY_SECTION } from '../../../../core/security/route-permissions';
import { RevealedTaxRegistration, TaxRegistration, VENDOR_NOTE_MIN, VENDOR_REVEAL_REASON_MAX } from '../../models/supplier-vendor.models';
import { SupplierVendorService } from '../../services/supplier-vendor.service';
import { classifyVendorError } from '../../utils/supplier-vendor-error.util';
import { VendorCopy, noteValid } from '../../utils/supplier-vendor.util';

let nextId = 0;

/** C0 controls and DEL, which the reveal endpoint refuses in a reason. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly vendorId = input.required<string>();
  readonly registrations = input.required<readonly TaxRegistration[]>();
  /** `supplier:vendor_tax_id:reveal`, decided by the page. */
  readonly canReveal = input.required<boolean>();

  /** The server's state moved on (the registration is gone): the page says so and reads the vendor again. */
  readonly reread = output<VendorCopy>();

  readonly id = `vendor-tax-${++nextId}`;
  readonly reasonMin = VENDOR_NOTE_MIN;
  readonly reasonMax = VENDOR_REVEAL_REASON_MAX;

  private revealSeq = 0;

  /** The registration whose dialog is open. */
  readonly target = signal<TaxRegistration | null>(null);
  readonly reason = signal('');
  readonly busy = signal(false);
  readonly error = signal<VendorCopy | null>(null);
  /** The server refused the reason itself (e.g. it contains the number). */
  readonly reasonError = signal<string | null>(null);
  /** RESTRICTED: the revealed number, only while the dialog is open. */
  readonly revealed = signal<RevealedTaxRegistration | null>(null);

  /** 10–500 characters on one line: the server refuses control characters in the reason. */
  readonly reasonValid = computed(
    () => noteValid(this.reason(), VENDOR_NOTE_MIN, VENDOR_REVEAL_REASON_MAX) && !CONTROL_CHARACTER.test(this.reason()),
  );
  readonly reasonHasControl = computed(() => CONTROL_CHARACTER.test(this.reason()));

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
    this.reasonError.set(null);
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
          const failure = classifyVendorError(err, 'POSITIVITY.VENDORS.ERROR.REVEAL', {
            writePermission: POSITIVITY_SECTION.vendorTaxIdReveal[0],
            renders: field => field === 'reason',
            fieldKeys: { reason: 'POSITIVITY.VENDORS.ERROR.FIELD.REVEAL_REASON' },
            retryableKey: 'POSITIVITY.VENDORS.ERROR.REVEAL_RETRYABLE',
          });
          // A timeout reveals nothing and changes no vendor: say so in the dialog and let them try again.
          // Anything else that moved the server on closes the dialog and has the page read again.
          if (failure.reread && failure.code !== 'RETRYABLE') {
            this.clear();
            this.reread.emit(failure.message);
            return;
          }
          this.error.set(failure.message);
          this.reasonError.set(failure.fieldErrors['reason'] ?? null);
          afterNextRender(
            () => this.host.nativeElement.querySelector<HTMLElement>(`#${this.id}-error`)?.focus(),
            { injector: this.injector },
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
    this.reasonError.set(null);
  }
}
