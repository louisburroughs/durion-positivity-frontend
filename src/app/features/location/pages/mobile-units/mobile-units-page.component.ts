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
import { isoDateLocal } from '../../../../core/utils/local-date';
import { LocationPickerComponent } from '../../../../shared/location-picker/location-picker.component';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { RailCaption, ServiceRailComponent } from '../../components/service-rail/service-rail.component';
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
  readonly from: string;
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
  readonly capabilities: readonly { code: string; label: string; pending: boolean }[];
  readonly codes: readonly string[];
  readonly saving: boolean;
  readonly policy: PolicyView;
  readonly warnings: readonly Message[];
  readonly notes: string;
}

interface GroupView {
  readonly group: UnitGroup;
  readonly headingKey: string;
  readonly cards: readonly UnitCardView[];
}

/** What is being dragged: a catalog service from the list, or a capability chip off a card. */
type Dragging =
  | { readonly kind: 'SERVICE'; readonly service: ClaimableService }
  | { readonly kind: 'CHIP'; readonly unitId: string; readonly code: string }
  | null;

/** The last capability change: what it did, and how to take it back. */
interface Outcome {
  readonly messages: readonly Message[];
  readonly undo: { readonly unitId: string; readonly codes: readonly string[] } | null;
}

interface Announcement {
  readonly key: string;
  readonly params: Record<string, string | number>;
}

const I18N = 'LOCATION.MOBILE_UNITS';

