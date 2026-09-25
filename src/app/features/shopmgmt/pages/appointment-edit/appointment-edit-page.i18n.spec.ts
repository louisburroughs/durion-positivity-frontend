/**
 * Appointment-edit copy guard — asserts real bundle content, not keys (issue #332).
 *
 * `appointment-edit-page.component.spec.ts` configures `TranslateModule.forRoot()` with no
 * loader, so `| translate` echoes the key back — a component-spec assertion like
 * `not.toContain('SCHEDULED')` would pass or fail on the KEY STRING, not the real copy. This file
 * loads the real `src/assets/i18n/*.json` (ADR-0035 §8) and asserts what #332's acceptance
 * criterion actually requires: every appointment status, conflict code and audit event code
 * resolves to real, non-empty prose in every shipped locale, and — for en-US — that prose is not
 * simply the raw enum code re-typed.
 */
import { describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import esUS from '../../../../../assets/i18n/es-US.json';
import esMX from '../../../../../assets/i18n/es-MX.json';
import frCA from '../../../../../assets/i18n/fr-CA.json';
import frFR from '../../../../../assets/i18n/fr-FR.json';
import qpsPloc from '../../../../../assets/i18n/qps-ploc.json';
import { APPOINTMENT_STATUS_CODES } from '../../models/appointment.models';

const LOCALES: readonly (readonly [string, unknown])[] = [
  ['en-US', enUS],
  ['es-US', esUS],
  ['es-MX', esMX],
  ['fr-CA', frCA],
  ['fr-FR', frFR],
  ['qps-ploc', qpsPloc],
];

/** The string at a dotted key path, or undefined when the path is not a string. */
function lookup(bundle: unknown, key: string): string | undefined {
  let node: unknown = bundle;
  for (const segment of key.split('.')) {
    if (node === null || typeof node !== 'object') {
      return undefined;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

const CONFLICT_CODES = [
  'FACILITY_CLOSED',
  'OUTSIDE_OPERATING_HOURS',
  'BAY_DOUBLE_BOOKED',
  'MECHANIC_UNAVAILABLE',
  'FACILITY_NEAR_CAPACITY',
  'NO_COMPETENT_MECHANIC_ROSTERED',
  'COMPETENT_MECHANIC_UNAVAILABLE',
  'GENERIC',
];

const AUDIT_EVENT_CODES = [
  'SCHEDULE_CREATED',
  'SCHEDULE_UPDATED',
  'SCHEDULE_CANCELLED',
  'ASSIGNMENT_CREATED',
  'ASSIGNMENT_REMOVED',
];

describe('appointment-edit copy (#332)', () => {
  describe.each(LOCALES)('%s', (localeName, bundle) => {
    it.each(APPOINTMENT_STATUS_CODES)('has a non-empty SHOPMGMT.APPOINTMENT_STATUS.%s', (code) => {
      const value = lookup(bundle, `SHOPMGMT.APPOINTMENT_STATUS.${code}`);
      expect(value).toBeTruthy();
    });

    it.each(CONFLICT_CODES)('has a non-empty SHOPMGMT.APPOINTMENT_CONFLICT_CODE.%s', (code) => {
      const value = lookup(bundle, `SHOPMGMT.APPOINTMENT_CONFLICT_CODE.${code}`);
      expect(value).toBeTruthy();
    });

    it.each(AUDIT_EVENT_CODES)('has a non-empty SHOPMGMT.APPOINTMENT_EDIT.AUDIT_EVENT.%s', (code) => {
      const value = lookup(bundle, `SHOPMGMT.APPOINTMENT_EDIT.AUDIT_EVENT.${code}`);
      expect(value).toBeTruthy();
    });

    it('has real prose for the reschedule/cancellation error keys, not an empty string', () => {
      expect(lookup(bundle, 'SHOPMGMT.APPOINTMENT_EDIT.ERROR.LOAD')).toBeTruthy();
      expect(lookup(bundle, 'SHOPMGMT.APPOINTMENT_EDIT.ERROR.LOAD_NOT_FOUND')).toBeTruthy();
      expect(lookup(bundle, 'SHOPMGMT.APPOINTMENT_EDIT.ERROR.RESCHEDULE_FAILED')).toBeTruthy();
      expect(lookup(bundle, 'SHOPMGMT.APPOINTMENT_EDIT.ERROR.CANCELLATION_FAILED')).toBeTruthy();
    });
  });

  it('en-US: a translated status is never just the raw enum code (#332 acceptance criterion)', () => {
    for (const code of APPOINTMENT_STATUS_CODES) {
      const value = lookup(enUS, `SHOPMGMT.APPOINTMENT_STATUS.${code}`);
      expect(value).not.toBe(code);
    }
  });

  it('en-US: a translated conflict code is never just the raw code', () => {
    for (const code of CONFLICT_CODES) {
      const value = lookup(enUS, `SHOPMGMT.APPOINTMENT_CONFLICT_CODE.${code}`);
      expect(value).not.toBe(code);
    }
  });

  it('en-US: a translated audit event is never just the raw eventType code', () => {
    for (const code of AUDIT_EVENT_CODES) {
      const value = lookup(enUS, `SHOPMGMT.APPOINTMENT_EDIT.AUDIT_EVENT.${code}`);
      expect(value).not.toBe(code);
    }
  });
});
