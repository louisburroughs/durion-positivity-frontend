import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  SupplierAccounts,
  SupplierActiveLocation,
  SupplierDeliveryAccount,
} from '../../models/supplier-profile.models';
import { mapSupplierError } from '../../utils/supplier-error.util';

type PanelState = 'idle' | 'loading' | 'ready' | 'error' | 'forbidden';

/**
 * Accounts tab of the vendor-profile detail screen.
 *
 * Vocabulary is canonical throughout (ADR-0050 §5): **billing** is the
 * invoicing/settlement account, **delivery** maps a pos-location to its vendor
 * account number. Vendor terms (`billTo`/`shipTo`, `BuyerParty`/`Consignee`) do
 * not appear here, in the template, or in the translation keys.
 *
 * ── The mapping-gap check is a second domain ─────────────────────────────────
 * A delivery mapping missing for an *active* location is a configuration error
 * that would otherwise only surface when an order fails, so the panel flags it
 * up front. But the roster of active locations comes from pos-location, not from
 * supplier: when that roster is unavailable the panel says the gap check could
 * not be run and still renders every mapping. "We could not verify" and "there
 * are no gaps" are different claims and must not look alike.
 *
 * ── YAML lock ────────────────────────────────────────────────────────────────
 * A YAML-managed profile rejects every mutation with `409` (ADR-0050 §6). The
 * write controls stay **visible and disabled with a stated reason** rather than
 * disappearing: a hidden control teaches an operator nothing about why the
 * system will not let them proceed. A `409` that arrives anyway is surfaced as
 * its own message, not as a generic failure.
 */
