import type { BayResponse } from '@durion-sdk/location';

/** `BayType` in pos-location, in the order the create form offers them. */
export const BAY_TYPES = [
  'GENERAL_SERVICE',
  'ALIGNMENT',
  'TIRE_SERVICE',
  'HEAVY_DUTY',
  'INSPECTION',
  'WASH_DETAIL',
] as const;
export type BayType = (typeof BAY_TYPES)[number];

/** Bay statuses pos-location accepts (`BayServiceImpl.ALLOWED_STATUSES`). */
export const BAY_STATUSES = ['ACTIVE', 'OUT_OF_SERVICE'] as const;
export type BayStatus = (typeof BAY_STATUSES)[number];

/** GVWR duty classes a bay can cap at (CAP-325 D13). */
export const DUTY_CLASSES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/**
 * The specialty services each bay type claims by default (CAP-325 D14.1).
 *
 * Mirrors pos-location's `R__seed_location_2_bay_specialty.sql`, because no API exposes the map yet
 * (durion-positivity-backend#2247). pos-location applies it itself when a create omits the codes, and
 * resets a retyped bay to it; this copy only lets the form show and send those codes explicitly. Drop
 * it once the read endpoint lands.
 */
export const BAY_TYPE_DEFAULT_CODES: Readonly<Record<BayType, readonly string[]>> = {
  GENERAL_SERVICE: [],
  ALIGNMENT: ['WHEEL-ALIGNMENT-4-WHEEL'],
  TIRE_SERVICE: [
    'TIRE-INSTALL-SET-4',
    'TIRE-INSTALL-LT-SET-4',
    'TIRE-INSTALL-COMMERCIAL-SINGLE',
    'TIRE-REPAIR-PATCH-PLUG',
    'WHEEL-BALANCE-SET-4',
    'ROAD-FORCE-BALANCE-SET-4',
    'NITROGEN-FILL-SET-4',
    'TPMS-SENSOR-SERVICE',
    'TPMS-SENSOR-REPLACE-SINGLE',
  ],
  HEAVY_DUTY: [],
  INSPECTION: ['DOT-ANNUAL-INSPECTION'],
  WASH_DETAIL: [],
};

/** The four lanes the Bays page groups cards into. Derived from the data, never dragged between. */
export const BAY_LANES = ['GENERAL', 'SPECIALTY', 'WASH', 'OUT_OF_SERVICE'] as const;
export type BayLane = (typeof BAY_LANES)[number];

/** Which sentence the card's "Can be assigned" line uses. */
export type BayEligibilityKind = 'OUT_OF_SERVICE' | 'WASH_NONE' | 'WASH' | 'GENERAL' | 'SPECIALTY';

/** Light 1–3, Medium 4–6, Heavy 7–8. */
export type DutyBand = 'LIGHT' | 'MEDIUM' | 'HEAVY';

/** The values the bay create/edit dialog holds. */
export interface BayDraft {
  name: string;
  bayType: BayType;
  status: BayStatus;
  maxConcurrentVehicles: number;
  /** Null means no limit. */
  maxDutyClass: number | null;
  serviceCapabilityCodes: string[];
}

export function isBayType(value: string | null | undefined): value is BayType {
  return (BAY_TYPES as readonly string[]).includes(value ?? '');
}

export function isOutOfService(bay: BayResponse): boolean {
  return (bay.status ?? '').toUpperCase() === 'OUT_OF_SERVICE';
}

export function isWashBay(bay: BayResponse): boolean {
  return (bay.bayType ?? '').toUpperCase() === 'WASH_DETAIL';
}

export function specialtyCodes(bay: BayResponse): readonly string[] {
  return bay.serviceCapabilityCodes ?? [];
}

/**
 * The lane a bay sits in. Out of service wins over type, so a bay that is down is never listed as if
 * it could take work.
 */
