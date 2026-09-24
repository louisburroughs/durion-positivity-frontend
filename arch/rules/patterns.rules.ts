import { calls, enclosing, insideCallback, parse, ts, walk, type Source } from '../support/ast';
import { selectors, type Project, SPEC } from '../support/projects';
import { type ArchRule, contentRule } from '../support/rule';

/**
 * PAT-01..08 (plan §5.6): the AST-heavy reactive-state and date rules. Selectors are file-local
 * (see conventions.rules.ts header note — this agent's scope may not edit `support/projects.ts`).
 */

const appPrefix = (p: Project): string => selectors.appTree(p).source;

/** Nearest enclosing method/property/class name, for line-number-free finding keys. */
function enclosingName(n: ts.Node): string {
  let cur: ts.Node | undefined = n.parent;
  while (cur) {
    if ((ts.isMethodDeclaration(cur) || ts.isFunctionDeclaration(cur) || ts.isGetAccessor(cur) || ts.isSetAccessor(cur)) && cur.name) {
      return cur.name.getText();
    }
    if (ts.isConstructorDeclaration(cur)) return 'constructor';
    if (ts.isPropertyDeclaration(cur) && cur.name) return cur.name.getText();
    if (ts.isClassDeclaration(cur) && cur.name) return cur.name.getText();
    cur = cur.parent;
  }
  return 'top-level';
}

const within = (container: ts.Node, node: ts.Node): boolean => node.getStart() >= container.getStart() && node.getEnd() <= container.getEnd();

// ---------------------------------------------------------------------------------------------
// PAT-01: an effect( callback that calls .subscribe( must declare onCleanup and call it
// ---------------------------------------------------------------------------------------------

