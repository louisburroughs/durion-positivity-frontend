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
import { DOCUMENT } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { POSITIVITY_PAGE } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { SupplierStatusChipComponent } from '../../components/supplier-status-chip/supplier-status-chip.component';
import { SupplierVendorPickerComponent } from '../../components/supplier-vendor-picker/supplier-vendor-picker.component';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  VendorProfileRequest,
  VendorProfileSummary,
} from '../../models/supplier-profile.models';
import { mapSupplierError } from '../../utils/supplier-error.util';
import { supplierIdentityKey } from '../../utils/supplier-identity.util';

type PageState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

/**
 * Supplier connectivity landing page: every vendor profile in this deployment.
 *
 * Profiles are per-deployment configuration (ADR-0050 §2), so this list is the
 * entry point for onboarding a vendor without database surgery. Creating a
 * profile happens here; auth configs, accounts, bindings, health, and PRICAT are
 * managed on the detail screen.
 *
 * Every profile belongs to one pos-supplier vendor (backend S23, #484): the
 * create form requires one, chosen from the tenant's active vendors, and the
 * list shows each profile's vendor number and name.
 *
 * YAML-managed profiles are listed and readable but not editable — the admin API
 * rejects writes to them by design, so the UI states the reason rather than
 * offering a control that will fail (ADR-0050 §6).
 */
@Component({
  selector: 'app-supplier-profile-list-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    SupplierStatusChipComponent,
    SupplierVendorPickerComponent,
  ],
  templateUrl: './supplier-profile-list-page.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-profile-list-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierProfileListPageComponent {
  private readonly service = inject(SupplierProfileService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);

  /**
   * Monotonic per-writer sequences (ADR-0063): a list or create callback
   * applies only while its sequence is still the latest issued. An identity
   * change moves both on, so nothing the previous identity started can land.
   */
  private listSeq = 0;
  private createSeq = 0;

  /** `tid|sub`, each half percent-encoded. */
  private readonly identity = computed(() =>
    supplierIdentityKey(this.auth.tenantId(), this.auth.currentUserClaims()?.sub),
  );
  private trackedIdentity = this.identity();

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly profiles = signal<VendorProfileSummary[]>([]);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly fieldDetails = signal<Record<string, string>>({});
  readonly createOpen = signal(false);
  readonly saving = signal(false);
  /**
   * `?vendorId=` (CAP:550 S30): only that vendor's connections, as the vendor
   * page's Connections section reads them. The id is used for the read only and
   * never rendered (P8).
   */
  readonly vendorFilter = signal<string | null>(null);

  /**
   * `supplier:profile:write` (ADR-0040 §6a). The page is admitted on the read
   * permission, which never enables a write. A token without `perm_bits` leaves
   * permissions unknown and keeps the legacy open behaviour, as `canAccess()` does.
   */
  readonly canWrite = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(POSITIVITY_PAGE.profileWrite),
  );

  readonly createForm = new FormGroup({
    vendorId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    supplierRef: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    displayName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    sandbox: new FormControl(false, { nonNullable: true }),
    enabled: new FormControl(true, { nonNullable: true }),
  });

  constructor() {
    // ADR-0063 §7: a token for another tenant or person while the page stays
    // mounted drops every read and write in flight and clears what the previous
    // identity loaded, then reads again — whether or not the form is open.
    effect(() => {
      const identity = this.identity();
      if (identity === this.trackedIdentity) return;
      this.trackedIdentity = identity;
      untracked(() => {
        this.resetForIdentity();
        this.load();
      });
    });
    this.route.queryParamMap
      .pipe(
        map(params => params.get('vendorId')?.trim() || null),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(vendorId => {
        this.vendorFilter.set(vendorId);
        this.load();
      });
  }

  fieldError(field: string): string | null {
    return this.fieldErrors()[field] ?? null;
  }

  /** Backend detail text for a field. Server data — rendered beneath the translated label only. */
  fieldDetail(field: string): string | null {
    return this.fieldDetails()[field] ?? null;
  }

  /** Drop field feedback — e.g. when it came from a previous identity's submission. */
  clearFieldFeedback(): void {
    this.fieldErrors.set({});
    this.fieldDetails.set({});
  }

  load(): void {
    const seq = ++this.listSeq;
    this.state.set('loading');
    this.errorKey.set(null);

    this.service
      .listProfiles(this.vendorFilter() ?? undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: profiles => {
          if (seq !== this.listSeq) return;
          this.profiles.set(profiles);
          this.state.set(profiles.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          if (seq !== this.listSeq) return;
          const outcome = mapSupplierError(err, 'POSITIVITY.PROFILES.ERROR.LOAD');
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }

  /** Drops every list and create callback in flight and clears all page state. */
  private resetForIdentity(): void {
    const active = this.document.activeElement;
    const focusInside = !!active && active !== this.document.body && this.host.nativeElement.contains(active);
    this.listSeq += 1;
    this.createSeq += 1;
    this.saving.set(false);
    this.createOpen.set(false);
    this.createForm.reset({ vendorId: '', supplierRef: '', displayName: '', sandbox: false, enabled: true });
    this.clearFieldFeedback();
    this.profiles.set([]);
    this.errorKey.set(null);
    this.state.set('idle');
    if (focusInside) {
      // The control that held focus may be gone with the form (ADR-0029 §8).
      afterNextRender(() => this.focusTitleIfLost(), { injector: this.injector });
    }
  }

  private focusTitleIfLost(): void {
    const active = this.document.activeElement;
    if (!active || active === this.document.body || !this.host.nativeElement.contains(active)) {
      this.host.nativeElement.querySelector<HTMLElement>('#profiles-page-title')?.focus();
    }
  }

  openCreate(): void {
    if (!this.canWrite()) {
      return;
    }
    this.fieldErrors.set({});
    this.fieldDetails.set({});
    this.createForm.reset({ vendorId: '', supplierRef: '', displayName: '', sandbox: false, enabled: true });
    this.createOpen.set(true);
  }

  cancelCreate(): void {
    this.createOpen.set(false);
    this.fieldErrors.set({});
    this.fieldDetails.set({});
  }

  create(): void {
    if (!this.canWrite()) {
      return;
    }
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    const raw = this.createForm.getRawValue();
    const request: VendorProfileRequest = {
      vendorId: raw.vendorId,
      supplierRef: raw.supplierRef.trim(),
      displayName: raw.displayName.trim(),
      sandbox: raw.sandbox,
      enabled: raw.enabled,
    };

    const seq = ++this.createSeq;
    this.saving.set(true);
    this.fieldErrors.set({});
    this.fieldDetails.set({});

    this.service
      .createProfile(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (seq !== this.createSeq) return;
          this.saving.set(false);
          this.createOpen.set(false);
          this.errorKey.set(null);
          this.load();
        },
        error: (err: unknown) => {
          if (seq !== this.createSeq) return;
          this.saving.set(false);
          const outcome = mapSupplierError(err, 'POSITIVITY.PROFILES.ERROR.CREATE');
          this.state.set('error');
          this.errorKey.set(outcome.errorKey);
          this.fieldErrors.set(outcome.fieldErrors);
          this.fieldDetails.set(outcome.fieldDetails);
        },
      });
  }
}
