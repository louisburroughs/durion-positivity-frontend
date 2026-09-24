import { projectFiles } from 'archunit';
import ts from 'typescript';
import { compare, formatFailure } from '../../support/baseline';
import { APP, FIXTURES, SPEC, selectors, type Project } from '../../support/projects';
import { contentRule, type ArchRule } from '../../support/rule';
import { listFiles } from '../../support/templates';
import { violationKey } from '../../support/violation-key';
import { lay02 } from '../layers.rules';
import { sdk04 } from '../transport.rules';

/** Files ArchUnitTS sees for a project (via `adhereTo`, which visits every node). */
async function archunitFiles(p: Project, subject: RegExp = /./): Promise<string[]> {
  const seen: string[] = [];
  await projectFiles(p.tsconfig)
    .inPath(subject)
    .should()
    .adhereTo((f) => {
      seen.push(f.path);
      return true;
    }, 'collect')
    .check({ allowEmptyTests: true });
  return [...new Set(seen)].sort();
}

/** Files the repo's own TypeScript (6.x) resolves for a tsconfig. */
function tsFiles(tsconfig: string): string[] {
  const cfg = ts.getParsedCommandLineOfConfigFile(tsconfig, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} })!;
  return cfg.fileNames.map((f) => f.replace(`${process.cwd()}/`, '')).sort();
}

describe('[harness] ArchUnitTS file set and selectors (plan §11.1, §11.3)', () => {
  it.each([APP, SPEC])('ArchUnitTS (nested TS 5.9) sees every file TS 6 resolves for $tsconfig', async (p) => {
    const expected = tsFiles(p.tsconfig).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
    const seen = new Set(await archunitFiles(p));
    const missing = expected.filter((f) => !seen.has(f));
    expect(missing, 'files TS 6 compiles but ArchUnitTS dropped').toEqual([]);
    expect(expected.length).toBeGreaterThan(100);
  });

  const fsCount = (dir: string, re: RegExp) =>
    listFiles(dir, '.ts').filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.endsWith('.d.ts') && re.test(f)).length;

  it.each([
    ['core', selectors.core(APP), 'src/app/core'],
    ['shared', selectors.shared(APP), 'src/app/shared'],
    ['features', selectors.features(APP), 'src/app/features'],
    ['ui', selectors.ui(APP), 'src/app'],
    ['pages', selectors.pages(APP), 'src/app'],
    ['services', selectors.services(APP), 'src/app'],
    ['models', selectors.models(APP), 'src/app'],
  ] as const)('selector %s matches the same files ArchUnitTS and the filesystem see', async (_n, re, glob) => {
    const viaArch = (await archunitFiles(APP, re)).filter((f) => f.endsWith('.ts')).length;
    expect(viaArch).toBeGreaterThan(0);
    expect(viaArch).toBe(fsCount(glob, re));
  });
});

describe('[harness] baseline ratchet (plan §3.3)', () => {
  const rule: ArchRule = { id: 'X-01', title: 't', mode: 'ratchet', keys: async () => [] };
  const base = [
    { key: 'a', reason: 'r' },
    { key: 'b', reason: 'r' },
  ];

  it('passes when current keys equal the baseline', () => {
    expect(compare(['a', 'b'], base)).toEqual({ added: [], stale: [], count: 2 });
  });
  it('reports new keys', () => {
    const o = compare(['a', 'b', 'c'], base);
    expect(o.added).toEqual(['c']);
    expect(formatFailure(rule, o)).toContain('+ c');
  });
  it('reports stale keys and says to delete them', () => {
    const o = compare(['a'], base);
    expect(o.stale).toEqual(['b']);
    expect(formatFailure(rule, o)).toMatch(/delete this entry[\s\S]*- b/);
  });
  it('treats a missing baseline as empty', () => {
    expect(compare(['a'], null).added).toEqual(['a']);
  });
});

/**
 * Regression guard for the `Project.root`/`onDisk` fix (`support/projects.ts`, `support/rule.ts`):
 * ArchUnitTS reports `FileInfo.path`/`FileInfo.content` relative to the tsconfig's own directory,
 * which for FIXTURES (`arch/fixtures/tsconfig.json`) isn't the repo root. Before the fix, every
 * FIXTURES selector silently matched zero files (`allowEmptyTests` swallowed it) and every
 * `contentRule` finder saw `content: ''`. Reuses real rule factories with real planted fixtures so a
 * regression here fails loudly instead of quietly matching nothing.
 */
describe('[harness] FIXTURES is visible through dependencyRule/contentRule (regression: Project.root, support/projects.ts)', () => {
  it('dependencyRule(FIXTURES) sees non-empty keys, including a planted violation', async () => {
    const keys = await lay02(FIXTURES).keys();
    expect(keys.length).toBeGreaterThan(0);
    expect(keys).toContain('src/app/shared/fxlay-shared-violate.ts -> src/app/features/fxlay-a/fxlay-a-target.ts');
  });

  it('contentRule(FIXTURES) sees non-empty keys, including a planted violation', async () => {
    const keys = await sdk04(FIXTURES).keys();
    expect(keys.length).toBeGreaterThan(0);
    expect(keys).toContain('src/app/features/fxlay-a/services/fxlay-sdk04-violate.service.ts :: fetch(');
  });

  it('contentRule(FIXTURES) hands every finder non-empty FileInfo content', async () => {
    const lengths: number[] = [];
    await contentRule({ id: 'X-HARNESS-CONTENT', title: 'collect content lengths', mode: 'enforce' }, FIXTURES, {
      subject: selectors.appTree(FIXTURES),
      finder: (f) => {
        lengths.push(f.content.length);
        return [];
      },
    }).keys();
    expect(lengths.length).toBeGreaterThan(0);
    expect(lengths.every((n) => n > 0)).toBe(true);
  });
});

describe('[harness] violation keys (plan §11.3.4, §11.3.6)', () => {
  it('drops self-edges', () => {
    expect(violationKey({ dependency: { sourceLabel: 'a.ts', targetLabel: 'a.ts' } })).toBeNull();
  });
  it('keys a dependency as source -> target', () => {
    expect(violationKey({ dependency: { sourceLabel: 'a.ts', targetLabel: 'b.ts' } })).toBe('a.ts -> b.ts');
  });
  it('keys a cycle by its sorted members, independent of start point', () => {
    const c1 = violationKey({ cycle: [{ sourceLabel: 'b', targetLabel: 'a' }, { sourceLabel: 'a', targetLabel: 'b' }] });
    const c2 = violationKey({ cycle: [{ sourceLabel: 'a', targetLabel: 'b' }, { sourceLabel: 'b', targetLabel: 'a' }] });
    expect(c1).toBe(c2);
  });
});