@Component({
  selector: 'app-supplier-accounts-panel',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './supplier-accounts-panel.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-accounts-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierAccountsPanelComponent {
  private readonly service = inject(SupplierProfileService);
  private readonly destroyRef = inject(DestroyRef);

  readonly vendorProfileId = input.required<string>();
  readonly readOnly = input<boolean>(false);

  readonly state = signal<PanelState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly accounts = signal<SupplierAccounts | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly fieldDetails = signal<Record<string, string>>({});
  readonly deliveryFormOpen = signal(false);
  readonly editingAccountId = signal<string | null>(null);
  readonly editingLocationId = signal<string | null>(null);

  /** Set when the last mutation was rejected with `409` — the source-of-truth lock. */
  readonly conflict = signal(false);

  readonly billingForm = new FormGroup({
    accountNumber: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    agencyCode: new FormControl('', { nonNullable: true }),
  });

  readonly deliveryForm = new FormGroup({
    locationId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    accountNumber: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    agencyCode: new FormControl('', { nonNullable: true }),
  });

  readonly deliveryAccounts = computed(() => this.accounts()?.delivery ?? []);

  readonly activeLocations = computed(() => this.accounts()?.activeLocations ?? []);

  /** False when the pos-location roster could not be read; the gap check is then unknown. */
  readonly locationsAvailable = computed(() => this.accounts()?.locationsAvailable ?? true);

  /**
   * Active locations with no delivery mapping.
   *
   * Empty whenever the roster is unavailable — the panel renders the
   * "not verified" note in that case rather than an all-clear.
   */
  readonly unmappedLocations = computed<SupplierActiveLocation[]>(() => {
    if (!this.locationsAvailable()) {
      return [];
    }
    const mapped = new Set(this.deliveryAccounts().map(entry => entry.locationId));
    return this.activeLocations().filter(location => !mapped.has(location.locationId));
  });

  readonly hasMappingGap = computed(() => this.unmappedLocations().length > 0);

  /** Locations still available to map, plus the one being edited. */
  readonly selectableLocations = computed<SupplierActiveLocation[]>(() => {
    const editing = this.editingLocationId();
    const mapped = new Set(this.deliveryAccounts().map(entry => entry.locationId));
    return this.activeLocations().filter(
      location => !mapped.has(location.locationId) || location.locationId === editing,
    );
  });

  constructor() {
    effect(onCleanup => {
      const profileId = this.vendorProfileId();
      if (!profileId) {
        return;
      }

      this.state.set('loading');
      this.errorKey.set(null);

      const sub: Subscription = this.service.getAccounts(profileId).subscribe({
        next: accounts => this.applyAccounts(accounts),
        error: (err: unknown) => this.handleLoadError(err),
      });

      onCleanup(() => sub.unsubscribe());
    });
  }

  fieldError(field: string): string | null {
    return this.fieldErrors()[field] ?? null;
  }

  /** Backend detail text for a field. Server data — rendered beneath the translated label only. */
  fieldDetail(field: string): string | null {
    return this.fieldDetails()[field] ?? null;
  }

  locationName(locationId: string): string {
    return (
      this.activeLocations().find(location => location.locationId === locationId)?.name ??
      locationId
    );
  }

  saveBilling(): void {
    if (this.readOnly() || this.billingForm.invalid) {
      this.billingForm.markAllAsTouched();
      return;
    }

    const raw = this.billingForm.getRawValue();
    this.clearFieldFeedback();

    this.service
      .saveBillingAccount(this.vendorProfileId(), {
        accountId: this.accounts()?.billing?.accountId,
        accountNumber: raw.accountNumber.trim(),
        agencyCode: raw.agencyCode.trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.errorKey.set(null);
          this.reload();
        },
        error: (err: unknown) => this.handleMutationError(err, 'POSITIVITY.ACCOUNTS.ERROR.SAVE_BILLING'),
      });
  }

  startAddDelivery(): void {
    this.editingAccountId.set(null);
    this.editingLocationId.set(null);
    this.clearFieldFeedback();
    this.deliveryForm.reset({ locationId: '', accountNumber: '', agencyCode: '' });
    this.deliveryFormOpen.set(true);
  }

  startEditDelivery(entry: SupplierDeliveryAccount): void {
    this.editingAccountId.set(entry.accountId);
    this.editingLocationId.set(entry.locationId);
    this.clearFieldFeedback();
    this.deliveryForm.reset({
      locationId: entry.locationId,
      accountNumber: entry.accountNumber,
      agencyCode: entry.agencyCode ?? '',
    });
    this.deliveryFormOpen.set(true);
  }

  /** Pre-select the gap the admin clicked on so fixing a warning is one step. */
  startMapLocation(location: SupplierActiveLocation): void {
    this.startAddDelivery();
    this.deliveryForm.controls.locationId.setValue(location.locationId);
  }

  cancelDelivery(): void {
    this.deliveryFormOpen.set(false);
    this.editingAccountId.set(null);
    this.editingLocationId.set(null);
    this.clearFieldFeedback();
  }

  saveDelivery(): void {
    if (this.readOnly() || this.deliveryForm.invalid) {
      this.deliveryForm.markAllAsTouched();
      return;
    }

    const raw = this.deliveryForm.getRawValue();
    this.clearFieldFeedback();

    this.service
      .saveDeliveryAccount(this.vendorProfileId(), {
        accountId: this.editingAccountId() ?? undefined,
        locationId: raw.locationId,
        accountNumber: raw.accountNumber.trim(),
        agencyCode: raw.agencyCode.trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deliveryFormOpen.set(false);
          this.editingAccountId.set(null);
          this.editingLocationId.set(null);
          this.errorKey.set(null);
          this.reload();
        },
        error: (err: unknown) =>
          this.handleMutationError(err, 'POSITIVITY.ACCOUNTS.ERROR.SAVE_DELIVERY'),
      });
  }

  removeDelivery(entry: SupplierDeliveryAccount): void {
    if (this.readOnly()) {
      return;
    }

    this.service
      .deleteAccount(this.vendorProfileId(), entry.accountId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.errorKey.set(null);
          this.reload();
        },
        error: (err: unknown) =>
          this.handleMutationError(err, 'POSITIVITY.ACCOUNTS.ERROR.DELETE_DELIVERY'),
      });
  }

  reload(): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.service
      .getAccounts(this.vendorProfileId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: accounts => this.applyAccounts(accounts),
        error: (err: unknown) => this.handleLoadError(err),
      });
  }

  private applyAccounts(accounts: SupplierAccounts): void {
    this.accounts.set(accounts);
    this.billingForm.reset({
      accountNumber: accounts.billing?.accountNumber ?? '',
      agencyCode: accounts.billing?.agencyCode ?? '',
    });
    this.state.set('ready');
  }

  private clearFieldFeedback(): void {
    this.fieldErrors.set({});
    this.fieldDetails.set({});
    this.conflict.set(false);
  }

  private handleLoadError(err: unknown): void {
    const outcome = mapSupplierError(err, 'POSITIVITY.ACCOUNTS.ERROR.LOAD');
    this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
    this.errorKey.set(outcome.errorKey);
  }

  /**
   * `409` is its own outcome, not a generic failure: on a YAML-managed profile
   * it is the source-of-truth lock and the operator needs to be told that, not
   * invited to retry.
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
