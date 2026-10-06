/**
 * Your books copy guard — asserts the SENTENCES, not the keys (ADR-0035 §8).
 * The component specs run with `TranslateModule.forRoot()` and no loader, so
 * `| translate` echoes the key; this file loads the real
 * `src/assets/i18n/*.json` bundles and checks what the copy claims, that every
 * key the pages build at runtime exists in all six locales with the same
 * placeholders, and Label in Name per locale for the controls with visible text.
 */
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService, TranslationObject } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import esMX from '../../../../../assets/i18n/es-MX.json';
import esUS from '../../../../../assets/i18n/es-US.json';
import frCA from '../../../../../assets/i18n/fr-CA.json';
import frFR from '../../../../../assets/i18n/fr-FR.json';
import qpsPloc from '../../../../../assets/i18n/qps-ploc.json';
import { EXPORT_FORMATS, EXPORT_REPORT_TYPES } from '../../models/books.models';
import {
  OTHER_LINE_KEY,
  SOURCE_TYPES,
  STATEMENT_LINES,
  entryStatusKey,
  sourceTypeKey,
} from '../../utils/books-display';
import { BooksPageComponent, EXPORT_FORMAT_KEYS, EXPORT_REPORT_KEYS, TAB_KEYS } from './books-page.component';
import { configureBooks, createBooksMocks } from './books-page.spec-helper';

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

/** Keys the pages build at runtime rather than writing literally in a template. */
const RUNTIME_KEYS: readonly string[] = [
  ...Object.values(STATEMENT_LINES).map(line => line.key),
  OTHER_LINE_KEY,
  ...[...SOURCE_TYPES, 'SOMETHING_NEW'].map(sourceTypeKey),
  ...(['DRAFT', 'PENDING', 'POSTED', 'REVERSED', 'UNKNOWN'] as const).flatMap(status => [
    entryStatusKey({ status, reversalJournalEntryId: null }),
    entryStatusKey({ status, reversalJournalEntryId: 'je-1' }),
  ]),
  ...Object.values(TAB_KEYS).flatMap(tab => [tab.label, tab.term]),
  ...EXPORT_REPORT_TYPES.map(type => EXPORT_REPORT_KEYS[type]),
  ...EXPORT_FORMATS.map(format => EXPORT_FORMAT_KEYS[format]),
  'ACCOUNTING.SHELL.NAV.BOOKS',
  'ACCOUNTING.SHELL.NAV.BOOKS_TERM',
  'ACCOUNTING.HOME.ACTION.WHO_OWES_WHAT',
  'SITEMAP.LABEL.BOOKS',
  'SITEMAP.LABEL.ENTRIES',
];

