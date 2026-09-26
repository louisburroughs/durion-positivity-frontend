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
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription, interval } from 'rxjs';
import type {
  CoverageRuleResponse,
  EligibleMobileUnitResponse,
  MobileUnitResponse,
  ServiceAreaResponse,
  TravelBufferPolicyResponse,
} from '@durion-sdk/location';
import { MobileUnitRequestStatusEnum } from '@durion-sdk/location';
import { AuthService } from '../../../../core/services/auth.service';
import { LOCATION_PAGE } from '../../../../core/security/route-permissions';
import { isoDateLocal, parseIsoDateLocal } from '../../../../core/utils/local-date';
import { LocationPickerComponent } from '../../../../shared/location-picker/location-picker.component';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { ServiceSearchComponent } from '../../components/service-search/service-search.component';
import { ClaimableService, LocationService } from '../../services/location.service';
import { isTestRecord, naturalCompare, operationCodeLabel } from '../../models/bay-setup.models';
import {
  ActivationChecklist,
  COVERAGE_RULE_TYPES,
  CoverageField,
  CoverageRuleDraft,
  CoverageRuleType,
  CoverageValidation,
  MOBILE_UNIT_STATUSES,
  MobileUnitDraft,
  MobileUnitPatch,
  MobileUnitStatus,
  UNIT_GROUPS,
  UnitGroup,
  activationChecklist,
  bufferKey,
  coverageTimeline,
  draftFromRule,
  draftFromUnit,
  eligibilityInstant,
  isActiveUnit,
  isReadyToActivate,
  newUnitDraft,
  postalCodeCount,
  toRuleRequest,
  unitGroupOf,
  usualCountry,
  validateCoverage,
} from '../../models/mobile-unit-setup.models';

type PageState = 'idle' | 'loading' | 'ready' | 'error';
type ReadOutcome = 'PENDING' | 'OK' | 'FAILED';
type DialogMode = 'create' | 'edit';
type CheckState = 'idle' | 'loading' | 'ready' | 'failed';

/** A translation key and its parameters, resolved in the template. */
interface Message {
  readonly key: string;
  readonly params?: Record<string, string | number>;
}

interface AreaChip {
  readonly ruleId: string;
  /** Null when the area can't be named: the areas read failed, or the area no longer exists. */
  readonly name: string | null;
  /** Null when the areas read failed. */
  readonly codes: number | null;
}

interface UpcomingCoverage {
  /** Local midnight of the rule's first day, for the date pipe (ADR-0038). */
  readonly from: Date;
  readonly chips: readonly AreaChip[];
}

/** The unit's travel buffer policy, or why none can be shown. */
interface PolicyView {
  readonly policy: TravelBufferPolicyResponse | null;
  readonly missingKey: string | null;
}

interface UnitCardView {
  readonly unit: MobileUnitResponse;
  readonly name: string;
  readonly active: boolean;
  readonly testRecord: boolean;
  readonly sentLine: Message;
  /** The sent line describes a unit that can't be matched. */
  readonly sentWarning: boolean;
  /** Null while the unit's coverage is unknown. */
  readonly checklist: ActivationChecklist | null;
  readonly ready: boolean;
  readonly coverageKnown: boolean;
  readonly current: readonly AreaChip[];
  readonly upcoming: readonly UpcomingCoverage[];
  readonly pastCount: number;
  readonly capabilities: readonly { code: string; label: string }[];
  readonly policy: PolicyView;
  readonly warnings: readonly Message[];
  readonly notes: string;
}

interface GroupView {
  readonly group: UnitGroup;
  readonly headingKey: string;
  readonly cards: readonly UnitCardView[];
}

interface Announcement {
  readonly key: string;
  readonly params: Record<string, string | number>;
}

const I18N = 'LOCATION.MOBILE_UNITS';
/** How often the page re-reads the local day, so a page left open past midnight moves with it. */
const DAY_CHECK_MS = 60_000;

