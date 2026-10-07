/**
 * Accounting home copy guard — asserts the SENTENCES, not the keys
 * (ADR-0035 §8). The component specs run with `TranslateModule.forRoot()`
 * and no loader, so `| translate` echoes the key; this file loads the real
 * `src/assets/i18n/*.json` bundles and checks what the copy claims, that every
 * key the home builds at runtime exists in all six locales with the same
 * placeholders, and Label in Name for the "What's this?" pattern per locale.
 */
import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import esMX from '../../../../../assets/i18n/es-MX.json';
import esUS from '../../../../../assets/i18n/es-US.json';
import frCA from '../../../../../assets/i18n/fr-CA.json';
import frFR from '../../../../../assets/i18n/fr-FR.json';
import qpsPloc from '../../../../../assets/i18n/qps-ploc.json';
import { HelpDisclosureComponent } from '../../components/help-disclosure/help-disclosure.component';
import { paymentMethodKey, paymentReasonKey } from '../../utils/payment-match';
import { ACCOUNTING_SUBNAV } from '../../accounting-subnav';
import { GLOSSARY_WORDS } from './accounting-home-page.component';

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
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

function en(key: string): string {
  const value = lookup(enUS, key);
  if (value === undefined) throw new Error(`en-US.json has no string at ${key}`);
  return value;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map(match => match[1]).sort();
}

function keysUnder(bundle: unknown, prefix: string): string[] {
  const out: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'string') {
      out.push(path);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) walk(child, `${path}.${key}`);
  };
  let root: unknown = bundle;
  for (const segment of prefix.split('.')) root = (root as Record<string, unknown>)?.[segment];
  walk(root, prefix);
  return out.sort();
}

const ROOTS = ['ACCOUNTING.SHELL', 'ACCOUNTING.HOME', 'ACCOUNTING.HELP'];

/** Keys the home builds at runtime rather than writing literally in a template. */
const RUNTIME_KEYS: readonly string[] = [
  ...ACCOUNTING_SUBNAV.flatMap(entry => [entry.labelKey, ...(entry.termKey ? [entry.termKey] : [])]),
  ...GLOSSARY_WORDS.flatMap(word => ['WORD', 'TERM', 'MEANING'].map(part => `ACCOUNTING.HELP.GLOSSARY.${word}.${part}`)),
  ...['REMITTANCE_REFERENCE', 'SAME_CUSTOMER', 'EXACT_TOTAL', 'SOMETHING_NEW'].map(paymentReasonKey),
  ...(['CASH', 'CARD', 'ON_ACCOUNT', 'OTHER', 'WIRE'].map(paymentMethodKey) as string[]),
];

