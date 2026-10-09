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
import { EMPTY, Observable, throwError } from 'rxjs';
import { expand, map, reduce } from 'rxjs/operators';
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
import { Vendor, VendorCreateInput, VendorPage } from '../../models/supplier-vendor.models';
import { SupplierVendorService } from '../../services/supplier-vendor.service';
import { VendorAnnouncerService } from '../../services/vendor-announcer.service';
import { REMIT_FIELD_PATH, VENDOR_FIELD_PATH, VendorFailure, classifyVendorError } from '../../utils/supplier-vendor-error.util';
import { VendorCopy, compactRemitTo, safeVendorReturnTo } from '../../utils/supplier-vendor.util';
import { supplierIdentityKey } from '../../utils/supplier-identity.util';

type PageState = 'ready' | 'error';
/**
 * After an unconfirmed create, the duplicate check (review A1/B2):
 * `checking` → `done` (with the exact matches, possibly none) or `failed`.
 * Add vendor stays blocked while `checking` or `failed`.
 */
type CheckState = 'idle' | 'checking' | 'done' | 'failed';

/** The permission Add vendor's command enforces, named by a 403. */
const WRITE_PERMISSION = POSITIVITY_SECTION.vendorWrite[0];
/** The duplicate check reads at the largest page size the list accepts… */
const CHECK_PAGE_SIZE = 200;
/** …and every page up to this bound; more than that and it cannot vouch for "no match". */
export const MAX_CHECK_PAGES = 10;

/** The paths this form renders a message for. */
const RENDERED = (field: string): boolean => field === 'vendorNumber' || VENDOR_FIELD_PATH.test(field) || REMIT_FIELD_PATH.test(field);

