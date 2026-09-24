import { readFileSync } from 'node:fs';
import { FIXTURES } from '../../support/projects';
import type { Source } from '../../support/ast';
import { i18n05, i18n06Findings, loadEnUsKeys, staticTranslateKeysInTs } from '../i18n.rules';

const read = (path: string): Source => ({ path, content: readFileSync(path, 'utf8') });

const TYPO_TS = 'arch/fixtures/src/app/core/fxi18n-typo.component.ts';
const FROZEN_TS = 'arch/fixtures/src/app/core/fxi18n-frozen.component.ts';

/**
 * Self-tests for the i18n suite (plan §6, §11.4). I18N-05's template half runs through the real
 * rule (`i18n05(FIXTURES)`), since `templateRule` reads `*.html` straight off disk. Its TS half and
 * I18N-06 call the exported finder functions directly on a `Source` built from a real file read:
 * ArchUnitTS's `adhereTo` (which the TS-side `contentRule` goes through in production) only
 * materializes `FileInfo.content` for files it has a reason to open while building its dependency
 * graph, and these standalone fixture files have no import edges into the fixture program — see
 * `i18n06Findings`'s doc comment in `../i18n.rules.ts`. Calling the finder directly still exercises
 * the exact detection logic the production rule runs; it only bypasses ArchUnitTS's file-loading.
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
});
