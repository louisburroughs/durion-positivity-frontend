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
import { SUPPLIER_AUTH_TYPES } from '../../utils/supplier-capability-keys';
import {
  SupplierAuthConfig,
  SupplierAuthConfigRequest,
  SupplierAuthType,
} from '../../models/supplier-profile.models';
import { mapSupplierError } from '../../utils/supplier-error.util';

type PanelState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

/**
 * Type pre-selected on a new configuration.
 *
 * A literal rather than `AuthConfigViewTypeEnum.BasicPlusApikey`: this is read
 * in class-field initialisers, where an imported binding is not reliably
 * resolved yet (see `utils/supplier-capability-keys.ts`). The union it is typed
 * as still comes from the generated enum, so a contract change still fails the
 * build here.
 */
const DEFAULT_AUTH_TYPE: SupplierAuthType = 'BASIC_PLUS_APIKEY';

/**
 * Credential-reference control names per auth type, exactly as the contract
 * names them. Each is a scheme-prefixed **reference**, never a value; the
 * backend rejects plaintext and never echoes a reference back.
 *
 * Note `tokenUrlRef`: the OAuth2 token endpoint is a secret reference in this
 * contract, not the plain URL an earlier guess assumed.
 */
const CREDENTIAL_FIELDS: Readonly<Record<SupplierAuthType, readonly string[]>> = {
  BASIC_PLUS_APIKEY: ['usernameRef', 'passwordRef', 'apiKeyRef'],
  OAUTH2_CLIENT_CREDENTIALS: ['tokenUrlRef', 'clientIdRef', 'clientSecretRef'],
  BEARER: ['bearerTokenRef'],
};

/**
 * Non-credential configuration controls per auth type. `apiKeyHeader` is a
 * header *name* — ordinary configuration data, and the only such field the
 * contract carries.
 */
const PLAIN_FIELDS: Readonly<Record<SupplierAuthType, readonly string[]>> = {
  BASIC_PLUS_APIKEY: ['apiKeyHeader'],
  OAUTH2_CLIENT_CREDENTIALS: [],
  BEARER: [],
};

/**
 * Auth tab of the vendor-profile detail screen.
 *
 * ── Nothing here can leak a secret ───────────────────────────────────────────
 * `AuthConfigView` — the contract's read model — is
 * `{ authConfigId, name, type, apiKeyHeader }`. It carries **no credential
 * material at all, by shape**, so the table below has nothing to redact: there
 * is no reference field to render, masked or otherwise.
 *
 * Writes carry `*Ref` reference strings such as `env:MICHELIN_EDI_USER`. The UI
 * never asks for a plaintext secret and has no `type="password"` control,
 * because there is no password to type.
 *
 * The available types are driven off the generated `AuthConfigViewTypeEnum`
 * rather than a hand-written union, so a new scheme arrives with the SDK.
 *
 * ── YAML lock ────────────────────────────────────────────────────────────────
 * A YAML-managed profile rejects every mutation with `409` (ADR-0050 §6). Write
 * controls stay visible and disabled with a stated reason.
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
  readonly fieldDetails = signal<Record<string, string>>({});
  readonly saving = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly formOpen = signal(false);
  readonly conflict = signal(false);

  /** Driven off the generated enum, not a hand-written union. */
  get authTypes(): readonly SupplierAuthType[] {
    return SUPPLIER_AUTH_TYPES;
  }

  private readonly selectedType = signal<SupplierAuthType>(DEFAULT_AUTH_TYPE);

  readonly form = new FormGroup({
    authRef: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    authType: new FormControl<SupplierAuthType>(DEFAULT_AUTH_TYPE, { nonNullable: true }),
    usernameRef: new FormControl('', { nonNullable: true }),
    passwordRef: new FormControl('', { nonNullable: true }),
    apiKeyRef: new FormControl('', { nonNullable: true }),
    apiKeyHeader: new FormControl('', { nonNullable: true }),
    tokenUrlRef: new FormControl('', { nonNullable: true }),
    clientIdRef: new FormControl('', { nonNullable: true }),
    clientSecretRef: new FormControl('', { nonNullable: true }),
    bearerTokenRef: new FormControl('', { nonNullable: true }),
  });

  /** Credential-reference controls shown for the selected auth type. */
  readonly credentialFields = computed(() => CREDENTIAL_FIELDS[this.selectedType()] ?? []);

  /** Plain configuration controls shown for the selected auth type. */
  readonly plainFields = computed(() => PLAIN_FIELDS[this.selectedType()] ?? []);

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
        error: (err: unknown) => this.handleLoadError(err),
      });

      onCleanup(() => sub.unsubscribe());
    });
  }

  fieldError(field: string): string | null {
    return this.fieldErrors()[field] ?? null;
  }

  fieldDetail(field: string): string | null {
    return this.fieldDetails()[field] ?? null;
  }

  startCreate(): void {
    this.editingId.set(null);
    this.clearFieldFeedback();
    this.form.reset({ authRef: '', authType: DEFAULT_AUTH_TYPE });
    this.selectedType.set(DEFAULT_AUTH_TYPE);
    this.formOpen.set(true);
  }

  /**
   * Open the edit form.
   *
   * Only the name, type and API-key header can be pre-filled — the read model
   * carries nothing else. Credential references must be re-entered because the
   * backend has never disclosed them, which is the point of the design.
   */
  startEdit(config: SupplierAuthConfig): void {
    this.editingId.set(config.authConfigId);
    this.clearFieldFeedback();
    this.form.reset({
      authRef: config.authRef,
      authType: config.authType,
      apiKeyHeader: config.apiKeyHeader ?? '',
    });
    this.selectedType.set(config.authType);
    this.formOpen.set(true);
  }

  cancelForm(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
    this.clearFieldFeedback();
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
    this.clearFieldFeedback();

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
        this.handleMutationError(err, 'POSITIVITY.AUTH.ERROR.SAVE');
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
        error: (err: unknown) => this.handleMutationError(err, 'POSITIVITY.AUTH.ERROR.DELETE'),
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
        error: (err: unknown) => this.handleLoadError(err),
      });
  }

  private clearFieldFeedback(): void {
    this.fieldErrors.set({});
    this.fieldDetails.set({});
    this.conflict.set(false);
  }

  private handleLoadError(err: unknown): void {
    const outcome = mapSupplierError(err, 'POSITIVITY.AUTH.ERROR.LOAD');
    this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
    this.errorKey.set(outcome.errorKey);
  }

  /** `409` is its own outcome: on a YAML profile it is the source-of-truth lock. */
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
