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
  SupplierAuthConfig,
  SupplierAuthConfigRequest,
  SupplierAuthType,
} from '../../models/supplier-profile.models';
import { mapSupplierError } from '../../utils/supplier-error.util';

type PanelState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

/** Credential-reference control names, per auth type. Every one of these is a reference, never a value. */
const CREDENTIAL_FIELDS: Readonly<Record<SupplierAuthType, readonly string[]>> = {
  BASIC_PLUS_APIKEY: ['usernameRef', 'passwordRef', 'apiKeyRef'],
  OAUTH2_CLIENT_CREDENTIALS: ['clientIdRef', 'clientSecretRef'],
  BEARER: ['tokenRef'],
};

/** Non-credential configuration controls, per auth type. */
const PLAIN_FIELDS: Readonly<Record<SupplierAuthType, readonly string[]>> = {
  BASIC_PLUS_APIKEY: [],
  OAUTH2_CLIENT_CREDENTIALS: ['tokenUrl', 'scope'],
  BEARER: [],
};

/**
 * Auth tab of the vendor-profile detail screen.
 *
 * Credential handling (ADR-0050 §4, issue #188): every credential-bearing input
 * is a **write-only reference string** such as `env:MICHELIN_EDI_USER`. The UI
 * never asks for a plaintext secret and never renders one:
 *   - controls are plain text inputs named `*Ref` with reference-scheme help text,
 *   - no `type="password"` field exists, because there is no password to type,
 *   - the request payload contains only `*Ref` values,
 *   - nothing in the response is treated as a secret to display.
 *
 * `readOnly` is set for YAML-managed profiles, whose configuration the admin API
 * rejects by design (ADR-0050 §6).
 */
@Component({
  selector: 'app-supplier-auth-panel',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './supplier-auth-panel.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-auth-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierAuthPanelComponent {
  private readonly service = inject(SupplierProfileService);
  private readonly destroyRef = inject(DestroyRef);

  readonly vendorProfileId = input.required<string>();
  /** True for YAML-managed profiles: read access only. */
  readonly readOnly = input<boolean>(false);

  readonly state = signal<PanelState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly configs = signal<SupplierAuthConfig[]>([]);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly saving = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly formOpen = signal(false);

  readonly authTypes: readonly SupplierAuthType[] = [
    'BASIC_PLUS_APIKEY',
    'OAUTH2_CLIENT_CREDENTIALS',
    'BEARER',
  ];

  private readonly selectedType = signal<SupplierAuthType>('BASIC_PLUS_APIKEY');

  readonly form = new FormGroup({
    authRef: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    authType: new FormControl<SupplierAuthType>('BASIC_PLUS_APIKEY', { nonNullable: true }),
    usernameRef: new FormControl('', { nonNullable: true }),
    passwordRef: new FormControl('', { nonNullable: true }),
    apiKeyRef: new FormControl('', { nonNullable: true }),
    clientIdRef: new FormControl('', { nonNullable: true }),
    clientSecretRef: new FormControl('', { nonNullable: true }),
    tokenUrl: new FormControl('', { nonNullable: true }),
    scope: new FormControl('', { nonNullable: true }),
    tokenRef: new FormControl('', { nonNullable: true }),
  });

  /** Credential-reference controls shown for the selected auth type. */
  readonly credentialFields = computed(() => CREDENTIAL_FIELDS[this.selectedType()]);

  /** Plain configuration controls shown for the selected auth type. */
  readonly plainFields = computed(() => PLAIN_FIELDS[this.selectedType()]);

  constructor() {
    this.form.controls.authType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.selectedType.set(value));

    effect(onCleanup => {
      const profileId = this.vendorProfileId();
      if (!profileId) {
        return;
      }

      this.state.set('loading');
      this.errorKey.set(null);

      const sub: Subscription = this.service.listAuthConfigs(profileId).subscribe({
        next: configs => {
          this.configs.set(configs);
          this.state.set(configs.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.AUTH.ERROR.LOAD');
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });

      onCleanup(() => sub.unsubscribe());
    });
  }

  fieldError(field: string): string | null {
    return this.fieldErrors()[field] ?? null;
  }

  startCreate(): void {
    this.editingId.set(null);
    this.fieldErrors.set({});
    this.form.reset({ authRef: '', authType: 'BASIC_PLUS_APIKEY' });
    this.selectedType.set('BASIC_PLUS_APIKEY');
    this.formOpen.set(true);
  }

  startEdit(config: SupplierAuthConfig): void {
    this.editingId.set(config.authConfigId);
    this.fieldErrors.set({});
    this.form.reset({
      authRef: config.authRef,
      authType: config.authType,
      usernameRef: config.usernameRef ?? '',
      passwordRef: config.passwordRef ?? '',
      apiKeyRef: config.apiKeyRef ?? '',
      clientIdRef: config.clientIdRef ?? '',
      clientSecretRef: config.clientSecretRef ?? '',
      tokenUrl: config.tokenUrl ?? '',
      scope: config.scope ?? '',
      tokenRef: config.tokenRef ?? '',
    });
    this.selectedType.set(config.authType);
    this.formOpen.set(true);
  }

  cancelForm(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
    this.fieldErrors.set({});
  }

  /** Build the payload from the controls that apply to the selected auth type only. */
  buildRequest(): SupplierAuthConfigRequest {
    const raw = this.form.getRawValue();
    const request: SupplierAuthConfigRequest = {
      authRef: raw.authRef.trim(),
      authType: raw.authType,
    };
    const applicable = [...this.credentialFields(), ...this.plainFields()];
    for (const field of applicable) {
      const value = (raw as unknown as Record<string, string>)[field]?.trim();
      if (value) {
        (request as unknown as Record<string, string>)[field] = value;
      }
    }
    return request;
  }

  save(): void {
    if (this.readOnly() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const profileId = this.vendorProfileId();
    const request = this.buildRequest();
    const editingId = this.editingId();

    this.saving.set(true);
    this.fieldErrors.set({});

    const call$ = editingId
      ? this.service.updateAuthConfig(profileId, editingId, request)
      : this.service.createAuthConfig(profileId, request);

    call$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.editingId.set(null);
        this.errorKey.set(null);
        this.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const outcome = mapSupplierError(err, 'POSITIVITY.AUTH.ERROR.SAVE');
        this.state.set('error');
        this.errorKey.set(outcome.errorKey);
        this.fieldErrors.set(outcome.fieldErrors);
      },
    });
  }

  remove(config: SupplierAuthConfig): void {
    if (this.readOnly()) {
      return;
    }

    this.service
      .deleteAuthConfig(this.vendorProfileId(), config.authConfigId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.errorKey.set(null);
          this.reload();
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.AUTH.ERROR.DELETE');
          this.state.set('error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }

  reload(): void {
    const profileId = this.vendorProfileId();
    this.state.set('loading');
    this.errorKey.set(null);

    this.service
      .listAuthConfigs(profileId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: configs => {
          this.configs.set(configs);
          this.state.set(configs.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.AUTH.ERROR.LOAD');
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }
}
