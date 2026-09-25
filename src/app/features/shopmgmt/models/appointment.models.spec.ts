import { describe, it, expect } from 'vitest';
import { appointmentStatusKey, conflictCodeKey } from './appointment.models';
import enUS from '../../../../assets/i18n/en-US.json';

describe('appointmentStatusKey', () => {
  it('maps a status in APPOINTMENT_STATUS_CODES to its translation key', () => {
    expect(appointmentStatusKey('SCHEDULED')).toBe('SHOPMGMT.APPOINTMENT_STATUS.SCHEDULED');
    expect(appointmentStatusKey('WORK_IN_PROGRESS')).toBe('SHOPMGMT.APPOINTMENT_STATUS.WORK_IN_PROGRESS');
    expect(appointmentStatusKey('INVOICED')).toBe('SHOPMGMT.APPOINTMENT_STATUS.INVOICED');
  });

  // PR #363 review: a status the server sends outside the known catalog must fall back to
  // COMMON.NOT_AVAILABLE rather than a raw-status key the missing-key fallback would expose as
  // visible text (ADR-0064 §5). Asserted against the real en-US bundle (ADR-0035 §8), not a
  // string pasted into the spec.
  it('falls back to COMMON.NOT_AVAILABLE for an unknown server status', () => {
    const key = appointmentStatusKey('SOME_FUTURE_STATUS');
    expect(key).toBe('COMMON.NOT_AVAILABLE');
    expect(enUS.COMMON.NOT_AVAILABLE).toBeTruthy();
  });

  it('falls back to COMMON.NOT_AVAILABLE for an absent status', () => {
    expect(appointmentStatusKey(undefined)).toBe('COMMON.NOT_AVAILABLE');
    expect(appointmentStatusKey(null)).toBe('COMMON.NOT_AVAILABLE');
    expect(appointmentStatusKey('')).toBe('COMMON.NOT_AVAILABLE');
  });
});

describe('conflictCodeKey', () => {
  it('maps a known conflict code to its translation key', () => {
    expect(conflictCodeKey('BAY_DOUBLE_BOOKED')).toBe('SHOPMGMT.APPOINTMENT_CONFLICT_CODE.BAY_DOUBLE_BOOKED');
  });

  it('falls back to the generic summary key for an unrecognised code', () => {
    expect(conflictCodeKey('SOME_NEW_CODE')).toBe('SHOPMGMT.APPOINTMENT_CONFLICT_CODE.GENERIC');
  });
});
