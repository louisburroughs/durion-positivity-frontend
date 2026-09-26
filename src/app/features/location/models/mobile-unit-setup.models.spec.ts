import type { CoverageRuleResponse, ServiceAreaResponse } from '@durion-sdk/location';
import {
  CoverageRuleDraft,
  activationChecklist,
  bufferKey,
  coverageTimeline,
  draftFromRule,
  eligibilityInstant,
  isReadyToActivate,
  ruleInEffect,
  toRuleRequest,
  unitGroupOf,
  usualCountry,
  validateCoverage,
} from './mobile-unit-setup.models';

const rule = (overrides: Partial<CoverageRuleResponse> = {}): CoverageRuleResponse => ({
  id: 'rule-1',
  mobileUnitId: 'mu-1',
  serviceAreaId: 'area-1',
  ruleType: 'SERVICE_AREA',
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
  ...overrides,
});

const area = (codes: [string, string][]): ServiceAreaResponse => ({
  id: 'area',
  name: 'Area',
  postalCodes: codes.map(([postalCode, countryCode]) => ({ postalCode, countryCode })),
});

const PREFIX = 'LOCATION.MOBILE_UNITS.COVERAGE.ERROR';

describe('mobile unit setup rules', () => {
  it('groups units by status, reading it case-insensitively', () => {
    expect(unitGroupOf({ id: 'a', status: 'active' })).toBe('ACTIVE');
    expect(unitGroupOf({ id: 'b', status: 'INACTIVE' })).toBe('INACTIVE');
    expect(unitGroupOf({ id: 'c' })).toBe('INACTIVE');
  });

  it('needs a policy, a capability and a coverage rule before a unit can be active', () => {
    const complete = activationChecklist({ travelBufferPolicyId: 'p', serviceCapabilityCodes: ['X'] }, 1);
    expect(complete).toEqual({ policy: true, capability: true, coverage: true });
    expect(isReadyToActivate(complete)).toBe(true);
    const bare = activationChecklist({}, 0);
    expect(bare).toEqual({ policy: false, capability: false, coverage: false });
    expect(isReadyToActivate({ ...complete, coverage: false })).toBe(false);
  });

  it('treats both ends of a rule as inclusive and a blank end as open', () => {
    expect(ruleInEffect({}, '2026-09-26')).toBe(true);
    expect(ruleInEffect({ validFrom: '2026-09-26', validTo: '2026-09-26' }, '2026-09-26')).toBe(true);
    expect(ruleInEffect({ validFrom: '2026-09-27' }, '2026-09-26')).toBe(false);
    expect(ruleInEffect({ validTo: '2026-09-25' }, '2026-09-26')).toBe(false);
  });

  it('splits coverage into current by priority, upcoming by start date, and past', () => {
    const later = rule({ id: 'later', validFrom: '2026-12-01' });
    const sooner = rule({ id: 'sooner', validFrom: '2026-10-01' });
    const second = rule({ id: 'second', priority: 2 });
    const first = rule({ id: 'first', priority: 1 });
    const ended = rule({ id: 'ended', validTo: '2026-01-01' });
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
    expect(bufferKey({ id: 'p', bufferType: 'FLAT_MINUTES' })).toBe('LOCATION.MOBILE_UNITS.BUFFER.FLAT_MINUTES');
    expect(bufferKey({ id: 'p', bufferType: 'MINUTES' })).toBe('LOCATION.MOBILE_UNITS.BUFFER.NEEDS_FIXING');
  });

  it('names an eligibility day as noon UTC, so the backend reads the same date', () => {
    expect(eligibilityInstant('2026-10-01')).toBe('2026-10-01T12:00:00Z');
  });

  it('turns a saved rule into an editor row and a valid row back into a request', () => {
    const draft = draftFromRule(rule({ ruleType: 'INCLUDE', priority: 3, validFrom: '2026-10-01', maxDistance: 25 }), 'k');
    expect(draft).toEqual({
      key: 'k',
      serviceAreaId: 'area-1',
      ruleType: 'SERVICE_AREA',
      priority: '3',
      validFrom: '2026-10-01',
      validTo: '',
      maxDistance: '25',
    });
    expect(toRuleRequest(draft)).toEqual({
      serviceAreaId: 'area-1',
      ruleType: 'SERVICE_AREA',
      priority: 3,
      validFrom: '2026-10-01',
    });
    expect(toRuleRequest(row({ ruleType: 'DISTANCE_TIER', maxDistance: '12.5' }))).toEqual({
      serviceAreaId: 'area-1',
      ruleType: 'DISTANCE_TIER',
      priority: 1,
      maxDistance: 12.5,
    });
  });

  describe('validateCoverage', () => {
    it('passes a complete set of rules', () => {
      const result = validateCoverage([row(), row({ key: 'r2', priority: '0', validFrom: '2026-01-01', validTo: '2026-01-01' })], true);
      expect(result.rows.size).toBe(0);
      expect(result.form).toBeNull();
    });

    it('needs a service area and a whole-number priority', () => {
      const result = validateCoverage([row({ serviceAreaId: '', priority: '1.5' })], false);
      expect(result.rows.get('r1')).toEqual({ serviceAreaId: `${PREFIX}.AREA_REQUIRED`, priority: `${PREFIX}.PRIORITY` });
    });

    it('refuses an end date before the start date', () => {
      const result = validateCoverage([row({ validFrom: '2026-10-02', validTo: '2026-10-01' })], false);
      expect(result.rows.get('r1')).toEqual({ validTo: `${PREFIX}.DATES` });
    });

    it('needs distance tiers to increase and end with one blank catch-all', () => {
      const tier = (key: string, maxDistance: string): CoverageRuleDraft => row({ key, ruleType: 'DISTANCE_TIER', maxDistance });
      expect(validateCoverage([tier('a', '10'), tier('b', '25'), tier('c', '')], false).rows.size).toBe(0);
      expect(validateCoverage([tier('a', '25'), tier('b', '10'), tier('c', '')], false).rows.get('b')).toEqual({
        maxDistance: `${PREFIX}.TIERS_ASCENDING`,
      });
      expect(validateCoverage([tier('a', ''), tier('b', '')], false).rows.get('a')).toEqual({
        maxDistance: `${PREFIX}.CATCH_ALL_LAST`,
      });
      expect(validateCoverage([tier('a', '10'), tier('b', '25')], false).rows.get('b')).toEqual({
        maxDistance: `${PREFIX}.CATCH_ALL_MISSING`,
      });
      expect(validateCoverage([tier('a', 'far'), tier('b', '')], false).rows.get('a')).toEqual({
        maxDistance: `${PREFIX}.DISTANCE`,
      });
    });

    it('ignores max distance on service-area rules', () => {
      expect(validateCoverage([row({ maxDistance: 'anything' })], false).rows.size).toBe(0);
    });

    it('stops an active unit losing its last rule, but lets an inactive one', () => {
      expect(validateCoverage([], true).form).toBe(`${PREFIX}.ACTIVE_NEEDS_RULE`);
      expect(validateCoverage([], false).form).toBeNull();
    });
  });
});
