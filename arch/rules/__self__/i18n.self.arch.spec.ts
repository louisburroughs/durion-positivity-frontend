import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FIXTURES } from '../../support/projects';
import type { Source } from '../../support/ast';
import { i18n01, i18n05, i18n06, i18n06Findings, i18n10, i18n10Findings, loadEnUsKeys, staticTranslateKeysInTs } from '../i18n.rules';

const read = (path: string): Source => ({ path, content: readFileSync(path, 'utf8') });

const TYPO_TS = 'arch/fixtures/src/app/core/fxi18n-typo.component.ts';
const FROZEN_TS = 'arch/fixtures/src/app/core/fxi18n-frozen.component.ts';

/**
 * Self-tests for the i18n suite (plan §6, §11.4). I18N-05's template half runs through the real
 * rule (`i18n05(FIXTURES)`), since `templateRule` reads `*.html` straight off disk. I18N-05's TS
 * half and I18N-06 are exercised two ways: directly, by calling the exported finder functions on a
 * `Source` built from a real file read (a focused unit test of the detection logic), and end to end,
 * by calling `i18n05(FIXTURES).keys()`/`i18n06(FIXTURES).keys()` — `contentRule` (`support/rule.ts`)
 * reads every file straight off disk, so both paths see the same fixtures.
 */
describe('[self] I18N-05 referenced keys exist in en-US.json', () => {
  it("catches a typo'd/missing key used as a literal `| translate` pipe in a template", async () => {
    const keys = await i18n05(FIXTURES).keys();
    expect(keys.some((k) => k.includes('fxi18n-typo.component.html') && k.includes('FXI18N.MISSING_KEY'))).toBe(true);
  });

  it('does not flag the compliant existing key in the template', async () => {
    const keys = await i18n05(FIXTURES).keys();
    expect(keys.some((k) => k.includes('FXI18N.EXISTING'))).toBe(false);
  });

  it('skips a dynamic (non-literal) `| translate` pipe key in the template', async () => {
    const keys = await i18n05(FIXTURES).keys();
    expect(keys.some((k) => k.includes('dynamicKey'))).toBe(false);
  });

  it("catches a typo'd/missing key set on a signal(...)-declared field in TS (e.g. errorKey.set(...))", () => {
    const keys = staticTranslateKeysInTs(read(TYPO_TS));
    expect(keys).toContain('FXI18N.MISSING_TS');
  });

  it('the missing TS key is genuinely absent from en-US.json (not a fixture mistake)', () => {
    const enUsKeys = loadEnUsKeys(FIXTURES);
    expect(enUsKeys.has('FXI18N.MISSING_TS')).toBe(false);
    expect(enUsKeys.has('FXI18N.EXISTING')).toBe(true);
  });

  it('end to end: i18n05(FIXTURES).keys() also catches the missing TS key', async () => {
    const keys = await i18n05(FIXTURES).keys();
    expect(keys.some((k) => k.includes('fxi18n-typo.component.ts') && k.includes('FXI18N.MISSING_TS'))).toBe(true);
  });
});

describe('[self] I18N-06 no translate.instant( ) in computed()/field initializer/effect()', () => {
  it('catches translate.instant( ) inside a computed() callback', () => {
    const findings = i18n06Findings(read(FROZEN_TS));
    expect(findings.some((f) => f.includes('computed()'))).toBe(true);
  });

  it('catches translate.instant( ) inside an effect() callback', () => {
    const findings = i18n06Findings(read(FROZEN_TS));
    expect(findings.some((f) => f.includes('effect()'))).toBe(true);
  });

  it('catches translate.instant( ) as a direct class field initializer', () => {
    const findings = i18n06Findings(read(FROZEN_TS));
    expect(findings.some((f) => f.includes('class field initializer'))).toBe(true);
  });

  it('does not flag translate.instant( ) called from a plain method body', () => {
    // The fixture has exactly 4 `translate.instant(...)` call sites: 3 violations (computed,
    // effect, field initializer) and 1 compliant one inside a plain method (`currentLabel()`). A
    // 4th finding would mean the compliant call site was (wrongly) also flagged.
    const findings = i18n06Findings(read(FROZEN_TS));
    expect(findings.length).toBe(3);
  });

  it('end to end: i18n06(FIXTURES).keys() also catches the frozen-instant fixture', async () => {
    const keys = await i18n06(FIXTURES).keys();
    expect(keys.some((k) => k.includes('fxi18n-frozen.component.ts'))).toBe(true);
  });
});

describe('[I18N-01] exact en-US key set', () => {
  const withLocales = async (locales: Record<string, unknown>): Promise<string[]> => {
    const dir = mkdtempSync(path.join(tmpdir(), 'i18n01-'));
    try {
      for (const [name, body] of Object.entries(locales)) writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(body));
      return await i18n01(dir).keys();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('flags a key a release locale has but en-US does not', async () => {
    const keys = await withLocales({ 'en-US': { A: { B: 'x' } }, 'fr-FR': { A: { B: 'y', C: 'z' } } });
    expect(keys.some((k) => k.includes('extra') && k.includes('A.C'))).toBe(true);
  });

  it('flags a key missing from a release locale', async () => {
    const keys = await withLocales({ 'en-US': { A: { B: 'x', C: 'w' } }, 'fr-FR': { A: { B: 'y' } } });
    expect(keys.some((k) => k.includes('missing') && k.includes('A.C'))).toBe(true);
  });

  it('passes identical key sets', async () => {
    expect(await withLocales({ 'en-US': { A: { B: 'x' } }, 'fr-FR': { A: { B: 'y' } } })).toEqual([]);
  });
});

describe('[self] I18N-10 money is formatted in the user locale', () => {
  const MONEY_TS = 'arch/fixtures/src/app/core/fxi18n-money.component.ts';

  it('catches CurrencyPipe and formatCurrency imported from @angular/common', () => {
    const findings = i18n10Findings(read(MONEY_TS));
    expect(findings).toContain('imports CurrencyPipe from @angular/common');
    expect(findings).toContain('imports formatCurrency from @angular/common');
  });

  it('catches a bare `| currency` in an inline template', () => {
    expect(i18n10Findings(read(MONEY_TS))).toContain('bare `| currency` pipe in an inline template');
  });

  it('catches a bare `| currency` in an external template, and only there', async () => {
    const keys = await i18n10(FIXTURES).keys();
    expect(keys).toContain('src/app/core/fxi18n-money.component.html :: bare `| currency` pipe');
    expect(keys.some((k) => k.includes('fxi18n-money-ok.component.html'))).toBe(false);
  });

  it('does not treat a logical OR with a `currency` field as the pipe', () => {
    const findings = i18n10Findings({ path: 'x.ts', content: "const t = '{{ total || currency }}';" });
    expect(findings).toEqual([]);
  });
});
