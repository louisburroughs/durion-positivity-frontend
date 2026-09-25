import { type Project, file, selectors } from '../support/projects';
import { calls, identifiers, insideCallback, ts, walk, type Source } from '../support/ast';
import { elements, type TemplateElement } from '../support/templates';
import { type ArchRule, contentRule, templateRule } from '../support/rule';

/** Security and navigation (plan §5.4). */

// ── SEC-01 ───────────────────────────────────────────────────────────────────────────────────────

export function sec01Finder(f: Source): string[] {
  const out: string[] = [];
  walk({ path: f.path, content: f.content }, (n) => {
    // Any assignment operator writes HTML: `=` and compound forms such as `+=`.
    const assigns =
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      n.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
    if (assigns && ts.isPropertyAccessExpression(n.left)) {
      if (n.left.name.text === 'innerHTML') out.push('assignment to .innerHTML');
    }
    if (ts.isPropertyAccessExpression(n) && n.name.text === 'outerHTML') out.push('access: .outerHTML');
  });
  for (const c of calls(f)) {
    if (c.name === 'insertAdjacentHTML') out.push('call: insertAdjacentHTML(');
    else if (c.callee === 'document.write') out.push('call: document.write(');
    else if (/^bypassSecurityTrust/.test(c.name)) out.push(`call: ${c.name}(`);
  }
  for (const id of identifiers(f)) if (id.text === 'DomSanitizer') out.push('identifier: DomSanitizer');
  return out;
}

/** No raw-HTML sink and no sanitizer bypass anywhere in production TS. */
export const sec01 = (p: Project): ArchRule =>
  contentRule(
    { id: 'SEC-01', title: 'no innerHTML/outerHTML/DomSanitizer bypass sinks (ADR-0065 §1)', mode: 'enforce' },
    p,
    { subject: selectors.appTree(p), finder: sec01Finder },
  );

// ── SEC-02 (suite-hosted template rule) ─────────────────────────────────────────────────────────

export function sec02Finder(f: Source): string[] {
  const out: string[] = [];
  for (const el of elements(f)) {
    if (el.inputs.has('innerHTML')) out.push(`<${el.name} [innerHTML]>`);
    if (el.inputs.has('outerHTML')) out.push(`<${el.name} [outerHTML]>`);
  }
  return out;
}

/** No [innerHTML]/[outerHTML] binding in any template. */
export const sec02 = (p: Project): ArchRule =>
  templateRule({ id: 'SEC-02', title: 'no [innerHTML]/[outerHTML] binding in templates (ADR-0065 §1)', mode: 'enforce' }, p, {
    finder: sec02Finder,
  });

// ── SEC-03 ───────────────────────────────────────────────────────────────────────────────────────

export function sec03Finder(f: Source): string[] {
  const out: string[] = [];
  for (const c of calls(f)) {
    if (!c.isNew && c.name === 'eval') out.push('call: eval(');
    if (c.isNew && c.name === 'Function') out.push('call: new Function(');
  }
  return out;
}

/** No eval( or new Function(. */
export const sec03 = (p: Project): ArchRule =>
  contentRule({ id: 'SEC-03', title: 'no eval( or new Function( (OWASP)', mode: 'enforce' }, p, {
    subject: selectors.appTree(p),
    finder: sec03Finder,
  });

// ── SEC-04 ───────────────────────────────────────────────────────────────────────────────────────

