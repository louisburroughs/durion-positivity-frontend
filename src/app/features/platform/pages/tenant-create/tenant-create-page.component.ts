import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { normalizeTenantSlug } from '../../../../core/security/tenant';
import { notBlank, tenantSlug } from '../../../../core/util/form-validators';
import { PlatformAccountService } from '../../services/platform-account.service';
import { PlatformTenantService } from '../../services/platform-tenant.service';
import { AccountSummary, TenantCreateRequest } from '../../models/tenant.models';
import { mapPlatformError } from '../../utils/platform-error.util';

type PageState = 'idle' | 'loading' | 'ready' | 'error' | 'forbidden';

/**
 * Register a tenant (ADR-0062 §7). The tenant is created PENDING under an
 * existing account; pos-security-service provisions its role template and the
 * initial administrator, then the registry moves it to ACTIVE.
 *
 * The owning account is chosen from the account list when it loads; if that
 * read fails (or there are no accounts yet), the form falls back to a plain
 * account-id field so an operator who knows the id is not blocked.
 */
@Component({
  selector: 'app-tenant-create-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './tenant-create-page.component.html',
  styleUrls: ['../../platform-shared.css', './tenant-create-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantCreatePageComponent {
  private readonly tenantService = inject(PlatformTenantService);
  private readonly accountService = inject(PlatformAccountService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Account-list load state and the create outcome; the form itself is always rendered. */
  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  /** Server text beneath the error banner (see `PlatformErrorOutcome.detail`). */
  readonly errorDetail = signal<string | null>(null);
  readonly accounts = signal<AccountSummary[]>([]);
  readonly saving = signal(false);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly fieldDetails = signal<Record<string, string>>({});

  readonly form = new FormGroup({
    // `submit()` trims, so every required text control also carries `notBlank`:
    // `Validators.required` alone would let whitespace through as an empty value.
    slug: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, notBlank, tenantSlug],
    }),
    displayName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, notBlank, Validators.maxLength(200)],
    }),
    accountId: new FormControl('', { nonNullable: true, validators: [Validators.required, notBlank] }),
    cell: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(64)] }),
    initialAdminEmail: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(320)],
    }),
  });

  constructor() {
    this.loadAccounts();
  }

  loadAccounts(): void {
    this.state.set('loading');
    this.errorKey.set(null);
    this.errorDetail.set(null);

    this.accountService
      .listAccounts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: accounts => {
          this.accounts.set(accounts);
          this.state.set('ready');
        },
        error: (err: unknown) => {
          // The account list is a convenience: a session holding only
          // platform:tenant:create is refused it (403) yet may still register a
          // tenant by id, so this is an ordinary load error with the plain-id
          // fallback, never the page-wide forbidden state.
          const outcome = mapPlatformError(err, 'PLATFORM.TENANTS.ERROR.ACCOUNTS_LOAD');
          this.state.set('error');
          this.errorKey.set(
            outcome.kind === 'forbidden' ? 'PLATFORM.TENANTS.ERROR.ACCOUNTS_LOAD' : outcome.errorKey,
          );
          this.errorDetail.set(outcome.kind === 'forbidden' ? null : outcome.detail);
        },
      });
  }

  fieldError(field: string): string | null {
    return this.fieldErrors()[field] ?? null;
  }

  /** Backend detail text for a field. Server data — rendered beneath the translated label only. */
  fieldDetail(field: string): string | null {
    return this.fieldDetails()[field] ?? null;
  }

  accountLabel(account: AccountSummary): string {
    const trading = account.tradingName?.trim();
    return trading && trading !== account.legalName ? `${account.legalName} (${trading})` : account.legalName;
  }

  submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const request: TenantCreateRequest = {
      slug: normalizeTenantSlug(raw.slug),
      displayName: raw.displayName.trim(),
      accountId: raw.accountId.trim(),
      initialAdminEmail: raw.initialAdminEmail.trim(),
    };
    const cell = raw.cell.trim();
    if (cell) {
      request.cell = cell;
    }

    this.saving.set(true);
    // A failed account-list load (or an earlier refused create) left the page
    // in an error state; the form is usable regardless, and an error state
    // with no key would render an empty banner while this request runs.
    if (this.state() !== 'loading') {
      this.state.set('ready');
    }
    this.errorKey.set(null);
    this.errorDetail.set(null);
    this.fieldErrors.set({});
    this.fieldDetails.set({});

    this.tenantService
      .createTenant(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: tenant => {
          this.saving.set(false);
          void this.router.navigate(['/app', 'platform', 'tenants', tenant.id], {
            state: { created: true },
          });
        },
        error: (err: unknown) => {
          this.saving.set(false);
          const outcome = mapPlatformError(err, 'PLATFORM.TENANTS.ERROR.CREATE', {
            conflictKey: 'PLATFORM.TENANTS.ERROR.SLUG_TAKEN',
            notFoundKey: 'PLATFORM.TENANTS.ERROR.ACCOUNT_NOT_FOUND',
          });
          // A refused create is the one denial this page renders as forbidden.
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
          this.errorDetail.set(outcome.detail);
          this.fieldErrors.set(outcome.fieldErrors);
          this.fieldDetails.set(outcome.fieldDetails);
        },
      });
  }

  get slugCtrl() { return this.form.controls.slug; }
  get displayNameCtrl() { return this.form.controls.displayName; }
  get accountIdCtrl() { return this.form.controls.accountId; }
  get cellCtrl() { return this.form.controls.cell; }
  get initialAdminEmailCtrl() { return this.form.controls.initialAdminEmail; }
}
