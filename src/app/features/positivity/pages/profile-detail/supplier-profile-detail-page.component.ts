import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { POSITIVITY_PAGE } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { distinctUntilChanged, map } from 'rxjs';
import { SupplierAccountsPanelComponent } from '../../components/supplier-accounts-panel/supplier-accounts-panel.component';
import { SupplierAuthPanelComponent } from '../../components/supplier-auth-panel/supplier-auth-panel.component';
import { SupplierBindingsPanelComponent } from '../../components/supplier-bindings-panel/supplier-bindings-panel.component';
import { SupplierHealthPanelComponent } from '../../components/supplier-health-panel/supplier-health-panel.component';
import { SupplierPriceCatalogPanelComponent } from '../../components/supplier-pricecat-panel/supplier-pricecat-panel.component';
import { SupplierStockSnapshotPanelComponent } from '../../components/supplier-stock-snapshot-panel/supplier-stock-snapshot-panel.component';
import { SupplierStatusChipComponent } from '../../components/supplier-status-chip/supplier-status-chip.component';
import {
  SupplierCurrentVendor,
  SupplierVendorPickerComponent,
} from '../../components/supplier-vendor-picker/supplier-vendor-picker.component';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  SupplierRetryBackoff,
  VendorProfile,
  VendorProfileRequest,
} from '../../models/supplier-profile.models';
import { mapSupplierError } from '../../utils/supplier-error.util';
import { SUPPLIER_RETRY_BACKOFFS } from '../../utils/supplier-capability-keys';

type PageState = 'idle' | 'loading' | 'ready' | 'error' | 'forbidden';

/** Tab identifiers, in presentation order. */
export const PROFILE_TABS = ['auth', 'accounts', 'bindings', 'health', 'pricat', 'stock'] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

/**
 * Vendor-profile detail screen: the Auth, Accounts, Bindings and Health
 * tabs from issues #188 and #189, plus PRICAT (#213) and the latest stock
 * snapshot (#217), both restored once backend PR #1644 shipped real reads for
 * them.
 *
 * The page owns the profile header and the tab shell only; each tab is a
 * self-contained panel that loads and mutates its own slice. That keeps a
 * failure in one tab (say, a `403` on health) from taking down the others.
 *
 * The tablist follows the WAI-ARIA tabs pattern: roving tabindex, arrow/Home/End
 * key navigation, and `aria-controls`/`aria-labelledby` wiring between each tab
 * and its panel (ADR-0029).
 *
 * A YAML-managed profile is read-only throughout — the admin API rejects **every**
 * mutation on it with `409` by design (ADR-0050 §6), so `readOnly` is threaded
 * into every panel. The controls stay visible and disabled with a stated reason
 * rather than disappearing: a hidden control teaches the operator nothing about
 * why the system will not let them proceed, and leaves them looking for a button
 * that is not there.
 *
 * Every profile belongs to one pos-supplier vendor (backend S23, #484). The
 * settings list names it, and the edit form carries a required vendor picker that
 * pre-selects it — an inactive current vendor stays selectable, labelled as
 * inactive, because the backend lets a profile keep it.
 *
 * The Health tab is present but reports that connection health is not yet
 * available: there is no health or circuit-breaker endpoint in the supplier
 * contract. See the panel for the reasoning.
 */
