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
import { Observable, of, switchMap } from 'rxjs';
import type { PostalCodeEntry, ServiceAreaResponse } from '@durion-sdk/location';
import { AuthService } from '../../../../core/services/auth.service';
import { LOCATION_PAGE } from '../../../../core/security/route-permissions';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { LocationService } from '../../services/location.service';
import { naturalCompare } from '../../models/bay-setup.models';
import { usualCountry } from '../../models/mobile-unit-setup.models';
import {
  ServiceAreaDraft,
  ServiceAreaPatch,
  isCountryCode,
  parsePostalCodes,
  postalCodeKey,
  samePostalCodes,
} from '../../models/setup-lists.models';

type PageState = 'idle' | 'loading' | 'ready' | 'error';
type DialogMode = 'create' | 'edit';

/** Postal codes a row shows before "and N more". */
const SAMPLE_CODES = 3;

interface AreaRow {
  readonly area: ServiceAreaResponse;
  readonly name: string;
  readonly active: boolean;
  readonly count: number;
  readonly samples: string;
  readonly more: number;
}

/**
 * Service areas: named sets of postal codes that mobile-unit coverage rules point at. A customer
 * is matched to a unit by postal code through one of these, so an area with no codes covers nobody.
 */
@Component({
  selector: 'app-service-areas-page',
  standalone: true,
  imports: [TranslatePipe, RouterLink, ModalDialogDirective],
  templateUrl: './service-areas-page.component.html',
  styleUrl: './service-areas-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiceAreasPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly locationService = inject(LocationService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  // --- page state (ADR-0031): `state` always moves before `errorKey` ---
  readonly state = signal<PageState>('loading');
  readonly errorKey = signal<string | null>(null);
  readonly areas = signal<ServiceAreaResponse[]>([]);
  readonly announcement = signal<{ key: string; area: string } | null>(null);
  readonly scopeDenied = signal(false);
  private readonly reloadTick = signal(0);

  readonly canEdit = computed(
    () =>
      !this.scopeDenied() &&
      (!this.auth.permissionsKnown() || this.auth.hasAnyPermission(LOCATION_PAGE.serviceAreaManage)),
  );

  readonly rows = computed<AreaRow[]>(() =>
    [...this.areas()]
      .sort((a, b) => naturalCompare(a.name ?? '', b.name ?? ''))
      .map(area => {
        const codes = area.postalCodes ?? [];
        return {
          area,
          name: area.name ?? '',
          active: area.active !== false,
          count: codes.length,
          samples: codes
            .slice(0, SAMPLE_CODES)
            .map(entry => entry.postalCode)
            .join(', '),
          more: Math.max(0, codes.length - SAMPLE_CODES),
        };
      }),
  );

  // --- create/edit dialog ---
  readonly dialogMode = signal<DialogMode | null>(null);
  readonly editing = signal<ServiceAreaResponse | null>(null);
  readonly draft = signal<ServiceAreaDraft>(this.emptyDraft());
  readonly pasteText = signal('');
  readonly pasteNote = signal<{ key: string; params: Record<string, string | number> } | null>(null);
  readonly nameErrorKey = signal<string | null>(null);
  readonly codesErrorKey = signal<string | null>(null);
  readonly saveErrorKey = signal<string | null>(null);
  readonly saving = signal(false);

  constructor() {
    effect(onCleanup => {
      this.reloadTick();
      this.state.set('loading');
      this.errorKey.set(null);
      const sub = this.locationService.listServiceAreas().subscribe(({ areas, ok }) => {
        if (!ok) {
          this.state.set('error');
          this.errorKey.set('LOCATION.SERVICE_AREAS.ERROR.LOAD');
          return;
        }
        this.areas.set(areas);
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
    this.draft.set(this.emptyDraft());
    this.dialogMode.set('create');
  }

  openEdit(area: ServiceAreaResponse): void {
    if (!this.canEdit()) return;
    this.resetDialog();
    this.editing.set(area);
    const codes = area.postalCodes ?? [];
    this.draft.set({
      name: area.name ?? '',
      description: area.description ?? '',
      active: area.active !== false,
      countryCode: codes[0]?.countryCode ?? usualCountry(this.areas()),
      postalCodes: [...codes],
    });
    this.dialogMode.set('edit');
  }

  closeDialog(): void {
    if (this.saving()) return;
    const area = this.editing();
    this.dialogMode.set(null);
    this.editing.set(null);
    if (area) this.focus(`#area-${CSS.escape(area.id)}`);
  }

  private resetDialog(): void {
    this.pasteText.set('');
    this.pasteNote.set(null);
    this.nameErrorKey.set(null);
    this.codesErrorKey.set(null);
    this.saveErrorKey.set(null);
  }

  private emptyDraft(): ServiceAreaDraft {
    return { name: '', description: '', active: true, countryCode: usualCountry(this.areas()), postalCodes: [] };
  }

  patchDraft(patch: Partial<ServiceAreaDraft>): void {
    if (patch.name !== undefined) this.nameErrorKey.set(null);
    this.draft.update(draft => ({ ...draft, ...patch }));
  }

  /** Adds the pasted codes for the chosen country, dropping repeats and codes too long to store. */
  addPasted(): void {
    const country = this.draft().countryCode;
    if (!isCountryCode(country)) {
      this.codesErrorKey.set('LOCATION.SERVICE_AREAS.ERROR.COUNTRY');
      this.focus('dialog #area-country');
      return;
    }
    const parsed = parsePostalCodes(this.pasteText(), country, this.draft().postalCodes);
    this.codesErrorKey.set(null);
    this.draft.update(draft => ({ ...draft, postalCodes: [...draft.postalCodes, ...parsed.added] }));
    this.pasteText.set('');
    this.pasteNote.set({
      key: parsed.tooLong.length > 0 ? 'LOCATION.SERVICE_AREAS.PASTE.ADDED_SKIPPED' : 'LOCATION.SERVICE_AREAS.PASTE.ADDED',
      params: { added: parsed.added.length, duplicates: parsed.duplicates, skipped: parsed.tooLong.join(', ') },
    });
  }

  removeCode(entry: PostalCodeEntry): void {
    const key = postalCodeKey(entry);
    this.draft.update(draft => ({ ...draft, postalCodes: draft.postalCodes.filter(e => postalCodeKey(e) !== key) }));
  }

  removeAllCodes(): void {
    this.draft.update(draft => ({ ...draft, postalCodes: [] }));
    this.focus('dialog #area-paste');
  }

  codeKey(entry: PostalCodeEntry): string {
    return postalCodeKey(entry);
  }

  submit(): void {
    const mode = this.dialogMode();
    if (!mode || !this.canEdit() || this.saving()) return;
    const draft = this.draft();
    const name = draft.name.trim();
    if (mode === 'create' && !name) {
      this.nameErrorKey.set('LOCATION.SERVICE_AREAS.ERROR.NAME_REQUIRED');
      this.focus('dialog #area-name');
      return;
    }
    // pos-location refuses an empty postal-code set on create and on replace.
    if (draft.postalCodes.length === 0) {
      this.codesErrorKey.set('LOCATION.SERVICE_AREAS.ERROR.CODES_REQUIRED');
      this.focus('dialog #area-paste');
      return;
    }
    const editing = this.editing();
    const save$ = mode === 'edit' && editing ? this.saveEdit(editing, draft) : this.saveCreate(name, draft);

    this.saving.set(true);
    this.saveErrorKey.set(null);
    save$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: saved => {
        this.saving.set(false);
        this.areas.update(areas =>
          mode === 'edit' ? areas.map(area => (area.id === saved.id ? saved : area)) : [...areas, saved],
        );
        this.announcement.set({
          key: mode === 'edit' ? 'LOCATION.SERVICE_AREAS.SAVED.UPDATED' : 'LOCATION.SERVICE_AREAS.SAVED.CREATED',
          area: saved.name ?? name,
        });
        this.dialogMode.set(null);
        this.editing.set(null);
        this.focus(`#area-${CSS.escape(saved.id)}`);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const status = err instanceof HttpErrorResponse ? err.status : 0;
        if (status === 409) {
          this.nameErrorKey.set('LOCATION.SERVICE_AREAS.ERROR.NAME_TAKEN');
          this.focus('dialog #area-name');
          return;
        }
        if (status === 403) this.scopeDenied.set(true);
        this.saveErrorKey.set(saveErrorKey(status));
      },
    });
  }

  private saveCreate(name: string, draft: ServiceAreaDraft): Observable<ServiceAreaResponse> {
    const description = draft.description.trim();
    return this.locationService.createServiceArea({
      name,
      active: draft.active,
      postalCodes: draft.postalCodes,
      ...(description ? { description } : {}),
    });
  }

  /** Details and postal codes are separate writes; each is sent only when it changed. */
  private saveEdit(area: ServiceAreaResponse, draft: ServiceAreaDraft): Observable<ServiceAreaResponse> {
    const patch: ServiceAreaPatch = {};
    const description = draft.description.trim();
    if (description !== (area.description ?? '')) patch.description = description;
    if (draft.active !== (area.active !== false)) patch.active = draft.active;
    const details$ = Object.keys(patch).length > 0 ? this.locationService.patchServiceArea(area.id, patch) : of(area);
    const codesChanged = !samePostalCodes(area.postalCodes ?? [], draft.postalCodes);
    return details$.pipe(
      switchMap(saved =>
        codesChanged ? this.locationService.replaceServiceAreaPostalCodes(area.id, draft.postalCodes) : of(saved),
      ),
    );
  }

  private focus(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }
}

function saveErrorKey(status: number): string {
  switch (status) {
    case 400:
      return 'LOCATION.SERVICE_AREAS.ERROR.INVALID';
    case 403:
      return 'LOCATION.SERVICE_AREAS.ERROR.NOT_ALLOWED';
    case 404:
      return 'LOCATION.SERVICE_AREAS.ERROR.GONE';
    default:
      return 'LOCATION.SERVICE_AREAS.ERROR.SAVE_FAILED';
  }
}
