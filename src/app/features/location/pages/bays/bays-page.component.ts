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
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import type { BayPatchRequest, BayRequest, BayResponse } from '@durion-sdk/location';
import { AuthService } from '../../../../core/services/auth.service';
import { LOCATION_PAGE } from '../../../../core/security/route-permissions';
import { LocationPickerComponent } from '../../../../shared/location-picker/location-picker.component';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { ClaimableService, LocationService } from '../../services/location.service';
import {
  BAY_LANES,
  BAY_STATUSES,
  BAY_TYPES,
  BAY_TYPE_DEFAULT_CODES,
  BayChange,
  BayDraft,
  BayLane,
  BayStatus,
  BayType,
  DUTY_CLASSES,
  DutyBand,
  activeClaimants,
  bayChanges,
  codeChanges,
  draftFromBay,
  dutyBand,
  eligibilityKind,
  isOutOfService,
  isTestRecord,
  laneOf,
  naturalCompare,
  newBayDraft,
  operationCodeLabel,
  specialtyCodes,
} from '../../models/bay-setup.models';

type PageState = 'idle' | 'loading' | 'ready' | 'error';
type DialogMode = 'create' | 'edit';
/** On a retype: take the new type's usual services, or keep the bay's current ones. */
type TypeChoice = 'DEFAULTS' | 'KEEP';
type SearchState = 'idle' | 'loading' | 'ready' | 'failed';

/** A translation key and its parameters, resolved in the template. */
interface Message {
  readonly key: string;
  readonly params?: Record<string, string | number>;
}

interface SaveAnnouncement {
  readonly key: string;
  readonly bay: string;
  readonly laneKey: string;
}

interface ChipView {
  readonly code: string;
  readonly label: string;
  readonly onlyBay: boolean;
}

interface BayCardView {
  readonly bay: BayResponse;
  readonly typeKey: string;
  readonly outOfService: boolean;
  readonly testRecord: boolean;
  readonly eligibility: Message;
  readonly duty: Message;
  readonly dutyValue: Message;
  readonly vehicles: number;
  readonly chips: readonly ChipView[];
  readonly hiddenChips: number;
  readonly isWash: boolean;
}

interface LaneView {
  readonly lane: BayLane;
  readonly headingKey: string;
  readonly cards: readonly BayCardView[];
}

/** Chips a card shows before "+N more". */
const VISIBLE_CHIPS = 4;
const MIN_SEARCH_LENGTH = 2;
const I18N = 'LOCATION.BAYS';

