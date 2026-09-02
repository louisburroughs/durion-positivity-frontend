import { describe, it, expect } from 'vitest';
import {
  DashboardVehicle,
  isOpenStatus,
  statusBand,
  statusKey,
  todayIsoLocal,
  vehicleLabel,
} from './shop-dashboard.models';
import type { WorkorderStatus } from '../../workexec/models/workexec.models';

describe('todayIsoLocal', () => {
  /**
   * These tests are the ONLY place the ADR-0038 rule is actually enforced.
   *
   * CI runs with TZ unset, i.e. UTC, where the local calendar date and the UTC
   * date are identical by definition — so a test that builds its expectation
   * with local getters and compares it to the implementation passes whether the
   * implementation uses local getters OR `toISOString().slice(0, 10)`. Verified:
   * reverting to `toISOString()` left every date test in the suite green.
   *
   * Passing a Date-like whose local getters and `toISOString()` deliberately
   * disagree makes the distinction observable in any timezone.
   */
  it('reads the local calendar date, not the UTC date', () => {
    // 18:00 on 2 Sep in a UTC-7 zone === 01:00 on 3 Sep UTC.
    const pacificEvening = {
      getFullYear: () => 2026,
      getMonth: () => 8,
      getDate: () => 2,
      toISOString: () => '2026-09-03T01:00:00.000Z',
    } as unknown as Date;

    expect(todayIsoLocal(pacificEvening)).toBe('2026-09-02');
  });

  it('does not fall back to the UTC date when they differ in the other direction', () => {
    // 00:30 on 3 Sep in a UTC+9 zone === 15:30 on 2 Sep UTC.
    const tokyoEarlyMorning = {
      getFullYear: () => 2026,
      getMonth: () => 8,
      getDate: () => 3,
      toISOString: () => '2026-09-02T15:30:00.000Z',
    } as unknown as Date;

    expect(todayIsoLocal(tokyoEarlyMorning)).toBe('2026-09-03');
  });

  it('zero-pads month and day', () => {
    expect(todayIsoLocal(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05');
  });

  it('defaults to now', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(todayIsoLocal()).toBe(expected);
  });
});

describe('statusBand', () => {
  const cases: ReadonlyArray<[WorkorderStatus, string]> = [
    ['DRAFT', 'queued'],
    ['APPROVED', 'queued'],
    ['ASSIGNED', 'queued'],
    ['WORK_IN_PROGRESS', 'active'],
    ['AWAITING_PARTS', 'blocked'],
    ['AWAITING_APPROVAL', 'blocked'],
    ['READY_FOR_PICKUP', 'ready'],
    ['COMPLETED', 'closed'],
    ['CANCELLED', 'cancelled'],
  ];

  it.each(cases)('maps %s to %s', (status, band) => {
    expect(statusBand(status)).toBe(band);
  });

  it('treats an absent status as idle', () => {
    expect(statusBand(undefined)).toBe('idle');
    expect(statusBand(null)).toBe('idle');
    expect(statusBand('')).toBe('idle');
  });

  it('falls back to queued for an unrecognised status rather than idle', () => {
    // Idle would claim the unit is free; queued keeps it visibly occupied.
    expect(statusBand('SOMETHING_NEW')).toBe('queued');
  });
});

describe('isOpenStatus', () => {
  it('is false only for COMPLETED and CANCELLED', () => {
    expect(isOpenStatus('COMPLETED')).toBe(false);
    expect(isOpenStatus('CANCELLED')).toBe(false);
    expect(isOpenStatus('WORK_IN_PROGRESS')).toBe(true);
    expect(isOpenStatus('DRAFT')).toBe(true);
    expect(isOpenStatus('READY_FOR_PICKUP')).toBe(true);
  });

  it('is false for an absent status', () => {
    expect(isOpenStatus(undefined)).toBe(false);
  });
});

describe('statusKey', () => {
  it('returns a key for a known status', () => {
    expect(statusKey('AWAITING_PARTS')).toBe('SHOPMGMT.SHOP_DASHBOARD.STATUS.AWAITING_PARTS');
  });

  it('returns undefined for an unknown status so the raw value can be shown', () => {
    expect(statusKey('SOMETHING_NEW')).toBeUndefined();
    expect(statusKey(undefined)).toBeUndefined();
  });
});

describe('vehicleLabel', () => {
  const full: DashboardVehicle = {
    vehicleId: 'v1',
    vin: '1FTFW1E85MFA88823',
    year: 2021,
    make: 'Ford',
    model: 'F-150',
  };

  it('joins year, make and model', () => {
    expect(vehicleLabel(full)).toBe('2021 Ford F-150');
  });

  it('skips absent parts without leaving double spaces', () => {
    expect(vehicleLabel({ vehicleId: 'v1', year: 2021, model: 'F-150' })).toBe('2021 F-150');
    expect(vehicleLabel({ vehicleId: 'v1', make: 'Ford' })).toBe('Ford');
  });

  it('falls back to the unstructured description when nothing is structured', () => {
    expect(vehicleLabel({ vehicleId: '', description: '2019 Toyota Camry' })).toBe('2019 Toyota Camry');
  });

  it('prefers structured parts over the description', () => {
    expect(vehicleLabel({ ...full, description: 'stale text' })).toBe('2021 Ford F-150');
  });

  it('returns empty string when nothing is known, so the template can show its own copy', () => {
    expect(vehicleLabel(undefined)).toBe('');
    expect(vehicleLabel({ vehicleId: 'v1' })).toBe('');
    expect(vehicleLabel({ vehicleId: 'v1', description: '   ' })).toBe('');
  });
});