export function laneOf(bay: BayResponse): BayLane {
  if (isOutOfService(bay)) return 'OUT_OF_SERVICE';
  if (isWashBay(bay)) return 'WASH';
  return specialtyCodes(bay).length > 0 ? 'SPECIALTY' : 'GENERAL';
}

/**
 * Which sentence describes what the bay can be assigned, per the opening-search rules in
 * pos-shop-manager (`OpeningSearchServiceImpl.eligibleBays`): a claimed service goes only to the bays
 * claiming it, unclaimed work goes to any bay except a wash bay, general bays first. An out-of-service
 * bay is left out of that search entirely.
 */
export function eligibilityKind(bay: BayResponse): BayEligibilityKind {
  if (isOutOfService(bay)) return 'OUT_OF_SERVICE';
  const claims = specialtyCodes(bay).length;
  if (isWashBay(bay)) return claims > 0 ? 'WASH' : 'WASH_NONE';
  return claims > 0 ? 'SPECIALTY' : 'GENERAL';
}

export function dutyBand(dutyClass: number | null | undefined): DutyBand | null {
  if (dutyClass == null || dutyClass < 1) return null;
  if (dutyClass <= 3) return 'LIGHT';
  if (dutyClass <= 6) return 'MEDIUM';
  return 'HEAVY';
}

const NATURAL = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** "Bay 2" before "Bay 10"; the backend sorts names as plain text. */
export function naturalCompare(a: string, b: string): number {
  return NATURAL.compare(a, b);
}

/**
 * Records the SDK integration suites leave behind ("Itest bay itest-1790388132-rwlg", "Itest unit …").
 * A name pattern until the backend flags test records.
 */
export function isTestRecord(name: string | null | undefined): boolean {
  return /^itest\b/i.test((name ?? '').trim());
}

/**
 * A readable label for an operation code until the catalog list endpoint supplies names
 * (durion-positivity-backend#2246): "WHEEL-ALIGNMENT-4-WHEEL" → "Wheel alignment 4 wheel".
 */
export function operationCodeLabel(code: string): string {
  const words = code.trim().toLowerCase().split('-').filter(Boolean).join(' ');
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : code;
}

/**
 * Operation code → ids of the ACTIVE bays claiming it. Out-of-service claims don't count in the
 * opening search, so they don't count here either.
 */
export function activeClaimants(bays: readonly BayResponse[]): ReadonlyMap<string, readonly string[]> {
  const claims = new Map<string, string[]>();
  for (const bay of bays) {
    if (isOutOfService(bay)) continue;
    for (const code of specialtyCodes(bay)) {
      const holders = claims.get(code) ?? [];
      holders.push(bay.id);
      claims.set(code, holders);
    }
  }
  return claims;
}

/** A draft for a new bay of the given type, carrying that type's default specialty codes. */
export function newBayDraft(bayType: BayType = 'GENERAL_SERVICE'): BayDraft {
  return {
    name: '',
    bayType,
    status: 'ACTIVE',
    maxConcurrentVehicles: 1,
    maxDutyClass: null,
    serviceCapabilityCodes: [...BAY_TYPE_DEFAULT_CODES[bayType]],
  };
}

/** A draft holding an existing bay's values. */
export function draftFromBay(bay: BayResponse): BayDraft {
  return {
    name: bay.name,
    bayType: isBayType(bay.bayType) ? bay.bayType : 'GENERAL_SERVICE',
    status: isOutOfService(bay) ? 'OUT_OF_SERVICE' : 'ACTIVE',
    maxConcurrentVehicles: bay.maxConcurrentVehicles ?? 1,
    maxDutyClass: bay.maxDutyClass ?? null,
    serviceCapabilityCodes: [...specialtyCodes(bay)],
  };
}

/** Codes present in `after` but not `before`, and the reverse. */
export function codeChanges(
  before: readonly string[],
  after: readonly string[],
): { added: string[]; removed: string[] } {
  const was = new Set(before);
  const now = new Set(after);
  return {
    added: after.filter(code => !was.has(code)),
    removed: before.filter(code => !now.has(code)),
  };
}

