import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription, distinctUntilChanged, map } from 'rxjs';
import { SupplierAccountsPanelComponent } from '../../components/supplier-accounts-panel/supplier-accounts-panel.component';
import { SupplierAuthPanelComponent } from '../../components/supplier-auth-panel/supplier-auth-panel.component';
import { SupplierBindingsPanelComponent } from '../../components/supplier-bindings-panel/supplier-bindings-panel.component';
import { SupplierHealthPanelComponent } from '../../components/supplier-health-panel/supplier-health-panel.component';
import { SupplierPriceCatalogPanelComponent } from '../../components/supplier-pricecat-panel/supplier-pricecat-panel.component';
import { SupplierStatusChipComponent } from '../../components/supplier-status-chip/supplier-status-chip.component';
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
export const PROFILE_TABS = ['auth', 'accounts', 'bindings', 'health', 'pricat'] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

/**
 * Vendor-profile detail screen: the Auth, Accounts, Bindings and Health
 * tabs from issues #188 and #189, plus PRICAT (#213), restored once backend
 * PR #1644 shipped a real freshness read for it.
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

  readonly editForm = new FormGroup({
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
    effect(onCleanup => {
      const sub: Subscription = this.route.paramMap
        .pipe(
          map(params => params.get('vendorProfileId')),
          distinctUntilChanged(),
        )
        .subscribe(profileId => {
          this.vendorProfileId.set(profileId);
          if (profileId) {
            this.loadProfile(profileId);
          }
        });

      onCleanup(() => sub.unsubscribe());
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
    this.state.set('loading');
    this.errorKey.set(null);

    this.service
      .getProfile(vendorProfileId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: profile => {
          this.profile.set(profile);
          this.editForm.reset({
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
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.PROFILES.ERROR.LOAD_DETAIL');
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
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
    this.clearFieldFeedback();
    this.editOpen.set(true);
  }

  cancelEdit(): void {
    this.editOpen.set(false);
    this.clearFieldFeedback();
  }

  saveProfile(): void {
    const profileId = this.vendorProfileId();
    if (!profileId || this.readOnly() || this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const raw = this.editForm.getRawValue();
    const request: VendorProfileRequest = {
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

    this.saving.set(true);
    this.clearFieldFeedback();

    this.service
      .updateProfile(profileId, request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: profile => {
          this.saving.set(false);
          this.profile.set(profile);
          this.editOpen.set(false);
          this.errorKey.set(null);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.handleMutationError(err, 'POSITIVITY.PROFILES.ERROR.SAVE');
        },
      });
  }

  deleteProfile(): void {
    const profileId = this.vendorProfileId();
    if (!profileId || this.readOnly()) {
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
