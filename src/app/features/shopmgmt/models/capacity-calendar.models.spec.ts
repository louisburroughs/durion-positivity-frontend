/**
 * Capacity engine unit tests.
 *
 * The engine is the whole point of the page: "three bays free" is not an answer
 * if none of them can do the job, and the two ways the technician axis hits zero
 * need different fixes. These cases pin that behaviour.
 */
import { describe, it, expect } from 'vitest';
import {
  BayHourState,
  CapacityBay,
  CapacityTechnician,
  DayCapacityInput,
  JobRequirement,
  computeDay,
  hoursNeeded,
  isCertifiedTechnician,
  isEligibleBay,
  rankEligibleBays,
  shopUtilization,
} from './capacity-calendar.models';

// ── Fixtures ────────────────────────────────────────────────────────────────

const HOURS = [7, 8, 9, 10, 11];

/** The alignment rack's seeded claim (pos-location's specialty map for ALIGNMENT, CAP-325 D14). */
const ALIGNMENT_CODE = 'WHEEL-ALIGNMENT-4-WHEEL';

/**
 * A fixture bay. An `ALIGNMENT` bay claims the alignment code unless told
 * otherwise, the way the seeded specialty map gives it that claim; eligibility
 * reads the claim, never the type.
 */
function bay(overrides: Partial<CapacityBay> & { bayId: string }): CapacityBay {
  return {
    name: overrides.bayId,
    bayType: 'GENERAL_SERVICE',
    capabilityCodes: overrides.bayType === 'ALIGNMENT' ? [ALIGNMENT_CODE] : [],
    outOfService: false,
    ...overrides,
  };
}

function tech(
  personId: string,
  overrides: Partial<CapacityTechnician> = {},
): CapacityTechnician {
  return {
    personId,
    displayName: personId,
    skills: [],
    assignedHours: new Set<number>(),
    onDutyHours: new Set(HOURS.map((_, index) => index)),
    ...overrides,
  };
}

const ALIGNMENT_JOB: JobRequirement = {
  label: '4-wheel alignment',
  operationCode: ALIGNMENT_CODE,
  skillCodes: [],
  skillRequirementsConfigured: true,
  durationHours: 1.5,
};

/** The alignment job once the catalog names its skill (CAP-329): certification is per person. */
const ALIGN_CERTIFIED_JOB: JobRequirement = { ...ALIGNMENT_JOB, skillCodes: ['ALIGN'] };

const ALL_WORK: JobRequirement = {
  label: '',
  skillCodes: [],
  skillRequirementsConfigured: true,
  durationHours: 1,
};

function input(overrides: Partial<DayCapacityInput> = {}): DayCapacityInput {
  const bays = overrides.bays ?? [bay({ bayId: 'rack', bayType: 'ALIGNMENT' })];
  return {
    date: '2026-09-15',
    kind: 'open',
    isToday: false,
    hours: HOURS,
    bays,
    technicians: [tech('J. Bell')],
    job: ALIGNMENT_JOB,
    grid: bays.map(() => HOURS.map(() => 'free' as BayHourState)),
    ...overrides,
  };
}

// ── Eligibility ─────────────────────────────────────────────────────────────

