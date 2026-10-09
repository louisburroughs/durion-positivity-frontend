import { describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import esMX from '../../../../../assets/i18n/es-MX.json';
import esUS from '../../../../../assets/i18n/es-US.json';
import frCA from '../../../../../assets/i18n/fr-CA.json';
import frFR from '../../../../../assets/i18n/fr-FR.json';

/** Copy claims of #469 and its S24 correction, asserted against the real bundles (ADR-0035 §8). */
const BUNDLES = { 'en-US': enUS, 'fr-CA': frCA, 'fr-FR': frFR, 'es-US': esUS, 'es-MX': esMX } as const;

function at(bundle: unknown, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);
  return typeof value === 'string' ? value : undefined;
}

describe('Vendor copy (en-US)', () => {
  it.each([
    ['SHELL.NAV.VENDORS', 'Vendors'],
    ['POSITIVITY.VENDORS.ADD', 'Add vendor'],
    ['POSITIVITY.VENDORS.FORM.NUMBER_HINT', "Leave blank and we'll number it (V-000123). Capital letters, digits and hyphens, up to {{max}}."],
    ['POSITIVITY.VENDORS.TERMS.DUE_ON_RECEIPT', 'Due on receipt'],
    ['POSITIVITY.VENDORS.TERMS.NET', 'Net {{days}}'],
    [
      'POSITIVITY.VENDORS.CREATE.CONSEQUENCE',
      "Purchasing, bills and payments will all use this vendor. Whoever adds a vendor can't approve its first bill.",
    ],
    // S24 (backend #2648): the announcement covers purchasing too.
    ['POSITIVITY.VENDORS.CREATE.ADDED', 'Vendor {{number}} added. It can take a moment to appear in bills, purchase orders and payments.'],
    ['POSITIVITY.VENDORS.ERROR.STALE', 'Someone else changed this vendor. Check and save again.'],
    ['POSITIVITY.VENDORS.ERROR.NUMBER_TAKEN', '{{number}} is already used. Leave it blank to number automatically.'],
    // S24 correction: open bills of an inactive vendor can be approved but are not paid.
    [
      'POSITIVITY.VENDORS.STATUS_DIALOG.DEACTIVATE_CONSEQUENCE',
      "New bills, payments and purchase orders for this vendor will be refused. Its open bills can still be approved, but they aren't paid while the vendor is inactive.",
    ],
    ['POSITIVITY.VENDORS.REMIT.REQUEST_CONSEQUENCE', 'The new address is used only after someone else approves it.'],
    [
      'POSITIVITY.VENDORS.REMIT.VERIFICATION_LABEL',
      'How did you check this? For example, you called the vendor on a number you already had',
    ],
    [
      'POSITIVITY.VENDORS.REMIT.APPROVE_CONSEQUENCE',
      'Payments will go to the new address. Bills approved before the change need a second confirmation before they are paid.',
    ],
    ['POSITIVITY.VENDORS.REMIT.SELF_APPROVAL', "You can't approve a change you requested"],
    ['POSITIVITY.VENDORS.EMPTY', 'No vendors match.'],
    ['POSITIVITY.VENDORS.EMPTY_ADD', 'Add the first one.'],
    ['POSITIVITY.VENDORS.TAX.MASKED', '•••• {{last4}}'],
    ['POSITIVITY.VENDORS.TAX.ON_FILE', 'on file'],
  ])('%s', (key, expected) => {
    expect(at(enUS, key)).toBe(expected);
  });

  it('never says open bills of an inactive vendor "can still be paid" (S24)', () => {
    for (const bundle of Object.values(BUNDLES)) {
      expect(at(bundle, 'POSITIVITY.VENDORS.STATUS_DIALOG.DEACTIVATE_CONSEQUENCE')).not.toMatch(/can still be paid/i);
    }
  });
});

describe('Vendor keys exist and are translated in every hand-maintained bundle', () => {
  const keys = [
    'SHELL.NAV.VENDORS',
    'POSITIVITY.VENDORS.TITLE',
    'POSITIVITY.VENDORS.CREATE.CONSEQUENCE',
    'POSITIVITY.VENDORS.REMIT.SELF_APPROVAL',
    'POSITIVITY.VENDORS.STATUS_DIALOG.DEACTIVATE_CONSEQUENCE',
    'POSITIVITY.VENDORS.TAX.REVEAL_CONSEQUENCE',
    'POSITIVITY.PROFILES.VENDOR.BELONGS_TO',
  ];

  it.each(Object.entries(BUNDLES))('%s', (locale, bundle) => {
    for (const key of keys) {
      const value = at(bundle, key);
      expect(value, `${locale} ${key}`).toBeTruthy();
      if (locale !== 'en-US' && key !== 'SHELL.NAV.VENDORS') expect(value, `${locale} ${key}`).not.toBe(at(enUS, key));
    }
  });
});
