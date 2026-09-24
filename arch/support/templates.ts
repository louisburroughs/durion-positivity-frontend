import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  parseTemplate,
  TmplAstBoundAttribute,
  TmplAstElement,
  TmplAstNode,
  TmplAstTextAttribute,
  TmplAstTemplate,
  TmplAstRecursiveVisitor,
  tmplAstVisitAll,
} from '@angular/compiler';
import { onDisk, type Project } from './projects';
import type { Source } from './ast';

/**
 * `*.html` files under the project's app tree (plan §3.4: suite-hosted template rules). Listed off
 * disk under `onDisk(p, p.app)` (repo-relative), but reported back `root`-relative — the same path
 * space ArchUnitTS's `FileInfo.path` uses (see `support/projects.ts`) — so template-rule keys are
 * consistent with dependency/content-rule keys for the same project.
 */
export function templateFiles(p: Project): Source[] {
  return listFiles(onDisk(p, p.app), '.html').map((f) => ({
    path: p.root === '.' ? f : path.posix.relative(p.root, f),
    content: readFileSync(f, 'utf8'),
  }));
}

/** Repo-relative files under `dir` with the given extension, sorted. */
export function listFiles(dir: string, ext: string): string[] {
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((f) => f.endsWith(ext))
    .map((f) => path.join(dir, f).split(path.sep).join('/'))
    .sort();
}

export interface TemplateElement {
  readonly name: string;
  readonly attrs: ReadonlyMap<string, string>;
  /** Bound inputs, by property name (`innerHTML` for `[innerHTML]`). */
  readonly inputs: ReadonlySet<string>;
  /** Output (event) names, e.g. `click`. */
  readonly outputs: ReadonlySet<string>;
  readonly node: TmplAstElement | TmplAstTemplate;
}

const cache = new Map<string, TmplAstNode[]>();

export function parseHtml(f: Source): TmplAstNode[] {
  const key = `${f.path}\0${f.content.length}\0${f.content}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = parseTemplate(f.content, f.path, { preserveWhitespaces: false }).nodes;
    cache.set(key, hit);
  }
  return hit;
}

/** Every element (and structural `<ng-template>`) in a template, flattened. */
export function elements(f: Source): TemplateElement[] {
  const out: TemplateElement[] = [];
  const toEl = (node: TmplAstElement | TmplAstTemplate, name: string): TemplateElement => ({
    name,
    attrs: new Map(node.attributes.map((a: TmplAstTextAttribute) => [a.name, a.value])),
    inputs: new Set(node.inputs.map((i: TmplAstBoundAttribute) => i.name)),
    outputs: new Set(node.outputs.map((o) => o.name)),
    node,
  });
  class V extends TmplAstRecursiveVisitor {
    override visitElement(el: TmplAstElement): void {
      out.push(toEl(el, el.name));
      super.visitElement(el);
    }
  }
  tmplAstVisitAll(new V(), parseHtml(f));
  return out;
}

export { TmplAstRecursiveVisitor, tmplAstVisitAll };