export function sec04Finder(f: Source): string[] {
  const out: string[] = [];
  walk({ path: f.path, content: f.content }, (n) => {
    if (!ts.isBinaryExpression(n) || n.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;
    if (ts.isIdentifier(n.left) && n.left.text === 'location') out.push('assignment to location');
    if (ts.isPropertyAccessExpression(n.left) && n.left.name.text === 'href' && /location$/i.test(n.left.expression.getText())) {
      out.push('assignment to location.href');
    }
  });
  for (const c of calls(f)) {
    if ((c.name === 'assign' || c.name === 'replace') && /(^|\.)location\.(assign|replace)$/i.test(c.callee)) {
      out.push(`call: ${c.callee}(`);
    }
  }
  return out;
}

/** No assignment to location/location.href, and no location.assign/replace, outside the reload recovery. */
export const sec04 = (p: Project): ArchRule =>
  contentRule({ id: 'SEC-04', title: 'no bare location navigation outside chunk-error-recovery (ADR-0037)', mode: 'enforce' }, p, {
    subject: selectors.appTree(p),
    except: [file(p, 'core/router/chunk-error-recovery.ts')],
    finder: sec04Finder,
  });

// ── SEC-05 (suite-hosted template rule) ─────────────────────────────────────────────────────────

export function sec05Finder(f: Source): string[] {
  const out: string[] = [];
  for (const el of elements(f)) {
    if (el.name !== 'a' && el.name !== 'area') continue;
    const href = el.attrs.get('href');
    if (href === undefined) continue;
    if (/^https?:\/\//i.test(href)) {
      const rel = (el.attrs.get('rel') ?? '').toLowerCase();
      if (!rel.includes('noopener') || !rel.includes('noreferrer')) {
        out.push(`<${el.name} href="${href}"> external link missing rel noopener/noreferrer`);
      }
      continue;
    }
    if (href === '' || href.startsWith('#') || /^(mailto|tel):/i.test(href)) continue;
    if (el.attrs.has('routerLink') || el.inputs.has('routerLink')) continue;
    out.push(`<${el.name} href="${href}"> bare in-app href, use routerLink`);
  }
  return out;
}

/** In-app navigation is routerLink; no bare href="/…", and an external href carries a safe rel. */
export const sec05 = (p: Project): ArchRule =>
  templateRule({ id: 'SEC-05', title: 'in-app navigation uses routerLink, external links carry rel (ADR-0037 §1, §4)', mode: 'enforce' }, p, {
    finder: sec05Finder,
  });

// ── SEC-06 (suite-hosted template rule) ─────────────────────────────────────────────────────────

export function sec06Finder(f: Source): string[] {
  const out: string[] = [];
  for (const el of elements(f)) {
    if (el.name !== 'a' || !el.outputs.has('click')) continue;
    const hasHref = el.attrs.has('href') || el.inputs.has('href');
    const hasRouterLink = el.attrs.has('routerLink') || el.inputs.has('routerLink');
    if (!hasHref && !hasRouterLink) out.push('<a (click)> without href/routerLink — use <button>');
  }
  return out;
}

/** An <a> with a (click) handler and no href/routerLink must become a <button>. */
export const sec06 = (p: Project): ArchRule =>
  templateRule({ id: 'SEC-06', title: '<a (click)> without href/routerLink must be a <button> (ADR-0037 §3)', mode: 'enforce' }, p, {
    finder: sec06Finder,
  });

// ── SEC-07 ───────────────────────────────────────────────────────────────────────────────────────

export function sec07Finder(f: Source): string[] {
  const out: string[] = [];
  walk({ path: f.path, content: f.content }, (n) => {
    if (n.kind !== ts.SyntaxKind.RegularExpressionLiteral) return;
    const t = (n as ts.RegularExpressionLiteral).text;
    if (/https\?/i.test(t) && /mailto/i.test(t)) out.push(`regex literal: ${t}`);
  });
  return out;
}

/** URL scheme-allowlist regexes live only in the shared safe-href util. */
export const sec07 = (p: Project): ArchRule =>
  contentRule({ id: 'SEC-07', title: 'URL scheme validation lives only in shared/utils/safe-href.util.ts (ADR-0065 §2)', mode: 'enforce' }, p, {
    subject: selectors.appTree(p),
    except: [file(p, 'shared/utils/safe-href.util.ts')],
    finder: sec07Finder,
  });

// ── SEC-08 ───────────────────────────────────────────────────────────────────────────────────────

export function sec08Finder(f: Source): string[] {
  return calls(f, (c) => c.name === 'revokeObjectURL')
    .filter((c) => !insideCallback(c.node, 'setTimeout'))
    .map(() => 'URL.revokeObjectURL not inside setTimeout(');
}

/** URL.revokeObjectURL runs inside a setTimeout callback, never synchronously after .click(). */
export const sec08 = (p: Project): ArchRule =>
  contentRule({ id: 'SEC-08', title: 'URL.revokeObjectURL runs inside setTimeout( (ADR-0065 §3)', mode: 'enforce' }, p, {
    subject: selectors.appTree(p),
    finder: sec08Finder,
  });

// ── SEC-09 (suite-hosted template rule) ─────────────────────────────────────────────────────────

function hasAttr(el: TemplateElement, name: string): boolean {
  return el.attrs.has(name) || el.inputs.has(name);
}

export function sec09Finder(f: Source): string[] {
  const out: string[] = [];
  for (const el of elements(f)) {
    if (el.name === 'dialog') {
      // A <dialog> is the right element but must carry the directive: without it, a JS-driven
      // dialog can be opened with show() (no top layer, focus trap or implicit aria-modal).
      if (!hasAttr(el, 'appModalDialog')) {
        out.push(el.attrs.has('open') ? '<dialog open> without appModalDialog' : '<dialog> without appModalDialog');
      }
      continue;
    }
    const roleDialog = (el.attrs.get('role') ?? '').toLowerCase() === 'dialog';
    const hasAriaModal = hasAttr(el, 'aria-modal');
    if (roleDialog || hasAriaModal) {
      const what = [roleDialog ? 'role="dialog"' : null, hasAriaModal ? 'aria-modal' : null].filter(Boolean).join('+');
      out.push(`<${el.name}> carries ${what} without being <dialog appModalDialog>`);
    }
  }
  return out;
}

/** aria-modal/role="dialog" only on <dialog appModalDialog>, never on a div/section. */
export const sec09 = (p: Project): ArchRule =>
  templateRule({ id: 'SEC-09', title: 'aria-modal/role="dialog" only on <dialog appModalDialog> (ADR-0029 §8.1)', mode: 'enforce' }, p, {
    finder: sec09Finder,
  });
