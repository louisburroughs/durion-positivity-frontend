import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type Source, importSpecifiers } from '../support/ast';
import { type Project, featureDomains, selectors } from '../support/projects';
import { type ArchRule, type Finder, combine, contentRule, cycleRule, dependencyRule } from '../support/rule';

/**
 * ArchUnitTS reports `FileInfo.path` relative to the *directory containing the tsconfig*, not the
 * repo root (confirmed by probing `projectFiles()` directly against `arch/fixtures/tsconfig.json`:
 * it returns paths like `src/app/...`, never `arch/fixtures/src/app/...`). `support/projects.ts`'s
 * `Project.app`/`Project.src` are repo-relative, so every `selectors.*`/`file`/`under` call built
 * straight from `p.app` silently matches zero files for any tsconfig that isn't at the repo root —
 * i.e. it works for APP/SPEC (tsconfig at repo root, so the two conventions coincide) and is broken
 * for FIXTURES. This is a `support/projects.ts` defect (see this suite's final report); worked
 * around here, without touching `support/*`, by re-deriving `app`/`src` relative to the tsconfig's
 * own directory before handing the project to a selector. `featureDomains()` still gets the
 * original, repo-relative `Project`, since it reads the filesystem relative to the repo root.
 */
export function regexProject(p: Project): Project {
  const base = path.posix.dirname(p.tsconfig);
  const rel = (abs: string): string => {
    const r = path.posix.relative(base, abs);
    return r === '' ? '.' : r;
  };
  return { tsconfig: p.tsconfig, app: rel(p.app), src: rel(p.src) };
}

/**
 * ArchUnitTS's lazily-loaded `FileInfo.content` comes back `""` for any tsconfig that isn't at the
 * repo root (confirmed by the same probe: every `FileInfo.content` under `.adhereTo()` is empty for
 * `arch/fixtures/tsconfig.json`). It appears to read the file relative to the process cwd using the
 * `path` it already reports (tsconfig-dir-relative), which only coincides with the real file
 * location when the tsconfig sits at the repo root — true for APP/SPEC, false for FIXTURES.
 * `support/rule.ts`'s `contentRule` hands a finder whatever `FileInfo` it received, so every content
 * finder in this suite reads the file itself instead of trusting `f.content`, resolving `f.path`
 * against the directory containing `p.tsconfig`. A no-op for APP/SPEC; load-bearing for FIXTURES.
 */
export function withDiskContent(p: Project, finder: Finder): Finder {
  return (f) => finder({ path: f.path, content: readFileSync(path.posix.join(path.posix.dirname(p.tsconfig), f.path), 'utf8') });
}

export const lay01 = (p: Project): ArchRule =>
  dependencyRule(
    { id: 'LAY-01', title: 'core/** must not depend on features/** (ADR-0010 §2)', mode: 'enforce' },
    p,
    { subject: selectors.core(regexProject(p)), target: selectors.features(regexProject(p)) },
  );

export const lay02 = (p: Project): ArchRule =>
  dependencyRule(
    { id: 'LAY-02', title: 'shared/** must not depend on features/** (ADR-0010)', mode: 'enforce' },
    p,
    { subject: selectors.shared(regexProject(p)), target: selectors.features(regexProject(p)) },
  );

/** A feature must not depend on another feature (ADR-0010 §3, 0036 §2): one dependencyRule per domain. */
export const lay03 = (p: Project): ArchRule => {
  const rp = regexProject(p);
  return combine(
    { id: 'LAY-03', title: 'A feature must not depend on another feature (ADR-0010 §3, 0036 §2)', mode: 'ratchet' },
    featureDomains(p).map((d) =>
      dependencyRule(
        { id: `LAY-03/${d}`, title: `feature '${d}' must not depend on another feature (ADR-0010 §3, 0036 §2)`, mode: 'ratchet' },
        p,
        {
          subject: selectors.feature(rp, d),
          target: selectors.features(rp),
          targetExcept: [selectors.feature(rp, d)],
          allowEmpty: true,
        },
      ),
    ),
  );
};

/** Resolve a relative module specifier from `filePath`'s directory to a repo-relative path (posix). */
function resolveRelative(filePath: string, specifier: string): string {
  return path.posix.normalize(path.posix.join(path.posix.dirname(filePath), specifier));
}

/** The `features/<domain>` segment of a `rp.app`-relative path under `features/`, or undefined. */
function ownFeatureDomain(rp: Project, relPath: string): string | undefined {
  return new RegExp(`^${rp.app}/features/([^/]+)/`).exec(relPath)?.[1];
}

/**
 * LAY-03 supplement (plan §11.3.3): dynamic `import('…')` edges aren't in the ArchUnitTS graph, so a
 * feature could lazy-load another feature without LAY-03 ever seeing the edge. Resolves relative
 * dynamic-import specifiers to repo paths and flags any that land under a different feature domain.
 */
