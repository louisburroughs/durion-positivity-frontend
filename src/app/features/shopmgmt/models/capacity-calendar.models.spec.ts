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
  isoDateLocal,
  parseIsoDateLocal,
  shopUtilization,
} from './capacity-calendar.models';

// ── Fixtures ────────────────────────────────────────────────────────────────

const HOURS = [7, 8, 9, 10, 11];

function bay(overrides: Partial<CapacityBay> & { bayId: string }): CapacityBay {
  return {
    name: overrides.bayId,
    bayType: 'GENERAL_SERVICE',
    capabilityCodes: [],
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
  bayTypes: ['ALIGNMENT'],
  skillCodes: [],
  durationHours: 1.5,
};

/** The alignment job once the catalog names its skill (CAP-329): certification is per person. */
const ALIGN_CERTIFIED_JOB: JobRequirement = { ...ALIGNMENT_JOB, skillCodes: ['ALIGN'] };

const ALL_WORK: JobRequirement = {
  label: '',
  bayTypes: [],
  skillCodes: [],
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
  const job = { ...ALIGNMENT_JOB, operationCode: 'WHEEL-ALIGNMENT-4-WHEEL', bayTypes: ['ALIGNMENT'] };
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

  it('D14: when nobody claims the operation it is general work — every general bay, never a specialty bay', () => {
    const brakeJob = { ...ALIGNMENT_JOB, operationCode: 'BRAKE-PAD-REPLACE-FRONT', bayTypes: [] };
    expect(isEligibleBay(general, brakeJob, [rack, general, tireBay])).toBe(true);
    expect(isEligibleBay(tireBay, brakeJob, [rack, general, tireBay])).toBe(false);
    expect(isEligibleBay(rack, brakeJob, [rack, general, tireBay])).toBe(false);
  });

  it('D14: an out-of-service claimant does not reserve the operation', () => {
    const downRack = bay({ ...rack, outOfService: true });
    expect(isEligibleBay(general, job, [downRack, general])).toBe(true);
  });

  it('falls back to bay type when the job has no operation code', () => {
    expect(isEligibleBay(bay({ bayId: 'a', bayType: 'ALIGNMENT' }), ALIGNMENT_JOB)).toBe(true);
    expect(isEligibleBay(bay({ bayId: 'b', bayType: 'TIRE_SERVICE' }), ALIGNMENT_JOB)).toBe(false);
  });

  it('never counts an out-of-service bay', () => {
    const down = bay({ bayId: 'a', bayType: 'ALIGNMENT', outOfService: true });
    expect(isEligibleBay(down, ALIGNMENT_JOB)).toBe(false);
  });

  it('treats an unfiltered job as every bay', () => {
    expect(isEligibleBay(bay({ bayId: 'a', bayType: 'TIRE_SERVICE' }), ALL_WORK)).toBe(true);
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

// ── Date helpers ────────────────────────────────────────────────────────────

describe('date helpers', () => {
  it('formats the local calendar date, not the UTC one (ADR-0038)', () => {
    // 11 PM local on the 15th is the 16th in UTC for any UTC-N zone; the
    // calendar must still say the 15th.
    const late = new Date(2026, 8, 15, 23, 30);
    expect(isoDateLocal(late)).toBe('2026-09-15');
  });

  it('parses an ISO date as local midnight', () => {
    const parsed = parseIsoDateLocal('2026-09-15');
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(8);
    expect(parsed.getDate()).toBe(15);
    expect(parsed.getHours()).toBe(0);
  });

  it('round-trips', () => {
    expect(isoDateLocal(parseIsoDateLocal('2026-02-29'.replace('29', '28')))).toBe('2026-02-28');
  });
});
