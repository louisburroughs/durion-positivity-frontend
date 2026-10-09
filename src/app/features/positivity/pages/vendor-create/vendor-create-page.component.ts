import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { POSITIVITY_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { VendorFieldsComponent } from '../../components/vendor-fields/vendor-fields.component';
import {
  VENDOR_NUMBER_MAX,
  registrationsOf,
  remitToGroup,
  remitToValues,
  termsOf,
  vendorFieldsGroup,
} from '../../components/vendor-fields/vendor-form';
import { VendorRemitToFieldsComponent } from '../../components/vendor-fields/vendor-remit-to-fields.component';
import { Vendor, VendorCreateInput } from '../../models/supplier-vendor.models';
import { SupplierVendorService } from '../../services/supplier-vendor.service';
import { VendorAnnouncerService } from '../../services/vendor-announcer.service';
import { VendorFailure, classifyVendorError } from '../../utils/supplier-vendor-error.util';
import { VendorCopy, compactRemitTo, safeVendorReturnTo } from '../../utils/supplier-vendor.util';
import { supplierIdentityKey } from '../../utils/supplier-identity.util';

type PageState = 'ready' | 'error';

/** The permission Add vendor's command enforces, named by a 403. */
const WRITE_PERMISSION = POSITIVITY_SECTION.vendorWrite[0];

/**
 * Add vendor (CAP:550 S30, #469 items 3–4): pos-supplier's vendor form, also
 * opened from Bills to pay as `vendors/new?returnTo=…`.
 *
 * - The route admits on `supplier:vendor:write`; the submit re-checks it (ADR-0040 §6a).
 * - A blank vendor number is omitted and the server numbers the vendor (V-000123).
 * - The consequence sentence — naming the first-bill rule — precedes the button (P4, §4.9).
 * - `returnTo` is honoured only when `safeVendorReturnTo` accepts it (ADR-0037);
 *   otherwise the page goes to the new vendor's detail. Cancel follows the same rule.
 * - One submit in flight. S23's create is not keyed, so a timeout re-reads the
 *   vendors matching what was typed before Add vendor is offered again (§8.2).
 */
@Component({
  selector: 'app-vendor-create-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, VendorFieldsComponent, VendorRemitToFieldsComponent],
  templateUrl: './vendor-create-page.component.html',
  styleUrls: ['../../vendors-shared.css', './vendor-create-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorCreatePageComponent {
  private readonly service = inject(SupplierVendorService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly announcer = inject(VendorAnnouncerService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly identity = computed(() => supplierIdentityKey(this.auth.tenantId(), this.auth.currentUserClaims()?.sub));
  private trackedIdentity = this.identity();
  private saveSeq = 0;
  private checkSeq = 0;

  /** The validated return path, or null to fall back (never the raw query value). */
  readonly returnTo = safeVendorReturnTo(this.route.snapshot.queryParamMap.get('returnTo'));
  readonly numberMax = VENDOR_NUMBER_MAX;

  readonly vendorNumber = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(VENDOR_NUMBER_MAX)] });
  readonly fields = vendorFieldsGroup();
  readonly remitTo = remitToGroup();

  readonly state = signal<PageState>('ready');
  readonly errorKey = signal<VendorCopy | null>(null);
  /** One submit in flight (§8.2). */
  readonly saving = signal(false);
  readonly fieldErrors = signal<Readonly<Record<string, string>>>({});
  /** The number the server refused as taken, for the field's message. */
  readonly takenNumber = signal<string | null>(null);
  readonly submitted = signal(false);
  /** After an unconfirmed create: vendors matching what was typed, read before Add vendor is offered again. */
  readonly possibleMatches = signal<readonly Vendor[] | null>(null);
  readonly checking = signal(false);

  readonly canWrite = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(POSITIVITY_SECTION.vendorWrite),
  );

  constructor() {
    // ADR-0063 §7: another tenant or person — whatever was in flight answered the previous one.
    effect(() => {
      const identity = this.identity();
      if (identity === this.trackedIdentity) return;
      this.trackedIdentity = identity;
      untracked(() => {
        this.saveSeq += 1;
        this.checkSeq += 1;
        this.saving.set(false);
        this.checking.set(false);
        this.possibleMatches.set(null);
        this.fieldErrors.set({});
        this.state.set('ready');
        this.errorKey.set(null);
      });
    });
  }

  submit(event?: Event): void {
    event?.preventDefault();
    if (!this.canWrite() || this.saving() || this.checking()) return;
    this.submitted.set(true);
    if (this.vendorNumber.invalid || this.fields.invalid) {
      this.vendorNumber.markAsTouched();
      this.fields.markAllAsTouched();
      return;
    }

    const input = this.buildInput();
    const seq = ++this.saveSeq;
    this.saving.set(true);
    this.state.set('ready');
    this.errorKey.set(null);
    this.fieldErrors.set({});
    this.takenNumber.set(null);
    this.possibleMatches.set(null);

    this.service
      .createVendor(input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: vendor => {
          if (seq !== this.saveSeq) return;
          this.saving.set(false);
          this.state.set('ready');
          this.errorKey.set(null);
          this.announcer.announce(this.translate.instant('POSITIVITY.VENDORS.CREATE.ADDED', { number: vendor.vendorNumber }));
          if (this.returnTo) {
            void this.router.navigateByUrl(this.returnTo);
          } else {
            void this.router.navigate(['/app', 'positivity', 'vendors', vendor.vendorId]);
          }
        },
        error: (err: unknown) => {
          if (seq !== this.saveSeq) return;
          this.saving.set(false);
          this.fail(classifyVendorError(err, 'POSITIVITY.VENDORS.ERROR.CREATE', WRITE_PERMISSION), input);
        },
      });
  }

  cancel(): void {
    if (this.returnTo) {
      void this.router.navigateByUrl(this.returnTo);
    } else {
      void this.router.navigate(['/app', 'positivity', 'vendors']);
    }
  }

  numberError(): VendorCopy | null {
    const key = this.fieldErrors()['vendorNumber'];
    if (!key) return null;
    return { key, params: { number: this.takenNumber() ?? '' } };
  }

  private buildInput(): VendorCreateInput {
    const raw = this.fields.getRawValue();
    const number = this.vendorNumber.value.trim().toUpperCase();
    const remitTo = compactRemitTo(remitToValues(this.remitTo));
    return {
      vendorNumber: number || undefined,
      legalName: raw.legalName.trim(),
      displayName: raw.displayName.trim(),
      paymentTerms: termsOf(this.fields),
      currency: raw.currency.trim().toUpperCase(),
      taxRegistrations: registrationsOf(this.fields),
      remitTo: remitTo ?? undefined,
    };
  }

  private fail(failure: VendorFailure, input: VendorCreateInput): void {
    this.state.set('error');
    this.errorKey.set(failure.code === 'RETRYABLE' ? { key: 'POSITIVITY.VENDORS.CREATE.UNCONFIRMED' } : failure.message);
    this.fieldErrors.set(failure.fieldErrors);
    if (failure.code === 'NUMBER_TAKEN') this.takenNumber.set(input.vendorNumber ?? null);
    if (failure.code === 'RETRYABLE') this.checkForCreated(input);
  }

  /** The create may have landed: read the vendors matching what was typed before offering Add vendor again. */
  private checkForCreated(input: VendorCreateInput): void {
    const seq = ++this.checkSeq;
    this.checking.set(true);
    this.service
      .listVendors(input.vendorNumber ?? input.displayName, undefined, 0, 10)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: page => {
          if (seq !== this.checkSeq) return;
          this.checking.set(false);
          this.possibleMatches.set(page.items);
        },
        error: () => {
          if (seq !== this.checkSeq) return;
          this.checking.set(false);
          this.possibleMatches.set([]);
        },
      });
  }
}