export const pat01Finder = (f: Source): string[] => {
  const findings: string[] = [];
  const subscribeCalls = calls(f, (c) => !c.isNew && c.name === 'subscribe');
  for (const e of calls(f, (c) => !c.isNew && c.name === 'effect')) {
    const cb = e.args[0];
    if (!cb || !(ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) continue;
    const hasSubscribe = subscribeCalls.some((s) => within(cb, s.node));
    if (!hasSubscribe) continue;
    const param = cb.parameters[0];
    const cleanupName = param && ts.isIdentifier(param.name) ? param.name.text : undefined;
    const registered = cleanupName ? calls(f, (c) => !c.isNew && c.name === cleanupName).some((c) => within(cb, c.node)) : false;
    if (!registered) findings.push(`${enclosingName(e.node)} :: effect subscribes without registering onCleanup`);
  }
  return findings;
};

export const pat01 = (p: Project): ArchRule =>
  contentRule(
    { id: 'PAT-01', title: 'an effect( callback that calls .subscribe( must declare onCleanup and call it (ADR-0033 §1, §3)', mode: 'enforce' },
    p,
    { subject: selectors.appTree(p), finder: pat01Finder },
  );

// ---------------------------------------------------------------------------------------------
// PAT-02: no takeUntilDestroyed inside an effect( callback
// ---------------------------------------------------------------------------------------------

export const pat02Finder = (f: Source): string[] =>
  calls(f, (c) => !c.isNew && c.name === 'takeUntilDestroyed' && insideCallback(c.node, 'effect')).map(
    (c) => `${enclosingName(c.node)} :: takeUntilDestroyed inside effect(`,
  );

export const pat02 = (p: Project): ArchRule =>
  contentRule(
    { id: 'PAT-02', title: 'no takeUntilDestroyed inside an effect( callback (ADR-0033 §2)', mode: 'ratchet' },
    p,
    { subject: selectors.appTree(p), finder: pat02Finder },
  );

// ---------------------------------------------------------------------------------------------
// PAT-03: errorKey.set(<non-null>) is immediately preceded by state.set('error') inside a
// subscribe({ error }) callback (§11.4 tuning: scoped to the error callback; a computed
// state.set(cond ? 'forbidden' : 'error') counts as compliant)
// ---------------------------------------------------------------------------------------------

function isErrorKeySet(expr: ts.Expression): boolean {
  if (!ts.isCallExpression(expr) || !ts.isPropertyAccessExpression(expr.expression) || expr.expression.name.text !== 'set') return false;
  if (!/errorKey$/.test(expr.expression.expression.getText())) return false;
  const arg = expr.arguments[0];
  return !!arg && arg.kind !== ts.SyntaxKind.NullKeyword;
}

/**
 * True when the enclosing class declares the ADR-0031 `state` signal (`readonly state = signal(…)`,
 * or `pageState`/`panelState`, etc.). Without it, `errorKey` is a form/local error message unrelated
 * to the page state machine, and the ordering rule does not apply — confirmed against real code: five
 * files (`location-edit-page`, `employee-offboard-page`, `employee-profile-page`,
 * `person-location-assignments-page`, `user-provision-page`) set `errorKey` with no `state` signal at
 * all and were false positives before this guard.
 */
function classHasStateSignal(cls: ts.ClassDeclaration): boolean {
  return cls.members.some(
    (m) =>
      ts.isPropertyDeclaration(m) &&
      m.name &&
      ts.isIdentifier(m.name) &&
      /state$/i.test(m.name.text) &&
      !!m.initializer &&
      ts.isCallExpression(m.initializer) &&
      ts.isIdentifier(m.initializer.expression) &&
      m.initializer.expression.text === 'signal',
  );
}

/** True for a single statement (or one-statement block) that is `<...state>.set('literal')`. */
function isStateSetLiteral(stmt: ts.Statement): boolean {
  const inner = ts.isBlock(stmt) ? (stmt.statements.length === 1 ? stmt.statements[0] : undefined) : stmt;
  if (!inner || !ts.isExpressionStatement(inner)) return false;
  const expr = inner.expression;
  if (!ts.isCallExpression(expr) || !ts.isPropertyAccessExpression(expr.expression) || expr.expression.name.text !== 'set') return false;
  if (!/state$/i.test(expr.expression.expression.getText())) return false;
  const arg = expr.arguments[0];
  return !!arg && ts.isStringLiteral(arg);
}

/**
 * True for an exhaustive `if (…) state.set('a'); else if (…) state.set('b'); else state.set('c');`
 * chain — the generalisation of the ternary carve-out (§11.4) to more than two outcomes. Real
 * shape: `supplier-fleet-authorization-panel`/`supplier-fleet-lookup-panel` branch
 * forbidden/unreachable/error, each `// ADR-0031: state first, then the key.`.
 */
function isExhaustiveStateIf(stmt: ts.Statement): boolean {
  if (!ts.isIfStatement(stmt) || !stmt.elseStatement) return false;
  const branchOk = (b: ts.Statement): boolean => isStateSetLiteral(b) || isExhaustiveStateIf(b);
  return branchOk(stmt.thenStatement) && branchOk(stmt.elseStatement);
}

function isCompliantStatePrecede(prev: ts.Statement | undefined): boolean {
  if (!prev) return false;
  if (isStateSetLiteral(prev)) {
    const expr = (prev as ts.ExpressionStatement).expression as ts.CallExpression;
    return (expr.arguments[0] as ts.StringLiteral).text === 'error';
  }
  if (isExhaustiveStateIf(prev)) return true; // §11.4-style carve-out, generalised past the ternary shape
  if (ts.isExpressionStatement(prev) && ts.isCallExpression(prev.expression) && ts.isPropertyAccessExpression(prev.expression.expression)) {
    const call = prev.expression;
    const callee = call.expression as ts.PropertyAccessExpression;
    if (callee.name.text === 'set' && /state$/i.test(callee.expression.getText())) {
      const arg = call.arguments[0];
      if (arg && ts.isConditionalExpression(arg)) {
        // §11.4: a computed `state.set(cond ? 'forbidden' : 'error')` ternary counts as compliant.
        const outcomes = new Set(
          [arg.whenTrue, arg.whenFalse].filter((x): x is ts.StringLiteral => ts.isStringLiteral(x)).map((x) => x.text),
        );
        return outcomes.has('forbidden') && outcomes.has('error');
      }
    }
  }
  return false;
}

export const pat03Finder = (f: Source): string[] => {
  const sf = parse(f);
  const findings: string[] = [];
  for (const s of calls(f, (c) => !c.isNew && c.name === 'subscribe')) {
    const arg = s.args[0];
    if (!arg || !ts.isObjectLiteralExpression(arg)) continue;
    const cls = enclosing(s.node, (n): n is ts.ClassDeclaration => ts.isClassDeclaration(n));
    if (!cls || !classHasStateSignal(cls)) continue;
    const errProp = arg.properties.find(
      (pr): pr is ts.PropertyAssignment | ts.MethodDeclaration =>
        (ts.isPropertyAssignment(pr) || ts.isMethodDeclaration(pr)) && !!pr.name && ts.isIdentifier(pr.name) && pr.name.text === 'error',
    );
    if (!errProp) continue;
    const fn = ts.isPropertyAssignment(errProp) ? errProp.initializer : errProp;
    if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) || ts.isMethodDeclaration(fn))) continue;
    const start = fn.getStart(sf);
    const end = fn.getEnd();
    walk(sf, (n) => {
      if (n.getStart(sf) < start || n.getEnd() > end) return;
      if (!ts.isExpressionStatement(n) || !isErrorKeySet(n.expression)) return;
      const block = n.parent;
      if (!ts.isBlock(block)) {
        findings.push(`${enclosingName(n)} :: errorKey.set not inside a plain block`);
        return;
      }
      const idx = block.statements.indexOf(n);
      if (!isCompliantStatePrecede(block.statements[idx - 1])) {
        findings.push(`${enclosingName(n)} :: errorKey.set not immediately preceded by state.set('error')`);
      }
    });
  }
  return findings;
};

