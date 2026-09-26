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
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import type { TravelBufferPolicyResponse } from '@durion-sdk/location';
import { AuthService } from '../../../../core/services/auth.service';
import { LOCATION_PAGE } from '../../../../core/security/route-permissions';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { LocationService } from '../../services/location.service';
import { naturalCompare } from '../../models/bay-setup.models';
import { TRAVEL_BUFFER_TYPES, TravelBufferType, bufferKey, isTravelBufferType } from '../../models/mobile-unit-setup.models';
import {
  TravelBufferPolicyDraft,
  TravelBufferPolicyPatch,
  parseBufferValue,
  policyDraft,
} from '../../models/setup-lists.models';

type PageState = 'idle' | 'loading' | 'ready' | 'error';
type DialogMode = 'create' | 'edit';

interface PolicyRow {
  readonly policy: TravelBufferPolicyResponse;
  readonly name: string;
  readonly bufferKey: string;
  readonly value: number;
  /** The stored type isn't one pos-location accepts (the seeded "MINUTES", backend#2249). */
  readonly needsFixing: boolean;
}

/**
 * Travel buffer policies: the extra time allowed around a mobile unit's visits for driving. Units
 * record one, but scheduling doesn't apply it yet, and the page says so.
 */
@Component({
  selector: 'app-travel-buffer-policies-page',
  standalone: true,
  imports: [TranslatePipe, RouterLink, ModalDialogDirective],
  templateUrl: './travel-buffer-policies-page.component.html',
  styleUrl: './travel-buffer-policies-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TravelBufferPoliciesPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly locationService = inject(LocationService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly bufferTypes = TRAVEL_BUFFER_TYPES;

  // --- page state (ADR-0031): `state` always moves before `errorKey` ---
  readonly state = signal<PageState>('loading');
  readonly errorKey = signal<string | null>(null);
  readonly policies = signal<TravelBufferPolicyResponse[]>([]);
  readonly announcement = signal<{ key: string; policy: string } | null>(null);
  readonly scopeDenied = signal(false);
  private readonly reloadTick = signal(0);

  readonly canEdit = computed(
    () =>
      !this.scopeDenied() &&
      (!this.auth.permissionsKnown() || this.auth.hasAnyPermission(LOCATION_PAGE.travelBufferPolicyManage)),
  );

  readonly rows = computed<PolicyRow[]>(() =>
    [...this.policies()]
      .sort((a, b) => naturalCompare(a.name ?? '', b.name ?? ''))
      .map(policy => ({
        policy,
        name: policy.name ?? '',
        bufferKey: bufferKey(policy),
        value: policy.bufferValue ?? 0,
        needsFixing: !isTravelBufferType(policy.bufferType),
      })),
  );

  // --- create/edit dialog ---
  readonly dialogMode = signal<DialogMode | null>(null);
  readonly editing = signal<TravelBufferPolicyResponse | null>(null);
  readonly draft = signal<TravelBufferPolicyDraft>(policyDraft(null));
  readonly nameErrorKey = signal<string | null>(null);
  readonly typeErrorKey = signal<string | null>(null);
  readonly valueErrorKey = signal<string | null>(null);
  readonly saveErrorKey = signal<string | null>(null);
  readonly saving = signal(false);

  constructor() {
    effect(onCleanup => {
      this.reloadTick();
      this.state.set('loading');
      this.errorKey.set(null);
      const sub = this.locationService.listTravelBufferPolicies().subscribe(({ policies, ok }) => {
        if (!ok) {
          this.state.set('error');
          this.errorKey.set('LOCATION.TRAVEL_BUFFERS.ERROR.LOAD');
          return;
        }
        this.policies.set(policies);
        this.state.set('ready');
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  retry(): void {
    this.reloadTick.update(tick => tick + 1);
  }

  openCreate(): void {
    if (!this.canEdit()) return;
    this.resetDialog();
    this.editing.set(null);
    this.draft.set(policyDraft(null));
    this.dialogMode.set('create');
  }

  openEdit(policy: TravelBufferPolicyResponse): void {
    if (!this.canEdit()) return;
    this.resetDialog();
    this.editing.set(policy);
    this.draft.set(policyDraft(policy));
    this.dialogMode.set('edit');
    if (!isTravelBufferType(policy.bufferType)) this.focus('dialog #policy-type');
  }

  closeDialog(): void {
    if (this.saving()) return;
    const policy = this.editing();
    this.dialogMode.set(null);
    this.editing.set(null);
    if (policy) this.focus(`#policy-${CSS.escape(policy.id)}`);
  }

  private resetDialog(): void {
    this.nameErrorKey.set(null);
    this.typeErrorKey.set(null);
    this.valueErrorKey.set(null);
    this.saveErrorKey.set(null);
  }

  patchDraft(patch: Partial<TravelBufferPolicyDraft>): void {
    if (patch.name !== undefined) this.nameErrorKey.set(null);
    if (patch.bufferType !== undefined) this.typeErrorKey.set(null);
    if (patch.bufferValue !== undefined) this.valueErrorKey.set(null);
    this.draft.update(draft => ({ ...draft, ...patch }));
  }

  setType(value: string): void {
    this.patchDraft({ bufferType: TRAVEL_BUFFER_TYPES.find(type => type === value) ?? '' });
  }

  typeKey(type: TravelBufferType): string {
    return `LOCATION.TRAVEL_BUFFERS.TYPE.${type}`;
  }

  /** The unit shown after the value: minutes, % or × distance. */
  readonly suffixKey = computed(() => {
    const type = this.draft().bufferType;
    return type ? `LOCATION.TRAVEL_BUFFERS.SUFFIX.${type}` : null;
  });

  submit(): void {
    const mode = this.dialogMode();
    if (!mode || !this.canEdit() || this.saving()) return;
    const draft = this.draft();
    const name = draft.name.trim();
    const value = parseBufferValue(draft.bufferValue);
    let firstInvalid: string | null = null;
    if (mode === 'create' && !name) {
      this.nameErrorKey.set('LOCATION.TRAVEL_BUFFERS.ERROR.NAME_REQUIRED');
      firstInvalid ??= 'policy-name';
    }
    if (!draft.bufferType) {
      this.typeErrorKey.set('LOCATION.TRAVEL_BUFFERS.ERROR.TYPE_REQUIRED');
      firstInvalid ??= 'policy-type';
    }
    if (value === undefined) {
      this.valueErrorKey.set('LOCATION.TRAVEL_BUFFERS.ERROR.VALUE');
      firstInvalid ??= 'policy-value';
    }
    if (firstInvalid || !draft.bufferType || value === undefined) {
      this.focus(`dialog #${firstInvalid}`);
      return;
    }
    const notes = draft.notes.trim();
    const editing = this.editing();
    const save$ =
      mode === 'edit' && editing
        ? this.locationService.patchTravelBufferPolicy(editing.id, toPatch(editing, draft.bufferType, value, notes))
        : this.locationService.createTravelBufferPolicy({
            name,
            bufferType: draft.bufferType,
            ...(value === null ? {} : { bufferValue: value }),
            ...(notes ? { notes } : {}),
          });

    this.saving.set(true);
    this.saveErrorKey.set(null);
    save$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: saved => {
        this.saving.set(false);
        this.policies.update(policies =>
          mode === 'edit' ? policies.map(p => (p.id === saved.id ? saved : p)) : [...policies, saved],
        );
        this.announcement.set({
          key: mode === 'edit' ? 'LOCATION.TRAVEL_BUFFERS.SAVED.UPDATED' : 'LOCATION.TRAVEL_BUFFERS.SAVED.CREATED',
          policy: saved.name ?? name,
        });
        this.dialogMode.set(null);
        this.editing.set(null);
        this.focus(`#policy-${CSS.escape(saved.id)}`);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const status = err instanceof HttpErrorResponse ? err.status : 0;
        if (status === 409) {
          this.nameErrorKey.set('LOCATION.TRAVEL_BUFFERS.ERROR.NAME_TAKEN');
          this.focus('dialog #policy-name');
          return;
        }
        if (status === 403) this.scopeDenied.set(true);
        this.saveErrorKey.set(saveErrorKey(status));
      },
    });
  }

  private focus(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }
}

/** Only what changed. A policy with an invalid stored type always sends the chosen one. */
function toPatch(
  policy: TravelBufferPolicyResponse,
  bufferType: TravelBufferType,
  value: number | null,
  notes: string,
): TravelBufferPolicyPatch {
  const patch: TravelBufferPolicyPatch = {};
  if (bufferType !== policy.bufferType) patch.bufferType = bufferType;
  if (value !== (policy.bufferValue ?? null)) patch.bufferValue = value;
  if (notes !== (policy.notes ?? '')) patch.notes = notes;
  return patch;
}

function saveErrorKey(status: number): string {
  switch (status) {
    case 400:
    case 422:
      return 'LOCATION.TRAVEL_BUFFERS.ERROR.INVALID';
    case 403:
      return 'LOCATION.TRAVEL_BUFFERS.ERROR.NOT_ALLOWED';
    case 404:
      return 'LOCATION.TRAVEL_BUFFERS.ERROR.GONE';
    default:
      return 'LOCATION.TRAVEL_BUFFERS.ERROR.SAVE_FAILED';
  }
}
