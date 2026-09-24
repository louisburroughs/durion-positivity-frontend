import { globSync } from 'node:fs';
import { projectFiles } from 'archunit';
import ts from 'typescript';
import { compare, formatFailure } from '../../support/baseline';
import { APP, SPEC, selectors, type Project } from '../../support/projects';
import type { ArchRule } from '../../support/rule';
import { violationKey } from '../../support/violation-key';

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

  const fsCount = (glob: string, re: RegExp) =>
    globSync(glob).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.endsWith('.d.ts') && re.test(f)).length;

  it.each([
    ['core', selectors.core(APP), 'src/app/core/**'],
    ['shared', selectors.shared(APP), 'src/app/shared/**'],
    ['features', selectors.features(APP), 'src/app/features/**'],
    ['ui', selectors.ui(APP), 'src/app/**'],
    ['pages', selectors.pages(APP), 'src/app/**'],
    ['services', selectors.services(APP), 'src/app/**'],
    ['models', selectors.models(APP), 'src/app/**'],
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
