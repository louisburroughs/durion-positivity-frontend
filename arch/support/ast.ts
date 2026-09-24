import ts from 'typescript';

/**
 * TypeScript-AST queries for content rules (plan §3.2). Uses the repo's root `typescript` (6.x),
 * never ArchUnitTS's nested copy. Comments are never part of any result, so a rule can't fire on
 * a comment that mentions a banned name.
 */

export interface Source {
  readonly path: string;
  readonly content: string;
}

const cache = new Map<string, { content: string; sf: ts.SourceFile }>();

export function parse(f: Source): ts.SourceFile {
  const hit = cache.get(f.path);
  if (hit && hit.content === f.content) return hit.sf;
  const sf = ts.createSourceFile(f.path, f.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  cache.set(f.path, { content: f.content, sf });
  return sf;
}

/** Depth-first walk of every node in the file. */
export function walk(f: Source | ts.SourceFile, visit: (n: ts.Node) => void): void {
  const sf = 'kind' in f ? f : parse(f);
  const rec = (n: ts.Node): void => {
    visit(n);
    ts.forEachChild(n, rec);
  };
  rec(sf);
}

export function nodes<T extends ts.Node>(f: Source, guard: (n: ts.Node) => n is T): T[] {
  const out: T[] = [];
  walk(f, (n) => {
    if (guard(n)) out.push(n);
  });
  return out;
}

export interface ImportSpec {
  readonly module: string;
  /** Whole declaration is `import type` / `export type`. */
  readonly typeOnly: boolean;
  /** Named bindings, with per-binding type-only flag. Empty for namespace/default/side-effect. */
  readonly names: readonly { name: string; typeOnly: boolean }[];
  readonly node: ts.Node;
}

/** Static `import … from` and `export … from` specifiers, plus dynamic `import('…')` (`dynamic: true`). */
export function importSpecifiers(f: Source): (ImportSpec & { dynamic: boolean })[] {
  const out: (ImportSpec & { dynamic: boolean })[] = [];
  walk(f, (n) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const clause = n.importClause;
      const typeOnly = !!clause?.isTypeOnly;
      const names: { name: string; typeOnly: boolean }[] = [];
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          names.push({ name: (el.propertyName ?? el.name).text, typeOnly: typeOnly || el.isTypeOnly });
        }
      }
      out.push({ module: n.moduleSpecifier.text, typeOnly, names, node: n, dynamic: false });
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      const names: { name: string; typeOnly: boolean }[] = [];
      if (n.exportClause && ts.isNamedExports(n.exportClause)) {
        for (const el of n.exportClause.elements) {
          names.push({ name: (el.propertyName ?? el.name).text, typeOnly: n.isTypeOnly || el.isTypeOnly });
        }
      }
      out.push({ module: n.moduleSpecifier.text, typeOnly: n.isTypeOnly, names, node: n, dynamic: false });
    } else if (
      ts.isCallExpression(n) &&
      n.expression.kind === ts.SyntaxKind.ImportKeyword &&
      n.arguments[0] &&
      ts.isStringLiteralLike(n.arguments[0])
    ) {
      out.push({ module: n.arguments[0].text, typeOnly: false, names: [], node: n, dynamic: true });
    }
  });
  return out;
}

/** Named bindings imported from one module (e.g. `HttpClient` from `@angular/common/http`). */
export function importedNames(f: Source, module: string): { name: string; typeOnly: boolean }[] {
  return importSpecifiers(f)
    .filter((i) => i.module === module)
    .flatMap((i) => i.names);
}

export interface Literal {
  readonly text: string;
  readonly node: ts.Node;
}

/**
 * String literals, no-substitution template literals, and the static head/middle/tail pieces of
 * template expressions. Import/export module specifiers are excluded.
 */
export function stringLiterals(f: Source): Literal[] {
  const out: Literal[] = [];
  walk(f, (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const p = n.parent;
      if (p && (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p))) return;
      out.push({ text: n.text, node: n });
    } else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      out.push({ text: n.text, node: n });
    }
  });
  return out;
}

/** Object-literal property keys (identifier, string or computed-string names). */
export function propertyKeys(f: Source): Literal[] {
  const out: Literal[] = [];
  walk(f, (n) => {
    if ((ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n) || ts.isMethodDeclaration(n)) && ts.isObjectLiteralExpression(n.parent)) {
      const name = n.name;
      if (ts.isIdentifier(name) || ts.isStringLiteral(name)) out.push({ text: name.text, node: n });
    }
  });
  return out;
}

/** Every identifier (including property-access names), with its text. */
export function identifiers(f: Source): Literal[] {
  return nodes(f, ts.isIdentifier).map((n) => ({ text: n.text, node: n }));
}

export interface Call {
  /** Callee source text, e.g. `effect`, `this.translate.instant`, `localStorage.setItem`. */
  readonly callee: string;
  /** Last name in the callee (`instant` for `this.translate.instant`). */
  readonly name: string;
  readonly args: readonly ts.Expression[];
  readonly node: ts.CallExpression | ts.NewExpression;
  readonly isNew: boolean;
}

/** Call and `new` expressions, optionally filtered. */
export function calls(f: Source, predicate: (c: Call) => boolean = () => true): Call[] {
  const sf = parse(f);
  const out: Call[] = [];
  walk(sf, (n) => {
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      const callee = n.expression.getText(sf);
      const name = ts.isPropertyAccessExpression(n.expression)
        ? n.expression.name.text
        : ts.isIdentifier(n.expression)
          ? n.expression.text
          : callee;
      const c: Call = { callee, name, args: n.arguments ?? [], node: n, isNew: ts.isNewExpression(n) };
      if (predicate(c)) out.push(c);
    }
  });
  return out;
}

/** Nearest ancestor satisfying `test`, or undefined. */
export function enclosing<T extends ts.Node>(node: ts.Node, test: (n: ts.Node) => n is T): T | undefined;
export function enclosing(node: ts.Node, test: (n: ts.Node) => boolean): ts.Node | undefined;
export function enclosing(node: ts.Node, test: (n: ts.Node) => boolean): ts.Node | undefined {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (test(cur)) return cur;
    cur = cur.parent;
  }
  return undefined;
}

/** True when `node` sits inside the callback argument of a call named `callName` (e.g. `effect`). */
export function insideCallback(node: ts.Node, callName: string): boolean {
  return !!enclosing(node, (n) => {
    if (!ts.isArrowFunction(n) && !ts.isFunctionExpression(n)) return false;
    const call = n.parent;
    if (!call || !ts.isCallExpression(call) || !call.arguments.includes(n as ts.Expression)) return false;
    const e = call.expression;
    const name = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : '';
    return name === callName;
  });
}

/** Source text of a node without leading trivia. */
export const text = (n: ts.Node): string => n.getText(n.getSourceFile());

export { ts };
