import {
  CoverageRuleResponseRuleTypeEnum,
  DistanceDtoUnitEnum,
  MobileUnitResponseStatusEnum,
} from '@durion-sdk/location';
import type {
  CoverageRuleResponse,
  ServiceAreaResponse,
  TravelBufferPolicyResponseBufferTypeEnum,
} from '@durion-sdk/location';
import {
  CoverageRuleDraft,
  activationChecklist,
  bufferKey,
  coverageTimeline,
  dayEndExclusiveInstant,
  dayStartInstant,
  draftFromRule,
  draftFromUnit,
  eligibilityInstant,
  exclusiveEndToLastDay,
  instantToDay,
  isReadyToActivate,
  ruleInEffect,
  toRuleRequest,
  unitBadgeStatus,
  unitGroupOf,
  usualCountry,
  validateCoverage,
} from './mobile-unit-setup.models';

const rule = (overrides: Partial<CoverageRuleResponse> = {}): CoverageRuleResponse => ({
  id: 'rule-1',
  mobileUnitId: 'mu-1',
  serviceAreaId: 'area-1',
  ruleType: CoverageRuleResponseRuleTypeEnum.ServiceArea,
  priority: 1,
  ...overrides,
});

const row = (overrides: Partial<CoverageRuleDraft> = {}): CoverageRuleDraft => ({
  key: 'r1',
  serviceAreaId: 'area-1',
  ruleType: 'SERVICE_AREA',
  priority: '1',
  validFrom: '',
  validTo: '',
  maxDistance: '',
  maxDistanceUnit: null,
  ...overrides,
});

const area = (codes: [string, string][]): ServiceAreaResponse => ({
  id: 'area',
  name: 'Area',
  postalCodes: codes.map(([postalCode, countryCode]) => ({ postalCode, countryCode })),
});

const PREFIX = 'LOCATION.MOBILE_UNITS.COVERAGE.ERROR';

