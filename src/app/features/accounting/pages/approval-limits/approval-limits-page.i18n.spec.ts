import { describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import esMX from '../../../../../assets/i18n/es-MX.json';
import esUS from '../../../../../assets/i18n/es-US.json';
import frCA from '../../../../../assets/i18n/fr-CA.json';
import frFR from '../../../../../assets/i18n/fr-FR.json';
import qpsPloc from '../../../../../assets/i18n/qps-ploc.json';

/**
 * Copy claims of Approval limits' Drawer cash, Petty-expense categories, Save
 * and History (CAP:550 S21, #466), asserted against the real bundles (ADR-0035 §8).
 */
type Bundle = Record<string, unknown>;

const BUNDLES: Readonly<Record<string, Bundle>> = {
  'en-US': enUS,
  'fr-CA': frCA,
  'fr-FR': frFR,
  'es-US': esUS,
  'es-MX': esMX,
  'qps-ploc': qpsPloc,
};

function lookup(bundle: Bundle, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Bundle)[part] : undefined), bundle);
  return typeof value === 'string' ? value : undefined;
}

function leaves(node: unknown, prefix: string): string[] {
  if (typeof node === 'string') return [prefix];
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node as Bundle).flatMap(([key, value]) => leaves(value, `${prefix}.${key}`));
}

const placeholders = (text: string): string[] => (text.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map(token => token.replace(/\s/g, '')).sort();

const ROOT = 'ACCOUNTING.APPROVAL_LIMITS';
const LIMITS = ((enUS as Bundle)['ACCOUNTING'] as Bundle)['APPROVAL_LIMITS'] as Bundle;
const S21_KEYS = [
  ...leaves(LIMITS['DRAWER'], `${ROOT}.DRAWER`),
  ...leaves(LIMITS['CATEGORIES'], `${ROOT}.CATEGORIES`),
  ...leaves(LIMITS['SAVE'], `${ROOT}.SAVE`),
  ...leaves(LIMITS['HISTORY'], `${ROOT}.HISTORY`),
  `${ROOT}.DENIED_ANY`,
  `${ROOT}.NAV.DRAWER`,
  `${ROOT}.NAV.CATEGORIES`,
];

describe('Approval limits copy (S21, #466)', () => {
  it('has every S21 key in all six bundles with the same placeholders', () => {
    expect(S21_KEYS.length).toBeGreaterThan(100);
    for (const key of S21_KEYS) {
      const source = lookup(enUS as Bundle, key);
      expect(source, key).toBeDefined();
      for (const [locale, bundle] of Object.entries(BUNDLES)) {
        const text = lookup(bundle, key);
        expect(text, `${locale} ${key}`).toBeTruthy();
        expect(placeholders(text!), `${locale} ${key}`).toEqual(placeholders(source!));
      }
    }
  });

  it.each([
    [`${ROOT}.DRAWER.LIMIT_LABEL`, 'Cashier can record up to'],
    [`${ROOT}.DRAWER.LIMIT_HINT`, 'Per drawer session'],
    [`${ROOT}.DRAWER.TOLERANCE_LABEL`, 'Drawer count can be off by'],
    [`${ROOT}.DRAWER.TOLERANCE_HINT`, 'Over or short, per closing count'],
    [`${ROOT}.DRAWER.ALLOWED`, 'Allowed'],
    [`${ROOT}.DRAWER.BADGE.BANK_DROP`, 'Always allowed · deposit bag number required'],
    [`${ROOT}.DRAWER.BADGE.FLOAT_CHANGE`, 'Always needs a manager'],
    [`${ROOT}.DRAWER.HOW.SUMMARY`, 'How are limits counted?'],
    [`${ROOT}.DRAWER.MEANS.HEADING`, 'What this means at the register'],
    [
      `${ROOT}.DRAWER.MEANS.PETTY_EXPENSE.ON`,
      'Petty expenses up to {{limit}} in one drawer session: the cashier records them; beyond that a manager approves at the register with their own sign-in.',
    ],
    [`${ROOT}.DRAWER.MEANS.DIFFERENT_PERSON`, 'The manager who approves must be a different person from the cashier.'],
    [`${ROOT}.CATEGORIES.TAX_INCLUDED`, 'Cashiers enter the receipt’s total, tax included.'],
    [
      `${ROOT}.CATEGORIES.READ_ONLY`,
      'Changes to categories are made by someone who manages your chart of accounts. Categories are turned off, never deleted, so old receipts keep their history.',
    ],
    [`${ROOT}.CATEGORIES.CREATE.CONSEQUENCE`, 'Cashiers can pick it at the register once it’s saved.'],
    [`${ROOT}.CATEGORIES.DEACTIVATE.CONSEQUENCE`, 'Cashiers stop seeing it at the register straight away; payouts already recorded keep it.'],
    [`${ROOT}.CATEGORIES.REMAP.CONSEQUENCE`, 'Payouts recorded from {{date}} go to {{account}}; earlier ones stay where they are.'],
    [`${ROOT}.CATEGORIES.FIELD.FROM`, 'Starting on'],
    [`${ROOT}.SAVE.CONSEQUENCE`, 'New limits apply from now on. Bills already approved and drawer payments already recorded don’t change.'],
    [
      `${ROOT}.SAVE.PARTIAL.DRAWER_FAILED`,
      'Bill limits were saved. Drawer cash limits weren’t saved: {{reason}} Your drawer changes are still here.',
    ],
    [`${ROOT}.HISTORY.SOURCE_FAILED.DRAWER`, 'Drawer cash changes couldn’t be loaded.'],
  ])('en-US %s reads as the story states', (key, text) => {
    expect(lookup(enUS as Bundle, key)).toBe(text);
  });
});
