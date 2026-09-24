import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { ASTWithSource, BindingPipe, LiteralPrimitive, RecursiveAstVisitor } from '@angular/compiler';
import { calls, enclosing, insideCallback, ts, type Source } from '../support/ast';
import { onDisk, type Project, selectors } from '../support/projects';
import { type ArchRule, type Finder, combine, contentRule, customRule, templateRule } from '../support/rule';
import { parseHtml, templateFiles, elements } from '../support/templates';
import { checkPseudoLocale } from '../../scripts/i18n/generate-pseudo-locale.mjs';
import { scan as scanMissingKeys } from '../../scripts/i18n/check-missing-keys.mjs';
import { scan as scanHardcodedTemplates } from '../../scripts/i18n/check-hardcoded-strings.mjs';
import { scan as scanHardcodedTs } from '../../scripts/i18n/check-hardcoded-ts-strings.mjs';

/**
 * i18n rules (plan §5.7). I18N-01..04 wrap the four `scripts/i18n/*.mjs` checkers' pure `scan()`s
 * (plan step 1). I18N-05..09 are new suite-hosted rules: I18N-05 walks the Angular template
 * expression AST (via `@angular/compiler`) for literal `| translate` pipes, and the TS AST (via
 * `support/ast.ts`) for `translate.instant/get/stream` and `errorKey.set` literal args plus
 * `errorKey`-typed field initializers, cross-checked against `en-US.json` (plan §11.4).
 */

const uniqSorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();

// ---------------------------------------------------------------------------------------------
// I18N-01..04: wrap the existing checkers. No new heuristics here.
// ---------------------------------------------------------------------------------------------

export const i18n01 = (): ArchRule =>
  customRule({ id: 'I18N-01', title: 'every release locale has exactly the en-US key set (ADR-0030)', mode: 'enforce' }, () => {
    const { diffs } = scanMissingKeys();
    return diffs.flatMap((d) => [
      ...d.missing.map((k) => `${d.locale} :: missing ${k}`),
      ...d.typeMismatches.map((t) => `${d.locale} :: type-mismatch ${t}`),
    ]);
  });

export const i18n02 = (): ArchRule =>
  customRule({ id: 'I18N-02', title: 'qps-ploc.json is in sync with en-US, regenerated never hand-edited (ADR-0030)', mode: 'enforce' }, () => {
    const r = checkPseudoLocale();
    return r.ok ? [] : [`qps-ploc.json :: ${r.reason}`];
  });

export const i18n03 = (options: { targets?: string[] } = {}): ArchRule =>
  customRule({ id: 'I18N-03', title: 'no hardcoded copy in templates (ADR-0030 §1)', mode: 'enforce' }, () => {
    const { findings } = scanHardcodedTemplates(options);
    return findings.map((f) => `${f.file} :: [${f.kind}] ${f.text}`);
  });

export const i18n04 = (options: { targets?: string[] } = {}): ArchRule =>
  customRule({ id: 'I18N-04', title: 'no hardcoded prose in TS, including prose-bearing inline template: (ADR-0030 §1)', mode: 'enforce' }, () => {
    const { findings } = scanHardcodedTs(options);
    return findings.map((f) => `${f.file} :: [${f.kind}] ${f.text}`);
  });

// ---------------------------------------------------------------------------------------------
// Shared: static translation-key extraction (I18N-05, I18N-09) and the en-US key index.
// ---------------------------------------------------------------------------------------------

/** Flattened dot-path key set of `en-US.json` for one project (plan §11.4). */
export function loadEnUsKeys(p: Project): Set<string> {
  const file = path.join(onDisk(p, p.src), 'assets', 'i18n', 'en-US.json');
  const json: unknown = JSON.parse(readFileSync(file, 'utf8'));
  const keys = new Set<string>();
  const flatten = (v: unknown, prefix: string): void => {
    if (typeof v === 'string') {
      keys.add(prefix);
      return;
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) flatten(child, prefix ? `${prefix}.${k}` : k);
      return;
    }
    if (prefix) keys.add(prefix);
  };
  flatten(json, '');
  return keys;
}

/**
 * Literal `'A.B' | translate` keys anywhere in a template's expression AST — interpolations,
 * bound attributes, bound events and control-flow block expressions (`@if`, `@for`, `@switch`,
 * `@defer`) all resolve to `ASTWithSource` nodes reachable from the template node tree, so a
 * generic walk (rather than one visitor method per `TmplAst*` node kind) covers all of them.
 * A `| translate` over anything but a string `LiteralPrimitive` is a dynamic key and is counted,
 * not returned (plan §5.7: "Dynamic keys … are skipped and counted").
 */