describe('Accounting home copy (real bundles)', () => {
  it.each(LOCALES)('%s carries every ACCOUNTING.SHELL/HOME/HELP key with en-US placeholders', (_name, bundle) => {
    for (const root of ROOTS) {
      const expected = keysUnder(enUS, root);
      expect(expected.length).toBeGreaterThan(0);
      expect(keysUnder(bundle, root)).toEqual(expected);
      for (const key of expected) {
        const value = lookup(bundle, key);
        expect(value?.trim(), `${key} is empty`).toBeTruthy();
        expect(placeholders(value!), key).toEqual(placeholders(en(key)));
      }
    }
  });

  it.each(LOCALES)('%s resolves every key the home builds at runtime', (_name, bundle) => {
    for (const key of RUNTIME_KEYS) expect(lookup(bundle, key), key).toBeDefined();
  });

  it('says the to-do empty state the way §5.6 words it', () => {
    expect(en('ACCOUNTING.HOME.TODO.EMPTY')).toBe("You're all caught up");
  });

  it('names a submitted check-up by what it waits for, and an unknown status as Unknown', () => {
    expect(en('ACCOUNTING.HOME.LANES.BANK.STATUS.SUBMITTED')).toBe('Waiting for a second person to approve');
    expect(en('ACCOUNTING.HOME.LANES.BANK.STATUS.IN_PROGRESS')).toBe('In progress');
    expect(en('ACCOUNTING.HOME.LANES.BANK.STATUS.FINALIZED')).toBe('Done');
    expect(en('ACCOUNTING.HOME.LANES.BANK.STATUS.NOT_STARTED')).toBe('Not started');
    expect(en('ACCOUNTING.HOME.LANES.BANK.STATUS.UNKNOWN')).toBe('Unknown');
  });

  it('labels unapproved bills for every cause that reaches the figure (ADR-0064 §4)', () => {
    // The served unapproved total holds bills awaiting approval AND bills still being checked.
    expect(en('ACCOUNTING.HOME.LANES.PAYABLES.UNAPPROVED')).toBe('Waiting for approval or still being checked');
  });

  it('puts the consequence before Approve month (P4) with the account named', () => {
    expect(en('ACCOUNTING.HOME.TODO.APPROVAL.CONSEQUENCE')).toBe(
      "Approving finishes this month's bank check-up for {{account}}. If an entry in this month changes later, it must be approved again.",
    );
  });

  it('blames the preparer rule, not a permission, on a self-approval refusal (P5)', () => {
    expect(en('ACCOUNTING.HOME.TODO.APPROVAL.ERROR.SELF_APPROVAL')).toBe("You can't approve a check-up you prepared.");
    expect(en('ACCOUNTING.HOME.TODO.APPROVAL.ERROR.SELF_APPROVAL').toLowerCase()).not.toContain('permission');
    expect(en('ACCOUNTING.HOME.TODO.APPROVAL.ERROR.FORBIDDEN')).toContain('{{permission}}');
  });

  it('keeps plain words first and the accountant’s term in the glossary (P1)', () => {
    expect(en('ACCOUNTING.HELP.GLOSSARY.BANK_CHECKUP.WORD')).toBe('Bank check-up');
    expect(en('ACCOUNTING.HELP.GLOSSARY.BANK_CHECKUP.TERM')).toBe('bank reconciliation');
    expect(en('ACCOUNTING.SHELL.NAV.BANK_TERM')).toBe('bank reconciliation');
    expect(en('ACCOUNTING.SHELL.SHOW_TERMS')).toBe('Show accounting terms');
  });

  it('offers only phase-1 Start here habits whose targets exist (S20 adds the cash habit)', () => {
    const habits = keysUnder(enUS, 'ACCOUNTING.HOME.START_HERE').filter(key => key.includes('HABIT_'));
    expect(habits).toEqual(['ACCOUNTING.HOME.START_HERE.HABIT_BANK', 'ACCOUNTING.HOME.START_HERE.HABIT_TODO']);
  });
});

describe('Label in Name per shipped locale (ADR-0029 §8.6)', () => {
  it.each(LOCALES)('%s: the "What\'s this?" summary’s accessible name starts with its visible label', (name, bundle) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [HelpDisclosureComponent, TranslateModule.forRoot()] });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation(name, bundle as TranslationObject);
    translate.use(name);

    const fixture = TestBed.createComponent(HelpDisclosureComponent);
    fixture.componentRef.setInput('textKey', 'ACCOUNTING.HELP.RECEIVABLES.TEXT');
    fixture.componentRef.setInput('contextKey', 'ACCOUNTING.HOME.LANES.RECEIVABLES.TITLE');
    fixture.detectChanges();

    const summary = (fixture.nativeElement as HTMLElement).querySelector('summary')!;
    const visible = lookup(bundle, 'ACCOUNTING.HELP.WHATS_THIS')!;
    const accessibleName = Array.from(summary.children)
      .filter(child => child.getAttribute('aria-hidden') !== 'true')
      .map(child => child.textContent?.trim())
      .join(' ');
    expect(accessibleName.startsWith(visible)).toBe(true);
    expect(accessibleName).toContain(lookup(bundle, 'ACCOUNTING.HOME.LANES.RECEIVABLES.TITLE')!);
  });
});