describe('isEligibleBay', () => {
  const job = { ...ALIGNMENT_JOB, operationCode: ALIGNMENT_CODE };
  const rack = bay({ bayId: 'rack', bayType: 'GENERAL_SERVICE', capabilityCodes: ['wheel-alignment-4-wheel'] });
  const general = bay({ bayId: 'gen', bayType: 'GENERAL_SERVICE' });
  const tireBay = bay({ bayId: 'tire', bayType: 'TIRE_SERVICE', capabilityCodes: ['TIRE-INSTALL-SET-4'] });

  it('D14: a bay claiming the operation code is eligible, whatever its bay type, case-insensitively', () => {
    // Bay type says no, the specialty map says yes: the map wins.
    expect(isEligibleBay(rack, job, [rack, general])).toBe(true);
  });

  it('D14: when a bay claims the operation, only claimants may do it', () => {
    expect(isEligibleBay(general, job, [rack, general])).toBe(false);
  });

  it('D14: when nobody claims the operation it is general work — every bay but a wash bay, specialty bays ranked last', () => {
    const brakeJob = { ...ALIGNMENT_JOB, operationCode: 'BRAKE-PAD-REPLACE-FRONT' };
    const wash = bay({ bayId: 'wash', bayType: 'WASH_DETAIL' });
    expect(isEligibleBay(general, brakeJob, [rack, general, tireBay, wash])).toBe(true);
    expect(isEligibleBay(tireBay, brakeJob, [rack, general, tireBay, wash])).toBe(true);
    expect(isEligibleBay(rack, brakeJob, [rack, general, tireBay, wash])).toBe(true);
    expect(isEligibleBay(wash, brakeJob, [rack, general, tireBay, wash])).toBe(false);
    expect(rankEligibleBays([rack, general, tireBay]).map(b => b.bayId)).toEqual(['gen', 'rack', 'tire']);
  });

  it('D14: a service the catalog gave no code is general work — nothing is inferred from its name', () => {
    const unnamed = { ...ALIGNMENT_JOB, serviceId: 'svc-oneoff', label: 'Alignment check (one-off)', operationCode: undefined };
    const wash = bay({ bayId: 'wash', bayType: 'WASH_DETAIL' });
    expect(isEligibleBay(general, unnamed, [rack, general, wash])).toBe(true);
    expect(isEligibleBay(rack, unnamed, [rack, general, wash])).toBe(true);
    // Still mechanical work: the wash bay stays out (D14's one exception).
    expect(isEligibleBay(wash, unnamed, [rack, general, wash])).toBe(false);
  });

  it('D14: an out-of-service claimant does not reserve the operation', () => {
    const downRack = bay({ ...rack, outOfService: true });
    expect(isEligibleBay(general, job, [downRack, general])).toBe(true);
  });

  it('D14: the claim decides, not the bay type — a tire bay is out only while a rack claims the operation', () => {
    const a = bay({ bayId: 'a', bayType: 'ALIGNMENT' });
    const b = bay({ bayId: 'b', bayType: 'TIRE_SERVICE' });
    expect(isEligibleBay(a, ALIGNMENT_JOB, [a, b])).toBe(true);
    expect(isEligibleBay(b, ALIGNMENT_JOB, [a, b])).toBe(false);
    // Alone, with nobody claiming the operation, the same tire bay may take it as general work.
    expect(isEligibleBay(b, ALIGNMENT_JOB, [b])).toBe(true);
  });

  it('never counts an out-of-service bay', () => {
    const down = bay({ bayId: 'a', bayType: 'ALIGNMENT', outOfService: true });
    expect(isEligibleBay(down, ALIGNMENT_JOB)).toBe(false);
  });

  it('treats an unfiltered job as every bay, the wash bay included', () => {
    expect(isEligibleBay(bay({ bayId: 'a', bayType: 'TIRE_SERVICE' }), ALL_WORK)).toBe(true);
    expect(isEligibleBay(bay({ bayId: 'w', bayType: 'WASH_DETAIL' }), ALL_WORK)).toBe(true);
  });
});

describe('isCertifiedTechnician', () => {
  const brakeJob: JobRequirement = { ...ALIGNMENT_JOB, skillCodes: ['BRAKES-LIGHT'] };

  it('holds when the technician has every skill the job requires, case-insensitively', () => {
    expect(isCertifiedTechnician(tech('bell', { skills: ['brakes-light '] }), brakeJob)).toBe(true);
    expect(isCertifiedTechnician(tech('ruiz', { skills: ['SUSPENSION-STEERING-LIGHT'] }), brakeJob)).toBe(false);
  });

  it('requires every required skill of one person, not one of them (CAP-329)', () => {
    const strict = { ...ALIGNMENT_JOB, skillCodes: ['BRAKES-LIGHT', 'ELECTRICAL-LIGHT'] };
    expect(isCertifiedTechnician(tech('a', { skills: ['BRAKES-LIGHT'] }), strict)).toBe(false);
    expect(isCertifiedTechnician(tech('b', { skills: ['BRAKES-LIGHT', 'ELECTRICAL-LIGHT'] }), strict)).toBe(true);
  });

  it('counts everyone when the job states no requirement', () => {
    // An unstated requirement is not a requirement: degrade to bay-only
    // capacity rather than reporting the whole roster as uncertified.
    expect(isCertifiedTechnician(tech('a'), ALIGNMENT_JOB)).toBe(true);
  });
});

describe('hoursNeeded', () => {
  it('rounds up, so a 1.5 hr job needs two unbroken hours', () => {
    expect(hoursNeeded({ ...ALIGNMENT_JOB, durationHours: 1.5 })).toBe(2);
  });

  it('never returns less than one hour', () => {
    expect(hoursNeeded({ ...ALIGNMENT_JOB, durationHours: 0.25 })).toBe(1);
  });
});

// ── The engine ──────────────────────────────────────────────────────────────

