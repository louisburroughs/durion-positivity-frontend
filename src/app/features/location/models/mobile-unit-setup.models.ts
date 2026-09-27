import { CoverageRuleRequestRuleTypeEnum, DistanceDtoUnitEnum } from '@durion-sdk/location';
import type {
  CoverageRuleRequest,
  CoverageRuleResponse,
  MobileUnitResponse,
  ServiceAreaResponse,
  TravelBufferPolicyResponse,
} from '@durion-sdk/location';
import { OutOfServiceReason, isOutOfServiceReason } from './bay-setup.models';

/**
 * Mobile-unit statuses pos-location accepts (DECISION-LOCATION-026); a unit created without one
 * starts OUT_OF_SERVICE. RETIRED is reached only via delete.
 */
export const MOBILE_UNIT_STATUSES = ['ACTIVE', 'OUT_OF_SERVICE'] as const;
export type MobileUnitStatus = (typeof MOBILE_UNIT_STATUSES)[number];

/**
 * Coverage rule types. Stored on each rule; eligibility matches on the service area only, so the
 * type (and a distance tier's max distance) is recorded, not used.
 */
export const COVERAGE_RULE_TYPES = ['SERVICE_AREA', 'DISTANCE_TIER'] as const;
export type CoverageRuleType = (typeof COVERAGE_RULE_TYPES)[number];

/**
 * Travel buffer policy types pos-location accepts (DECISION-LOCATION-028). FLAT_MINUTES was
 * renamed to FIXED_MINUTES; PERCENTAGE_OF_TRAVEL and DISTANCE_MULTIPLIER were removed.
 */
export const TRAVEL_BUFFER_TYPES = ['FIXED_MINUTES', 'DISTANCE_TIER'] as const;
export type TravelBufferType = (typeof TRAVEL_BUFFER_TYPES)[number];

/** The two groups the Mobile Units page shows. RETIRED units fall in with the non-active ones. */
export const UNIT_GROUPS = ['ACTIVE', 'OUT_OF_SERVICE'] as const;
export type UnitGroup = (typeof UNIT_GROUPS)[number];

/** The status badge on a unit's card: its own status if recognised, else OUT_OF_SERVICE. */
export type UnitBadgeStatus = MobileUnitStatus | 'RETIRED';

/** Fields `PATCH /v1/mobile-units/{id}` reads; an absent key is left unchanged. */
export interface MobileUnitPatch {
  name?: string;
  status?: MobileUnitStatus;
  /** Required when the resulting status is OUT_OF_SERVICE (DECISION-LOCATION-026). */
  outOfServiceReason?: OutOfServiceReason;
  /** Required in addition to the reason when it is OTHER. */
  outOfServiceNote?: string;
  notes?: string;
  travelBufferPolicyId?: string;
  serviceCapabilityCodes?: string[];
}

/** What pos-location requires before a unit can be ACTIVE (`requireCompleteWhenActive`). */
export interface ActivationChecklist {
  readonly policy: boolean;
  readonly capability: boolean;
  readonly coverage: boolean;
}

/** The values the unit create/edit dialog holds. */
export interface MobileUnitDraft {
  name: string;
  status: MobileUnitStatus;
  /** Required when `status` is OUT_OF_SERVICE (DECISION-LOCATION-026). */
  outOfServiceReason: OutOfServiceReason | '';
  /** Required in addition to the reason when it is OTHER. */
  outOfServiceNote: string;
  travelBufferPolicyId: string;
  serviceCapabilityCodes: string[];
  notes: string;
}

/** One row of the coverage editor. Numbers stay text until validated, so a half-typed value survives. */
export interface CoverageRuleDraft {
  /** Local row identity for tracking and focus; never sent. */
  readonly key: string;
  serviceAreaId: string;
  ruleType: CoverageRuleType;
  priority: string;
  validFrom: string;
  validTo: string;
  maxDistance: string;
  /**
   * The unit a saved rule's `maxDistance` came back in (DECISION-LOCATION-028); null for a row with
   * no saved distance, which takes the location's unit when it is saved.
   */
  maxDistanceUnit: DistanceDtoUnitEnum | null;
}

