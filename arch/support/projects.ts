import { readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * A program the rules run against. ArchUnitTS reports `FileInfo.path` relative to the *directory
 * containing the tsconfig*, not the repo root (confirmed by probing `projectFiles()` directly
 * against `arch/fixtures/tsconfig.json`: it returns paths like `src/app/...`, never
 * `arch/fixtures/src/app/...`). `app`/`src` are therefore `root`-relative, not repo-relative — that
 * makes them the same path space ArchUnitTS's own `FileInfo.path` uses, so every
 * `selectors.*`/`file`/`under` regex built from `p.app`/`p.src` matches ArchUnitTS's files directly,
 * for APP/SPEC (tsconfig at the repo root, so `root` is `.` and the two conventions coincide) and
 * for FIXTURES alike. Use `onDisk` to turn a `root`-relative path back into a repo-relative one for
 * `fs` calls.
 *
 * Selectors live here only (plan §11.3.1): ArchUnitTS globs with an interior `**` silently
 * under-match, so every selector is a regex built from the project prefix.
 */
export interface Project {
  readonly tsconfig: string;
  /** Repo-relative directory containing `tsconfig` ('.' when it sits at the repo root). */
  readonly root: string;
  /** `root`-relative path of the `src/app` equivalent, no trailing slash. */
  readonly app: string;
  /** `root`-relative path of the `src` equivalent (holds `environments/`, `assets/`). */
  readonly src: string;
}

export const APP: Project = { tsconfig: 'tsconfig.app.json', root: '.', app: 'src/app', src: 'src' };
export const SPEC: Project = { tsconfig: 'tsconfig.spec.json', root: '.', app: 'src/app', src: 'src' };
export const FIXTURES: Project = {
  tsconfig: 'arch/fixtures/tsconfig.json',
  root: 'arch/fixtures',
  app: 'src/app',
  src: 'src',
};

/** A `root`-relative path (e.g. `p.app`, or a `FileInfo.path` ArchUnitTS reported) to a repo-relative disk path. */
export const onDisk = (p: Project, rel: string): string => (p.root === '.' ? rel : path.posix.join(p.root, rel));

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex matching any path under `<app>/<sub>/`. */
export const under = (p: Project, sub: string): RegExp => new RegExp(`^${esc(`${p.app}/${sub}`)}/`);

/** Regex matching exactly one repo-relative file under the app tree. */
export const file = (p: Project, rel: string): RegExp => new RegExp(`^${esc(`${p.app}/${rel}`)}$`);

export const selectors = {
  core: (p: Project) => under(p, 'core'),
  shared: (p: Project) => under(p, 'shared'),
  features: (p: Project) => under(p, 'features'),
  feature: (p: Project, domain: string) => under(p, `features/${domain}`),
  /** Anything inside a `pages/` or `components/` folder, at any depth. */
  ui: (p: Project) => new RegExp(`^${esc(p.app)}/.*/(pages|components)/`),
  pages: (p: Project) => new RegExp(`^${esc(p.app)}/.*/pages/`),
  services: (p: Project) => new RegExp(`^${esc(p.app)}/.*/services/`),
  models: (p: Project) => new RegExp(`^${esc(p.app)}/.*/models/`),
  environments: (p: Project) => new RegExp(`^${esc(p.src)}/environments/`),
  appTree: (p: Project) => new RegExp(`^${esc(p.app)}/`),
};

/** Feature domains, read from the filesystem so a new feature is covered automatically. */
export function featureDomains(p: Project = APP): string[] {
  return readdirSync(path.resolve(onDisk(p, p.app), 'features'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/** True for a repo-relative path of a spec file. */
export const isSpec = (p: string): boolean => /\.spec\.ts$/.test(p);
