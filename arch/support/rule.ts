import { readFileSync } from 'node:fs';
import { projectFiles } from 'archunit';
import type { Source } from './ast';
import { onDisk, type Project } from './projects';
import { templateFiles } from './templates';
import { isTypeOnlyDependency, violationKey } from './violation-key';

/**
 * Rule model (plan §4). Every rule is built by a factory taking a `Project`, so the same definition
 * runs against `src` and against the fixture project (plan §6).
 *
 * - enforce: zero violations today, must stay zero.
 * - ratchet: baselined in `arch/baselines/<ID>.json`, shrink-only.
 * - warn:    prints, never fails.
 */
export type Mode = 'enforce' | 'ratchet' | 'warn';

export interface ArchRule {
  readonly id: string;
  /** Rule text plus ADR reference, e.g. `pages must not depend on ApiBaseService (ADR-0041 §2)`. */
  readonly title: string;
  readonly mode: Mode;
  /** Stable, sorted, de-duplicated violation keys. */
  keys(): Promise<string[]>;
}

/** A content finder returns one short, line-number-free finding per violation in a file. */
export type Finder = (f: Source) => string[];

const uniqSorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();

export interface DependencySpec {
  subject: RegExp;
  /** Subject files excluded from the rule. */
  subjectExcept?: RegExp[];
  target: RegExp;
  /** Target files excluded from the rule (e.g. the subject's own feature). */
  targetExcept?: RegExp[];
  /** Ignore dependencies whose every edge is `import type`. */
  allowTypeOnly?: boolean;
  /** Per-domain loops set this: a domain without the subject folder is not a failure. */
  allowEmpty?: boolean;
}

/** `subject` files must not depend on `target` files (ArchUnitTS dependency graph). */
export function dependencyRule(
  meta: { id: string; title: string; mode: Mode },
  p: Project,
  spec: DependencySpec,
): ArchRule {
  return {
    ...meta,
    async keys() {
      const subj = projectFiles(p.tsconfig).inPath(
        spec.subject,
        spec.subjectExcept?.length ? { except: { inPath: spec.subjectExcept } } : undefined,
      );
      const violations = await subj
        .shouldNot()
        .dependOnFiles()
        .inPath(spec.target, spec.targetExcept?.length ? { except: { inPath: spec.targetExcept } } : undefined)
        .check({ allowEmptyTests: spec.allowEmpty });
      return uniqSorted(
        violations
          .filter((v) => !(spec.allowTypeOnly && isTypeOnlyDependency(v)))
          .map(violationKey)
          .filter((k): k is string => k !== null),
      );
    },
  };
}

/** No import cycles among `subject` files. */
export function cycleRule(meta: { id: string; title: string; mode: Mode }, p: Project, subject: RegExp): ArchRule {
  return {
    ...meta,
    async keys() {
      const v = await projectFiles(p.tsconfig).inPath(subject).should().haveNoCycles().check();
      return uniqSorted(v.map(violationKey).filter((k): k is string => k !== null));
    },
  };
}

export interface ContentSpec {
  subject: RegExp;
  /** Files exempt from the rule (allowlist). */
  except?: RegExp[];
  finder: Finder;
}

/**
 * Content rule: ArchUnitTS supplies the file set and `FileInfo` (`adhereTo`); the finder does the
 * AST work. Keys are `path :: finding`.
 *
 * `FileInfo.content` is lazily materialized by ArchUnitTS only for files it has a reason to open
 * while building its dependency graph, so a standalone file with no import edges can come back
 * `""` — and, for any `p.tsconfig` that isn't at the repo root (FIXTURES), it comes back `""` for
 * every file, since ArchUnitTS resolves it against the tsconfig's own directory (`p.root`), which
 * only matches the real file location when `p.root` is `.` (see `support/projects.ts`). Either way
 * the fix is the same: read the file straight off disk via `onDisk`.
 */
export function contentRule(meta: { id: string; title: string; mode: Mode }, p: Project, spec: ContentSpec): ArchRule {
  return {
    ...meta,
    async keys() {
      const found = new Map<string, string[]>();
      const except = spec.except ?? [];
      await projectFiles(p.tsconfig)
        .inPath(spec.subject)
        .should()
        .adhereTo((f) => {
          if (except.some((r) => r.test(f.path))) return true;
          const content = p.root !== '.' || !f.content ? readFileSync(onDisk(p, f.path), 'utf8') : f.content;
          const r = spec.finder({ path: f.path, content });
          if (r.length) found.set(f.path, r);
          return r.length === 0;
        }, `${meta.id} ${meta.title}`)
        .check({ allowEmptyTests: true });
      return uniqSorted([...found].flatMap(([path, fs]) => fs.map((x) => `${path} :: ${x}`)));
    },
  };
}

/** Suite-hosted rule over `*.html` templates (plan §3.4). Keys are `path :: finding`. */
export function templateRule(
  meta: { id: string; title: string; mode: Mode },
  p: Project,
  spec: { except?: RegExp[]; finder: Finder },
): ArchRule {
  return {
    ...meta,
    async keys() {
      const except = spec.except ?? [];
      return uniqSorted(
        templateFiles(p)
          .filter((f) => !except.some((r) => r.test(f.path)))
          .flatMap((f) => spec.finder(f).map((x) => `${f.path} :: ${x}`)),
      );
    },
  };
}

/** A rule computed by arbitrary code (e.g. wrapping an i18n checker's `scan()`). */
export function customRule(meta: { id: string; title: string; mode: Mode }, keys: () => Promise<string[]> | string[]): ArchRule {
  return { ...meta, keys: async () => uniqSorted(await keys()) };
}

/** Merge several rules (e.g. one per feature domain) under one ID. */
export function combine(meta: { id: string; title: string; mode: Mode }, rules: ArchRule[]): ArchRule {
  return {
    ...meta,
    async keys() {
      const all = await Promise.all(rules.map((r) => r.keys()));
      return uniqSorted(all.flat());
    },
  };
}