@Component({
  selector: 'app-mobile-units-page',
  standalone: true,
  imports: [DatePipe, TranslatePipe, LocationPickerComponent, ModalDialogDirective, ServiceRailComponent, ServiceSearchComponent],
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
  readonly today = isoDateLocal(new Date());

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

  // --- capability changes straight from the cards ---
  readonly dragging = signal<Dragging>(null);
  /** Lists being saved, shown on the card until the save confirms or fails. */
  readonly pendingCodes = signal<ReadonlyMap<string, readonly string[]>>(new Map());
  readonly outcome = signal<Outcome | null>(null);
  /** The Add capability dialog: the pointer-free route for a drop (ADR-0029 rule 13). */
  readonly addDialogUnit = signal<MobileUnitResponse | null>(null);
  readonly picked = signal<ClaimableService[]>([]);

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
  /** The postal code and date the shown results answer. */
  readonly checkedFor = signal<{ postalCode: string; date: string } | null>(null);
  readonly checkCountryValue = computed(() => this.checkCountry() || usualCountry(this.areas()));

  constructor() {
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.locationId.set(String(params['locationId'] ?? ''));
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
    this.scopeDenied.set(false);
    this.announcement.set(null);
    this.cardErrors.set(new Map());
    this.outcome.set(null);
    this.pendingCodes.set(new Map());
    this.checkResults.set([]);
    this.checkedFor.set(null);
    this.checkState.set('idle');
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
    const rules = this.coverage().get(unitId) ?? [];
    return new Set(coverageTimeline(rules, this.today).current.map(rule => rule.serviceAreaId)).size;
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
    save$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: saved => {
        this.saving.set(false);
        if (this.locationId() !== locationId) return;
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
    const locationId = this.locationId();
    this.coverageSaving.set(true);
    this.coverageSaveErrorKey.set(null);
    this.locationService
      .replaceCoverageRules(unit.id, this.ruleRows().map(toRuleRequest))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: rules => {
          this.coverageSaving.set(false);
          if (this.locationId() !== locationId) return;
          this.coverage.update(coverage => new Map(coverage).set(unit.id, rules));
          this.announcement.set({
            key: `${I18N}.SAVED.COVERAGE_${plural(rules.length)}`,
            params: { unit: unit.name ?? '', count: rules.length },
          });
          this.closeCoverage();
        },
        error: (err: unknown) => {
          this.coverageSaving.set(false);
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
    this.locationService
      .findEligibleMobileUnits(postalCode, this.checkCountryValue(), eligibilityInstant(date))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: results => {
          if (this.locationId() !== locationId) return;
          // Eligibility isn't filtered by base location; this page answers for its own shop.
          this.checkResults.set(results.filter(result => result.baseLocationId === locationId));
          this.checkedFor.set({ postalCode, date });
          this.checkState.set('ready');
        },
        error: () => {
          this.checkState.set('failed');
        },
      });
  }

  // --- capability changes from the cards: drag and drop, chip ×, Add capability ---

  readonly draggedServiceName = computed(() => {
    const dragging = this.dragging();
    return dragging?.kind === 'SERVICE' ? dragging.service.name : '';
  });

  /** While a chip is dragged, the services list takes the drop that removes it. */
  readonly railRemoveTarget = computed<RailCaption | null>(() => {
    const dragging = this.dragging();
    if (dragging?.kind !== 'CHIP') return null;
    const unit = this.units().find(u => u.id === dragging.unitId);
    return {
      key: `${I18N}.DROP.REMOVE_ZONE`,
      params: { service: this.serviceLabel(dragging.code), unit: unit?.name ?? '' },
    };
  });

  /** Which units here record each service, under its row in the services list. */
  readonly describeService = (code: string): RailCaption => {
    const holders = this.units().filter(unit => (unit.serviceCapabilityCodes ?? []).includes(code));
    if (holders.length === 0) return { key: `${I18N}.RAIL.NONE` };
    if (holders.length === 1) return { key: `${I18N}.RAIL.ONE`, params: { unit: holders[0].name ?? '' } };
    return { key: `${I18N}.RAIL.MANY`, params: { count: holders.length } };
  };

  onServiceDragStart(service: ClaimableService): void {
    this.dragging.set({ kind: 'SERVICE', service });
  }

  onChipDragStart(unit: MobileUnitResponse, code: string, event: DragEvent): void {
    event.dataTransfer?.setData('text/plain', code);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    this.dragging.set({ kind: 'CHIP', unitId: unit.id, code });
  }

  onDragEnd(): void {
    this.dragging.set(null);
  }

  dropState(card: UnitCardView): 'READY' | 'ALREADY' | 'BUSY' | null {
    const dragging = this.dragging();
    if (dragging?.kind !== 'SERVICE' || !this.canEdit()) return null;
    if (card.codes.includes(dragging.service.operationCode)) return 'ALREADY';
    return card.saving ? 'BUSY' : 'READY';
  }

  onCardDragOver(card: UnitCardView, event: DragEvent): void {
    if (this.dropState(card) !== 'READY') return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  onCardDrop(card: UnitCardView, event: DragEvent): void {
    const dragging = this.dragging();
    const state = this.dropState(card);
    this.dragging.set(null);
    if (dragging?.kind !== 'SERVICE' || state !== 'READY') return;
    event.preventDefault();
    this.addCapabilities(card.unit, [dragging.service]);
  }

  onRailRemoveDrop(): void {
    const dragging = this.dragging();
    this.dragging.set(null);
    if (dragging?.kind !== 'CHIP') return;
    const unit = this.units().find(u => u.id === dragging.unitId);
    if (unit) this.removeCapabilityFromUnit(unit, dragging.code);
  }

  addCapabilities(unit: MobileUnitResponse, services: readonly ClaimableService[]): void {
    const current = this.currentCodesOf(unit);
    const fresh = services.filter(service => !current.includes(service.operationCode));
    if (fresh.length === 0) return;
    fresh.forEach(service => this.rememberName(service));
    const message: Message =
      fresh.length === 1
        ? { key: `${I18N}.DROP.ADDED`, params: { unit: unit.name ?? '', service: fresh[0].name } }
        : { key: `${I18N}.DROP.ADDED_MANY`, params: { unit: unit.name ?? '', count: fresh.length } };
    this.changeCodes(unit, [...current, ...fresh.map(service => service.operationCode)], message, true);
  }

  /**
   * Removes one capability. An active unit's last one is refused before any request: pos-location
   * would refuse it (422), and the fix is to set the unit inactive first.
   */
  removeCapabilityFromUnit(unit: MobileUnitResponse, code: string): void {
    if (!this.canEdit()) return;
    const current = this.currentCodesOf(unit);
    const index = current.indexOf(code);
    if (index < 0) return;
    if (current.length === 1 && isActiveUnit(unit)) {
      this.setCardError(unit.id, `${I18N}.DROP.LAST_CAPABILITY`);
      return;
    }
    const next = current.filter(c => c !== code);
    this.changeCodes(
      unit,
      next,
      { key: `${I18N}.DROP.REMOVED`, params: { unit: unit.name ?? '', service: this.serviceLabel(code) } },
      true,
    );
    const following = next[index] ?? next[index - 1];
    this.focus(
      following
        ? `#cap-remove-${CSS.escape(unit.id)}-${CSS.escape(following)}`
        : `#add-capability-${CSS.escape(unit.id)}`,
    );
  }

  undo(): void {
    const undo = this.outcome()?.undo;
    const unit = undo && this.units().find(u => u.id === undo.unitId);
    if (!undo || !unit) return;
    this.changeCodes(unit, [...undo.codes], { key: `${I18N}.DROP.UNDONE`, params: { unit: unit.name ?? '' } }, false);
  }

  dismissOutcome(): void {
    this.outcome.set(null);
  }

  private currentCodesOf(unit: MobileUnitResponse): readonly string[] {
    return this.pendingCodes().get(unit.id) ?? unit.serviceCapabilityCodes ?? [];
  }

  /**
   * Saves a unit's whole capability list (PATCH replaces it). The card shows the new list at once,
   * marked pending; on success the page offers Undo; on refusal the card goes back and says why.
   */
  private changeCodes(unit: MobileUnitResponse, next: string[], message: Message, offerUndo: boolean): void {
    const locationId = this.locationId();
    if (!this.canEdit() || !locationId) return;
    if (this.pendingCodes().has(unit.id)) {
      this.setCardError(unit.id, `${I18N}.DROP.BUSY`);
      return;
    }
    if (next.length === 0 && isActiveUnit(unit)) {
      this.setCardError(unit.id, `${I18N}.DROP.LAST_CAPABILITY`);
      return;
    }
    const previous = [...(unit.serviceCapabilityCodes ?? [])];
    this.setCardError(unit.id, null);
    this.setPending(unit.id, next);
    this.locationService
      .patchMobileUnit(unit.id, { serviceCapabilityCodes: next })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: saved => {
          this.setPending(unit.id, null);
          if (this.locationId() !== locationId) return;
          this.replaceUnit(saved);
          this.outcome.set({ messages: [message], undo: offerUndo ? { unitId: saved.id, codes: previous } : null });
        },
        error: (err: unknown) => {
          this.setPending(unit.id, null);
          const status = httpStatus(err);
          if (status === 403) this.scopeDenied.set(true);
          this.setCardError(unit.id, status === 422 ? `${I18N}.DROP.INVALID` : saveErrorKey(status));
        },
      });
  }

  private setPending(unitId: string, codes: readonly string[] | null): void {
    this.pendingCodes.update(pending => {
      const next = new Map(pending);
      if (codes) next.set(unitId, codes);
      else next.delete(unitId);
      return next;
    });
  }

  openAddDialog(unit: MobileUnitResponse): void {
    if (!this.canEdit() || !this.canSearchServices()) return;
    this.picked.set([]);
    this.addDialogUnit.set(unit);
  }

  closeAddDialog(): void {
    const unit = this.addDialogUnit();
    this.addDialogUnit.set(null);
    if (unit) this.focus(`#add-capability-${CSS.escape(unit.id)}`);
  }

  pick(service: ClaimableService): void {
    this.picked.update(picked =>
      picked.some(p => p.operationCode === service.operationCode) ? picked : [...picked, service],
    );
  }

  unpick(code: string): void {
    this.picked.update(picked => picked.filter(p => p.operationCode !== code));
  }

  readonly addDialogSelected = computed(() => {
    const unit = this.addDialogUnit();
    return [...(unit ? this.currentCodesOf(unit) : []), ...this.picked().map(p => p.operationCode)];
  });

  confirmAdd(): void {
    const unit = this.addDialogUnit();
    const picked = this.picked();
    if (!unit || picked.length === 0) return;
    this.addDialogUnit.set(null);
    this.addCapabilities(unit, picked);
    this.focus(`#add-capability-${CSS.escape(unit.id)}`);
  }

  /** Names the services list learned, for the chips. */
  rememberNames(services: readonly ClaimableService[]): void {
    services.forEach(service => this.rememberName(service));
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
    const pending = this.pendingCodes().get(unit.id);
    const codes = pending ?? unit.serviceCapabilityCodes ?? [];
    const active = isActiveUnit(unit);
    const rules = this.coverage().get(unit.id);
    const coverageKnown = rules != null;
    const timeline = coverageTimeline(rules ?? [], this.today);
    const checklist = coverageKnown ? activationChecklist(unit, rules.length) : null;
    const areaCount = new Set(timeline.current.map(rule => rule.serviceAreaId)).size;

    let sentLine: Message;
    let sentWarning = false;
    if (!active) sentLine = { key: `${I18N}.SENT.INACTIVE` };
    else if (!coverageKnown) sentLine = { key: `${I18N}.SENT.UNKNOWN` };
    else if (areaCount === 0) {
      sentLine = { key: `${I18N}.SENT.NONE_TODAY` };
      sentWarning = true;
    } else sentLine = { key: `${I18N}.SENT.${areaCount === 1 ? 'AREAS_ONE' : 'AREAS_MANY'}`, params: { count: areaCount } };

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
      upcoming: [...upcomingByDate].map(([from, chips]) => ({ from, chips })),
      pastCount: timeline.past.length,
      capabilities: codes.map(code => ({
        code,
        label: this.serviceLabel(code),
        pending: pending != null && !(unit.serviceCapabilityCodes ?? []).includes(code),
      })),
      codes,
      saving: pending != null,
      policy: this.policyView(unit.travelBufferPolicyId),
      warnings: this.coverageWarnings(rules ?? []),
      notes: unit.notes?.trim() ?? '',
    };
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