describe('mobile unit setup rules', () => {
  it('groups units by status, reading it case-insensitively; retired falls in with the non-active', () => {
    expect(unitGroupOf({ id: 'a', status: 'active' as MobileUnitResponseStatusEnum })).toBe('ACTIVE');
    expect(unitGroupOf({ id: 'b', status: MobileUnitResponseStatusEnum.OutOfService })).toBe('OUT_OF_SERVICE');
    expect(unitGroupOf({ id: 'c', status: MobileUnitResponseStatusEnum.Retired })).toBe('OUT_OF_SERVICE');
    expect(unitGroupOf({ id: 'd' })).toBe('OUT_OF_SERVICE');
  });

  it('badges a unit by its own status, defaulting an unrecognised one to out of service', () => {
    expect(unitBadgeStatus({ id: 'a', status: 'active' as MobileUnitResponseStatusEnum })).toBe('ACTIVE');
    expect(unitBadgeStatus({ id: 'b', status: MobileUnitResponseStatusEnum.OutOfService })).toBe('OUT_OF_SERVICE');
    expect(unitBadgeStatus({ id: 'c', status: MobileUnitResponseStatusEnum.Retired })).toBe('RETIRED');
    expect(unitBadgeStatus({ id: 'd' })).toBe('OUT_OF_SERVICE');
    expect(unitBadgeStatus({ id: 'e', status: 'BOGUS' as MobileUnitResponseStatusEnum })).toBe('OUT_OF_SERVICE');
  });

  it('refuses to draft a retired unit: retiring is DELETE-only and reactivating it is a separate story', () => {
    expect(() => draftFromUnit({ id: 'u', status: MobileUnitResponseStatusEnum.Retired })).toThrow(/RETIRED/);
  });

  it('needs a policy, a capability and a coverage rule before a unit can be active', () => {
    const complete = activationChecklist({ travelBufferPolicyId: 'p', serviceCapabilityCodes: ['X'] }, 1);
    expect(complete).toEqual({ policy: true, capability: true, coverage: true });
    expect(isReadyToActivate(complete)).toBe(true);
    const bare = activationChecklist({}, 0);
    expect(bare).toEqual({ policy: false, capability: false, coverage: false });
    expect(isReadyToActivate({ ...complete, coverage: false })).toBe(false);
  });

  describe('UTC-instant day helpers (DECISION-LOCATION-027)', () => {
    it('turns a calendar day into its UTC-midnight start instant', () => {
      expect(dayStartInstant('2026-10-01')).toBe('2026-10-01T00:00:00Z');
    });

    it('turns the last valid day into the exclusive end instant, the next UTC day', () => {
      expect(dayEndExclusiveInstant('2026-10-31')).toBe('2026-11-01T00:00:00Z');
      // Crosses a year boundary too, not just a month.
      expect(dayEndExclusiveInstant('2026-12-31')).toBe('2027-01-01T00:00:00Z');
    });

    it('reads a validFrom instant back to its own UTC calendar day', () => {
      expect(instantToDay('2026-10-01T00:00:00Z')).toBe('2026-10-01');
    });

    it('reads a midnight validTo instant back to the PREVIOUS UTC day, the last one fully valid', () => {
      expect(exclusiveEndToLastDay('2026-11-01T00:00:00Z')).toBe('2026-10-31');
      expect(exclusiveEndToLastDay('2027-01-01T00:00:00Z')).toBe('2026-12-31');
    });

    it('reads a non-midnight validTo instant (another client) as its own UTC day, partly valid', () => {
      expect(exclusiveEndToLastDay('2026-11-01T15:00:00Z')).toBe('2026-11-01');
    });
  });

  it('treats validFrom as inclusive, validTo as exclusive, and a blank end as open, against UTC instants', () => {
    expect(ruleInEffect({}, '2026-09-26')).toBe(true);
    // A one-day window: valid on its own day only.
    expect(ruleInEffect({ validFrom: dayStartInstant('2026-09-26'), validTo: dayEndExclusiveInstant('2026-09-26') }, '2026-09-26')).toBe(true);
    expect(ruleInEffect({ validFrom: dayStartInstant('2026-09-26'), validTo: dayEndExclusiveInstant('2026-09-26') }, '2026-09-27')).toBe(false);
    expect(ruleInEffect({ validFrom: dayStartInstant('2026-09-26'), validTo: dayEndExclusiveInstant('2026-09-26') }, '2026-09-25')).toBe(false);
    expect(ruleInEffect({ validFrom: dayStartInstant('2026-09-27') }, '2026-09-26')).toBe(false);
    // validTo is exclusive: a rule ending at the start of D is NOT in effect on D.
    expect(ruleInEffect({ validTo: dayStartInstant('2026-09-26') }, '2026-09-26')).toBe(false);
    expect(ruleInEffect({ validTo: dayStartInstant('2026-09-26') }, '2026-09-25')).toBe(true);
  });

  it('is true on the last valid day, false the day after, and false the day before validFrom', () => {
    const window = { validFrom: dayStartInstant('2026-10-01'), validTo: dayEndExclusiveInstant('2026-10-31') };
    expect(ruleInEffect(window, '2026-09-30')).toBe(false); // day before validFrom
    expect(ruleInEffect(window, '2026-10-01')).toBe(true); // first valid day
    expect(ruleInEffect(window, '2026-10-31')).toBe(true); // last valid day
    expect(ruleInEffect(window, '2026-11-01')).toBe(false); // day after the last valid day
  });

  it('classifies upcoming/past at the exact boundary: upcoming from D+1, past through D', () => {
    const rules = [
      rule({ id: 'starts-tomorrow', validFrom: dayStartInstant('2026-09-27') }),
      rule({ id: 'starts-today', validFrom: dayStartInstant('2026-09-26') }),
      rule({ id: 'ended-today', validTo: dayStartInstant('2026-09-26') }),
      rule({ id: 'ends-tomorrow', validTo: dayStartInstant('2026-09-27') }),
    ];
    const timeline = coverageTimeline(rules, '2026-09-26');
    expect(timeline.upcoming.map(r => r.id)).toEqual(['starts-tomorrow']);
    expect(timeline.current.map(r => r.id)).toEqual(['starts-today', 'ends-tomorrow']);
    expect(timeline.past.map(r => r.id)).toEqual(['ended-today']);
  });

  it('splits coverage into current by priority, upcoming by start date, and past, under the UTC-instant/exclusive-end contract', () => {
    const later = rule({ id: 'later', validFrom: dayStartInstant('2026-12-01') });
    const sooner = rule({ id: 'sooner', validFrom: dayStartInstant('2026-10-01') });
    const second = rule({ id: 'second', priority: 2 });
    const first = rule({ id: 'first', priority: 1 });
    const ended = rule({ id: 'ended', validTo: dayStartInstant('2026-09-26') }); // exclusive end at start of "today"
    const timeline = coverageTimeline([later, second, ended, first, sooner], '2026-09-26');
    expect(timeline.current.map(r => r.id)).toEqual(['first', 'second']);
    expect(timeline.upcoming.map(r => r.id)).toEqual(['sooner', 'later']);
    expect(timeline.past.map(r => r.id)).toEqual(['ended']);
  });

  it('starts the coverage check in the country most postal codes use, else US', () => {
    expect(usualCountry([])).toBe('US');
    expect(usualCountry([area([['K1A', 'ca'], ['M5V', 'CA']]), area([['78701', 'US']])])).toBe('CA');
  });

  it('names each travel buffer type, and flags an unknown one', () => {
    expect(bufferKey({ id: 'p', bufferType: 'FIXED_MINUTES' as TravelBufferPolicyResponseBufferTypeEnum, bufferValue: 15 })).toBe(
      'LOCATION.MOBILE_UNITS.BUFFER.FIXED_MINUTES',
    );
    expect(bufferKey({ id: 'p', bufferType: 'MINUTES' as TravelBufferPolicyResponseBufferTypeEnum })).toBe(
      'LOCATION.MOBILE_UNITS.BUFFER.NEEDS_FIXING',
    );
    expect(bufferKey({ id: 'p', bufferType: 'FIXED_MINUTES' as TravelBufferPolicyResponseBufferTypeEnum, bufferValue: 0 })).toBe(
      'LOCATION.MOBILE_UNITS.BUFFER.FIXED_MINUTES',
    );
    // FLAT_MINUTES was renamed to FIXED_MINUTES (DECISION-LOCATION-028); a record still carrying the
    // old name is treated the same as any other unrecognised type.
    expect(bufferKey({ id: 'p', bufferType: 'FLAT_MINUTES' as TravelBufferPolicyResponseBufferTypeEnum, bufferValue: 5 })).toBe(
      'LOCATION.MOBILE_UNITS.BUFFER.NEEDS_FIXING',
    );
    expect(bufferKey({ id: 'p', bufferType: 'DISTANCE_TIER' as TravelBufferPolicyResponseBufferTypeEnum, bufferValue: undefined })).toBe(
      'LOCATION.MOBILE_UNITS.BUFFER.NO_VALUE',
    );
  });

  it('names an eligibility day as noon UTC, so the backend reads the same date', () => {
    expect(eligibilityInstant('2026-10-01')).toBe('2026-10-01T12:00:00Z');
  });

  it('turns a saved rule into an editor row and a valid row back into a request', () => {
    const draft = draftFromRule(
      rule({
        ruleType: 'INCLUDE' as CoverageRuleResponseRuleTypeEnum,
        priority: 3,
        validFrom: '2026-10-01T00:00:00Z',
        maxDistance: { value: 25, unit: DistanceDtoUnitEnum.Mi },
      }),
      'k',
    );
    expect(draft).toEqual({
      key: 'k',
      serviceAreaId: 'area-1',
      ruleType: 'SERVICE_AREA',
      priority: '3',
      validFrom: '2026-10-01',
      validTo: '',
      maxDistance: '25',
      maxDistanceUnit: 'MI',
    });
    expect(toRuleRequest(draft, DistanceDtoUnitEnum.Km)).toEqual({
      serviceAreaId: 'area-1',
      ruleType: 'SERVICE_AREA',
      priority: 3,
      validFrom: '2026-10-01T00:00:00Z',
    });
    // A brand-new row (no rule.maxDistance yet) takes the location's unit.
    expect(toRuleRequest(row({ ruleType: 'DISTANCE_TIER', maxDistance: '12.5' }), DistanceDtoUnitEnum.Km)).toEqual({
      serviceAreaId: 'area-1',
      ruleType: 'DISTANCE_TIER',
      priority: 1,
      maxDistance: { value: 12.5, unit: 'KM' },
    });
  });

  it('round-trips validFrom/validTo through draftFromRule and toRuleRequest as UTC instants', () => {
    const draft = draftFromRule(rule({ validFrom: '2026-10-01T00:00:00Z', validTo: '2026-11-01T00:00:00Z' }), 'k');
    expect(draft.validFrom).toBe('2026-10-01');
    expect(draft.validTo).toBe('2026-10-31'); // exclusive end read back to the last inclusive day
    expect(toRuleRequest(draft, DistanceDtoUnitEnum.Km)).toEqual({
      serviceAreaId: 'area-1',
      ruleType: 'SERVICE_AREA',
      priority: 1,
      validFrom: '2026-10-01T00:00:00Z',
      validTo: '2026-11-01T00:00:00Z', // re-sent as the next UTC day's start
    });
  });

  it('reads a non-midnight validTo (another client) as its own day, and sends a one-day window back as an instant pair', () => {
    const draft = draftFromRule(rule({ validTo: '2026-11-01T15:00:00Z' }), 'k');
    expect(draft.validTo).toBe('2026-11-01');
    // A one-day window (same start/end day) is valid: it becomes [dayStart, nextDayStart).
    const oneDayDraft = row({ validFrom: '2026-10-01', validTo: '2026-10-01' });
    expect(toRuleRequest(oneDayDraft, DistanceDtoUnitEnum.Km)).toEqual({
      serviceAreaId: 'area-1',
      ruleType: 'SERVICE_AREA',
      priority: 1,
      validFrom: '2026-10-01T00:00:00Z',
      validTo: '2026-10-02T00:00:00Z',
    });
  });

  it('keeps a rule saved in miles on edit, in miles, regardless of the location', () => {
    const draft = draftFromRule(
      rule({ ruleType: 'DISTANCE_TIER' as CoverageRuleResponseRuleTypeEnum, maxDistance: { value: 25, unit: DistanceDtoUnitEnum.Mi } }),
      'k',
    );
    expect(draft.maxDistanceUnit).toBe('MI');
    // The location is KM; the unit the rule came back in still wins.
    expect(toRuleRequest(draft, DistanceDtoUnitEnum.Km)).toEqual({
      serviceAreaId: 'area-1',
      ruleType: 'DISTANCE_TIER',
      priority: 1,
      maxDistance: { value: 25, unit: 'MI' },
    });
  });

  it('sends a new rule in the base location\'s unit when the location is MI', () => {
    const newRow = row({ ruleType: 'DISTANCE_TIER', maxDistance: '15' });
    expect(newRow.maxDistanceUnit).toBeNull();
    expect(toRuleRequest(newRow, DistanceDtoUnitEnum.Mi)).toEqual({
      serviceAreaId: 'area-1',
      ruleType: 'DISTANCE_TIER',
      priority: 1,
      maxDistance: { value: 15, unit: 'MI' },
    });
  });

  it('gives a rule with no distance no unit of its own', () => {
    const draft = draftFromRule(rule({ ruleType: 'DISTANCE_TIER' as CoverageRuleResponseRuleTypeEnum }), 'k');
    expect(draft.maxDistanceUnit).toBeNull();
  });

  describe('validateCoverage', () => {
    it("refuses a new distance while the location's unit is unknown, never guessing KM (ADR-0064)", () => {
      const rows = [row({ key: 'a', ruleType: 'DISTANCE_TIER', maxDistance: '10' }), row({ key: 'b', ruleType: 'DISTANCE_TIER' })];
      expect(validateCoverage(rows, false, null).rows.get('a')).toEqual({ maxDistance: `${PREFIX}.UNIT_UNKNOWN` });
      expect(validateCoverage(rows, false, DistanceDtoUnitEnum.Mi).rows.size).toBe(0);
    });

    it('accepts a saved distance in its own unit even while the location unit is unknown', () => {
      const rows = [
        row({ key: 'a', ruleType: 'DISTANCE_TIER', maxDistance: '10', maxDistanceUnit: DistanceDtoUnitEnum.Mi }),
        row({ key: 'b', ruleType: 'DISTANCE_TIER' }),
      ];
      expect(validateCoverage(rows, false, null).rows.size).toBe(0);
    });

    it('passes a complete set of rules', () => {
      const result = validateCoverage([row(), row({ key: 'r2', priority: '0', validFrom: '2026-01-01', validTo: '2026-01-01' })], true, DistanceDtoUnitEnum.Km);
      expect(result.rows.size).toBe(0);
      expect(result.form).toBeNull();
    });

    it('needs a service area and a whole-number priority', () => {
      const result = validateCoverage([row({ serviceAreaId: '', priority: '1.5' })], false, DistanceDtoUnitEnum.Km);
      expect(result.rows.get('r1')).toEqual({ serviceAreaId: `${PREFIX}.AREA_REQUIRED`, priority: `${PREFIX}.PRIORITY` });
    });

    it('refuses an end date before the start date', () => {
      const result = validateCoverage([row({ validFrom: '2026-10-02', validTo: '2026-10-01' })], false, DistanceDtoUnitEnum.Km);
      expect(result.rows.get('r1')).toEqual({ validTo: `${PREFIX}.DATES` });
    });

    it('needs distance tiers to increase and end with one blank catch-all', () => {
      const tier = (key: string, maxDistance: string): CoverageRuleDraft => row({ key, ruleType: 'DISTANCE_TIER', maxDistance });
      expect(validateCoverage([tier('a', '10'), tier('b', '25'), tier('c', '')], false, DistanceDtoUnitEnum.Km).rows.size).toBe(0);
      expect(validateCoverage([tier('a', '25'), tier('b', '10'), tier('c', '')], false, DistanceDtoUnitEnum.Km).rows.get('b')).toEqual({
        maxDistance: `${PREFIX}.TIERS_ASCENDING`,
      });
      expect(validateCoverage([tier('a', ''), tier('b', '')], false, DistanceDtoUnitEnum.Km).rows.get('a')).toEqual({
        maxDistance: `${PREFIX}.CATCH_ALL_LAST`,
      });
      expect(validateCoverage([tier('a', '10'), tier('b', '25')], false, DistanceDtoUnitEnum.Km).rows.get('b')).toEqual({
        maxDistance: `${PREFIX}.CATCH_ALL_MISSING`,
      });
      expect(validateCoverage([tier('a', 'far'), tier('b', '')], false, DistanceDtoUnitEnum.Km).rows.get('a')).toEqual({
        maxDistance: `${PREFIX}.DISTANCE`,
      });
    });

    it('ignores max distance on service-area rules', () => {
      expect(validateCoverage([row({ maxDistance: 'anything' })], false, DistanceDtoUnitEnum.Km).rows.size).toBe(0);
    });

    it('stops an active unit losing its last rule, but lets an inactive one', () => {
      expect(validateCoverage([], true, DistanceDtoUnitEnum.Km).form).toBe(`${PREFIX}.ACTIVE_NEEDS_RULE`);
      expect(validateCoverage([], false, DistanceDtoUnitEnum.Km).form).toBeNull();
    });
  });
});