export const pat03 = (p: Project): ArchRule =>
  contentRule(
    {
      id: 'PAT-03',
      title: "errorKey.set(<non-null>) is immediately preceded by state.set('error') inside a subscribe({ error }) callback (ADR-0031 §1, §5)",
      mode: 'ratchet',
    },
    p,
    {
      subject: selectors.appTree(p),
      // dispatch-board-page extracts error handling into applyError()/applySuccess() helper
      // methods called from the subscribe({ error }) callback (ADR-0064 §4 carve-out). The AST
      // check only looks inside the callback itself, so it cannot see across that call and would
      // otherwise false-positive on every errorKey.set in the helpers. Allowlisted with reason
      // per plan §11.4.
      except: [/dispatch-board-page\.component\.ts$/],
      finder: pat03Finder,
    },
  );

// ---------------------------------------------------------------------------------------------
// PAT-04: inside catchError( in features/**/services/**, never return an empty-value fallback
// ---------------------------------------------------------------------------------------------

function isEmptyOfCall(expr: ts.Expression): string | undefined {
  if (ts.isIdentifier(expr) && expr.text === 'EMPTY') return 'EMPTY';
  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === 'of') {
    const arg = expr.arguments[0];
    if (arg && ts.isArrayLiteralExpression(arg) && arg.elements.length === 0) return 'of([])';
    if (arg && ts.isObjectLiteralExpression(arg) && arg.properties.length === 0) return 'of({})';
    if (
      arg &&
      ts.isNewExpression(arg) &&
      ts.isIdentifier(arg.expression) &&
      (arg.expression.text === 'Map' || arg.expression.text === 'Set') &&
      !(arg.arguments && arg.arguments.length)
    ) {
      return `of(new ${arg.expression.text}())`;
    }
  }
  return undefined;
}

