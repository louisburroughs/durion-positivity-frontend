import type {
  CoverageRuleRequest,
  CoverageRuleResponse,
  MobileUnitResponse,
  ServiceAreaResponse,
  TravelBufferPolicyResponse,
} from '@durion-sdk/location';

/** Mobile-unit statuses pos-location stores. New units start INACTIVE. */
export const MOBILE_UNIT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type MobileUnitStatus = (typeof MOBILE_UNIT_STATUSES)[number];

/**
 * Coverage rule types. Stored on each rule; eligibility matches on the service area only, so the
 * type (and a distance tier's max distance) is recorded, not used.
 */
export const COVERAGE_RULE_TYPES = ['SERVICE_AREA', 'DISTANCE_TIER'] as const;
export type CoverageRuleType = (typeof COVERAGE_RULE_TYPES)[number];

/** Travel buffer policy types pos-location accepts (`TravelBufferPolicyServiceImpl`). */
export const TRAVEL_BUFFER_TYPES = ['FLAT_MINUTES', 'PERCENTAGE_OF_TRAVEL', 'DISTANCE_MULTIPLIER'] as const;
export type TravelBufferType = (typeof TRAVEL_BUFFER_TYPES)[number];

/** The two groups the Mobile Units page shows. */
export const UNIT_GROUPS = ['ACTIVE', 'INACTIVE'] as const;
export type UnitGroup = (typeof UNIT_GROUPS)[number];

/** Fields `PATCH /v1/mobile-units/{id}` reads; an absent key is left unchanged. */
export interface MobileUnitPatch {
  name?: string;
  status?: MobileUnitStatus;
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

export function unitGroupOf(unit: MobileUnitResponse): UnitGroup {
  return isActiveUnit(unit) ? 'ACTIVE' : 'INACTIVE';
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
export function bufferKey(policy: TravelBufferPolicyResponse): string {
  return isTravelBufferType(policy.bufferType)
    ? `LOCATION.MOBILE_UNITS.BUFFER.${policy.bufferType}`
    : 'LOCATION.MOBILE_UNITS.BUFFER.NEEDS_FIXING';
}

export function newUnitDraft(): MobileUnitDraft {
  return { name: '', status: 'INACTIVE', travelBufferPolicyId: '', serviceCapabilityCodes: [], notes: '' };
}

export function draftFromUnit(unit: MobileUnitResponse): MobileUnitDraft {
  return {
    name: unit.name ?? '',
    status: isActiveUnit(unit) ? 'ACTIVE' : 'INACTIVE',
    travelBufferPolicyId: unit.travelBufferPolicyId ?? '',
    serviceCapabilityCodes: [...(unit.serviceCapabilityCodes ?? [])],
    notes: unit.notes ?? '',
  };
}

export function draftFromRule(rule: CoverageRuleResponse, key: string): CoverageRuleDraft {
  return {
    key,
    serviceAreaId: rule.serviceAreaId ?? '',
    ruleType: isCoverageRuleType(rule.ruleType) ? rule.ruleType : 'SERVICE_AREA',
    priority: rule.priority == null ? '' : String(rule.priority),
    validFrom: rule.validFrom ?? '',
    validTo: rule.validTo ?? '',
    maxDistance: rule.maxDistance == null ? '' : String(rule.maxDistance),
  };
}

const WHOLE_NUMBER = /^\d+$/;
const DECIMAL = /^\d+(\.\d+)?$/;

/**
 * Checks the coverage editor's rows before a save, since pos-location's replace checks nothing
 * (durion-positivity-backend#2248):
 * - a service area and a whole-number priority on every row;
 * - valid to not before valid from;
 * - distance tiers, in list order, strictly increasing and ending with exactly one blank catch-all
 *   (the rule pos-location applies on create);
 * - an active unit keeps at least one rule.
 */
export function validateCoverage(rows: readonly CoverageRuleDraft[], unitActive: boolean): CoverageValidation {
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
    if (previous != null && value <= previous) flag(row.key, 'maxDistance', `${prefix}.TIERS_ASCENDING`);
    else if (last) flag(row.key, 'maxDistance', `${prefix}.CATCH_ALL_MISSING`);
    previous = value;
  });

  const form = unitActive && rows.length === 0 ? `${prefix}.ACTIVE_NEEDS_RULE` : null;
  return { rows: errors, form };
}

/** The request for one valid editor row. Max distance travels only on a distance tier. */
export function toRuleRequest(row: CoverageRuleDraft): CoverageRuleRequest {
  const maxDistance = row.ruleType === 'DISTANCE_TIER' && row.maxDistance.trim() ? Number(row.maxDistance) : undefined;
  return {
    serviceAreaId: row.serviceAreaId,
    ruleType: row.ruleType,
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