export type CoverageField = 'serviceAreaId' | 'priority' | 'validTo' | 'maxDistance';

/** Validation outcome: row key → field → i18n key, plus a form-level key. */
export interface CoverageValidation {
  readonly rows: ReadonlyMap<string, Partial<Record<CoverageField, string>>>;
  readonly form: string | null;
}

/** A unit's coverage split by whether each rule is in effect on a given day. */
export interface CoverageTimeline {
  readonly current: readonly CoverageRuleResponse[];
  readonly upcoming: readonly CoverageRuleResponse[];
  readonly past: readonly CoverageRuleResponse[];
}

export function isActiveUnit(unit: MobileUnitResponse): boolean {
  return (unit.status ?? '').toUpperCase() === 'ACTIVE';
}

/** Retired only via `DELETE` (DECISION-LOCATION-026); reactivating one is a separate story (#395). */
export function isRetired(unit: MobileUnitResponse): boolean {
  return (unit.status ?? '').toUpperCase() === 'RETIRED';
}

export function unitGroupOf(unit: MobileUnitResponse): UnitGroup {
  return isActiveUnit(unit) ? 'ACTIVE' : 'OUT_OF_SERVICE';
}

/**
 * The status a unit's card badges: its own status when it is ACTIVE or RETIRED, else
 * OUT_OF_SERVICE — which is also pos-location's own default for a missing/unrecognised value
 * (DECISION-LOCATION-026).
 */
export function unitBadgeStatus(unit: MobileUnitResponse): UnitBadgeStatus {
  const status = (unit.status ?? '').toUpperCase();
  return status === 'ACTIVE' || status === 'RETIRED' ? status : 'OUT_OF_SERVICE';
}

export function isCoverageRuleType(value: string | null | undefined): value is CoverageRuleType {
  return (COVERAGE_RULE_TYPES as readonly string[]).includes(value ?? '');
}

export function isTravelBufferType(value: string | null | undefined): value is TravelBufferType {
  return (TRAVEL_BUFFER_TYPES as readonly string[]).includes(value ?? '');
}

export function activationChecklist(
  unit: Pick<MobileUnitResponse, 'travelBufferPolicyId' | 'serviceCapabilityCodes'>,
  ruleCount: number,
): ActivationChecklist {
  return {
    policy: !!unit.travelBufferPolicyId,
    capability: (unit.serviceCapabilityCodes ?? []).length > 0,
    coverage: ruleCount > 0,
  };
}

export function isReadyToActivate(checklist: ActivationChecklist): boolean {
  return checklist.policy && checklist.capability && checklist.coverage;
}

/**
 * True when the rule applies on `isoDate` (`YYYY-MM-DD`). Both ends are inclusive and a blank end is
 * open, as pos-location's eligibility query reads them. Dates compare as strings, never through
 * `new Date()` (ADR-0038).
 */
export function ruleInEffect(rule: Pick<CoverageRuleResponse, 'validFrom' | 'validTo'>, isoDate: string): boolean {
  return (!rule.validFrom || rule.validFrom <= isoDate) && (!rule.validTo || rule.validTo >= isoDate);
}

