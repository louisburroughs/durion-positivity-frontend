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
import { Subscription, forkJoin } from 'rxjs';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { SupplierStatusChipComponent } from '../supplier-status-chip/supplier-status-chip.component';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  KNOWN_SUPPLIER_CAPABILITIES,
  KNOWN_SUPPLIER_PROTOCOL_FAMILIES,
  KNOWN_SUPPLIER_PROTOCOL_VERSIONS,
  SUPPLIER_CAPTURE_LEVELS,
} from '../../utils/supplier-capability-keys';
import {
  SupplierAuthConfig,
  SupplierBinding,
  SupplierBindingRequest,
  SupplierCapability,
  SupplierCaptureLevel,
} from '../../models/supplier-profile.models';
import { mapSupplierError } from '../../utils/supplier-error.util';

type PanelState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

/**
 * One row of the bindings table: a capability with its binding when one exists.
 * `binding === null` means the capability is configured-off for this vendor —
 * rendered explicitly as disabled, never omitted.
 */
export interface BindingRow {
  capability: SupplierCapability;
  binding: SupplierBinding | null;
  /** True when this row exists only to show the capability as unconfigured. */
  unbound: boolean;
}

/**
 * Bindings tab of the vendor-profile detail screen.
 *
 * ── Absence is meaningful ────────────────────────────────────────────────────
 * An absent or disabled binding means the capability resolves to the typed
 * `CAPABILITY_NOT_CONFIGURED` outcome (ADR-0050 §3) — a normal HTTP 200 result,
 * not an error. So the table lists every capability this UI can name, not only
 * the bound ones: hiding an unbound capability would make "switched off" and
 * "does not exist" look identical.
 *
 * There is **no capability-registry endpoint** in the supplier contract, so that
 * roster comes from `KNOWN_SUPPLIER_CAPABILITIES` — a display aid, unioned with
 * whatever the profile is actually bound to so a capability the frontend has
 * never heard of still appears. It is not validation: any key is submitted as
 * typed and the backend decides, rejecting unknown ones with
 * `SUPPLIER_UNKNOWN_CAPABILITY`.
 *
 * ── Version and family are free-form ─────────────────────────────────────────
 * `version` is deliberately not an enum in the contract (ADR-0051 §3) so a
 * vendor's new norm needs no code change, and `protocolFamily` is typed as a
 * plain string. Both are comboboxes — a text input with `<datalist>`
 * suggestions — never a closed dropdown that would reject a valid new key.
 *
 * ── Editing a live binding is confirmed ──────────────────────────────────────
 * Any edit to a currently *enabled* binding goes through an explicit
 * confirmation, because that binding is carrying production traffic. Creating a
 * binding, and editing a disabled one, do not prompt.
 */
