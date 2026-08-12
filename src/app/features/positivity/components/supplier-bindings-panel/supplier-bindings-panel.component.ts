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
  SupplierAuthConfig,
  SupplierBinding,
  SupplierBindingRequest,
  SupplierCapability,
  SupplierCapabilityDescriptor,
  SupplierProtocolFamily,
} from '../../models/supplier-profile.models';
import { mapSupplierError } from '../../utils/supplier-error.util';

type PanelState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

/**
 * One row of the bindings table: a capability the registry offers, with its
 * binding when one exists. `binding === null` means the capability is
 * configured-off for this vendor — rendered explicitly as disabled, never
 * omitted.
 */
export interface BindingRow {
  capability: SupplierCapability;
  binding: SupplierBinding | null;
  descriptor: SupplierCapabilityDescriptor;
}

/**
 * Bindings tab of the vendor-profile detail screen.
 *
 * Two rules from issue #188 shape this component:
 *
 * 1. **Absence is meaningful.** The table is driven by the registry's capability
 *    catalog, not by the binding list, so a capability with no binding renders
 *    as an explicitly disabled row ("not configured", ADR-0050 §3). Hiding it
 *    would make "disabled" and "does not exist" look identical.
 *
 * 2. **Editing a live binding is confirmed.** Resolving the story's open
 *    question conservatively: any edit to a binding that is currently *enabled*
 *    goes through an explicit confirmation dialog before the request is sent,
 *    because that binding is carrying production traffic. Creating a binding,
 *    and editing a disabled one, do not prompt.
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
  readonly capabilities = signal<SupplierCapabilityDescriptor[]>([]);
  readonly authConfigs = signal<SupplierAuthConfig[]>([]);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly formOpen = signal(false);
  readonly saving = signal(false);
  readonly editingBindingId = signal<string | null>(null);

  /** Set when an edit to a currently-enabled binding is awaiting explicit confirmation. */
  readonly pendingConfirmation = signal<SupplierBindingRequest | null>(null);

  readonly form = new FormGroup({
    capability: new FormControl<SupplierCapability | ''>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    protocolFamily: new FormControl<SupplierProtocolFamily | ''>('', {
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
  });

  private readonly selectedCapability = signal<SupplierCapability | ''>('');
  private readonly selectedFamily = signal<SupplierProtocolFamily | ''>('');

  /** Every registry capability, with its binding when one exists. */
  readonly rows = computed<BindingRow[]>(() => {
    const byCapability = new Map(this.bindings().map(b => [b.capability, b]));
    return this.capabilities().map(descriptor => ({
      capability: descriptor.capability,
      binding: byCapability.get(descriptor.capability) ?? null,
      descriptor,
    }));
  });

  readonly protocolFamilies = computed<SupplierProtocolFamily[]>(() => {
    const capability = this.selectedCapability();
    const descriptor = this.capabilities().find(d => d.capability === capability);
    return descriptor?.protocolOptions.map(option => option.protocolFamily) ?? [];
  });

  readonly protocolVersions = computed<string[]>(() => {
    const capability = this.selectedCapability();
    const family = this.selectedFamily();
    const descriptor = this.capabilities().find(d => d.capability === capability);
    return (
      descriptor?.protocolOptions.find(option => option.protocolFamily === family)?.versions ?? []
    );
  });

  /** The binding currently being edited, if any. */
  readonly editingBinding = computed(() => {
    const id = this.editingBindingId();
    return id ? (this.bindings().find(b => b.bindingId === id) ?? null) : null;
  });

  constructor() {
    this.form.controls.capability.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.selectedCapability.set(value));

    this.form.controls.protocolFamily.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.selectedFamily.set(value));

    effect(onCleanup => {
      const profileId = this.vendorProfileId();
      if (!profileId) {
        return;
      }

      this.state.set('loading');
      this.errorKey.set(null);

      const sub: Subscription = forkJoin({
        bindings: this.service.listBindings(profileId),
        capabilities: this.service.listCapabilities(),
        authConfigs: this.service.listAuthConfigs(profileId),
      }).subscribe({
        next: result => {
          this.bindings.set(result.bindings);
          this.capabilities.set(result.capabilities);
          this.authConfigs.set(result.authConfigs);
          this.state.set(result.capabilities.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.BINDINGS.ERROR.LOAD');
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
    this.fieldErrors.set({});
    this.form.reset({
      capability: row.capability,
      protocolFamily: '',
      protocolVersion: '',
      baseUrl: '',
      path: '',
      authRef: '',
      cronSchedule: '',
      enabled: true,
    });
    this.selectedCapability.set(row.capability);
    this.selectedFamily.set('');
    this.formOpen.set(true);
  }

  startEdit(binding: SupplierBinding): void {
    this.editingBindingId.set(binding.bindingId);
    this.fieldErrors.set({});
    this.form.reset({
      capability: binding.capability,
      protocolFamily: binding.protocolFamily,
      protocolVersion: binding.protocolVersion,
      baseUrl: binding.baseUrl,
      path: binding.path,
      authRef: binding.authRef,
      cronSchedule: binding.cronSchedule ?? '',
      enabled: binding.enabled,
    });
    this.selectedCapability.set(binding.capability);
    this.selectedFamily.set(binding.protocolFamily);
    this.formOpen.set(true);
  }

  cancelForm(): void {
    this.formOpen.set(false);
    this.editingBindingId.set(null);
    this.pendingConfirmation.set(null);
    this.fieldErrors.set({});
  }

  buildRequest(): SupplierBindingRequest {
    const raw = this.form.getRawValue();
    return {
      capability: raw.capability as SupplierCapability,
      protocolFamily: raw.protocolFamily as SupplierProtocolFamily,
      protocolVersion: raw.protocolVersion,
      baseUrl: raw.baseUrl.trim(),
      path: raw.path.trim(),
      authRef: raw.authRef,
      cronSchedule: raw.cronSchedule.trim() || null,
      enabled: raw.enabled,
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
    this.fieldErrors.set({});

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
        const outcome = mapSupplierError(err, 'POSITIVITY.BINDINGS.ERROR.SAVE');
        this.state.set('error');
        this.errorKey.set(outcome.errorKey);
        this.fieldErrors.set(outcome.fieldErrors);
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
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.BINDINGS.ERROR.DELETE');
          this.state.set('error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }

  reload(): void {
    const profileId = this.vendorProfileId();
    this.state.set('loading');
    this.errorKey.set(null);

    forkJoin({
      bindings: this.service.listBindings(profileId),
      capabilities: this.service.listCapabilities(),
      authConfigs: this.service.listAuthConfigs(profileId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.bindings.set(result.bindings);
          this.capabilities.set(result.capabilities);
          this.authConfigs.set(result.authConfigs);
          this.state.set(result.capabilities.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.BINDINGS.ERROR.LOAD');
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }
}