export function coverageTimeline(rules: readonly CoverageRuleResponse[], isoDate: string): CoverageTimeline {
  const byPriority = [...rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  return {
    current: byPriority.filter(rule => ruleInEffect(rule, isoDate)),
    upcoming: byPriority
      .filter(rule => !!rule.validFrom && rule.validFrom > isoDate)
      .sort((a, b) => ((a.validFrom ?? '') < (b.validFrom ?? '') ? -1 : 1)),
    past: byPriority.filter(rule => !!rule.validTo && rule.validTo < isoDate),
  };
}

/** Postal codes an area covers; an area with none covers nobody. */
export function postalCodeCount(area: ServiceAreaResponse | undefined): number {
  return area?.postalCodes?.length ?? 0;
}

/**
 * The country the Check coverage form starts with: the one most of the location's service-area
 * postal codes use, else US.
 */
export function usualCountry(areas: readonly ServiceAreaResponse[]): string {
  const counts = new Map<string, number>();
  for (const area of areas) {
    for (const entry of area.postalCodes ?? []) {
      const country = entry.countryCode.trim().toUpperCase();
      if (country) counts.set(country, (counts.get(country) ?? 0) + 1);
    }
  }
  let best = 'US';
  let bestCount = 0;
  for (const [country, count] of counts) {
    if (count > bestCount) {
      best = country;
      bestCount = count;
    }
  }
  return best;
}

/** The i18n key for a policy's buffer in words; unknown types (the seeded "MINUTES") need fixing. */
/** A blank value means "no buffer" (the dialog's contract), never an invented zero. */
export function bufferKey(policy: TravelBufferPolicyResponse): string {
  if (!isTravelBufferType(policy.bufferType)) return 'LOCATION.MOBILE_UNITS.BUFFER.NEEDS_FIXING';
  if (policy.bufferValue == null) return 'LOCATION.MOBILE_UNITS.BUFFER.NO_VALUE';
  return `LOCATION.MOBILE_UNITS.BUFFER.${policy.bufferType}`;
}

export function newUnitDraft(): MobileUnitDraft {
  return {
    name: '',
    status: 'OUT_OF_SERVICE',
    outOfServiceReason: '',
    outOfServiceNote: '',
    travelBufferPolicyId: '',
    serviceCapabilityCodes: [],
    notes: '',
  };
}

/**
 * A draft holding an existing unit's values, for the create/edit dialog. Throws for a `RETIRED` unit:
 * retiring is only via `DELETE` and reactivating one is a separate story (#395), so there is no
 * `MobileUnitDraft.status` this could honestly map to — mapping it to the editable `OUT_OF_SERVICE`
 * would let an ordinary save silently reactivate a terminal record. The page's only call site
 * (`openEdit`) guards against a retired unit first, so this is a second, load-bearing guard against a
 * bug reintroducing that one, not the primary defense.
 */
export function draftFromUnit(unit: MobileUnitResponse): MobileUnitDraft {
  if (isRetired(unit)) {
    throw new Error('draftFromUnit: unit is RETIRED and cannot be edited (reactivation is tracked separately, #395)');
  }
  return {
    name: unit.name ?? '',
    status: isActiveUnit(unit) ? 'ACTIVE' : 'OUT_OF_SERVICE',
    outOfServiceReason: isOutOfServiceReason(unit.outOfServiceReason) ? unit.outOfServiceReason : '',
    outOfServiceNote: unit.outOfServiceNote ?? '',
    travelBufferPolicyId: unit.travelBufferPolicyId ?? '',
    serviceCapabilityCodes: [...(unit.serviceCapabilityCodes ?? [])],
    notes: unit.notes ?? '',
  };
}

/**
 * Turns a saved rule into an editor row. `maxDistanceUnit` keeps the unit the response carries
 * (pos-location expresses it in the base location's `distanceUnit`, DECISION-LOCATION-028), so the
 * value is resent in the unit it was shown in; a rule with no distance has none.
 */
export function draftFromRule(rule: CoverageRuleResponse, key: string): CoverageRuleDraft {
  return {
    key,
    serviceAreaId: rule.serviceAreaId ?? '',
    ruleType: isCoverageRuleType(rule.ruleType) ? rule.ruleType : 'SERVICE_AREA',
    priority: rule.priority == null ? '' : String(rule.priority),
    validFrom: rule.validFrom ?? '',
    validTo: rule.validTo ?? '',
    maxDistance: rule.maxDistance == null ? '' : String(rule.maxDistance.value),
    maxDistanceUnit: rule.maxDistance?.unit ?? null,
  };
}

const WHOLE_NUMBER = /^\d+$/;
const DECIMAL = /^\d+(\.\d+)?$/;

/** The unit a row's distance is saved in: its own, else the location's; null while neither is known. */
export function rowDistanceUnit(
  row: CoverageRuleDraft,
  locationUnit: DistanceDtoUnitEnum | null,
): DistanceDtoUnitEnum | null {
  return row.maxDistanceUnit ?? locationUnit;
}

/**
 * Checks the coverage editor's rows before a save, since pos-location's replace checks nothing
 * (durion-positivity-backend#2248):
 * - a service area and a whole-number priority on every row;
 * - valid to not before valid from;
 * - distance tiers, in list order, strictly increasing and ending with exactly one blank catch-all
 *   (the rule pos-location applies on create);
 * - a distance has a known unit: the row's own, else the location's (`locationUnit`, null while
 *   unread or unreadable — never guessed, since a wrong unit silently rescales the tier);
 * - an active unit keeps at least one rule.
 */
export function validateCoverage(
  rows: readonly CoverageRuleDraft[],
  unitActive: boolean,
  locationUnit: DistanceDtoUnitEnum | null,
): CoverageValidation {
  const errors = new Map<string, Partial<Record<CoverageField, string>>>();
  const flag = (key: string, field: CoverageField, message: string): void => {
    errors.set(key, { ...errors.get(key), [field]: message });
  };
  const prefix = 'LOCATION.MOBILE_UNITS.COVERAGE.ERROR';

  for (const row of rows) {
    if (!row.serviceAreaId) flag(row.key, 'serviceAreaId', `${prefix}.AREA_REQUIRED`);
    if (!WHOLE_NUMBER.test(row.priority.trim())) flag(row.key, 'priority', `${prefix}.PRIORITY`);
    if (row.validFrom && row.validTo && row.validTo < row.validFrom) flag(row.key, 'validTo', `${prefix}.DATES`);
  }

  const tiers = rows.filter(row => row.ruleType === 'DISTANCE_TIER');
  let previous: number | null = null;
  tiers.forEach((row, index) => {
    const text = row.maxDistance.trim();
    const last = index === tiers.length - 1;
    if (!text) {
      if (!last) flag(row.key, 'maxDistance', `${prefix}.CATCH_ALL_LAST`);
      return;
    }
    if (!DECIMAL.test(text)) {
      flag(row.key, 'maxDistance', `${prefix}.DISTANCE`);
      return;
    }
    const value = Number(text);
    if (rowDistanceUnit(row, locationUnit) == null) flag(row.key, 'maxDistance', `${prefix}.UNIT_UNKNOWN`);
    else if (previous != null && value <= previous) flag(row.key, 'maxDistance', `${prefix}.TIERS_ASCENDING`);
    else if (last) flag(row.key, 'maxDistance', `${prefix}.CATCH_ALL_MISSING`);
    previous = value;
  });

  const form = unitActive && rows.length === 0 ? `${prefix}.ACTIVE_NEEDS_RULE` : null;
  return { rows: errors, form };
}

/**
 * The request for one row that passed `validateCoverage`. Max distance travels only on a distance
 * tier, in `rowDistanceUnit` (DECISION-LOCATION-028) — pos-location accepts either unit and converts
 * it, storing km. Validation refuses a distance with no known unit, so one never reaches here.
 */
export function toRuleRequest(row: CoverageRuleDraft, locationUnit: DistanceDtoUnitEnum | null): CoverageRuleRequest {
  const unit = rowDistanceUnit(row, locationUnit);
  const maxDistance =
    row.ruleType === 'DISTANCE_TIER' && row.maxDistance.trim() && unit != null
      ? { value: Number(row.maxDistance), unit }
      : undefined;
  return {
    serviceAreaId: row.serviceAreaId,
    ruleType:
      row.ruleType === 'DISTANCE_TIER'
        ? CoverageRuleRequestRuleTypeEnum.DistanceTier
        : CoverageRuleRequestRuleTypeEnum.ServiceArea,
    priority: Number(row.priority.trim()),
    ...(row.validFrom ? { validFrom: row.validFrom } : {}),
    ...(row.validTo ? { validTo: row.validTo } : {}),
    ...(maxDistance == null ? {} : { maxDistance }),
  };
}

/**
 * The instant for an eligibility check on a local day. pos-location turns `at` into a UTC date, so
 * noon UTC names the same calendar day in every zone.
 */
export function eligibilityInstant(isoDate: string): string {
  return `${isoDate}T12:00:00Z`;
}