@Component({
  selector: 'app-supplier-bindings-panel',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, ModalDialogDirective, SupplierStatusChipComponent],
  templateUrl: './supplier-bindings-panel.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-bindings-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierBindingsPanelComponent {
  private readonly service = inject(SupplierProfileService);
  private readonly destroyRef = inject(DestroyRef);

  readonly vendorProfileId = input.required<string>();
  readonly readOnly = input<boolean>(false);

  readonly state = signal<PanelState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly bindings = signal<SupplierBinding[]>([]);
  readonly authConfigs = signal<SupplierAuthConfig[]>([]);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly fieldDetails = signal<Record<string, string>>({});
  readonly formOpen = signal(false);
  readonly saving = signal(false);
  readonly editingBindingId = signal<string | null>(null);
  readonly conflict = signal(false);

  /**
   * Combobox suggestions. Not closed sets — see the class comment.
   *
   * Getters, not fields: see `utils/supplier-capability-keys.ts` for why these
   * must be read at access time.
   */
  get protocolFamilySuggestions(): readonly string[] {
    return KNOWN_SUPPLIER_PROTOCOL_FAMILIES;
  }

  get protocolVersionSuggestions(): readonly string[] {
    return KNOWN_SUPPLIER_PROTOCOL_VERSIONS;
  }

  get captureLevels(): readonly SupplierCaptureLevel[] {
    return SUPPLIER_CAPTURE_LEVELS;
  }

  /** Set when an edit to a currently-enabled binding is awaiting explicit confirmation. */
  readonly pendingConfirmation = signal<SupplierBindingRequest | null>(null);

  readonly form = new FormGroup({
    capability: new FormControl<SupplierCapability>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    protocolFamily: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    protocolVersion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    baseUrl: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    path: new FormControl('', { nonNullable: true }),
    authRef: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    cronSchedule: new FormControl('', { nonNullable: true }),
    enabled: new FormControl(true, { nonNullable: true }),
    captureLevel: new FormControl<SupplierCaptureLevel | ''>('', { nonNullable: true }),
  });

  /**
   * Every capability this UI can name, plus every capability actually bound.
   *
   * The union matters: a binding for a key the frontend does not know about must
   * still be listed and editable rather than silently vanishing from the table.
   */
  readonly rows = computed<BindingRow[]>(() => {
    const byCapability = new Map(this.bindings().map(b => [b.capability, b]));
    const capabilities = [
      ...KNOWN_SUPPLIER_CAPABILITIES,
      ...this.bindings()
        .map(b => b.capability)
        .filter(capability => !KNOWN_SUPPLIER_CAPABILITIES.includes(capability)),
    ];
    return capabilities.map(capability => {
      const binding = byCapability.get(capability) ?? null;
      return { capability, binding, unbound: binding === null };
    });
  });

  /** The binding currently being edited, if any. */
  readonly editingBinding = computed(() => {
    const id = this.editingBindingId();
    return id ? (this.bindings().find(b => b.bindingId === id) ?? null) : null;
  });

  constructor() {
    effect(onCleanup => {
      const profileId = this.vendorProfileId();
      if (!profileId) {
        return;
      }

      this.state.set('loading');
      this.errorKey.set(null);

      const sub: Subscription = forkJoin({
        bindings: this.service.listBindings(profileId),
        authConfigs: this.service.listAuthConfigs(profileId),
      }).subscribe({
        next: result => {
          this.bindings.set(result.bindings);
          this.authConfigs.set(result.authConfigs);
          this.state.set('ready');
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

  /**
   * True when this UI has translated copy for the key.
   *
   * A key it has never heard of is rendered verbatim rather than through a
   * translation that would resolve to the raw key anyway — showing the operator
   * exactly what the backend said.
   */
  isKnownCapability(capability: SupplierCapability): boolean {
    return KNOWN_SUPPLIER_CAPABILITIES.includes(capability);
  }

  isKnownProtocolFamily(family: string): boolean {
    return KNOWN_SUPPLIER_PROTOCOL_FAMILIES.includes(family);
  }

  statusLabelKey(row: BindingRow): string {
    if (!row.binding) {
      return 'POSITIVITY.BINDINGS.STATUS.NOT_CONFIGURED';
    }
    return row.binding.enabled
      ? 'POSITIVITY.BINDINGS.STATUS.ENABLED'
      : 'POSITIVITY.BINDINGS.STATUS.DISABLED';
  }

  statusTone(row: BindingRow): 'success' | 'neutral' {
    return row.binding?.enabled ? 'success' : 'neutral';
  }

  startCreate(row: BindingRow): void {
    this.editingBindingId.set(null);
    this.clearFieldFeedback();
    this.form.reset({
      capability: row.capability,
      protocolFamily: '',
      protocolVersion: '',
      baseUrl: '',
      path: '',
      authRef: '',
      cronSchedule: '',
      enabled: true,
      captureLevel: '',
    });
    this.formOpen.set(true);
  }

  startEdit(binding: SupplierBinding): void {
    this.editingBindingId.set(binding.bindingId);
    this.clearFieldFeedback();
    this.form.reset({
      capability: binding.capability,
      protocolFamily: binding.protocolFamily,
      protocolVersion: binding.protocolVersion,
      baseUrl: binding.baseUrl,
      path: binding.path,
      authRef: binding.authRef,
      cronSchedule: binding.cronSchedule ?? '',
      enabled: binding.enabled,
      captureLevel: binding.captureLevel ?? '',
    });
    this.formOpen.set(true);
  }

  cancelForm(): void {
    this.formOpen.set(false);
    this.editingBindingId.set(null);
    this.pendingConfirmation.set(null);
    this.clearFieldFeedback();
  }

  buildRequest(): SupplierBindingRequest {
    const raw = this.form.getRawValue();
    return {
      capability: raw.capability.trim(),
      protocolFamily: raw.protocolFamily.trim(),
      protocolVersion: raw.protocolVersion.trim(),
      baseUrl: raw.baseUrl.trim(),
      path: raw.path.trim(),
      authRef: raw.authRef,
      cronSchedule: raw.cronSchedule.trim() || null,
      enabled: raw.enabled,
      captureLevel: raw.captureLevel || undefined,
    };
  }

  /**
   * Submit handler. Edits to a currently-enabled binding are held for explicit
   * confirmation instead of being sent straight through.
   */
  save(): void {
    if (this.readOnly() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const request = this.buildRequest();
    const existing = this.editingBinding();

    if (existing?.enabled) {
      this.pendingConfirmation.set(request);
      return;
    }

    this.submit(request);
  }

  /** Proceed with the held edit after the admin confirms. */
  confirmSave(): void {
    const request = this.pendingConfirmation();
    if (!request) {
      return;
    }
    this.pendingConfirmation.set(null);
    this.submit(request);
  }

  cancelConfirmation(): void {
    this.pendingConfirmation.set(null);
  }

  private submit(request: SupplierBindingRequest): void {
    const profileId = this.vendorProfileId();
    const editingId = this.editingBindingId();

    this.saving.set(true);
    this.clearFieldFeedback();

    const call$ = editingId
      ? this.service.updateBinding(profileId, editingId, request)
      : this.service.createBinding(profileId, request);

    call$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.editingBindingId.set(null);
        this.errorKey.set(null);
        this.reload();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.handleMutationError(err, 'POSITIVITY.BINDINGS.ERROR.SAVE');
      },
    });
  }

  remove(binding: SupplierBinding): void {
    if (this.readOnly()) {
      return;
    }

    this.service
      .deleteBinding(this.vendorProfileId(), binding.bindingId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.errorKey.set(null);
          this.reload();
        },
        error: (err: unknown) =>
          this.handleMutationError(err, 'POSITIVITY.BINDINGS.ERROR.DELETE'),
      });
  }

  reload(): void {
    const profileId = this.vendorProfileId();
    this.state.set('loading');
    this.errorKey.set(null);

    forkJoin({
      bindings: this.service.listBindings(profileId),
      authConfigs: this.service.listAuthConfigs(profileId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.bindings.set(result.bindings);
          this.authConfigs.set(result.authConfigs);
          this.state.set('ready');
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
    const outcome = mapSupplierError(err, 'POSITIVITY.BINDINGS.ERROR.LOAD');
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