/** Return statements belonging to `fn` itself — never crossing into a nested function's body. */
function directReturns(fn: ts.ArrowFunction | ts.FunctionExpression): ts.Expression[] {
  const out: ts.Expression[] = [];
  if (!ts.isBlock(fn.body)) {
    out.push(fn.body);
    return out;
  }
  const visit = (n: ts.Node): void => {
    if (n !== fn.body && ts.isFunctionLike(n)) return;
    if (ts.isReturnStatement(n) && n.expression) out.push(n.expression);
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(fn.body, visit);
  return out;
}

export const pat04Finder = (f: Source): string[] => {
  const findings: string[] = [];
  for (const c of calls(f, (c) => !c.isNew && c.name === 'catchError')) {
    const cb = c.args[0];
    if (!cb || !(ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) continue;
    for (const ret of directReturns(cb)) {
      const shape = isEmptyOfCall(ret);
      if (shape) findings.push(`${enclosingName(c.node)} :: catchError returns ${shape}`);
    }
  }
  return findings;
};

export const pat04 = (p: Project): ArchRule =>
  contentRule(
    {
      id: 'PAT-04',
      title: 'inside catchError( in features/**/services/**, never return of([])/of(new Map())/of(new Set())/of({})/EMPTY (ADR-0064 §1)',
      mode: 'ratchet',
    },
    p,
    { subject: new RegExp(`${selectors.features(p).source}.*/services/.*\\.ts$`), finder: pat04Finder },
  );

// ---------------------------------------------------------------------------------------------
// PAT-05: no UTC-unsafe date shapes
// ---------------------------------------------------------------------------------------------

const isDateOnlyLiteral = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);

export const pat05Finder = (f: Source): string[] => {
  const findings: string[] = [];
  const sf = parse(f);

  for (const c of calls(f, (c) => c.isNew && c.name === 'Date')) {
    const arg = c.args[0];
    if (arg && ts.isStringLiteralLike(arg) && isDateOnlyLiteral(arg.text)) {
      findings.push(`${enclosingName(c.node)} :: new Date('${arg.text}') date-only literal parses as UTC`);
    }
  }

  for (const c of calls(f, (c) => !c.isNew && (c.name === 'slice' || c.name === 'substring'))) {
    if (!ts.isPropertyAccessExpression(c.node.expression)) continue;
    const receiver = c.node.expression.expression;
    if (!ts.isCallExpression(receiver) || !ts.isPropertyAccessExpression(receiver.expression) || receiver.expression.name.text !== 'toISOString') continue;
    const [a0, a1] = c.args;
    const isZeroTen = a0 && ts.isNumericLiteral(a0) && a0.text === '0' && a1 && ts.isNumericLiteral(a1) && a1.text === '10';
    if (isZeroTen) findings.push(`${enclosingName(c.node)} :: toISOString().${c.name}(0, 10) reads UTC, not local, date parts`);
  }

  walk(sf, (n) => {
    if (ts.isNumericLiteral(n) && n.getText().replace(/_/g, '') === '86400000') {
      findings.push(`${enclosingName(n)} :: ${n.getText()} ms/day literal ignores DST`);
    } else if (ts.isBinaryExpression(n) && n.getText().replace(/\s+/g, '') === '24*60*60*1000') {
      findings.push(`${enclosingName(n)} :: 24 * 60 * 60 * 1000 ms/day literal ignores DST`);
    } else if (
      ts.isPropertyDeclaration(n) &&
      n.name &&
      ts.isIdentifier(n.name) &&
      n.name.text === 'today' &&
      n.initializer &&
      ts.isNewExpression(n.initializer) &&
      ts.isIdentifier(n.initializer.expression) &&
      n.initializer.expression.text === 'Date' &&
      !(n.initializer.arguments && n.initializer.arguments.length)
    ) {
      findings.push(`${enclosingName(n)} :: class field 'today = new Date()' freezes at construction`);
    }
  });

  return findings;
};

export const pat05 = (p: Project): ArchRule =>
  contentRule(
    {
      id: 'PAT-05',
      title:
        "no new Date('YYYY-MM-DD') literal, .toISOString().slice/substring(0, 10), an 86400000/86_400_000/24*60*60*1000 ms-per-day literal, or a class field 'today = new Date()' (ADR-0038 §1, §6, §8)",
      mode: 'ratchet',
    },
    p,
    { subject: selectors.appTree(p), finder: pat05Finder },
  );

// ---------------------------------------------------------------------------------------------
// PAT-06 (Warn, SPEC project): no literal-date new Date('20YY-…') in a spec (ADR-0038 §7)
// ---------------------------------------------------------------------------------------------

export const pat06Finder = (f: Source): string[] =>
  calls(f, (c) => c.isNew && c.name === 'Date')
    .filter((c): c is typeof c & { args: [ts.StringLiteralLike] } => {
      const a = c.args[0];
      return !!a && ts.isStringLiteralLike(a) && /^\d{4}-/.test(a.text);
    })
    .map((c) => `${enclosingName(c.node)} :: new Date('${(c.args[0] as ts.StringLiteralLike).text}') literal date`);

export const pat06 = (p: Project = SPEC): ArchRule =>
  contentRule(
    { id: 'PAT-06', title: "no literal-date new Date('20YY-…') in a spec (ADR-0038 §7)", mode: 'warn' },
    p,
    { subject: new RegExp(`${appPrefix(p)}.*\\.spec\\.ts$`), finder: pat06Finder },
  );

// ---------------------------------------------------------------------------------------------
// PAT-07: no parameter default that reads a live signal in an apply* method
// ---------------------------------------------------------------------------------------------

export const pat07Finder = (f: Source): string[] => {
  const findings: string[] = [];
  walk(parse(f), (n) => {
    if (!ts.isMethodDeclaration(n) || !n.name || !ts.isIdentifier(n.name) || !n.name.text.startsWith('apply')) return;
    for (const param of n.parameters) {
      if (!param.initializer || !ts.isCallExpression(param.initializer) || param.initializer.arguments.length !== 0) continue;
      const callee = param.initializer.expression;
      if (ts.isPropertyAccessExpression(callee) && callee.expression.kind === ts.SyntaxKind.ThisKeyword) {
        const paramName = ts.isIdentifier(param.name) ? param.name.text : '?';
        findings.push(`${n.name!.text}(${paramName} = this.${callee.name.text}()) reads a live signal as a parameter default`);
      }
    }
  });
  return findings;
};

export const pat07 = (p: Project): ArchRule =>
  contentRule(
    { id: 'PAT-07', title: 'no parameter default that reads a live signal in an apply* method (ADR-0063 §1)', mode: 'enforce' },
    p,
    { subject: selectors.appTree(p), finder: pat07Finder },
  );

// ---------------------------------------------------------------------------------------------
// PAT-08: no console.* in production code, except an allowlisted logger location
// ---------------------------------------------------------------------------------------------

/** No allowlisted logger location exists yet — the plan's survey found none; every hit is debt. */
const CONSOLE_ALLOWLIST: RegExp[] = [];

export const pat08Finder = (f: Source): string[] =>
  calls(f, (c) => !c.isNew && c.callee.startsWith('console.')).map((c) => `${enclosingName(c.node)} :: ${c.callee}(...)`);

export const pat08 = (p: Project): ArchRule =>
  contentRule(
    { id: 'PAT-08', title: 'no console.* in production code, except an allowlisted logger location (best practice)', mode: 'ratchet' },
    p,
    { subject: selectors.appTree(p), except: CONSOLE_ALLOWLIST, finder: pat08Finder },
  );

export type { Source };