@Component({
  selector: 'app-mobile-units-page',
  standalone: true,
  imports: [DatePipe, TranslatePipe, LocationPickerComponent, ModalDialogDirective, ServiceSearchComponent],
  templateUrl: './mobile-units-page.component.html',
  styleUrl: './mobile-units-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobileUnitsPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly locationService = inject(LocationService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly statuses = MOBILE_UNIT_STATUSES;
  readonly ruleTypes = COVERAGE_RULE_TYPES;
  /** The one clock read behind "today"; a method so a spec can pin it (ADR-0038 §7). */
  now(): Date {
    return new Date();
  }

  /** The local day, re-read every minute: fixed at construction it goes stale across midnight. */
  readonly today = signal(isoDateLocal(this.now()));

  // --- page state (ADR-0031): `state` always moves before `errorKey` ---
  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly locationId = signal('');
  readonly invalidId = signal(false);
  readonly showTests = signal(false);
  readonly units = signal<MobileUnitResponse[]>([]);
  readonly coverage = signal<ReadonlyMap<string, readonly CoverageRuleResponse[]>>(new Map());
  readonly coverageRead = signal<ReadOutcome>('PENDING');
  readonly areas = signal<ServiceAreaResponse[]>([]);
  readonly areasRead = signal<ReadOutcome>('PENDING');
  readonly policies = signal<TravelBufferPolicyResponse[]>([]);
  readonly policiesRead = signal<ReadOutcome>('PENDING');
  readonly announcement = signal<Announcement | null>(null);
  /** Per-card refusal, keyed by unit id. */
  readonly cardErrors = signal<ReadonlyMap<string, string>>(new Map());
  readonly activating = signal<string | null>(null);
  /** Set by a 403 on a write: `location:mobile-unit:manage` doesn't reach this location. */
  readonly scopeDenied = signal(false);
  private readonly reloadTick = signal(0);

  /** Service names learned from catalog searches, until a catalog list endpoint exists (backend#2246). */
  private readonly serviceNames = signal<ReadonlyMap<string, string>>(new Map());

  readonly canManage = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(LOCATION_PAGE.mobileUnitManage),
  );
  readonly canEdit = computed(() => this.canManage() && !this.scopeDenied());
  readonly canSearchServices = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(LOCATION_PAGE.catalogServiceView),
  );

  private readonly areaById = computed(() => new Map(this.areas().map(area => [area.id, area])));
  private readonly policyById = computed(() => new Map(this.policies().map(policy => [policy.id, policy])));

  readonly hiddenTestCount = computed(() => this.units().filter(unit => isTestRecord(unit.name)).length);

  readonly groups = computed<GroupView[]>(() => {
    const showTests = this.showTests();
    const visible = this.units()
      .filter(unit => showTests || !isTestRecord(unit.name))
      .sort((a, b) => naturalCompare(a.name ?? '', b.name ?? ''));
    return UNIT_GROUPS.map(group => ({
      group,
      headingKey: `${I18N}.GROUP.${group}`,
      cards: visible.filter(unit => unitGroupOf(unit) === group).map(unit => this.toCard(unit)),
    }));
  });
  readonly hasVisibleUnits = computed(() => this.groups().some(group => group.cards.length > 0));

  // --- unit create/edit dialog ---
  readonly dialogMode = signal<DialogMode | null>(null);
  readonly editingUnit = signal<MobileUnitResponse | null>(null);
  readonly draft = signal<MobileUnitDraft>(newUnitDraft());
  /** Set after a create: the dialog offers to go straight on to coverage. */
  readonly createdUnit = signal<MobileUnitResponse | null>(null);
  readonly saving = signal(false);
  readonly nameErrorKey = signal<string | null>(null);
  readonly saveErrorKey = signal<string | null>(null);
  readonly draftChips = computed(() =>
    this.draft().serviceCapabilityCodes.map(code => ({ code, label: this.serviceLabel(code) })),
  );
  /** The checklist for the unit being edited, as the draft would leave it. */
  readonly draftChecklist = computed(() => {
    const unit = this.editingUnit();
    const draft = this.draft();
    return activationChecklist(
      { travelBufferPolicyId: draft.travelBufferPolicyId, serviceCapabilityCodes: draft.serviceCapabilityCodes },
      unit ? (this.coverage().get(unit.id)?.length ?? 0) : 0,
    );
  });
  readonly draftCanBeActive = computed(() => isReadyToActivate(this.draftChecklist()));

  // --- coverage editor ---
  readonly coverageUnit = signal<MobileUnitResponse | null>(null);
  readonly ruleRows = signal<CoverageRuleDraft[]>([]);
  readonly coverageSubmitted = signal(false);
  readonly coverageSaving = signal(false);
  readonly coverageSaveErrorKey = signal<string | null>(null);
  private rowSeq = 0;
  readonly coverageValidation = computed<CoverageValidation>(() =>
    validateCoverage(this.ruleRows(), this.coverageUnit() != null && isActiveUnit(this.coverageUnit()!)),
  );
  /** Field errors show once the user has tried to save; the active-unit guard shows at once. */
  readonly showRowErrors = computed(() => this.coverageSubmitted());

  // --- check coverage ---
  readonly checkOpen = signal(false);
  readonly checkPostalCode = signal('');
  readonly checkCountry = signal('');
  readonly checkDate = signal(isoDateLocal(new Date()));
  readonly checkState = signal<CheckState>('idle');
  readonly checkErrorKey = signal<string | null>(null);
  readonly checkResults = signal<EligibleMobileUnitResponse[]>([]);
  /** The postal code and day the shown results answer; `day` is local midnight for the date pipe. */
  readonly checkedFor = signal<{ postalCode: string; date: string; day: Date } | null>(null);
  /** The check in flight: a newer check or a location change drops it (ADR-0063). */
  private checkSub: Subscription | null = null;
  /** The unit and coverage saves in flight, dropped with their dialogs on a location change. */
  private saveSub: Subscription | null = null;
  private coverageSub: Subscription | null = null;
  readonly checkCountryValue = computed(() => this.checkCountry() || usualCountry(this.areas()));

  constructor() {
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const locationId = String(params['locationId'] ?? '');
      if (locationId !== this.locationId()) this.abandonLocationWork();
      this.locationId.set(locationId);
      this.showTests.set(params['tests'] === '1');
    });

    effect(onCleanup => {
      const locationId = this.locationId();
      this.reloadTick();
      this.coverage.set(new Map());
      this.coverageRead.set('PENDING');
      if (!locationId) {
        this.units.set([]);
        this.state.set('idle');
        return;
      }
      this.state.set('loading');
      this.errorKey.set(null);
      const sub = this.locationService.listMobileUnits(locationId).subscribe({
          next: read => {
            this.units.set(read.units);
            this.coverage.set(read.coverage);
            this.coverageRead.set(read.coverageOk ? 'OK' : 'FAILED');
            this.state.set('ready');
          },
          error: () => {
            this.units.set([]);
            this.state.set('error');
            this.errorKey.set('LOCATION.MOBILE_UNITS.ERROR.LOAD');
          },
        });
      onCleanup(() => sub.unsubscribe());
    });

    // Browser only: a server render has no midnight to cross.
    afterNextRender(() => {
      interval(DAY_CHECK_MS)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.today.set(isoDateLocal(this.now())));
    });

    // Service areas and travel buffer policies are tenant-wide: read once, degrade to "unavailable".
    this.locationService
      .listServiceAreas()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ areas, ok }) => {
        this.areas.set(areas);
        this.areasRead.set(ok ? 'OK' : 'FAILED');
      });
    this.locationService
      .listTravelBufferPolicies()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ policies, ok }) => {
        this.policies.set(policies);
        this.policiesRead.set(ok ? 'OK' : 'FAILED');
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
    if (locationId !== this.locationId()) this.abandonLocationWork();
    this.scopeDenied.set(false);
    this.announcement.set(null);
    this.cardErrors.set(new Map());
    this.locationId.set(locationId);
    this.router.navigate([], { queryParams: { locationId: locationId || null }, queryParamsHandling: 'merge' });
  }

  /**
   * Dialogs, saves and checks belong to one location. A location change, from the picker or the
   * URL, closes the dialogs and drops whatever is in flight so nothing lands on the new one.
   */
  private abandonLocationWork(): void {
    for (const sub of [this.saveSub, this.coverageSub, this.checkSub]) sub?.unsubscribe();
    this.saveSub = this.coverageSub = this.checkSub = null;
    this.saving.set(false);
    this.coverageSaving.set(false);
    this.dialogMode.set(null);
    this.editingUnit.set(null);
    this.createdUnit.set(null);
    this.coverageUnit.set(null);
    this.checkResults.set([]);
    this.checkedFor.set(null);
    this.checkState.set('idle');
  }

  retry(): void {
    this.reloadTick.update(tick => tick + 1);
  }

  toggleTests(show: boolean): void {
    this.showTests.set(show);
    this.router.navigate([], { queryParams: { tests: show ? 1 : null }, queryParamsHandling: 'merge' });
  }

  // --- activation ---

  /**
   * Activates a complete unit. An incomplete one isn't sent: focus moves to its first missing
   * checklist row and the page says what is missing.
   */
  activate(card: UnitCardView): void {
    if (!this.canEdit() || this.activating() || card.checklist == null) return;
    const unit = card.unit;
    if (!card.ready) {
      const missing = (['policy', 'capability', 'coverage'] as const).find(item => !card.checklist![item])!;
      this.announcement.set({ key: `${I18N}.ACTIVATE.NEEDS_${missing.toUpperCase()}`, params: { unit: card.name } });
      this.focus(`#check-${CSS.escape(unit.id)}-${missing}`);
      return;
    }
    const locationId = this.locationId();
    this.activating.set(unit.id);
    this.setCardError(unit.id, null);
    this.locationService
      .patchMobileUnit(unit.id, { status: 'ACTIVE' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: saved => {
          this.activating.set(null);
          if (this.locationId() !== locationId) return;
          this.replaceUnit(saved);
          const count = this.currentAreaCount(unit.id);
          this.announcement.set({ key: `${I18N}.ACTIVATE.DONE_${plural(count)}`, params: { unit: card.name, count } });
          this.focus(`#unit-${CSS.escape(unit.id)}`);
        },
        error: (err: unknown) => {
          this.activating.set(null);
          const status = httpStatus(err);
          if (status === 403) this.scopeDenied.set(true);
          this.setCardError(unit.id, status === 422 ? `${I18N}.ACTIVATE.REFUSED` : saveErrorKey(status));
        },
      });
  }

  cardError(unitId: string): string | null {
    return this.cardErrors().get(unitId) ?? null;
  }

  private setCardError(unitId: string, key: string | null): void {
    this.cardErrors.update(errors => {
      const next = new Map(errors);
      if (key) next.set(unitId, key);
      else next.delete(unitId);
      return next;
    });
  }

  private currentAreaCount(unitId: string): number {
    return this.matchableAreaCount(coverageTimeline(this.coverage().get(unitId) ?? [], this.today()).current);
  }

  /**
   * The areas today's rules can send the unit to: known areas with at least one postal code. A
   * switched-off area still counts, because matching still uses it. Only meaningful once the areas
   * read is OK.
   */
  private matchableAreaCount(current: readonly CoverageRuleResponse[]): number {
    const areas = this.areaById();
    return new Set(
      current.map(rule => rule.serviceAreaId).filter(id => {
        const area = areas.get(id);
        return area != null && postalCodeCount(area) > 0;
      }),
    ).size;
  }

  // --- unit create/edit dialog ---

  openCreate(): void {
    if (!this.canEdit()) return;
    this.resetDialog();
    this.editingUnit.set(null);
    this.draft.set(newUnitDraft());
    this.dialogMode.set('create');
  }

  openEdit(unit: MobileUnitResponse, focusField?: string): void {
    if (!this.canEdit()) return;
    this.resetDialog();
    this.editingUnit.set(unit);
    this.draft.set(draftFromUnit(unit));
    this.dialogMode.set('edit');
    if (focusField) this.focus(`dialog #${focusField}`);
  }

  closeDialog(): void {
    if (this.saving()) return;
    const returnTo = this.editingUnit() ?? this.createdUnit();
    this.dialogMode.set(null);
    this.editingUnit.set(null);
    this.createdUnit.set(null);
    if (returnTo) this.focus(`#unit-${CSS.escape(returnTo.id)}`);
  }

  private resetDialog(): void {
    this.createdUnit.set(null);
    this.nameErrorKey.set(null);
    this.saveErrorKey.set(null);
  }

  setName(name: string): void {
    this.nameErrorKey.set(null);
    this.draft.update(draft => ({ ...draft, name }));
  }

  setPolicy(travelBufferPolicyId: string): void {
    if (!travelBufferPolicyId && this.noPolicyLocked()) return;
    this.draft.update(draft => ({ ...draft, travelBufferPolicyId }));
  }

  setNotes(notes: string): void {
    this.draft.update(draft => ({ ...draft, notes }));
  }

  setStatus(value: string): void {
    const status = MOBILE_UNIT_STATUSES.find(s => s === value);
    if (!status || (status === 'ACTIVE' && !this.draftCanBeActive())) return;
    this.draft.update(draft => ({ ...draft, status }));
  }

  addCapability(service: ClaimableService): void {
    this.rememberName(service);
    this.draft.update(draft =>
      draft.serviceCapabilityCodes.includes(service.operationCode)
        ? draft
        : { ...draft, serviceCapabilityCodes: [...draft.serviceCapabilityCodes, service.operationCode] },
    );
  }

  removeCapability(code: string): void {
    this.draft.update(draft => ({
      ...draft,
      serviceCapabilityCodes: draft.serviceCapabilityCodes.filter(c => c !== code),
    }));
  }

  /**
   * PATCH treats a missing `travelBufferPolicyId` as "unchanged" and has no clear value yet
   * (backend#2252), so "No policy" is disabled while editing a unit that has one.
   */
  readonly noPolicyLocked = computed(() => this.dialogMode() === 'edit' && !!this.editingUnit()?.travelBufferPolicyId);

  /** An active unit must keep a capability; the save would be refused (422). */
  readonly lastCapabilityLocked = computed(
    () => this.draft().status === 'ACTIVE' && this.draft().serviceCapabilityCodes.length <= 1,
  );

  submit(): void {
    const mode = this.dialogMode();
    const locationId = this.locationId();
    if (!mode || !locationId || !this.canEdit() || this.saving()) return;
    const draft = this.draft();
    const name = draft.name.trim();
    if (!name) {
      this.nameErrorKey.set('LOCATION.MOBILE_UNITS.ERROR.NAME_REQUIRED');
      this.focus('dialog #unit-name');
      return;
    }
    if (draft.status === 'ACTIVE' && !this.draftCanBeActive()) {
      this.saveErrorKey.set('LOCATION.MOBILE_UNITS.ERROR.ACTIVE_INCOMPLETE');
      return;
    }
    const editing = this.editingUnit();
    const fields = {
      name,
      notes: draft.notes.trim(),
      serviceCapabilityCodes: [...draft.serviceCapabilityCodes],
      ...(draft.travelBufferPolicyId ? { travelBufferPolicyId: draft.travelBufferPolicyId } : {}),
    };
    const save$ =
      mode === 'edit' && editing
        ? this.locationService.patchMobileUnit(editing.id, this.toPatch(fields, draft.status, editing))
        : this.locationService.createMobileUnit({ ...fields, baseLocationId: locationId, status: MobileUnitRequestStatusEnum.Inactive });

    this.saving.set(true);
    this.saveErrorKey.set(null);
    this.saveSub = save$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: saved => {
        this.saving.set(false);
        this.saveSub = null;
        if (mode === 'create') {
          this.units.update(units => [...units, saved]);
          this.coverage.update(coverage => new Map(coverage).set(saved.id, []));
          if (isTestRecord(saved.name) && !this.showTests()) this.toggleTests(true);
          this.createdUnit.set(saved);
          this.announcement.set({ key: `${I18N}.SAVED.CREATED`, params: { unit: saved.name ?? name } });
          this.focus('dialog #add-coverage-now');
          return;
        }
        this.replaceUnit(saved);
        this.announcement.set({ key: `${I18N}.SAVED.UPDATED`, params: { unit: saved.name ?? name } });
        this.dialogMode.set(null);
        this.editingUnit.set(null);
        this.focus(`#unit-${CSS.escape(saved.id)}`);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.saveSub = null;
        const status = httpStatus(err);
        if (status === 409) {
          this.nameErrorKey.set('LOCATION.MOBILE_UNITS.ERROR.NAME_TAKEN');
          this.focus('dialog #unit-name');
          return;
        }
        if (status === 403) this.scopeDenied.set(true);
        this.saveErrorKey.set(saveErrorKey(status));
      },
    });
  }

  /**
   * An edit sends only what changed. PATCH re-checks every capability code it is sent against the
   * catalog, so resending an unchanged list could refuse an unrelated rename.
   */
  private toPatch(
    fields: { name: string; notes: string; serviceCapabilityCodes: string[]; travelBufferPolicyId?: string },
    status: MobileUnitStatus,
    unit: MobileUnitResponse,
  ): MobileUnitPatch {
    const patch: MobileUnitPatch = {};
    if (fields.name !== unit.name) patch.name = fields.name;
    if (fields.notes !== (unit.notes ?? '')) patch.notes = fields.notes;
    if (fields.travelBufferPolicyId && fields.travelBufferPolicyId !== unit.travelBufferPolicyId) {
      patch.travelBufferPolicyId = fields.travelBufferPolicyId;
    }
    const before = unit.serviceCapabilityCodes ?? [];
    const after = fields.serviceCapabilityCodes;
    if (before.length !== after.length || before.some(code => !after.includes(code))) {
      patch.serviceCapabilityCodes = after;
    }
    if (status !== (isActiveUnit(unit) ? 'ACTIVE' : 'INACTIVE')) patch.status = status;
    return patch;
  }

  /** After a create: go straight on to the new unit's coverage. */
  addCoverageForCreated(): void {
    const unit = this.createdUnit();
    this.dialogMode.set(null);
    this.createdUnit.set(null);
    if (unit) this.openCoverage(unit);
  }

  // --- coverage editor ---

  openCoverage(unit: MobileUnitResponse): void {
    if (!this.canEdit()) return;
    const rules = [...(this.coverage().get(unit.id) ?? [])].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    this.ruleRows.set(rules.map(rule => draftFromRule(rule, this.nextRowKey())));
    this.coverageSubmitted.set(false);
    this.coverageSaveErrorKey.set(null);
    this.coverageUnit.set(unit);
  }

  closeCoverage(): void {
    if (this.coverageSaving()) return;
    const unit = this.coverageUnit();
    this.coverageUnit.set(null);
    if (unit) this.focus(`#edit-coverage-${CSS.escape(unit.id)}`);
  }

  addRule(): void {
    const rows = this.ruleRows();
    const nextPriority = rows.reduce((max, row) => Math.max(max, Number(row.priority) || 0), 0) + 1;
    const row: CoverageRuleDraft = {
      key: this.nextRowKey(),
      serviceAreaId: '',
      ruleType: 'SERVICE_AREA',
      priority: String(nextPriority),
      validFrom: '',
      validTo: '',
      maxDistance: '',
    };
    this.ruleRows.set([...rows, row]);
    this.focus(`#rule-${row.key}-area`);
  }

  removeRule(key: string): void {
    const rows = this.ruleRows();
    const index = rows.findIndex(row => row.key === key);
    const remaining = rows.filter(row => row.key !== key);
    this.ruleRows.set(remaining);
    const next = remaining[index] ?? remaining[index - 1];
    this.focus(next ? `#rule-${next.key}-remove` : '#add-rule');
  }

  setRuleField(key: string, field: 'serviceAreaId' | 'priority' | 'validFrom' | 'validTo' | 'maxDistance', value: string): void {
    this.ruleRows.update(rows => rows.map(row => (row.key === key ? { ...row, [field]: value } : row)));
  }

  setRuleType(key: string, value: string): void {
    const ruleType = COVERAGE_RULE_TYPES.find(type => type === value);
    if (!ruleType) return;
    this.ruleRows.update(rows =>
      rows.map(row => (row.key === key ? { ...row, ruleType, maxDistance: ruleType === 'DISTANCE_TIER' ? row.maxDistance : '' } : row)),
    );
  }

  ruleError(key: string, field: CoverageField): string | null {
    if (!this.showRowErrors()) return null;
    return this.coverageValidation().rows.get(key)?.[field] ?? null;
  }

  ruleDescribedBy(key: string, field: CoverageField, hintId?: string): string | null {
    const ids = [this.ruleError(key, field) ? `rule-${key}-${field}-error` : null, hintId ?? null].filter(Boolean);
    return ids.length ? ids.join(' ') : null;
  }

  saveCoverage(): void {
    const unit = this.coverageUnit();
    if (!unit || !this.canEdit() || this.coverageSaving()) return;
    this.coverageSubmitted.set(true);
    const validation = this.coverageValidation();
    if (validation.form || validation.rows.size > 0) {
      const firstKey = this.ruleRows().find(row => validation.rows.has(row.key))?.key;
      if (firstKey) {
        const field = Object.keys(validation.rows.get(firstKey) ?? {})[0] ?? 'serviceAreaId';
        this.focus(`#rule-${firstKey}-${field === 'serviceAreaId' ? 'area' : field}`);
      }
      return;
    }
    this.coverageSaving.set(true);
    this.coverageSaveErrorKey.set(null);
    this.coverageSub = this.locationService
      .replaceCoverageRules(unit.id, this.ruleRows().map(toRuleRequest))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: rules => {
          this.coverageSaving.set(false);
          this.coverageSub = null;
          this.coverage.update(coverage => new Map(coverage).set(unit.id, rules));
          this.announcement.set({
            key: `${I18N}.SAVED.COVERAGE_${plural(rules.length)}`,
            params: { unit: unit.name ?? '', count: rules.length },
          });
          this.closeCoverage();
        },
        error: (err: unknown) => {
          this.coverageSaving.set(false);
          this.coverageSub = null;
          const status = httpStatus(err);
          if (status === 403) this.scopeDenied.set(true);
          this.coverageSaveErrorKey.set(saveErrorKey(status));
        },
      });
  }

  areaOptionKey(area: ServiceAreaResponse): Message {
    const count = postalCodeCount(area);
    return { key: `${I18N}.COVERAGE.AREA_OPTION_${plural(count)}`, params: { area: area.name ?? '', count } };
  }

  /** What to say under a rule's area select: its code count and whether it can match. */
  areaNote(serviceAreaId: string): Message | null {
    if (!serviceAreaId || this.areasRead() !== 'OK') return null;
    const area = this.areaById().get(serviceAreaId);
    if (!area) return { key: `${I18N}.COVERAGE.AREA_MISSING` };
    const count = postalCodeCount(area);
    if (count === 0) return { key: `${I18N}.COVERAGE.AREA_EMPTY` };
    return {
      key: `${I18N}.COVERAGE.${area.active === false ? 'AREA_OFF' : 'AREA_CODES'}_${plural(count)}`,
      params: { count },
    };
  }

  /** A rule's saved area that the areas list doesn't hold still needs an option to show as selected. */
  isUnlistedArea(serviceAreaId: string): boolean {
    return !!serviceAreaId && !this.areaById().has(serviceAreaId);
  }

  private nextRowKey(): string {
    this.rowSeq += 1;
    return `r${this.rowSeq}`;
  }

  // --- check coverage ---

  toggleCheck(): void {
    this.checkOpen.update(open => !open);
  }

  runCheck(): void {
    const postalCode = this.checkPostalCode().trim();
    const date = this.checkDate();
    if (!postalCode) {
      this.checkErrorKey.set('LOCATION.MOBILE_UNITS.CHECK.POSTAL_REQUIRED');
      this.focus('#check-postal');
      return;
    }
    const locationId = this.locationId();
    this.checkErrorKey.set(null);
    this.checkState.set('loading');
    // Only the latest check may answer: a slower earlier one is dropped, not raced.
    this.checkSub?.unsubscribe();
    this.checkSub = this.locationService
      .findEligibleMobileUnits(postalCode, this.checkCountryValue(), eligibilityInstant(date))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: results => {
          this.checkSub = null;
          // Eligibility isn't filtered by base location; this page answers for its own shop.
          this.checkResults.set(results.filter(result => result.baseLocationId === locationId));
          this.checkedFor.set({ postalCode, date, day: parseIsoDateLocal(date) });
          this.checkState.set('ready');
        },
        error: () => {
          this.checkSub = null;
          this.checkState.set('failed');
        },
      });
  }

  // --- labels ---

  serviceLabel(code: string): string {
    return this.serviceNames().get(code) ?? operationCodeLabel(code);
  }

  statusKey(status: string): string {
    return `${I18N}.STATUS.${status}`;
  }

  ruleTypeKey(type: CoverageRuleType): string {
    return `${I18N}.COVERAGE.RULE_TYPE.${type}`;
  }

  /** The buffer in words, e.g. "15 minutes flat"; "type needs fixing" for an unknown type. */
  bufferText(policy: TravelBufferPolicyResponse): Message {
    return { key: bufferKey(policy), params: { value: policy.bufferValue ?? 0 } };
  }

  private rememberName(service: ClaimableService): void {
    this.serviceNames.update(names => new Map(names).set(service.operationCode, service.name));
  }

  private replaceUnit(saved: MobileUnitResponse): void {
    this.units.update(units => units.map(unit => (unit.id === saved.id ? saved : unit)));
  }

  private focus(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }

  private toCard(unit: MobileUnitResponse): UnitCardView {
    const name = unit.name ?? '';
    const active = isActiveUnit(unit);
    const rules = this.coverage().get(unit.id);
    const coverageKnown = rules != null;
    const timeline = coverageTimeline(rules ?? [], this.today());
    const checklist = coverageKnown ? activationChecklist(unit, rules.length) : null;
    const { sentLine, sentWarning } = this.sentLine(active, coverageKnown, timeline.current);

    const upcomingByDate = new Map<string, AreaChip[]>();
    for (const rule of timeline.upcoming) {
      const from = rule.validFrom ?? '';
      upcomingByDate.set(from, [...(upcomingByDate.get(from) ?? []), this.areaChip(rule)]);
    }

    return {
      unit,
      name,
      active,
      testRecord: isTestRecord(name),
      sentLine,
      sentWarning,
      checklist,
      ready: checklist != null && isReadyToActivate(checklist),
      coverageKnown,
      current: timeline.current.map(rule => this.areaChip(rule)),
      upcoming: [...upcomingByDate].map(([from, chips]) => ({ from: parseIsoDateLocal(from), chips })),
      pastCount: timeline.past.length,
      capabilities: (unit.serviceCapabilityCodes ?? []).map(code => ({ code, label: this.serviceLabel(code) })),
      policy: this.policyView(unit.travelBufferPolicyId),
      warnings: this.coverageWarnings(rules ?? []),
      notes: unit.notes?.trim() ?? '',
    };
  }

  /**
   * Where an active unit can be sent today. The count is of areas that can match (see
   * `matchableAreaCount`), so it never claims an area its own warning says covers nobody; while
   * the areas are unknown it says so rather than counting rules.
   */
  private sentLine(
    active: boolean,
    coverageKnown: boolean,
    current: readonly CoverageRuleResponse[],
  ): { sentLine: Message; sentWarning: boolean } {
    if (!active) return { sentLine: { key: `${I18N}.SENT.INACTIVE` }, sentWarning: false };
    if (!coverageKnown) return { sentLine: { key: `${I18N}.SENT.UNKNOWN` }, sentWarning: false };
    if (current.length === 0) return { sentLine: { key: `${I18N}.SENT.NONE_TODAY` }, sentWarning: true };
    const areasRead = this.areasRead();
    if (areasRead !== 'OK') {
      return { sentLine: { key: `${I18N}.SENT.${areasRead === 'FAILED' ? 'AREAS_UNKNOWN' : 'AREAS_CHECKING'}` }, sentWarning: false };
    }
    const count = this.matchableAreaCount(current);
    if (count === 0) return { sentLine: { key: `${I18N}.SENT.NONE_MATCHABLE` }, sentWarning: true };
    return { sentLine: { key: `${I18N}.SENT.AREAS_${plural(count)}`, params: { count } }, sentWarning: false };
  }

  private areaChip(rule: CoverageRuleResponse): AreaChip {
    const area = this.areaById().get(rule.serviceAreaId);
    const known = this.areasRead() === 'OK';
    return { ruleId: rule.id, name: area?.name ?? null, codes: known && area ? postalCodeCount(area) : null };
  }

  private policyView(policyId: string | undefined): PolicyView {
    if (!policyId) return { policy: null, missingKey: `${I18N}.POLICY.NONE` };
    const policy = this.policyById().get(policyId);
    return policy ? { policy, missingKey: null } : { policy: null, missingKey: `${I18N}.POLICY.UNAVAILABLE` };
  }

  /** Coverage that can't match as it looks: an area switched off (still counts), empty, or gone. */
  private coverageWarnings(rules: readonly CoverageRuleResponse[]): Message[] {
    if (this.areasRead() !== 'OK') return [];
    const warnings: Message[] = [];
    const seen = new Set<string>();
    for (const rule of rules) {
      if (seen.has(rule.serviceAreaId)) continue;
      seen.add(rule.serviceAreaId);
      const area = this.areaById().get(rule.serviceAreaId);
      if (!area) warnings.push({ key: `${I18N}.WARNING.AREA_MISSING` });
      else if (postalCodeCount(area) === 0) warnings.push({ key: `${I18N}.WARNING.AREA_EMPTY`, params: { area: area.name ?? '' } });
      else if (area.active === false) warnings.push({ key: `${I18N}.WARNING.AREA_OFF`, params: { area: area.name ?? '' } });
    }
    return warnings;
  }
}

/** The `_ONE` / `_MANY` suffix for a count. */
function plural(count: number): 'ONE' | 'MANY' {
  return count === 1 ? 'ONE' : 'MANY';
}

function httpStatus(err: unknown): number {
  return err instanceof HttpErrorResponse ? err.status : 0;
}

/** The message for a refused write; 409 on a name is handled at the Name field instead. */
function saveErrorKey(status: number): string {
  switch (status) {
    case 400:
      return 'LOCATION.MOBILE_UNITS.ERROR.INVALID';
    case 403:
      return 'LOCATION.MOBILE_UNITS.ERROR.NOT_ALLOWED';
    case 404:
      return 'LOCATION.MOBILE_UNITS.ERROR.GONE';
    case 409:
      return 'LOCATION.MOBILE_UNITS.ERROR.CONFLICT';
    case 422:
      return 'LOCATION.MOBILE_UNITS.ERROR.UNPROCESSABLE';
    default:
      return 'LOCATION.MOBILE_UNITS.ERROR.SAVE_FAILED';
  }
}
