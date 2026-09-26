import type { BayResponse } from '@durion-sdk/location';
import {
  BAY_TYPE_DEFAULT_CODES,
  BayDraft,
  activeClaimants,
  bayChanges,
  codeChanges,
  draftFromBay,
  dutyBand,
  eligibilityKind,
  isTestRecord,
  laneOf,
  naturalCompare,
  newBayDraft,
  operationCodeLabel,
} from './bay-setup.models';

const bay = (overrides: Partial<BayResponse> = {}): BayResponse => ({
  id: 'bay-1',
  locationId: 'loc-1',
  name: 'Bay 1',
  bayType: 'GENERAL_SERVICE',
  status: 'ACTIVE',
  maxConcurrentVehicles: 1,
  serviceCapabilityCodes: [],
  ...overrides,
});

const ALIGN = 'WHEEL-ALIGNMENT-4-WHEEL';

describe('bay setup rules', () => {
  describe('laneOf / eligibilityKind', () => {
    it('puts an out-of-service bay in the out-of-service lane whatever its type or claims', () => {
      const down = bay({ status: 'OUT_OF_SERVICE', bayType: 'WASH_DETAIL', serviceCapabilityCodes: [ALIGN] });
      expect(laneOf(down)).toBe('OUT_OF_SERVICE');
      expect(eligibilityKind(down)).toBe('OUT_OF_SERVICE');
    });

    it('puts a wash & detail bay in its own lane, and a wash bay with no services can be assigned nothing', () => {
      expect(laneOf(bay({ bayType: 'WASH_DETAIL' }))).toBe('WASH');
      expect(eligibilityKind(bay({ bayType: 'WASH_DETAIL' }))).toBe('WASH_NONE');
      expect(eligibilityKind(bay({ bayType: 'WASH_DETAIL', serviceCapabilityCodes: ['FULL-DETAIL'] }))).toBe('WASH');
    });

    it('splits the other bays on whether they claim any specialty service, not on their type', () => {
      expect(laneOf(bay({ bayType: 'ALIGNMENT', serviceCapabilityCodes: [] }))).toBe('GENERAL');
      expect(laneOf(bay({ serviceCapabilityCodes: [ALIGN] }))).toBe('SPECIALTY');
      expect(eligibilityKind(bay())).toBe('GENERAL');
      expect(eligibilityKind(bay({ serviceCapabilityCodes: [ALIGN] }))).toBe('SPECIALTY');
    });

    it('reads status and type case-insensitively', () => {
      expect(laneOf(bay({ status: 'out_of_service' }))).toBe('OUT_OF_SERVICE');
      expect(laneOf(bay({ bayType: 'wash_detail' }))).toBe('WASH');
    });
  });

  it('bands duty classes 1–3 light, 4–6 medium, 7–8 heavy, and none for no limit', () => {
    expect([1, 3, 4, 6, 7, 8].map(dutyBand)).toEqual(['LIGHT', 'LIGHT', 'MEDIUM', 'MEDIUM', 'HEAVY', 'HEAVY']);
    expect(dutyBand(undefined)).toBeNull();
    expect(dutyBand(null)).toBeNull();
  });

  it('sorts names naturally: Bay 2 before Bay 10', () => {
    expect(['Bay 10', 'Bay 2', 'bay 1'].sort(naturalCompare)).toEqual(['bay 1', 'Bay 2', 'Bay 10']);
  });

  it('recognises the SDK integration-suite records by name only', () => {
    expect(isTestRecord('Itest bay itest-1790388132-rwlg')).toBe(true);
    expect(isTestRecord('  itest unit 4')).toBe(true);
    expect(isTestRecord('Itesting rack')).toBe(false);
    expect(isTestRecord('Bay 3')).toBe(false);
  });

  it('turns an operation code into a readable label', () => {
    expect(operationCodeLabel(ALIGN)).toBe('Wheel alignment 4 wheel');
    expect(operationCodeLabel('  ')).toBe('  ');
  });

  it('counts only in-service bays as claimants', () => {
    const claims = activeClaimants([
      bay({ id: 'a', serviceCapabilityCodes: [ALIGN] }),
      bay({ id: 'b', serviceCapabilityCodes: [ALIGN, 'TPMS-SENSOR-SERVICE'] }),
      bay({ id: 'c', status: 'OUT_OF_SERVICE', serviceCapabilityCodes: ['DOT-ANNUAL-INSPECTION'] }),
    ]);
    expect(claims.get(ALIGN)).toEqual(['a', 'b']);
    expect(claims.get('TPMS-SENSOR-SERVICE')).toEqual(['b']);
    expect(claims.has('DOT-ANNUAL-INSPECTION')).toBe(false);
  });

  it('starts a new draft with the type defaults, and copies an existing bay into a draft', () => {
    expect(newBayDraft('TIRE_SERVICE').serviceCapabilityCodes).toEqual(BAY_TYPE_DEFAULT_CODES.TIRE_SERVICE);
    expect(newBayDraft()).toEqual({
      name: '',
      bayType: 'GENERAL_SERVICE',
      status: 'ACTIVE',
      maxConcurrentVehicles: 1,
      maxDutyClass: null,
      serviceCapabilityCodes: [],
    });
    expect(draftFromBay(bay({ bayType: 'UNKNOWN', status: 'OUT_OF_SERVICE', maxDutyClass: 6 }))).toEqual({
      name: 'Bay 1',
      bayType: 'GENERAL_SERVICE',
      status: 'OUT_OF_SERVICE',
      maxConcurrentVehicles: 1,
      maxDutyClass: 6,
      serviceCapabilityCodes: [],
    });
  });

  it('diffs code lists in both directions', () => {
    expect(codeChanges(['A', 'B'], ['B', 'C'])).toEqual({ added: ['C'], removed: ['A'] });
  });

  describe('bayChanges', () => {
    const draft = (overrides: Partial<BayDraft> = {}): BayDraft => ({ ...newBayDraft(), name: 'Bay 4', ...overrides });

    it('reports nothing for a new general bay at a location with room for any vehicle', () => {
      expect(bayChanges(null, draft(), [bay()])).toEqual([]);
    });

    it('says a new bay becomes the only claimant of a service no in-service bay holds', () => {
      const bays = [bay({ id: 'down', status: 'OUT_OF_SERVICE', serviceCapabilityCodes: [ALIGN] })];
      expect(bayChanges(null, draft({ serviceCapabilityCodes: [ALIGN] }), bays)).toEqual([
        { kind: 'ONLY_CLAIMANT', code: ALIGN },
      ]);
    });

    it('says nothing about a service another in-service bay already claims', () => {
      const bays = [bay({ id: 'other', serviceCapabilityCodes: [ALIGN] })];
      expect(bayChanges(null, draft({ serviceCapabilityCodes: [ALIGN] }), bays)).toEqual([]);
    });

    it('turns every sole claim into general work when a bay goes out of service', () => {
      const before = bay({ id: 'b3', name: 'Bay 3', serviceCapabilityCodes: [ALIGN, 'TPMS-SENSOR-SERVICE'] });
      const others = [bay({ id: 'b5', serviceCapabilityCodes: ['TPMS-SENSOR-SERVICE'] })];
      const after = { ...draftFromBay(before), status: 'OUT_OF_SERVICE' as const };
      expect(bayChanges(before, after, [before, ...others])).toEqual([
        { kind: 'OUT_OF_SERVICE' },
        { kind: 'NOW_GENERAL_WORK', code: ALIGN },
      ]);
    });

    it('restores sole claims when a bay comes back into service', () => {
      const before = bay({ status: 'OUT_OF_SERVICE', serviceCapabilityCodes: [ALIGN] });
      const after = { ...draftFromBay(before), status: 'ACTIVE' as const };
      expect(bayChanges(before, after, [before])).toEqual([
        { kind: 'BACK_IN_SERVICE' },
        { kind: 'ONLY_CLAIMANT', code: ALIGN },
      ]);
    });

    it('says a service added to an out-of-service bay is on hold', () => {
      const before = bay({ status: 'OUT_OF_SERVICE' });
      const after = { ...draftFromBay(before), serviceCapabilityCodes: [ALIGN] };
      expect(bayChanges(before, after, [before])).toEqual([{ kind: 'CLAIM_ON_HOLD', code: ALIGN }]);
    });

    it('warns when lowering a duty class leaves no in-service bay for heavier vehicles', () => {
      const before = bay({ id: 'heavy', maxDutyClass: 8 });
      const others = [bay({ id: 'light', maxDutyClass: 3 }), bay({ id: 'down', status: 'OUT_OF_SERVICE' })];
      const after = { ...draftFromBay(before), maxDutyClass: 6 };
      expect(bayChanges(before, after, [before, ...others])).toEqual([{ kind: 'NO_BAY_ABOVE', dutyClass: 6 }]);
    });

    it('does not warn about duty class while another bay has no limit', () => {
      const before = bay({ id: 'heavy', maxDutyClass: 8 });
      const after = { ...draftFromBay(before), maxDutyClass: 4 };
      expect(bayChanges(before, after, [before, bay({ id: 'open' })])).toEqual([]);
    });

    it('warns that an in-service wash bay with no services can be assigned nothing', () => {
      expect(bayChanges(null, draft({ bayType: 'WASH_DETAIL' }), [])).toEqual([{ kind: 'WASH_NONE' }]);
    });
  });
});