describe('Your books copy (real bundles)', () => {
  it.each(LOCALES)('%s carries every ACCOUNTING.BOOKS key with en-US placeholders', (_name, bundle) => {
    const expected = keysUnder(enUS, 'ACCOUNTING.BOOKS');
    expect(expected.length).toBeGreaterThan(100);
    expect(keysUnder(bundle, 'ACCOUNTING.BOOKS')).toEqual(expected);
    for (const key of expected) {
      const value = lookup(bundle, key);
      expect(value?.trim(), `${key} is empty`).toBeTruthy();
      expect(placeholders(value!), key).toEqual(placeholders(en(key)));
    }
  });

  it.each(LOCALES)('%s resolves every key the pages build at runtime', (_name, bundle) => {
    for (const key of RUNTIME_KEYS) expect(lookup(bundle, key), key).toBeDefined();
  });

  it('words the Summary states the way the story does (Spec discrepancy 1, PROPOSED 4)', () => {
    expect(en('ACCOUNTING.BOOKS.SUMMARY.NOT_SET_UP')).toMatch(/^Your summary isn't set up yet/);
    expect(en('ACCOUNTING.BOOKS.SUMMARY.UNBALANCED')).toBe("Your books don't balance — tell your accountant.");
    expect(en('ACCOUNTING.BOOKS.SUMMARY.PROFIT_SO_FAR')).toBe('Profit so far');
    expect(en('ACCOUNTING.BOOKS.SUMMARY.OWN')).toBe('What you own');
    expect(en('ACCOUNTING.BOOKS.SUMMARY.OWE')).toBe('What you owe');
    expect(en('ACCOUNTING.BOOKS.SUMMARY.YOURS')).toBe("What's yours");
    expect(en('ACCOUNTING.BOOKS.SUMMARY.LINE.IN_THE_BANK')).toBe('In the bank');
    expect(en('ACCOUNTING.BOOKS.SUMMARY.LINE.KEPT_IN_DRAWERS')).toBe('Kept in drawers for change');
    expect(en('ACCOUNTING.BOOKS.SUMMARY.LINE.SALES_TAX_COLLECTED')).toBe('Sales tax collected, not yet paid');
    expect(en(OTHER_LINE_KEY)).toBe('Other');
  });

  it('keeps the locked-entries sentence, the help questions and the reverse consequence verbatim', () => {
    expect(en('ACCOUNTING.BOOKS.LEDGER.LOCKED')).toBe(
      'Entries are locked once recorded; a mistake is fixed with a correcting entry.',
    );
    expect(en('ACCOUNTING.BOOKS.LEDGER.WHY_UP_DOWN')).toBe("Why 'went up' and 'went down'?");
    expect(en('ACCOUNTING.BOOKS.ENTRIES.STATUS_HELP')).toBe('What do Correction and Reversed mean?');
    expect(en('ACCOUNTING.BOOKS.HOW_TO_READ.SUMMARY')).toBe('New to this? How to read your books in one minute');
    expect(en('ACCOUNTING.BOOKS.ENTRY.REVERSE.CONSEQUENCE')).toBe(
      "This records a new entry that undoes {{entry}} and marks it Reversed. It can't be undone.",
    );
    expect(en('ACCOUNTING.BOOKS.ENTRY.REVERSE.OVERRIDE_LABEL')).toBe('Why record this in a closed month?');
    expect(en('ACCOUNTING.BOOKS.ENTRY.NOT_FOUND')).toBe("We couldn't find this entry.");
    expect(en('ACCOUNTING.BOOKS.ENTRIES.SEARCH_HINT')).toContain('JE-202610-131');
  });

  it('labels the entry statuses and the aging columns as the story does', () => {
    expect(en('ACCOUNTING.BOOKS.STATUS.RECORDED')).toBe('Recorded');
    expect(en('ACCOUNTING.BOOKS.STATUS.CORRECTION')).toBe('Correction');
    expect(en('ACCOUNTING.BOOKS.STATUS.REVERSED')).toBe('Reversed');
    expect(en('ACCOUNTING.BOOKS.STATUS.NOT_RECORDED')).toBe('Not recorded yet');
    expect(en('ACCOUNTING.BOOKS.STATUS.UNKNOWN')).toBe('Unknown');
    expect(en('ACCOUNTING.BOOKS.CORRECTION_DESCRIPTION')).toBe('Correction of an earlier entry');
    expect(en('ACCOUNTING.BOOKS.NAME_NOT_AVAILABLE')).toBe('Name not available');
    expect(
      ['NOT_YET_DUE', 'DAYS_1_30', 'DAYS_31_60', 'DAYS_61_90', 'DAYS_90_PLUS', 'TOTAL'].map(key =>
        en(`ACCOUNTING.BOOKS.OWED.${key}`),
      ),
    ).toEqual(['Not yet due', '1–30 days late', '31–60', '61–90', 'More than 90', 'Total']);
  });

  it('names a refusal by its permission, never as a connection problem (ADR-0064 §6)', () => {
    expect(en('ACCOUNTING.BOOKS.REGION.DENIED')).toContain('{{permission}}');
    expect(en('ACCOUNTING.BOOKS.ENTRY.REVERSE.ERROR.FORBIDDEN')).toContain('{{permission}}');
    expect(en('ACCOUNTING.BOOKS.ENTRY.REVERSE.ERROR.PERIOD_CLOSED')).toContain('{{permission}}');
    expect(en('ACCOUNTING.BOOKS.ERROR.LOAD').toLowerCase()).not.toContain('permission');
  });

  it('keeps plain words first and the accountant’s term as the suffix (P1)', () => {
    expect(en('ACCOUNTING.SHELL.NAV.BOOKS')).toBe('Your books');
    expect(en('ACCOUNTING.BOOKS.TABS.SUMMARY_TERM')).toBe('balance sheet');
    expect(en('ACCOUNTING.BOOKS.TABS.OWED_TERM')).toBe('aged receivables and payables');
    expect(en('ACCOUNTING.BOOKS.TABS.ENTRIES_TERM')).toBe('general ledger');
  });
});

describe('Label in Name per shipped locale (ADR-0029 §8.6)', () => {
  it.each(LOCALES)('%s: every tab and the export button are named by their visible text', async (name, bundle) => {
    TestBed.resetTestingModule();
    configureBooks(createBooksMocks(), { tenantId: signal<string | null>(null) });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation(name, bundle as TranslationObject);
    translate.use(name);
    const fixture = TestBed.createComponent(BooksPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('.books__tab'));
    expect(tabs.map(tab => tab.textContent?.trim())).toEqual(
      Object.values(TAB_KEYS).map(tab => lookup(bundle, tab.label)),
    );
    for (const tab of tabs) expect(tab.hasAttribute('aria-label')).toBe(false);
    const exportButton = root.querySelector<HTMLButtonElement>('[data-testid="export-open"]')!;
    expect(exportButton.textContent?.trim()).toBe(lookup(bundle, 'ACCOUNTING.BOOKS.EXPORT.OPEN'));
    expect(root.querySelector('label[for="books-period"]')?.textContent?.trim()).toBe(
      lookup(bundle, 'ACCOUNTING.BOOKS.PERIOD.LABEL'),
    );
  });
});