export function templateTranslateKeys(f: Source): { keys: string[]; dynamicCount: number } {
  const keys: string[] = [];
  let dynamicCount = 0;
  const seen = new Set<unknown>();

  class PipeVisitor extends RecursiveAstVisitor {
    override visitPipe(pipe: BindingPipe, context: unknown): unknown {
      if (pipe.name === 'translate') {
        if (pipe.exp instanceof LiteralPrimitive && typeof pipe.exp.value === 'string') {
          keys.push(pipe.exp.value);
        } else {
          dynamicCount++;
        }
      }
      return super.visitPipe(pipe, context);
    }
  }
  const visitor = new PipeVisitor();

  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    if (node instanceof ASTWithSource) {
      node.ast.visit(visitor);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    for (const value of Object.values(node as Record<string, unknown>)) walk(value);
  };
  walk(parseHtml(f));

  return { keys, dynamicCount };
}

const TRANSLATE_CALL_RE = /(^|\.)translate\.(instant|get|stream)$/;
/** `A.B.C` — dotted ALL_CAPS segments. Same shape the existing TS checker treats as a key, not prose. */
const KEY_SHAPE_RE = /^[A-Z][A-Z0-9_]*(\.[A-Z][A-Z0-9_]*)+$/;

/** Every string-literal descendant of `node` (bounded to one call argument, so this stays cheap). */
function stringLiteralsIn(node: ts.Node): ts.StringLiteralLike[] {
  const out: ts.StringLiteralLike[] = [];
  const rec = (n: ts.Node): void => {
    if (ts.isStringLiteralLike(n)) out.push(n);
    ts.forEachChild(n, rec);
  };
  rec(node);
  return out;
}

/** Names of fields/variables declared `= signal(...)` (a "key-typed field" candidate per §11.4). */
function signalFieldNames(f: Source): Set<string> {
  const names = new Set<string>();
  for (const c of calls(f, (call) => call.name === 'signal')) {
    const decl = enclosing(
      c.node,
      (n): n is ts.PropertyDeclaration | ts.VariableDeclaration => ts.isPropertyDeclaration(n) || ts.isVariableDeclaration(n),
    );
    if (decl?.name && ts.isIdentifier(decl.name)) names.add(decl.name.text);
  }
  return names;
}

/**
 * Literal keys from TS translation call sites: `translate.instant/get/stream('A.B')`, and
 * `.set(...)` on a `signal(...)`-declared field (`errorKey`, `rescheduleError`, `successMessage`,
 * …) — ADR-0031's error/status-message convention, where such a signal holds either `null` or a
 * translation key, often behind a `body?.message ?? 'A.B'` fallback. The `.set(` case is scoped to
 * a dotted ALL_CAPS literal shape: the spike found a bare "looks like a key" heuristic
 * false-positives on permission codes such as `INVENTORY.VIEW` (plan §11.4).
 */
export function staticTranslateKeysInTs(f: Source): string[] {
  const keys: string[] = [];

  for (const c of calls(f, (call) => TRANSLATE_CALL_RE.test(call.callee))) {
    const arg = c.args[0];
    if (arg && ts.isStringLiteralLike(arg)) keys.push(arg.text);
  }

  const signalFields = signalFieldNames(f);
  for (const c of calls(f, (call) => call.name === 'set')) {
    const receiver = c.callee.replace(/\.set$/, '');
    const field = receiver.split('.').pop() ?? '';
    if (!signalFields.has(field)) continue;
    const arg = c.args[0];
    if (!arg) continue;
    for (const lit of stringLiteralsIn(arg)) {
      if (KEY_SHAPE_RE.test(lit.text)) keys.push(lit.text);
    }
  }

  return keys;
}

/** All `.ts` sources under a project's app tree (production code: no specs, no declaration files). */
function tsSourceFiles(p: Project): Source[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.ts') && !name.endsWith('.spec.ts') && !name.endsWith('.d.ts')) out.push(full);
    }
  };
  walk(onDisk(p, p.app));
  return out
    .sort()
    .map((filePath) => ({ path: filePath, content: readFileSync(filePath, 'utf8') }));
}

// ---------------------------------------------------------------------------------------------
// I18N-05: referenced keys exist in en-US.json (plan §5.7, §11.5 — ~58 template + 4 TS today).
// ---------------------------------------------------------------------------------------------

export const i18n05 = (p: Project): ArchRule => {
  const enUsKeys = loadEnUsKeys(p);
  const missingKeyFindings = (keys: string[]): string[] => uniqSorted(keys.filter((k) => !enUsKeys.has(k)).map((k) => `missing key ${k}`));

  const meta = { id: 'I18N-05', title: 'referenced translation keys exist in en-US.json (ADR-0030, plan §11.5)', mode: 'enforce' as const };
  const templateFinder: Finder = (f) => missingKeyFindings(templateTranslateKeys(f).keys);
  const tsFinder: Finder = (f) => missingKeyFindings(staticTranslateKeysInTs(f));

  return combine(meta, [
    templateRule(meta, p, { finder: templateFinder }),
    contentRule(meta, p, { subject: selectors.appTree(p), except: [/\.spec\.ts$/], finder: tsFinder }),
  ]);
};

