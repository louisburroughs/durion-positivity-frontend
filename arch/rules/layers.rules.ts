import path from 'node:path';
import { type Source, importSpecifiers } from '../support/ast';
import { type Project, featureDomains, selectors } from '../support/projects';
import { type ArchRule, type Finder, combine, contentRule, cycleRule, dependencyRule } from '../support/rule';

export const lay01 = (p: Project): ArchRule =>
  dependencyRule(
    { id: 'LAY-01', title: 'core/** must not depend on features/** (ADR-0010 §2)', mode: 'enforce' },
    p,
    { subject: selectors.core(p), target: selectors.features(p) },
  );

export const lay02 = (p: Project): ArchRule =>
  dependencyRule(
    { id: 'LAY-02', title: 'shared/** must not depend on features/** (ADR-0010)', mode: 'enforce' },
    p,
    { subject: selectors.shared(p), target: selectors.features(p) },
  );

/** A feature must not depend on another feature (ADR-0010 §3, 0036 §2): one dependencyRule per domain. */
export const lay03 = (p: Project): ArchRule =>
  combine(
    { id: 'LAY-03', title: 'A feature must not depend on another feature (ADR-0010 §3, 0036 §2)', mode: 'ratchet' },
    featureDomains(p).map((d) =>
      dependencyRule(
        { id: `LAY-03/${d}`, title: `feature '${d}' must not depend on another feature (ADR-0010 §3, 0036 §2)`, mode: 'ratchet' },
        p,
        {
          subject: selectors.feature(p, d),
          target: selectors.features(p),
          targetExcept: [selectors.feature(p, d)],
          allowEmpty: true,
        },
      ),
    ),
  );

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
    const ownDomain = ownFeatureDomain(p, f.path);
    if (!ownDomain) return [];
    const out: string[] = [];
    for (const spec of importSpecifiers(f)) {
      if (!spec.dynamic || !spec.module.startsWith('.')) continue;
      const resolved = resolveRelative(f.path, spec.module);
      const targetDomain = ownFeatureDomain(p, `${resolved}/`);
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
    { subject: selectors.features(p), finder: dynamicCrossFeatureImportFinder(p) },
  );

/** Any feature's `models/` folder, at any depth under `features/`. */
const featureModels = (rp: Project): RegExp => new RegExp(`${selectors.features(rp).source}[^/]+/models/`);

/** A feature must not import another feature's `models/` (ADR-0036 §2): the stricter subset of LAY-03. */
export const lay04 = (p: Project): ArchRule =>
  combine(
    { id: 'LAY-04', title: "A feature must not import another feature's models/ (ADR-0036 §2)", mode: 'ratchet' },
    featureDomains(p).map((d) => {
      const ownModels = new RegExp(`${selectors.feature(p, d).source}models/`);
      return dependencyRule(
        { id: `LAY-04/${d}`, title: `feature '${d}' must not import another feature's models/ (ADR-0036 §2)`, mode: 'ratchet' },
        p,
        {
          subject: selectors.feature(p, d),
          target: featureModels(p),
          targetExcept: [ownModels],
          allowEmpty: true,
        },
      );
    }),
  );

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

export const lay05 = (p: Project): ArchRule =>
  combine(
    {
      id: 'LAY-05',
      title: 'models/** must not depend on services/pages/components, nor import @angular/*/rxjs at runtime (ADR-0010 §5)',
      mode: 'enforce',
    },
    [
      dependencyRule(
        { id: 'LAY-05/dep', title: 'models/** must not depend on services/pages/components (ADR-0010 §5)', mode: 'enforce' },
        p,
        { subject: selectors.models(p), target: uiOrServices(p), allowTypeOnly: true },
      ),
      contentRule(
        { id: 'LAY-05/content', title: 'models/** must not import @angular/*/rxjs at runtime (ADR-0010 §5)', mode: 'enforce' },
        p,
        { subject: selectors.models(p), finder: noRuntimeAngularOrRxjs },
      ),
    ],
  );

export const lay06 = (p: Project): ArchRule =>
  dependencyRule(
    { id: 'LAY-06', title: 'services/** must not depend on pages/**/components/** (ADR-0010 §5)', mode: 'enforce' },
    p,
    { subject: selectors.services(p), target: selectors.ui(p) },
  );

export const lay07 = (p: Project): ArchRule =>
  cycleRule({ id: 'LAY-07', title: 'No import cycles within src/app/** (best practice)', mode: 'enforce' }, p, selectors.appTree(p));

/** Only core/**, app.config*.ts and main*.ts may import src/environments/** (ADR-0041 §3-4). */
export const lay08 = (p: Project): ArchRule =>
  dependencyRule(
    { id: 'LAY-08', title: 'Only core/**, app.config*.ts and main*.ts may import src/environments/** (ADR-0041 §3-4)', mode: 'ratchet' },
    p,
    {
      subject: selectors.appTree(p),
      subjectExcept: [selectors.core(p), new RegExp(`^${p.app}/app\\.config`)],
      target: selectors.environments(p),
    },
  );
