import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseTemplate, TmplAstElement, TmplAstText } from '@angular/compiler';
import { calls, parse, ts, walk, type Source } from '../support/ast';
import { selectors, type Project } from '../support/projects';
import { type ArchRule, contentRule } from '../support/rule';

/**
 * CON-01..09 (plan §5.5). Selectors here are file-local (plan §11.3.1's centralisation applies to
 * `support/projects.ts`, which this agent's scope may not edit — these compose the exported
 * `selectors`/`under` primitives instead of duplicating their escaping logic).
 */

const appPrefix = (p: Project): string => selectors.appTree(p).source; // e.g. "^src/app/"

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

// ---------------------------------------------------------------------------------------------
// CON-01: a *.service.ts under features/** lives in a services/ folder (ADR-0010 §5)
// ---------------------------------------------------------------------------------------------

export const con01Finder = (_f: Source): string[] => ['not under services/ folder'];

export const con01 = (p: Project): ArchRule =>
  contentRule(
    { id: 'CON-01', title: 'a *.service.ts under features/** lives in a services/ folder (ADR-0010 §5)', mode: 'ratchet' },
    p,
    {
      subject: new RegExp(`${selectors.features(p).source}.*\\.service\\.ts$`),
      except: [selectors.services(p)],
      finder: con01Finder,
    },
  );

// ---------------------------------------------------------------------------------------------
// CON-02: every *.service.ts/*.store.ts in features/** and core/** has a co-located *.spec.ts
// ---------------------------------------------------------------------------------------------

export const con02Finder = (f: Source): string[] => (existsSync(f.path.replace(/\.ts$/, '.spec.ts')) ? [] : ['missing co-located spec']);

// Was Ratchet with one entry (core/services/theme.service.ts) when this suite was written; a
// concurrent change on this branch added that spec while this agent was working, so the rule is
// clean today. Switched to Enforce per the baseline ratchet's own rule (`arch/support/baseline.ts`
// throws "Ratchet with no debt: switch it to Enforce").
export const con02 = (p: Project): ArchRule =>
  contentRule(
    { id: 'CON-02', title: 'every *.service.ts/*.store.ts in features/** and core/** has a co-located *.spec.ts (ADR-0032 §3, ADR-0035 §1, §4)', mode: 'enforce' },
    p,
    {
      subject: new RegExp(`${appPrefix(p)}(features|core)/.*\\.(service|store)\\.ts$`),
      finder: con02Finder,
    },
  );

// ---------------------------------------------------------------------------------------------
// CON-03 (Warn): every public method of a *Service class is named in a describe/it title or
// called in its sibling spec — the stronger version of CON-02 (ADR-0035 §1).
// ---------------------------------------------------------------------------------------------

export const con03Finder = (f: Source): string[] => {
  const specPath = f.path.replace(/\.ts$/, '.spec.ts');
  if (!existsSync(specPath)) return []; // CON-02 already flags this
  const specText = readFileSync(specPath, 'utf8');
  const findings: string[] = [];
  walk(parse(f), (n) => {
    if (!ts.isClassDeclaration(n) || !n.name?.text.endsWith('Service')) return;
    for (const m of n.members) {
      if (!ts.isMethodDeclaration(m) || !m.name || !ts.isIdentifier(m.name)) continue;
      const isNonPublic = m.modifiers?.some((md) => md.kind === ts.SyntaxKind.PrivateKeyword || md.kind === ts.SyntaxKind.ProtectedKeyword);
      if (isNonPublic) continue;
      const name = m.name.text;
      if (!specText.includes(name)) findings.push(`${n.name!.text}.${name} not referenced in sibling spec`);
    }
  });
  return findings;
};

export const con03 = (p: Project): ArchRule =>
  contentRule(
    { id: 'CON-03', title: 'every public method of a *Service class is named in a describe/it title or called in its sibling spec (ADR-0035 §1)', mode: 'warn' },
    p,
    {
      subject: new RegExp(`${appPrefix(p)}(features|core)/.*\\.service\\.ts$`),
      finder: con03Finder,
    },
  );

// ---------------------------------------------------------------------------------------------
// CON-04: every @Component under pages/**|components/** follows the four-file convention
// ---------------------------------------------------------------------------------------------