@Component({
  selector: 'app-bays-page',
  standalone: true,
  imports: [TranslatePipe, LocationPickerComponent, ModalDialogDirective],
  templateUrl: './bays-page.component.html',
  styleUrl: './bays-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BaysPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly locationService = inject(LocationService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly bayTypes = BAY_TYPES;
  readonly bayStatuses = BAY_STATUSES;
  readonly dutyClasses = DUTY_CLASSES;

  // --- page state (ADR-0031): `state` always moves before `errorKey` ---
  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly locationId = signal('');
  readonly invalidId = signal(false);
  readonly bays = signal<BayResponse[]>([]);
  readonly showTests = signal(false);
  readonly outOfServiceOpen = signal(false);
  readonly expandedCards = signal<ReadonlySet<string>>(new Set());
  /** Page-level polite announcement of the last save. */
  readonly announcement = signal<SaveAnnouncement | null>(null);
  /** Set by a 403 on a write: pos-location scoped `location:bay:manage` away from this location. */
  readonly scopeDenied = signal(false);
  /** Bumped on every reload so a slow read for an earlier location never paints over a newer one. */
  private reloadTick = signal(0);

  /** Service names learned from catalog searches, until a catalog list endpoint exists (backend#2246). */
  private readonly serviceNames = signal<ReadonlyMap<string, string>>(new Map());

  readonly canManage = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(LOCATION_PAGE.bayManage),
  );
  readonly canEdit = computed(() => this.canManage() && !this.scopeDenied());
  readonly canSearchServices = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(LOCATION_PAGE.catalogServiceView),
  );

  readonly hiddenTestCount = computed(() => this.bays().filter(bay => isTestRecord(bay.name)).length);

  /** Claims are counted over every bay at the location, test records included: the backend counts them. */
  private readonly claimants = computed(() => activeClaimants(this.bays()));
  private readonly hasGeneralBays = computed(() => this.bays().some(bay => laneOf(bay) === 'GENERAL'));

  readonly lanes = computed<LaneView[]>(() => {
    const showTests = this.showTests();
    const visible = this.bays()
      .filter(bay => showTests || !isTestRecord(bay.name))
      .sort((a, b) => naturalCompare(a.name, b.name));
    return BAY_LANES.map(lane => ({
      lane,
      headingKey: `${I18N}.LANE.${lane}`,
      cards: visible.filter(bay => laneOf(bay) === lane).map(bay => this.toCard(bay)),
    }));
  });
  readonly hasVisibleBays = computed(() => this.lanes().some(lane => lane.cards.length > 0));

  // --- create/edit dialog ---
  readonly dialogMode = signal<DialogMode | null>(null);
  readonly editingBay = signal<BayResponse | null>(null);
  readonly draft = signal<BayDraft>(newBayDraft());
  readonly typeChoice = signal<TypeChoice>('DEFAULTS');
  /** Set when a type pick filled in the specialty list, for the "Filled in from …" caption. */
  readonly filledFrom = signal<BayType | null>(null);
  readonly saving = signal(false);
  readonly nameErrorKey = signal<string | null>(null);
  readonly saveErrorKey = signal<string | null>(null);

  readonly serviceQuery = signal('');
  readonly serviceResults = signal<ClaimableService[]>([]);
  readonly searchState = signal<SearchState>('idle');
  private readonly searchTerms = new Subject<string>();

  readonly typeChanged = computed(() => {
    const bay = this.editingBay();
    return bay != null && this.draft().bayType !== bay.bayType;
  });
  /** The bay's current services, offered as "Keep" when the type changes (edit only). */
  readonly currentCodes = computed(() => this.editingBay()?.serviceCapabilityCodes ?? []);
  readonly typeDefaults = computed(() => BAY_TYPE_DEFAULT_CODES[this.draft().bayType]);
  readonly isGeneralBay = computed(() => this.draft().serviceCapabilityCodes.length === 0);
  /**
   * pos-location's PATCH treats a null duty class as "unchanged", so a set limit can't be cleared
   * yet (backend#2251). "No limit" is disabled while editing such a bay.
   */
  readonly noLimitLocked = computed(() => this.dialogMode() === 'edit' && this.editingBay()?.maxDutyClass != null);
  readonly draftChips = computed<ChipView[]>(() =>
    this.draft().serviceCapabilityCodes.map(code => ({ code, label: this.serviceLabel(code), onlyBay: false })),
  );
  readonly changes = computed(() => bayChanges(this.editingBay(), this.draft(), this.bays()));
  readonly changeMessages = computed(() => this.changes().map(change => this.changeMessage(change)));

  constructor() {
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.locationId.set(String(params['locationId'] ?? ''));
      this.showTests.set(params['tests'] === '1');
    });

    effect(onCleanup => {
      const locationId = this.locationId();
      this.reloadTick();
      if (!locationId) {
        this.bays.set([]);
        this.state.set('idle');
        return;
      }
      this.state.set('loading');
      this.errorKey.set(null);
      const sub = this.locationService.listBays(locationId).subscribe({
        next: bays => {
          this.bays.set(bays);
          this.state.set('ready');
        },
        error: () => {
          this.bays.set([]);
          this.state.set('error');
          this.errorKey.set('LOCATION.BAYS.ERROR.LOAD');
        },
      });
      onCleanup(() => sub.unsubscribe());
    });

    this.searchTerms
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap(term => this.locationService.searchClaimableServices(term)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ services, ok }) => {
        if (this.serviceQuery().trim().length < MIN_SEARCH_LENGTH) return;
        this.serviceResults.set(services);
        this.searchState.set(ok ? 'ready' : 'failed');
        this.rememberNames(services);
      });
  }

  // --- location and filters ---

  onLocationSelected(locationId: string): void {
    this.invalidId.set(false);
    this.changeLocation(locationId);
  }

  onInvalidSelection(_id: string): void {
    this.changeLocation('');
    this.invalidId.set(true);
  }

  private changeLocation(locationId: string): void {
    this.scopeDenied.set(false);
    this.announcement.set(null);
    this.expandedCards.set(new Set());
    this.locationId.set(locationId);
    this.router.navigate([], { queryParams: { locationId: locationId || null }, queryParamsHandling: 'merge' });
  }

  retry(): void {
    this.reloadTick.update(tick => tick + 1);
  }

  toggleTests(show: boolean): void {
    this.showTests.set(show);
    this.router.navigate([], { queryParams: { tests: show ? 1 : null }, queryParamsHandling: 'merge' });
  }

  toggleOutOfService(): void {
    this.outOfServiceOpen.update(open => !open);
  }

  toggleChips(bayId: string): void {
    this.expandedCards.update(expanded => {
      const next = new Set(expanded);
      if (!next.delete(bayId)) next.add(bayId);
      return next;
    });
  }

  isExpanded(bayId: string): boolean {
    return this.expandedCards().has(bayId);
  }

  // --- create/edit dialog ---

  openCreate(): void {
    if (!this.canEdit()) return;
    this.resetDialog();
    this.editingBay.set(null);
    this.draft.set(newBayDraft());
    this.dialogMode.set('create');
  }

  openEdit(bay: BayResponse): void {
    if (!this.canEdit()) return;
    this.resetDialog();
    this.editingBay.set(bay);
    this.draft.set(draftFromBay(bay));
    this.dialogMode.set('edit');
  }

  closeDialog(): void {
    if (this.saving()) return;
    this.dialogMode.set(null);
    this.editingBay.set(null);
  }

  private resetDialog(): void {
    this.typeChoice.set('DEFAULTS');
    this.filledFrom.set(null);
    this.nameErrorKey.set(null);
    this.saveErrorKey.set(null);
    this.serviceQuery.set('');
    this.serviceResults.set([]);
    this.searchState.set('idle');
  }

  setName(name: string): void {
    this.nameErrorKey.set(null);
    this.patchDraft({ name });
  }

  setType(value: string): void {
    const bayType = BAY_TYPES.find(type => type === value);
    if (!bayType) return;
    const bay = this.editingBay();
    if (bay != null && bay.bayType === bayType) {
      this.patchDraft({ bayType, serviceCapabilityCodes: [...specialtyCodes(bay)] });
      this.filledFrom.set(null);
      return;
    }
    this.typeChoice.set('DEFAULTS');
    this.patchDraft({ bayType, serviceCapabilityCodes: [...BAY_TYPE_DEFAULT_CODES[bayType]] });
    this.filledFrom.set(bayType);
  }

  setTypeChoice(choice: TypeChoice): void {
    this.typeChoice.set(choice);
    const codes = choice === 'KEEP' ? this.currentCodes() : this.typeDefaults();
    this.patchDraft({ serviceCapabilityCodes: [...codes] });
    this.filledFrom.set(choice === 'DEFAULTS' ? this.draft().bayType : null);
  }

  setStatus(value: string): void {
    const status = BAY_STATUSES.find(s => s === value);
    if (status) this.patchDraft({ status });
  }

  setVehicles(value: string): void {
    const vehicles = Number.parseInt(value, 10);
    this.patchDraft({ maxConcurrentVehicles: Number.isFinite(vehicles) ? vehicles : 0 });
  }

  setDutyClass(value: string): void {
    const dutyClass = Number.parseInt(value, 10);
    this.patchDraft({ maxDutyClass: Number.isFinite(dutyClass) ? dutyClass : null });
  }

  setGeneralBay(general: boolean): void {
    const codes = general ? [] : [...this.typeDefaults()];
    this.patchDraft({ serviceCapabilityCodes: codes });
    this.filledFrom.set(general || codes.length === 0 ? null : this.draft().bayType);
  }

  onServiceQuery(query: string): void {
    this.serviceQuery.set(query);
    const term = query.trim();
    if (term.length < MIN_SEARCH_LENGTH) {
      this.serviceResults.set([]);
      this.searchState.set('idle');
      this.searchTerms.next('');
      return;
    }
    this.searchState.set('loading');
    this.searchTerms.next(term);
  }

  addService(service: ClaimableService): void {
    const codes = this.draft().serviceCapabilityCodes;
    if (codes.includes(service.operationCode)) return;
    this.rememberNames([service]);
    this.patchDraft({ serviceCapabilityCodes: [...codes, service.operationCode] });
    this.filledFrom.set(null);
  }

  removeService(code: string): void {
    this.patchDraft({ serviceCapabilityCodes: this.draft().serviceCapabilityCodes.filter(c => c !== code) });
    this.filledFrom.set(null);
  }

  hasService(code: string): boolean {
    return this.draft().serviceCapabilityCodes.includes(code);
  }

  private patchDraft(patch: Partial<BayDraft>): void {
    this.draft.update(draft => ({ ...draft, ...patch }));
  }

  submit(): void {
    const mode = this.dialogMode();
    const locationId = this.locationId();
    if (!mode || !locationId || !this.canEdit() || this.saving()) return;
    const draft = this.draft();
    const name = draft.name.trim();
    if (!name) {
      this.nameErrorKey.set('LOCATION.BAYS.ERROR.NAME_REQUIRED');
      this.focusInDialog('#bay-name');
      return;
    }
    if (!Number.isInteger(draft.maxConcurrentVehicles) || draft.maxConcurrentVehicles < 1) {
      this.saveErrorKey.set('LOCATION.BAYS.ERROR.VEHICLES');
      return;
    }
    const editing = this.editingBay();
    const request: BayRequest = {
      name,
      bayType: draft.bayType,
      status: draft.status,
      capacity: { maxConcurrentVehicles: draft.maxConcurrentVehicles },
      serviceCapabilityCodes: [...draft.serviceCapabilityCodes],
      ...(draft.maxDutyClass == null ? {} : { maxDutyClass: draft.maxDutyClass }),
    };
    const save$ =
      mode === 'edit' && editing
        ? this.locationService.patchBay(locationId, editing.id, this.toPatch(request, editing))
        : this.locationService.createBay(locationId, request);

    this.saving.set(true);
    this.saveErrorKey.set(null);
    this.nameErrorKey.set(null);
    save$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: saved => {
        this.saving.set(false);
        if (this.locationId() !== locationId) return;
        this.bays.update(bays =>
          mode === 'edit' ? bays.map(bay => (bay.id === saved.id ? saved : bay)) : [...bays, saved],
        );
        if (isTestRecord(saved.name) && !this.showTests()) this.toggleTests(true);
        if (laneOf(saved) === 'OUT_OF_SERVICE') this.outOfServiceOpen.set(true);
        this.announcement.set({
          key: mode === 'edit' ? 'LOCATION.BAYS.SAVED.UPDATED' : 'LOCATION.BAYS.SAVED.CREATED',
          bay: saved.name,
          laneKey: `${I18N}.LANE.${laneOf(saved)}`,
        });
        this.dialogMode.set(null);
        this.editingBay.set(null);
        this.focusCard(saved.id);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const status = err instanceof HttpErrorResponse ? err.status : 0;
        if (status === 409) {
          this.nameErrorKey.set('LOCATION.BAYS.ERROR.NAME_TAKEN');
          this.focusInDialog('#bay-name');
          return;
        }
        if (status === 403) this.scopeDenied.set(true);
        this.saveErrorKey.set(saveErrorKey(status));
      },
    });
  }

  /**
   * An edit resends the specialty list only when it or the type changed: pos-location re-validates
   * every code it is sent, so an unrelated rename would otherwise fail on a code the catalog has
   * since retired. A retype always carries the list, which stops the backend resetting it.
   */
  private toPatch(request: BayRequest, bay: BayResponse): BayPatchRequest {
    const { serviceCapabilityCodes, ...rest } = request;
    const { added, removed } = codeChanges(specialtyCodes(bay), serviceCapabilityCodes ?? []);
    const listChanged = added.length > 0 || removed.length > 0 || request.bayType !== bay.bayType;
    return listChanged ? request : rest;
  }

  private focusInDialog(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(`dialog ${selector}`)?.focus(), {
      injector: this.injector,
    });
  }

  /** Focus follows the saved card into its lane (ADR-0029 rule 7). */
  private focusCard(bayId: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(`#bay-${CSS.escape(bayId)}`)?.focus(), {
      injector: this.injector,
    });
  }

  // --- labels ---

  serviceLabel(code: string): string {
    return this.serviceNames().get(code) ?? operationCodeLabel(code);
  }

  typeKey(bayType: string | undefined): string {
    return `${I18N}.TYPE.${bayType ?? 'GENERAL_SERVICE'}`;
  }

  statusKey(status: BayStatus): string {
    return `${I18N}.STATUS.${status}`;
  }

  dutyOptionKey(dutyClass: number): string {
    return `${I18N}.DUTY.OPTION_${dutyBand(dutyClass)}`;
  }

  private rememberNames(services: readonly ClaimableService[]): void {
    if (services.length === 0) return;
    this.serviceNames.update(names => {
      const next = new Map(names);
      for (const service of services) next.set(service.operationCode, service.name);
      return next;
    });
  }

  private toCard(bay: BayResponse): BayCardView {
    const codes = specialtyCodes(bay);
    const outOfService = isOutOfService(bay);
    const claimants = this.claimants();
    const chips = codes.map(code => ({
      code,
      label: this.serviceLabel(code),
      onlyBay: !outOfService && claimants.get(code)?.length === 1,
    }));
    const expanded = this.expandedCards().has(bay.id);
    const visibleChips = expanded ? chips : chips.slice(0, VISIBLE_CHIPS);
    return {
      bay,
      typeKey: this.typeKey(bay.bayType),
      outOfService,
      testRecord: isTestRecord(bay.name),
      eligibility: this.eligibilityMessage(bay, codes.length),
      duty: this.dutyMessage(bay.maxDutyClass, 'TAKES'),
      dutyValue: this.dutyMessage(bay.maxDutyClass, 'VALUE'),
      vehicles: bay.maxConcurrentVehicles ?? 1,
      chips: visibleChips,
      hiddenChips: chips.length - visibleChips.length,
      isWash: laneOf(bay) === 'WASH',
    };
  }

  private eligibilityMessage(bay: BayResponse, count: number): Message {
    const plural = count === 1 ? 'ONE' : 'MANY';
    const kind = eligibilityKind(bay);
    switch (kind) {
      case 'OUT_OF_SERVICE':
        return { key: `${I18N}.CAN_BE_ASSIGNED.${count > 0 ? 'OUT_OF_SERVICE_CLAIMS' : 'OUT_OF_SERVICE'}` };
      case 'SPECIALTY':
        return {
          key: `${I18N}.CAN_BE_ASSIGNED.${this.hasGeneralBays() ? 'SPECIALTY_AFTER_GENERAL' : 'SPECIALTY'}_${plural}`,
          params: { count },
        };
      case 'WASH':
        return { key: `${I18N}.CAN_BE_ASSIGNED.WASH_${plural}`, params: { count } };
      default:
        return { key: `${I18N}.CAN_BE_ASSIGNED.${kind}` };
    }
  }

  private dutyMessage(dutyClass: number | undefined, form: 'TAKES' | 'VALUE'): Message {
    const band: DutyBand | null = dutyBand(dutyClass);
    return band == null
      ? { key: `${I18N}.DUTY.${form}_ANY` }
      : { key: `${I18N}.DUTY.${form}_${band}`, params: { dutyClass: dutyClass ?? 0 } };
  }

  private changeMessage(change: BayChange): Message {
    const bay = this.draft().name.trim() || this.editingBay()?.name || '';
    const key = `${I18N}.CHANGES.${change.kind}`;
    switch (change.kind) {
      case 'ONLY_CLAIMANT':
      case 'NOW_GENERAL_WORK':
      case 'CLAIM_ON_HOLD':
        return { key, params: { bay, service: this.serviceLabel(change.code) } };
      case 'NO_BAY_ABOVE':
        return { key, params: { dutyClass: change.dutyClass } };
      default:
        return { key, params: { bay } };
    }
  }
}

/** The dialog message for a refused save; 409 is handled at the name field instead. */
function saveErrorKey(status: number): string {
  switch (status) {
    case 400:
      return 'LOCATION.BAYS.ERROR.INVALID';
    case 403:
      return 'LOCATION.BAYS.ERROR.NOT_ALLOWED';
    case 404:
      return 'LOCATION.BAYS.ERROR.GONE';
    case 422:
      return 'LOCATION.BAYS.ERROR.INVALID_SERVICES';
    default:
      return 'LOCATION.BAYS.ERROR.SAVE_FAILED';
  }
}