const same = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a?.trim() && !!b?.trim() && a.trim().toLocaleUpperCase() === b.trim().toLocaleUpperCase();

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
 *   vendors that exactly match what was typed before Add vendor is offered
 *   again (§8.2). A check that cannot read keeps Add vendor blocked and offers
 *   **Check again** — it never reports "no match" it did not see.
 * - A `tid|sub` change drops everything typed, including tax-registration
 *   numbers (ADR-0063 §7, ADR-0072).
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  private readonly identity = computed(() => supplierIdentityKey(this.auth.tenantId(), this.auth.currentUserClaims()?.sub));
  private trackedIdentity = this.identity();
  private saveSeq = 0;
  private checkSeq = 0;
  /** What the unconfirmed create sent, for Check again. */
  private unconfirmed: VendorCreateInput | null = null;

  /** The validated return path, or null to fall back (never the raw query value). */
  readonly returnTo = safeVendorReturnTo(this.route.snapshot.queryParamMap.get('returnTo'));
  readonly numberMax = VENDOR_NUMBER_MAX;

  readonly vendorNumber = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(VENDOR_NUMBER_MAX)] });
  readonly fields = signal(vendorFieldsGroup());
  readonly remitTo = signal(remitToGroup());

  readonly state = signal<PageState>('ready');
  readonly errorKey = signal<VendorCopy | null>(null);
  /** One submit in flight (§8.2). */
  readonly saving = signal(false);
  readonly fieldErrors = signal<Readonly<Record<string, string>>>({});
  /** The number the server refused as taken, for the field's message. */
  readonly takenNumber = signal<string | null>(null);
  readonly submitted = signal(false);
  readonly checkState = signal<CheckState>('idle');
  /** Vendors exactly matching what the unconfirmed create sent. */
  readonly possibleMatches = signal<readonly Vendor[]>([]);
  readonly checking = computed(() => this.checkState() === 'checking');
  /** Add vendor is blocked while a create may have landed and that is not yet known. */
  readonly addBlocked = computed(() => this.saving() || this.checkState() === 'checking' || this.checkState() === 'failed');

  readonly canWrite = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(POSITIVITY_SECTION.vendorWrite),
  );

  constructor() {
    // ADR-0063 §7: another tenant or person — whatever was in flight or typed belonged to the previous one.
    effect(() => {
      const identity = this.identity();
      if (identity === this.trackedIdentity) return;
      this.trackedIdentity = identity;
      untracked(() => this.resetForIdentity());
    });
  }

  submit(event?: Event): void {
    event?.preventDefault();
    if (!this.canWrite() || this.addBlocked()) return;
    this.submitted.set(true);
    const fields = this.fields();
    if (this.vendorNumber.invalid || fields.invalid) {
      this.vendorNumber.markAsTouched();
      fields.markAllAsTouched();
      return;
    }

    const input = this.buildInput();
    const seq = ++this.saveSeq;
    this.saving.set(true);
    this.state.set('ready');
    this.errorKey.set(null);
    this.fieldErrors.set({});
    this.takenNumber.set(null);
    this.checkState.set('idle');
    this.possibleMatches.set([]);

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
          this.fail(
            classifyVendorError(err, 'POSITIVITY.VENDORS.ERROR.CREATE', {
              writePermission: WRITE_PERMISSION,
              renders: RENDERED,
              retryableKey: 'POSITIVITY.VENDORS.CREATE.UNCONFIRMED',
            }),
            input,
          );
        },
      });
  }

  /** Check again: read the matching vendors once more. */
  retryCheck(): void {
    if (this.unconfirmed && this.checkState() === 'failed') this.checkForCreated(this.unconfirmed);
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
    const fields = this.fields();
    const raw = fields.getRawValue();
    const number = this.vendorNumber.value.trim().toUpperCase();
    const remitTo = compactRemitTo(remitToValues(this.remitTo()));
    return {
      vendorNumber: number || undefined,
      legalName: raw.legalName.trim(),
      displayName: raw.displayName.trim(),
      paymentTerms: termsOf(fields),
      currency: raw.currency.trim().toUpperCase(),
      taxRegistrations: registrationsOf(fields),
      remitTo: remitTo ?? undefined,
    };
  }

  private fail(failure: VendorFailure, input: VendorCreateInput): void {
    this.state.set('error');
    this.errorKey.set(failure.message);
    this.fieldErrors.set(failure.fieldErrors);
    if (failure.code === 'NUMBER_TAKEN') this.takenNumber.set(input.vendorNumber ?? null);
    // The submit button is disabled while saving, which drops focus: move it to the message
    // (a failed duplicate check, scheduled after this, moves it on to its own message).
    this.focusAfterRender('[data-testid="vendor-create-error"]');
    if (failure.code === 'RETRYABLE') {
      this.unconfirmed = input;
      this.checkForCreated(input);
    }
  }

  /**
   * The create may have landed: read the vendors that could be it and keep the
   * exact matches — the typed number, or the legal or display name. The list is
   * ordered by `vendorNumber`, and a typed number (WALMART, V-999999) can sort
   * anywhere among the server's `V-000123` numbers, so every page is read, up
   * to `MAX_CHECK_PAGES`. A result past that bound fails the check rather than
   * report a "no match" it did not see.
   */
  private checkForCreated(input: VendorCreateInput): void {
    const seq = ++this.checkSeq;
    this.checkState.set('checking');
    this.possibleMatches.set([]);
    const q = input.vendorNumber ?? input.displayName;
    this.readCandidates(q)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: candidates => {
          if (seq !== this.checkSeq) return;
          const exact = candidates.filter(
            vendor =>
              same(vendor.vendorNumber, input.vendorNumber) ||
              same(vendor.legalName, input.legalName) ||
              same(vendor.displayName, input.displayName),
          );
          this.possibleMatches.set(exact);
          this.checkState.set('done');
          // Check again was the focused control and is gone now: land on the outcome (ADR-0029 §8.7).
          this.focusAfterRender('[data-testid="vendor-create-matches"]');
        },
        error: () => {
          if (seq !== this.checkSeq) return;
          this.possibleMatches.set([]);
          this.checkState.set('failed');
          this.focusAfterRender('[data-testid="vendor-create-check-failed"]');
        },
      });
  }

  private readCandidates(q: string): Observable<Vendor[]> {
    const read = (index: number): Observable<{ index: number; page: VendorPage }> =>
      this.service.listVendors(q, undefined, index, CHECK_PAGE_SIZE).pipe(map(page => ({ index, page })));
    return read(0).pipe(
      expand(({ index, page }) => {
        const next = index + 1;
        if (page.items.length === 0 || next >= page.totalPages) return EMPTY;
        return next < MAX_CHECK_PAGES ? read(next) : throwError(() => new Error('duplicate check exceeded its page bound'));
      }),
      map(({ page }) => page.items),
      reduce((all: Vendor[], items) => [...all, ...items], [] as Vendor[]),
    );
  }

  private resetForIdentity(): void {
    this.saveSeq += 1;
    this.checkSeq += 1;
    this.unconfirmed = null;
    this.saving.set(false);
    this.checkState.set('idle');
    this.possibleMatches.set([]);
    this.vendorNumber.reset('');
    this.fields.set(vendorFieldsGroup());
    this.remitTo.set(remitToGroup());
    this.submitted.set(false);
    this.takenNumber.set(null);
    this.fieldErrors.set({});
    this.state.set('ready');
    this.errorKey.set(null);
  }

  private focusAfterRender(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }
}
