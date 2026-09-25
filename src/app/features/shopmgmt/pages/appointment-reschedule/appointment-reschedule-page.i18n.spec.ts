/**
 * Appointment-reschedule copy guard — asserts real bundle content, not keys (issue #333).
 *
 * See appointment-edit-page.i18n.spec.ts for why this file exists (component specs configure
 * `TranslateModule.forRoot()` with no loader, so `| translate` there just echoes the key). This
 * file loads the real `src/assets/i18n/*.json` and asserts the reschedule-reason dropdown, which
 * had drifted from the SDK's `RescheduleAppointmentRequestReasonEnum` (CAP-249 verify finding —
 * `FACILITY_UNAVAILABLE`/`TECHNICIAN_UNAVAILABLE` are not valid backend reason codes), and the new
 * error keys all resolve to real prose in every shipped locale.
 */
import { describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import esUS from '../../../../../assets/i18n/es-US.json';
import esMX from '../../../../../assets/i18n/es-MX.json';
import frCA from '../../../../../assets/i18n/fr-CA.json';
import frFR from '../../../../../assets/i18n/fr-FR.json';
import qpsPloc from '../../../../../assets/i18n/qps-ploc.json';

const LOCALES: readonly (readonly [string, unknown])[] = [
  ['en-US', enUS],
  ['es-US', esUS],
  ['es-MX', esMX],
  ['fr-CA', frCA],
  ['fr-FR', frFR],
  ['qps-ploc', qpsPloc],
];

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

// The real `RescheduleAppointmentRequestReasonEnum` (checked against @durion-sdk/shop-manager).
const REASON_CODES = [
  'CUSTOMER_REQUEST',
  'SHOP_CAPACITY',
  'EQUIPMENT_ISSUE',
  'MECHANIC_UNAVAILABLE',
  'PARTS_DELAY',
  'WEATHER',
  'EMERGENCY',
  'MANAGER_DISCRETION',
  'OTHER',
];

const STALE_REASON_CODES = ['FACILITY_UNAVAILABLE', 'TECHNICIAN_UNAVAILABLE'];

const ERROR_KEYS = [
  'LOAD_DETAILS',
  'LOAD_NOT_FOUND',
  'SUBMIT_FAILED',
  'FIELD_START',
  'FIELD_END',
  'FIELD_REASON',
  'FIELD_NOTES',
  'FIELD_INVALID',
];

describe('appointment-reschedule copy (#333)', () => {
  describe.each(LOCALES)('%s', (localeName, bundle) => {
    it.each(REASON_CODES)('has a non-empty SHOPMGMT.APPOINTMENT_RESCHEDULE.REASONS.%s', (code) => {
      const value = lookup(bundle, `SHOPMGMT.APPOINTMENT_RESCHEDULE.REASONS.${code}`);
      expect(value).toBeTruthy();
    });

    it.each(STALE_REASON_CODES)('no longer carries the invalid reason code %s', (code) => {
      const value = lookup(bundle, `SHOPMGMT.APPOINTMENT_RESCHEDULE.REASONS.${code}`);
      expect(value).toBeUndefined();
    });

    it.each(ERROR_KEYS)('has a non-empty SHOPMGMT.APPOINTMENT_RESCHEDULE.ERROR.%s', (key) => {
      const value = lookup(bundle, `SHOPMGMT.APPOINTMENT_RESCHEDULE.ERROR.${key}`);
      expect(value).toBeTruthy();
    });

    it('has a non-empty STATUS and FACILITY label', () => {
      expect(lookup(bundle, 'SHOPMGMT.APPOINTMENT_RESCHEDULE.STATUS')).toBeTruthy();
      expect(lookup(bundle, 'SHOPMGMT.APPOINTMENT_RESCHEDULE.FACILITY')).toBeTruthy();
    });
  });

  it('en-US: every reason option is real prose, never the raw enum code', () => {
    for (const code of REASON_CODES) {
      const value = lookup(enUS, `SHOPMGMT.APPOINTMENT_RESCHEDULE.REASONS.${code}`);
      expect(value).not.toBe(code);
    }
  });
});