describe('computeDay', () => {
  it('counts only eligible bays, not the whole shop', () => {
    const bays = [
      bay({ bayId: 'gen1', bayType: 'GENERAL_SERVICE' }),
      bay({ bayId: 'gen2', bayType: 'GENERAL_SERVICE' }),
      bay({ bayId: 'rack', bayType: 'ALIGNMENT' }),
    ];
    const day = computeDay(input({ bays, grid: bays.map(() => HOURS.map(() => 'free' as BayHourState)) }));

    // Three bays free shop-wide, but only one can do an alignment.
    expect(day.hours[0].shopFree).toBe(3);
    expect(day.hours[0].bayFree).toBe(1);
    expect(day.hours[0].eligible).toBe(1);
  });

  it('reports zero eligible capacity when the rack is taken, limited by bay', () => {
    const bays = [bay({ bayId: 'rack', bayType: 'ALIGNMENT' })];
    const day = computeDay(
      input({ bays, grid: [HOURS.map(() => 'busy' as BayHourState)] }),
    );

    expect(day.firstFitHour).toBeUndefined();
    expect(day.hours[0].limit).toBe('bay');
    expect(day.techBlock).toBeUndefined();
  });

  it('separates "technician off" from "technician assigned elsewhere"', () => {
    const bays = [bay({ bayId: 'rack', bayType: 'ALIGNMENT' })];
    const grid = [HOURS.map(() => 'free' as BayHourState)];
    const certified = (overrides: Partial<CapacityTechnician>) =>
      tech('J. Bell', { skills: ['ALIGN'], ...overrides });

    // Nobody rostered: call someone in.
    const off = computeDay(
      input({ job: ALIGN_CERTIFIED_JOB, bays, grid, technicians: [certified({ onDutyHours: new Set() })] }),
    );
    expect(off.techBlock).toBe('off');
    expect(off.techOffHours).toBe(HOURS.length);

    // Rostered but covering another bay: reassign.
    const assigned = computeDay(
      input({
        job: ALIGN_CERTIFIED_JOB,
        bays,
        grid,
        technicians: [certified({ assignedHours: new Set(HOURS.map((_, i) => i)) })],
      }),
    );
    expect(assigned.techBlock).toBe('assigned');
    expect(assigned.techAssignedHours).toBe(HOURS.length);
  });

  it('is amber-not-red even with the rack free all day, when no tech is free', () => {
    // The design's driving case: equipment available, person not. The two need
    // different fixes, so the day must not read as "bay full".
    const bays = [bay({ bayId: 'rack', bayType: 'ALIGNMENT' })];
    const day = computeDay(
      input({
        job: ALIGN_CERTIFIED_JOB,
        bays,
        grid: [HOURS.map(() => 'free' as BayHourState)],
        technicians: [tech('J. Bell', { skills: ['ALIGN'], onDutyHours: new Set() })],
      }),
    );

    expect(day.eligibleFreeBayHours).toBe(HOURS.length);
    expect(day.firstFitHour).toBeUndefined();
    expect(day.hours[0].limit).toBe('tech');
  });

  it('requires the duration unbroken in one bay', () => {
    const bays = [bay({ bayId: 'rack', bayType: 'ALIGNMENT' })];
    // free, busy, free, free, busy — only index 2 starts two unbroken hours.
    const grid: BayHourState[][] = [['free', 'busy', 'free', 'free', 'busy']];
    const day = computeDay(input({ bays, grid }));

    expect(day.firstFitHour).toBe(HOURS[2]);
    expect(day.hours.map(hour => hour.fits)).toEqual([false, false, true, false, false]);
  });

  it('does not offer a window that runs past the end of the day', () => {
    const bays = [bay({ bayId: 'rack', bayType: 'ALIGNMENT' })];
    const grid: BayHourState[][] = [['busy', 'busy', 'busy', 'busy', 'free']];
    // The last hour is free, but a 1.5 hr job needs two.
    expect(computeDay(input({ bays, grid })).firstFitHour).toBeUndefined();
  });

  it('skips hours already under way on today', () => {
    const bays = [bay({ bayId: 'rack', bayType: 'ALIGNMENT' })];
    const grid = [HOURS.map(() => 'free' as BayHourState)];
    const day = computeDay(input({ bays, grid, isToday: true, currentHour: 9 }));

    // 7 and 8 are in the past; 9 is the first hour that can still start a job.
    expect(day.firstFitHour).toBe(9);
  });

  it('returns an empty day for a closure, keeping the grid for the week view', () => {
    const day = computeDay(input({ kind: 'holiday' }));
    expect(day.hours).toEqual([]);
    expect(day.eligibleCapacityBayHours).toBe(0);
    expect(day.bayStates.length).toBe(1);
  });

  it('keeps bay-hours, never appointment counts, as the unit', () => {
    const bays = [bay({ bayId: 'a' }), bay({ bayId: 'b' })];
    // One four-hour job and four one-hour jobs both consume four bay-hours.
    const grid: BayHourState[][] = [
      ['busy', 'busy', 'busy', 'busy', 'free'],
      ['busy', 'busy', 'busy', 'busy', 'free'],
    ];
    const day = computeDay(input({ bays, grid, job: ALL_WORK }));

    expect(day.shopCapacityBayHours).toBe(10);
    expect(day.shopFreeBayHours).toBe(2);
    expect(shopUtilization(day)).toBeCloseTo(0.8);
  });

  it('carries a downed bay out of capacity entirely', () => {
    const bays = [
      bay({ bayId: 'rack', bayType: 'ALIGNMENT' }),
      bay({ bayId: 'down', bayType: 'ALIGNMENT', outOfService: true }),
    ];
    const grid: BayHourState[][] = [
      HOURS.map(() => 'free'),
      HOURS.map(() => 'down'),
    ];
    const day = computeDay(input({ bays, grid }));

    expect(day.hours[0].bayCapacity).toBe(1);
    expect(day.hours[0].shopCapacity).toBe(1);
  });
});