// ---------------------------------------------------------------------------------------------
// I18N-06: translate.instant( ) must not run once and freeze — not in computed(), a class field
// initializer, or effect() (none of those re-run on a locale change).
// ---------------------------------------------------------------------------------------------

function frozenInstantReason(node: ts.Node): string | null {
  if (insideCallback(node, 'computed')) return 'inside computed()';
  if (insideCallback(node, 'effect')) return 'inside effect()';
  // Nearest function-like or property-declaration ancestor: if it's a PropertyDeclaration, the
  // call sits directly in a class field initializer, with no callback between it and the field.
  const boundary = enclosing(
    node,
    (n): n is ts.Node =>
      ts.isArrowFunction(n) ||
      ts.isFunctionExpression(n) ||
      ts.isMethodDeclaration(n) ||
      ts.isConstructorDeclaration(n) ||
      ts.isGetAccessorDeclaration(n) ||
      ts.isSetAccessorDeclaration(n) ||
      ts.isPropertyDeclaration(n),
  );
  if (boundary && ts.isPropertyDeclaration(boundary)) return 'in a class field initializer';
  return null;
}

/**
 * The I18N-06 finder itself, exported so the self-test can also call it directly on a `Source`
 * built from a real file read, for a focused unit test of the detection logic. `contentRule`
 * (`support/rule.ts`) reads the file straight off disk whenever ArchUnitTS's own `FileInfo.content`
 * comes back empty, so `i18n06(FIXTURES).keys()` exercises the same logic end to end too.
 */
export const i18n06Findings: Finder = (f) =>
  uniqSorted(
    calls(f, (c) => TRANSLATE_CALL_RE.test(c.callee) && c.name === 'instant')
      .map((c) => frozenInstantReason(c.node))
      .filter((r): r is string => r !== null)
      .map((r) => `translate.instant(…) ${r}`),
  );

export const i18n06 = (p: Project): ArchRule =>
  contentRule(
    { id: 'I18N-06', title: 'no translate.instant( ) in computed(), a class field initializer, or effect() (ADR-0030)', mode: 'enforce' },
    p,
    { subject: selectors.appTree(p), except: [/\.spec\.ts$/], finder: i18n06Findings },
  );

// ---------------------------------------------------------------------------------------------
// I18N-07: no manual locale formatting in pages/**/components/** — use the number/date/currency
// pipes or a single allowlisted core formatter.
// ---------------------------------------------------------------------------------------------

const LOCALE_METHOD_RE = /\.(toLocaleString|toLocaleDateString|toLocaleTimeString|toFixed)$/;
const INTL_CTOR_RE = /(^|\.)Intl\.[A-Za-z]+$/;

export const i18n07 = (p: Project): ArchRule =>
  contentRule(
    { id: 'I18N-07', title: 'no manual locale formatting (toLocale*/Intl.*/toFixed) in pages/** or components/** (ADR-0030)', mode: 'enforce' },
    p,
    {
      subject: selectors.ui(p),
      finder: (f) =>
        uniqSorted(
          calls(f)
            .filter((c) => (c.isNew && INTL_CTOR_RE.test(c.callee)) || (!c.isNew && LOCALE_METHOD_RE.test(c.callee)))
            .map((c) => (c.isNew ? `new ${c.callee}(…)` : `${c.callee}(…)`)),
        ),
    },
  );

// ---------------------------------------------------------------------------------------------
// I18N-08: no hardcoded dir="ltr"/"rtl" — direction is locale-driven.
// ---------------------------------------------------------------------------------------------

export const i18n08 = (p: Project): ArchRule =>
  templateRule({ id: 'I18N-08', title: 'no hardcoded dir="ltr"/"rtl" in templates — direction is locale-driven (ADR-0030)', mode: 'enforce' }, p, {
    finder: (f) =>
      uniqSorted(
        elements(f)
          .map((el) => el.attrs.get('dir'))
          .filter((dir): dir is string => !!dir && /^(ltr|rtl)$/i.test(dir))
          .map((dir) => `hardcoded dir="${dir}"`),
      ),
  });

// ---------------------------------------------------------------------------------------------
// I18N-09: unused en-US keys — report only (dynamic keys make it unprovable; count only, since a
// huge key list is not useful printed in full).
// ---------------------------------------------------------------------------------------------

export const i18n09 = (p: Project): ArchRule => {
  const enUsKeys = loadEnUsKeys(p);
  return customRule({ id: 'I18N-09', title: 'unused en-US keys: no static reference reaches them (hygiene)', mode: 'warn' }, () => {
    const used = new Set<string>();
    for (const f of templateFiles(p)) for (const k of templateTranslateKeys(f).keys) used.add(k);
    for (const f of tsSourceFiles(p)) for (const k of staticTranslateKeysInTs(f)) used.add(k);
    const unusedCount = [...enUsKeys].filter((k) => !used.has(k)).length;
    return unusedCount ? [`${unusedCount} unused key(s) in en-US.json (dynamic-key usages are not counted as used)`] : [];
  });
};