/** True when an inline template's whole markup is one root element (§11.4 tuning). */
function isSingleElementTemplate(html: string): boolean {
  try {
    const { nodes } = parseTemplate(html, 'con04-inline.html', { preserveWhitespaces: false });
    const meaningful = nodes.filter((n) => !(n instanceof TmplAstText && n.value.trim() === ''));
    return meaningful.length === 1 && meaningful[0] instanceof TmplAstElement;
  } catch {
    return false;
  }
}

export const con04Finder = (f: Source): string[] => {
  const comp = calls(f, (c) => !c.isNew && c.name === 'Component').find((c) => c.args[0] && ts.isObjectLiteralExpression(c.args[0]));
  if (!comp) return []; // not a @Component file (e.g. a model/service nested under pages/components)
  const meta = comp.args[0] as ts.ObjectLiteralExpression;
  const prop = (name: string): ts.PropertyAssignment | undefined =>
    meta.properties.find((pr): pr is ts.PropertyAssignment => ts.isPropertyAssignment(pr) && ts.isIdentifier(pr.name) && pr.name.text === name);

  const templateProp = prop('template');
  const templateUrlProp = prop('templateUrl');
  const styleProp = prop('styleUrl') ?? prop('styleUrls');

  if (templateProp && !templateUrlProp && ts.isStringLiteralLike(templateProp.initializer) && isSingleElementTemplate(templateProp.initializer.text)) {
    return []; // §11.4: a single-element inline template is exempt, matching the i18n TS checker
  }

  const findings: string[] = [];
  if (!existsSync(f.path.replace(/\.ts$/, '.spec.ts'))) findings.push('missing spec');

  if (templateUrlProp && ts.isStringLiteralLike(templateUrlProp.initializer)) {
    const htmlPath = path.join(path.dirname(f.path), templateUrlProp.initializer.text);
    if (!existsSync(htmlPath)) findings.push('missing html');
  }
  if (styleProp) {
    const init = styleProp.initializer;
    const urls = ts.isArrayLiteralExpression(init)
      ? init.elements.filter(ts.isStringLiteralLike).map((e) => e.text)
      : ts.isStringLiteralLike(init)
        ? [init.text]
        : [];
    for (const u of urls) {
      if (!existsSync(path.join(path.dirname(f.path), u))) findings.push(`missing css (${u})`);
    }
  }
  return findings;
};

export const con04 = (p: Project): ArchRule =>
  contentRule(
    {
      id: 'CON-04',
      title: 'a @Component under pages/**|components/** follows the four-file convention: .ts/.html/.css/.spec.ts (CLAUDE.md, ADR-0035)',
      mode: 'enforce',
    },
    p,
    { subject: selectors.ui(p), finder: con04Finder },
  );

// ---------------------------------------------------------------------------------------------
// CON-05: the four security-audit interfaces live only in security-audit.models.ts
// ---------------------------------------------------------------------------------------------

const AUDIT_INTERFACES = new Set(['AuditEventFilter', 'AuditEventDetail', 'AuditEventPageResponse', 'AuditExportJob']);

export const con05Finder = (f: Source): string[] => {
  const findings: string[] = [];
  walk(parse(f), (n) => {
    if (ts.isInterfaceDeclaration(n) && n.name && AUDIT_INTERFACES.has(n.name.text)) {
      findings.push(`interface ${n.name.text} declared outside security-audit.models.ts`);
    }
  });
  return findings;
};

export const con05 = (p: Project): ArchRule =>
  contentRule(
    {
      id: 'CON-05',
      title: 'AuditEventFilter/AuditEventDetail/AuditEventPageResponse/AuditExportJob are declared only in features/security/models/security-audit.models.ts (ADR-0036 §1)',
      mode: 'enforce',
    },
    p,
    {
      subject: selectors.appTree(p),
      except: [new RegExp(`${appPrefix(p)}features/security/models/security-audit\\.models\\.ts$`)],
      finder: con05Finder,
    },
  );

// ---------------------------------------------------------------------------------------------
// CON-06: no @NgModule, no standalone: false
// ---------------------------------------------------------------------------------------------

export const con06Finder = (f: Source): string[] => {
  const findings: string[] = [];
  if (calls(f, (c) => !c.isNew && c.name === 'NgModule').length) findings.push('@NgModule used');
  walk(parse(f), (n) => {
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === 'standalone' && n.initializer.kind === ts.SyntaxKind.FalseKeyword) {
      findings.push(`${enclosingName(n)} :: standalone: false`);
    }
  });
  return findings;
};