const dynamicCrossFeatureImportFinder =
  (p: Project): Finder =>
  (f: Source) => {
    const rp = regexProject(p);
    const ownDomain = ownFeatureDomain(rp, f.path);
    if (!ownDomain) return [];
    const out: string[] = [];
    for (const spec of importSpecifiers(f)) {
      if (!spec.dynamic || !spec.module.startsWith('.')) continue;
      const resolved = resolveRelative(f.path, spec.module);
      const targetDomain = ownFeatureDomain(rp, `${resolved}/`);
      if (targetDomain && targetDomain !== ownDomain) out.push(`import('${spec.module}')`);
    }
    return out;
  };

export const lay03d = (p: Project): ArchRule =>
  contentRule(
    {
      id: 'LAY-03d',
      title: 'A feature must not dynamically import() another feature (ADR-0010 §3, 0036 §2; plan §11.3.3)',
      mode: 'enforce',
    },
    p,
    { subject: selectors.features(regexProject(p)), finder: withDiskContent(p, dynamicCrossFeatureImportFinder(p)) },
  );

/** Any feature's `models/` folder, at any depth under `features/`. */
const featureModels = (rp: Project): RegExp => new RegExp(`${selectors.features(rp).source}[^/]+/models/`);

/** A feature must not import another feature's `models/` (ADR-0036 §2): the stricter subset of LAY-03. */
export const lay04 = (p: Project): ArchRule => {
  const rp = regexProject(p);
  return combine(
    { id: 'LAY-04', title: "A feature must not import another feature's models/ (ADR-0036 §2)", mode: 'ratchet' },
    featureDomains(p).map((d) => {
      const ownModels = new RegExp(`${selectors.feature(rp, d).source}models/`);
      return dependencyRule(
        { id: `LAY-04/${d}`, title: `feature '${d}' must not import another feature's models/ (ADR-0036 §2)`, mode: 'ratchet' },
        p,
        {
          subject: selectors.feature(rp, d),
          target: featureModels(rp),
          targetExcept: [ownModels],
          allowEmpty: true,
        },
      );
    }),
  );
};

/** Union of the services/pages/components selectors, for a single dependencyRule target. */
const uiOrServices = (rp: Project): RegExp => new RegExp(`(?:${selectors.services(rp).source})|(?:${selectors.ui(rp).source})`);

/** `models/**` must not import `@angular/*`/`rxjs` at runtime; type-only imports are fine. */
const noRuntimeAngularOrRxjs: Finder = (f) => {
  const out: string[] = [];
  for (const spec of importSpecifiers(f)) {
    if (spec.dynamic) continue;
    if (spec.module !== 'rxjs' && !spec.module.startsWith('@angular/')) continue;
    if (spec.typeOnly) continue;
    if (spec.names.length === 0) {
      out.push(`'${spec.module}'`); // default/namespace/side-effect import: always runtime
      continue;
    }
    if (spec.names.some((n) => !n.typeOnly)) out.push(`'${spec.module}'`);
  }
  return out;
};

export const lay05 = (p: Project): ArchRule => {
  const rp = regexProject(p);
  return combine(
    {
      id: 'LAY-05',
      title: 'models/** must not depend on services/pages/components, nor import @angular/*/rxjs at runtime (ADR-0010 §5)',
      mode: 'enforce',
    },
    [
      dependencyRule(
        { id: 'LAY-05/dep', title: 'models/** must not depend on services/pages/components (ADR-0010 §5)', mode: 'enforce' },
        p,
        { subject: selectors.models(rp), target: uiOrServices(rp), allowTypeOnly: true },
      ),
      contentRule(
        { id: 'LAY-05/content', title: 'models/** must not import @angular/*/rxjs at runtime (ADR-0010 §5)', mode: 'enforce' },
        p,
        { subject: selectors.models(rp), finder: withDiskContent(p, noRuntimeAngularOrRxjs) },
      ),
    ],
  );
};

export const lay06 = (p: Project): ArchRule =>
  dependencyRule(
    { id: 'LAY-06', title: 'services/** must not depend on pages/**/components/** (ADR-0010 §5)', mode: 'enforce' },
    p,
    { subject: selectors.services(regexProject(p)), target: selectors.ui(regexProject(p)) },
  );

export const lay07 = (p: Project): ArchRule =>
  cycleRule(
    { id: 'LAY-07', title: 'No import cycles within src/app/** (best practice)', mode: 'enforce' },
    p,
    selectors.appTree(regexProject(p)),
  );

/** Only core/**, app.config*.ts and main*.ts may import src/environments/** (ADR-0041 §3-4). */
export const lay08 = (p: Project): ArchRule => {
  const rp = regexProject(p);
  return dependencyRule(
    { id: 'LAY-08', title: 'Only core/**, app.config*.ts and main*.ts may import src/environments/** (ADR-0041 §3-4)', mode: 'ratchet' },
    p,
    {
      subject: selectors.appTree(rp),
      subjectExcept: [selectors.core(rp), new RegExp(`^${rp.app}/app\\.config`)],
      target: selectors.environments(rp),
    },
  );
};