@Component({
  selector: 'app-supplier-profile-detail-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    SupplierStatusChipComponent,
    SupplierAuthPanelComponent,
    SupplierAccountsPanelComponent,
    SupplierBindingsPanelComponent,
    SupplierHealthPanelComponent,
    SupplierPriceCatalogPanelComponent,
    SupplierStockSnapshotPanelComponent,
    SupplierVendorPickerComponent,
  ],
  templateUrl: './supplier-profile-detail-page.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-profile-detail-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierProfileDetailPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(SupplierProfileService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /**
   * Monotonic per-writer sequences (ADR-0063). The route id alone is not an
   * ownership token: A → B → A with the first A request still pending would let
   * that stale response overwrite the newer one. A callback applies only when its
   * sequence is still the latest one issued for that writer.
   */
  private loadSeq = 0;
  private saveSeq = 0;
  /** Set when a route change removed the focused control; the next settled load restores focus. */
  private restoreFocusAfterLoad = false;

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly profile = signal<VendorProfile | null>(null);
  readonly vendorProfileId = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly fieldDetails = signal<Record<string, string>>({});
  readonly editOpen = signal(false);
  readonly saving = signal(false);
  /** Set when the last mutation was rejected with `409` — the source-of-truth lock. */
  readonly conflict = signal(false);

  readonly tabs = PROFILE_TABS;
  readonly activeTab = signal<ProfileTab>('auth');

  /** Read at access time — see `utils/supplier-capability-keys.ts`. */
  get retryBackoffs(): readonly SupplierRetryBackoff[] {
    return SUPPLIER_RETRY_BACKOFFS;
  }

  /** YAML-sourced profiles are configuration rollouts, not operator data. */
  readonly readOnly = computed(() => this.profile()?.sourceOfTruth === 'YAML');

  /**
   * `supplier:profile:write` (ADR-0040 §6a): the route admits on the read
   * permission, which never enables a write. A token without `perm_bits` leaves
   * permissions unknown and keeps the legacy open behaviour, as `canAccess()` does.
   */
  readonly canWrite = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(POSITIVITY_PAGE.profileWrite),
  );

  /** Why the write controls are disabled, if they are. */
  readonly writeBlockedReasonId = computed(() =>
    this.readOnly() ? 'profile-readonly-reason' : this.canWrite() ? null : 'profile-write-reason',
  );

  /** The profile's own vendor, pre-selected (and always offered) by the edit form's picker. */
  readonly currentVendor = computed<SupplierCurrentVendor | null>(
    () => {
      const profile = this.profile();
      return profile?.vendorId
        ? {
            vendorId: profile.vendorId,
            vendorNumber: profile.vendorNumber,
            displayName: profile.vendorDisplayName,
          }
        : null;
    },
    { equal: (a, b) => a?.vendorId === b?.vendorId && a?.vendorNumber === b?.vendorNumber && a?.displayName === b?.displayName },
  );

  readonly editForm = new FormGroup({
    vendorId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    supplierRef: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    displayName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    sandbox: new FormControl(false, { nonNullable: true }),
    enabled: new FormControl(true, { nonNullable: true }),
    sandboxBaseUrlOverride: new FormControl('', { nonNullable: true }),
    connectTimeoutMillis: new FormControl<number | null>(null),
    readTimeoutMillis: new FormControl<number | null>(null),
    maxRetries: new FormControl<number | null>(null),
    retryBackoff: new FormControl<SupplierRetryBackoff | ''>('', { nonNullable: true }),
  });

  constructor() {
    // Subscribed once, outside any reactive context: inside an effect, the
    // signals the load reads would be tracked and every change-detection pass
    // would resubscribe and reload the profile.
    this.route.paramMap
      .pipe(
        map(params => params.get('vendorProfileId')),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(profileId => {
        // A different profile: whatever form was open belonged to the last one.
        // If focus sat inside this page (say, in the edit form) it is about to
        // be removed; hold it on the loading target, then the heading (ADR-0029 §8).
        const active = document.activeElement;
        this.restoreFocusAfterLoad =
          this.restoreFocusAfterLoad || (!!active && active !== document.body && this.host.nativeElement.contains(active));
        this.saveSeq += 1;
        this.saving.set(false);
        this.editOpen.set(false);
        this.clearFieldFeedback();
        this.profile.set(null);
        this.vendorProfileId.set(profileId);
        if (profileId) {
          this.loadProfile(profileId);
        } else {
          // No profile to load, so no load will settle and restore focus.
          this.restoreFocusAfterLoad = false;
        }
        if (this.restoreFocusAfterLoad) {
          afterNextRender(() => this.focusTarget('[data-testid="profile-loading"]'), { injector: this.injector });
        }
      });
  }

  tabId(tab: ProfileTab): string {
    return `supplier-tab-${tab}`;
  }

  panelId(tab: ProfileTab): string {
    return `supplier-panel-${tab}`;
  }

  selectTab(tab: ProfileTab): void {
    this.activeTab.set(tab);
  }

  /** Arrow/Home/End navigation across the tablist (WAI-ARIA tabs pattern). */
  onTabKeydown(event: KeyboardEvent, tab: ProfileTab): void {
    const index = this.tabs.indexOf(tab);
    const nextIndex = this.nextTabIndex(event.key, index);
    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const next = this.tabs[nextIndex];
    this.selectTab(next);
    const element = document.getElementById(this.tabId(next));
    element?.focus();
  }

  /** Target tab index for a navigation key, or null when the key is not ours. */
  private nextTabIndex(key: string, index: number): number | null {
    switch (key) {
      case 'ArrowRight':
        return (index + 1) % this.tabs.length;
      case 'ArrowLeft':
        return (index - 1 + this.tabs.length) % this.tabs.length;
      case 'Home':
        return 0;
      case 'End':
        return this.tabs.length - 1;
      default:
        return null;
    }
  }

  fieldError(field: string): string | null {
    return this.fieldErrors()[field] ?? null;
  }

  /** Backend detail text for a field. Server data — rendered beneath the translated label only. */
  fieldDetail(field: string): string | null {
    return this.fieldDetails()[field] ?? null;
  }

  loadProfile(vendorProfileId: string): void {
    const seq = ++this.loadSeq;
    const current = (): boolean => seq === this.loadSeq && this.vendorProfileId() === vendorProfileId;
    this.state.set('loading');
    this.errorKey.set(null);

    this.service
      .getProfile(vendorProfileId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: profile => {
          // Superseded by a newer load, or the route moved on: not this page's profile any more.
          if (!current()) {
            return;
          }
          this.profile.set(profile);
          this.editForm.reset({
            vendorId: profile.vendorId,
            supplierRef: profile.supplierRef,
            displayName: profile.displayName,
            sandbox: profile.sandbox,
            enabled: profile.enabled,
            sandboxBaseUrlOverride: profile.sandboxBaseUrlOverride ?? '',
            connectTimeoutMillis: profile.connectTimeoutMillis ?? null,
            readTimeoutMillis: profile.readTimeoutMillis ?? null,
            maxRetries: profile.maxRetries ?? null,
            retryBackoff: profile.retryBackoff ?? '',
          });
          this.state.set('ready');
          this.restoreFocusIfPending();
        },
        error: (err: unknown) => {
          if (!current()) {
            return;
          }
          const outcome = mapSupplierError(err, 'POSITIVITY.PROFILES.ERROR.LOAD_DETAIL');
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
          this.restoreFocusIfPending();
        },
      });
  }

  reload(): void {
    const profileId = this.vendorProfileId();
    if (profileId) {
      this.loadProfile(profileId);
    }
  }

  openEdit(): void {
    if (!this.canWrite() || this.readOnly()) {
      return;
    }
    this.clearFieldFeedback();
    this.editOpen.set(true);
  }

  cancelEdit(): void {
    this.editOpen.set(false);
    this.clearFieldFeedback();
  }

  saveProfile(): void {
    const profileId = this.vendorProfileId();
    if (!profileId || this.readOnly() || !this.canWrite()) {
      return;
    }
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const raw = this.editForm.getRawValue();
    const request: VendorProfileRequest = {
      vendorId: raw.vendorId,
      supplierRef: raw.supplierRef.trim(),
      displayName: raw.displayName.trim(),
      sandbox: raw.sandbox,
      enabled: raw.enabled,
      sandboxBaseUrlOverride: raw.sandboxBaseUrlOverride.trim() || undefined,
      connectTimeoutMillis: raw.connectTimeoutMillis ?? undefined,
      readTimeoutMillis: raw.readTimeoutMillis ?? undefined,
      maxRetries: raw.maxRetries ?? undefined,
      retryBackoff: raw.retryBackoff || undefined,
    };

    const seq = ++this.saveSeq;
    const current = (): boolean => seq === this.saveSeq && this.vendorProfileId() === profileId;
    this.saving.set(true);
    this.clearFieldFeedback();

    this.service
      .updateProfile(profileId, request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: profile => {
          if (!current()) {
            return;
          }
          this.saving.set(false);
          this.profile.set(profile);
          this.editOpen.set(false);
          this.errorKey.set(null);
        },
        error: (err: unknown) => {
          if (!current()) {
            return;
          }
          this.saving.set(false);
          this.handleMutationError(err, 'POSITIVITY.PROFILES.ERROR.SAVE');
        },
      });
  }

  deleteProfile(): void {
    const profileId = this.vendorProfileId();
    if (!profileId || this.readOnly() || !this.canWrite()) {
      return;
    }

    this.service
      .deleteProfile(profileId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          void this.router.navigate(['/app', 'positivity']);
        },
        error: (err: unknown) => this.handleMutationError(err, 'POSITIVITY.PROFILES.ERROR.DELETE'),
      });
  }

  /** The signed-in identity changed under the open form: its field feedback is stale. */
  onVendorIdentityChanged(): void {
    this.clearFieldFeedback();
  }

  private restoreFocusIfPending(): void {
    if (!this.restoreFocusAfterLoad) {
      return;
    }
    this.restoreFocusAfterLoad = false;
    afterNextRender(
      () => this.focusTarget('#profile-detail-title', '[data-testid="profile-error"]', '[data-testid="profile-forbidden"]'),
      { injector: this.injector },
    );
  }

  /** Focus the first of `selectors` present in this page. */
  private focusTarget(...selectors: string[]): void {
    for (const selector of selectors) {
      const element = this.host.nativeElement.querySelector<HTMLElement>(selector);
      if (element) {
        element.focus();
        return;
      }
    }
  }

  private clearFieldFeedback(): void {
    this.fieldErrors.set({});
    this.fieldDetails.set({});
    this.conflict.set(false);
  }

  /**
   * `409` is its own outcome, not a generic failure: on a YAML-managed profile
   * it is the source-of-truth lock, and offering a Retry there would just invite
   * the operator to fail again.
   */
  private handleMutationError(err: unknown, fallbackKey: string): void {
    const outcome = mapSupplierError(err, fallbackKey);
    this.state.set('error');
    this.errorKey.set(
      outcome.kind === 'conflict'
        ? this.readOnly()
          ? 'POSITIVITY.ERROR.CONFLICT_YAML'
          : 'POSITIVITY.ERROR.CONFLICT'
        : outcome.errorKey,
    );
    this.conflict.set(outcome.kind === 'conflict');
    this.fieldErrors.set(outcome.fieldErrors);
    this.fieldDetails.set(outcome.fieldDetails);
  }
}