export const con06 = (p: Project): ArchRule =>
  contentRule(
    { id: 'CON-06', title: 'no @NgModule and no standalone: false (Angular 22 standalone-only, CLAUDE.md)', mode: 'enforce' },
    p,
    { subject: selectors.appTree(p), finder: con06Finder },
  );

// ---------------------------------------------------------------------------------------------
// CON-07: server-generated timestamp fields in models/** interfaces are readonly, optional and
// carry @serverGenerated (ADR-0034 §1, §3)
// ---------------------------------------------------------------------------------------------

const SERVER_TIMESTAMP_FIELDS = new Set(['createdAt', 'updatedAt', 'requestedAt', 'approvedAt', 'issuedAt', 'completedAt', 'cancelledAt']);

function leadingTrivia(sf: ts.SourceFile, n: ts.Node): string {
  const full = n.getFullText(sf);
  const own = n.getText(sf);
  return full.slice(0, full.length - own.length);
}

export const con07Finder = (f: Source): string[] => {
  const sf = parse(f);
  const findings: string[] = [];
  walk(sf, (n) => {
    if (!ts.isPropertySignature(n) || !n.name || !ts.isIdentifier(n.name) || !SERVER_TIMESTAMP_FIELDS.has(n.name.text)) return;
    const iface = ts.isInterfaceDeclaration(n.parent) ? n.parent.name.text : 'anonymous';
    const isReadonly = n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword);
    const isOptional = !!n.questionToken;
    if (!isReadonly || !isOptional) findings.push(`${iface}.${n.name.text} :: not readonly/optional`);
    if (!leadingTrivia(sf, n).includes('@serverGenerated')) findings.push(`${iface}.${n.name.text} :: missing @serverGenerated`);
  });
  return findings;
};

export const con07 = (p: Project): ArchRule =>
  contentRule(
    {
      id: 'CON-07',
      title: 'server-generated timestamp fields in models/** interfaces are readonly, optional, and carry @serverGenerated (ADR-0034 §1, §3)',
      mode: 'enforce',
    },
    p,
    { subject: selectors.models(p), finder: con07Finder },
  );

// ---------------------------------------------------------------------------------------------
// CON-08: a server-generated key must not appear in an object literal sent to a create*/update*
// SDK call or an ApiBaseService post/put/patch (ADR-0034 §2)
// ---------------------------------------------------------------------------------------------

function objectLiteralServerKeys(obj: ts.ObjectLiteralExpression): string[] {
  const found: string[] = [];
  for (const pr of obj.properties) {
    if ((ts.isPropertyAssignment(pr) || ts.isShorthandPropertyAssignment(pr)) && ts.isIdentifier(pr.name) && SERVER_TIMESTAMP_FIELDS.has(pr.name.text)) {
      found.push(pr.name.text);
    }
  }
  return found;
}

export const con08Finder = (f: Source): string[] => {
  const findings: string[] = [];
  const writeCalls = calls(f, (c) => !c.isNew && (/^(create|update)[A-Z]/.test(c.name) || c.name === 'post' || c.name === 'put' || c.name === 'patch'));
  for (const c of writeCalls) {
    for (const arg of c.args) {
      if (!ts.isObjectLiteralExpression(arg)) continue;
      for (const key of objectLiteralServerKeys(arg)) {
        findings.push(`${enclosingName(c.node)} :: ${c.callee}(...) sends server-generated key "${key}"`);
      }
    }
  }
  return findings;
};

export const con08 = (p: Project): ArchRule =>
  contentRule(
    {
      id: 'CON-08',
      title: 'a server-generated key must not appear in an object literal passed to an SDK create*/update* call or ApiBaseService post/put/patch (ADR-0034 §2)',
      mode: 'enforce',
    },
    p,
    { subject: selectors.appTree(p), finder: con08Finder },
  );

// ---------------------------------------------------------------------------------------------
// CON-09 (Ratchet): only one of util/ and utils/ — utils/ is the chosen name (plan §8.4)
// ---------------------------------------------------------------------------------------------

export const con09Finder = (_f: Source): string[] => ['file under a util/ folder — rename the folder to utils/'];

export const con09 = (p: Project): ArchRule =>
  contentRule(
    { id: 'CON-09', title: 'only utils/ is used as the folder name, not util/ (hygiene, plan §8.4)', mode: 'ratchet' },
    p,
    { subject: new RegExp(`${appPrefix(p)}.*/util/`), finder: con09Finder },
  );

export type { Source };