/**
 * One consequence a bay save has for what this location's bays can be assigned. The create/edit
 * dialog lists these in its "What changes" column before the user saves.
 */
export type BayChange =
  /** The bay becomes the only in-service bay claiming the service; other bays stop taking it. */
  | { readonly kind: 'ONLY_CLAIMANT'; readonly code: string }
  /** No in-service bay claims the service any more, so it becomes general work. */
  | { readonly kind: 'NOW_GENERAL_WORK'; readonly code: string }
  /** The bay claims the service but is out of service, so the claim won't count until it's back. */
  | { readonly kind: 'CLAIM_ON_HOLD'; readonly code: string }
  | { readonly kind: 'OUT_OF_SERVICE' }
  | { readonly kind: 'BACK_IN_SERVICE' }
  /** No in-service bay here would take vehicles above this class. */
  | { readonly kind: 'NO_BAY_ABOVE'; readonly dutyClass: number }
  /** A wash & detail bay with no services can be assigned nothing. */
  | { readonly kind: 'WASH_NONE' };

const HEAVIEST_CLASS = DUTY_CLASSES[DUTY_CLASSES.length - 1];

/** The heaviest class any in-service bay in the list takes (a bay with no limit takes class 8). */
function heaviestClassTaken(bays: readonly { status: BayStatus; maxDutyClass: number | null }[]): number {
  let heaviest = 0;
  for (const bay of bays) {
    if (bay.status !== 'ACTIVE') continue;
    heaviest = Math.max(heaviest, bay.maxDutyClass ?? HEAVIEST_CLASS);
  }
  return heaviest;
}

/**
 * What saving `after` would change, given the bay it replaces (`before`, null on create) and every
 * bay at the location. Uses only the confirmed eligibility rules: in-service claims are exclusive,
 * out-of-service claims don't count, an unclaimed service is general work, duty class is a maximum.
 */
export function bayChanges(
  before: BayResponse | null,
  after: BayDraft,
  bays: readonly BayResponse[],
): BayChange[] {
  const others = bays.filter(bay => bay.id !== before?.id);
  const otherClaims = activeClaimants(others);
  const wasActive = before != null && !isOutOfService(before);
  const isActive = after.status === 'ACTIVE';
  const claimedBefore = wasActive ? specialtyCodes(before) : [];
  const claimedAfter = isActive ? after.serviceCapabilityCodes : [];
  const { added, removed } = codeChanges(claimedBefore, claimedAfter);
  const changes: BayChange[] = [];

  if (before != null && wasActive && !isActive) changes.push({ kind: 'OUT_OF_SERVICE' });
  if (before != null && !wasActive && isActive) changes.push({ kind: 'BACK_IN_SERVICE' });

  for (const code of added) {
    if (!otherClaims.has(code)) changes.push({ kind: 'ONLY_CLAIMANT', code });
  }
  for (const code of removed) {
    if (!otherClaims.has(code)) changes.push({ kind: 'NOW_GENERAL_WORK', code });
  }
  if (!isActive) {
    const heldBefore = before != null ? specialtyCodes(before) : [];
    for (const code of codeChanges(heldBefore, after.serviceCapabilityCodes).added) {
      changes.push({ kind: 'CLAIM_ON_HOLD', code });
    }
  }

  const otherDrafts = others.map(draftFromBay);
  const heaviestBefore = heaviestClassTaken(before ? [...otherDrafts, draftFromBay(before)] : otherDrafts);
  const heaviestAfter = heaviestClassTaken([...otherDrafts, after]);
  if (heaviestAfter < heaviestBefore && heaviestAfter > 0) {
    changes.push({ kind: 'NO_BAY_ABOVE', dutyClass: heaviestAfter });
  }

  if (isActive && after.bayType === 'WASH_DETAIL' && after.serviceCapabilityCodes.length === 0) {
    changes.push({ kind: 'WASH_NONE' });
  }
  return changes;
}
