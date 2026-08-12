import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { SupplierStatusChipComponent } from '../../components/supplier-status-chip/supplier-status-chip.component';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  VendorProfileRequest,
  VendorProfileSummary,
} from '../../models/supplier-profile.models';
import { mapSupplierError } from '../../utils/supplier-error.util';

type PageState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

/**
 * Supplier connectivity landing page: every vendor profile in this deployment.
 *
 * Profiles are per-deployment configuration (ADR-0050 §2), so this list is the
 * entry point for onboarding a vendor without database surgery. Creating a
 * profile happens here; auth configs, accounts, bindings, health, and PRICAT are
 * managed on the detail screen.
 *
 * YAML-managed profiles are listed and readable but not editable — the admin API
 * rejects writes to them by design, so the UI states the reason rather than
 * offering a control that will fail (ADR-0050 §6).
 */
@Component({
  selector: 'app-supplier-profile-list-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, SupplierStatusChipComponent],
  templateUrl: './supplier-profile-list-page.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-profile-list-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierProfileListPageComponent {
  private readonly service = inject(SupplierProfileService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly profiles = signal<VendorProfileSummary[]>([]);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly fieldDetails = signal<Record<string, string>>({});
  readonly createOpen = signal(false);
  readonly saving = signal(false);

  readonly createForm = new FormGroup({
    supplierRef: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    displayName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    sandbox: new FormControl(false, { nonNullable: true }),
    enabled: new FormControl(true, { nonNullable: true }),
  });

  constructor() {
    this.load();
  }

  fieldError(field: string): string | null {
    return this.fieldErrors()[field] ?? null;
  }

  /** Backend detail text for a field. Server data — rendered beneath the translated label only. */
  fieldDetail(field: string): string | null {
    return this.fieldDetails()[field] ?? null;
  }

  load(): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.service
      .listProfiles()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: profiles => {
          this.profiles.set(profiles);
          this.state.set(profiles.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.PROFILES.ERROR.LOAD');
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }

  openCreate(): void {
    this.fieldErrors.set({});
    this.fieldDetails.set({});
    this.createForm.reset({ supplierRef: '', displayName: '', sandbox: false, enabled: true });
    this.createOpen.set(true);
  }

  cancelCreate(): void {
    this.createOpen.set(false);
    this.fieldErrors.set({});
    this.fieldDetails.set({});
  }

  create(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    const raw = this.createForm.getRawValue();
    const request: VendorProfileRequest = {
      supplierRef: raw.supplierRef.trim(),
      displayName: raw.displayName.trim(),
      sandbox: raw.sandbox,
      enabled: raw.enabled,
    };

    this.saving.set(true);
    this.fieldErrors.set({});
    this.fieldDetails.set({});

    this.service
      .createProfile(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.createOpen.set(false);
          this.errorKey.set(null);
          this.load();
        },
        error: (err: unknown) => {
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
