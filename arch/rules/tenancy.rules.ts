import { type Project, file, selectors, under } from '../support/projects';
import { calls, enclosing, identifiers, propertyKeys, stringLiterals, ts, walk, type Source } from '../support/ast';
import { type ArchRule, contentRule } from '../support/rule';

/**
 * Tenancy (plan §5.3). ADR-0062 supersedes ADR-0023: the tenant lives only in the JWT `tid` claim
 * and never travels in a request body, query string or header. None of these rules ban the word
 * "tenant" — the platform-admin registry (a tenant is the administered resource) and the login
 * `tenantSlug` contract are legitimate carve-outs, allowlisted below rather than exempted by regex.
 */

// ── TEN-01 ───────────────────────────────────────────────────────────────────────────────────────

const TEN01_HEADERS = new Set(
  ['X-Tenant-Id', 'X-Tenant-Slug', 'X-Loc-Fin-Bits', 'X-Loc-Oth-Bits', 'X-Loc-Scope'].map((h) => h.toLowerCase()),
);

export function ten01Finder(f: Source): string[] {
  return stringLiterals(f)
    .filter((lit) => TEN01_HEADERS.has(lit.text.trim().toLowerCase()))
    .map((lit) => `string literal: ${lit.text}`);
}

/** No string literal equal to a tenant/location header name, anywhere in production code. */
export const ten01 = (p: Project): ArchRule =>
  contentRule(
    { id: 'TEN-01', title: 'no tenant/location header string literals (ADR-0062 §3, ADR-0061 §3)', mode: 'enforce' },
    p,
    { subject: selectors.appTree(p), finder: ten01Finder },
  );

// ── TEN-02 ───────────────────────────────────────────────────────────────────────────────────────

const TEN02_NAMES = new Set(['tenantId', 'tenant_id', 'tenantID', 'tid']);

/**
 * True when `id` names a value the code would go on to *send* (a declaration, a parameter, an
 * object-literal key). False for a property-access *read* (`claims.tid`, TEN-05's concern, not
 * this rule's) and for a type position (`{ tid?: string }`), which declares a shape, not a value.
 */
export function isOutboundValuePosition(id: { node: ts.Node }): boolean {
  const parent = id.node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === id.node) return false;
  if (ts.isPropertySignature(parent) && parent.name === id.node) return false;
  if (ts.isQualifiedName(parent)) return false;
  return true;
}

export function ten02Finder(f: Source): string[] {
  const out: string[] = [];
  for (const id of identifiers(f)) if (TEN02_NAMES.has(id.text) && isOutboundValuePosition(id)) out.push(`identifier: ${id.text}`);
  for (const k of propertyKeys(f)) if (TEN02_NAMES.has(k.text)) out.push(`property key: ${k.text}`);
  for (const lit of stringLiterals(f)) if (TEN02_NAMES.has(lit.text)) out.push(`string literal: ${lit.text}`);
  return out;
}

/** Outside core/** and features/platform/**, no tenant id ever appears as an identifier, key or literal. */
export const ten02 = (p: Project): ArchRule =>
  contentRule(
    { id: 'TEN-02', title: 'no tenantId identifier/key/literal outside core and platform (ADR-0062 §3)', mode: 'enforce' },
    p,
    { subject: selectors.appTree(p), except: [selectors.core(p), under(p, 'features/platform')], finder: ten02Finder },
  );

// ── TEN-03 ───────────────────────────────────────────────────────────────────────────────────────

/**
 * The login contract. `core/utils/form-validators.ts` is a deviation from the plan's literal list:
 * it exports the shared `tenantSlug` reactive-form validator consumed by both the login page and
 * `features/platform` tenant-create page. It normalises/validates the slug the user typed — it
 * never reads one from a route or forwards one to a request — so it belongs with the contract it
 * validates, not with the ADR-0062 §3 leak this rule polices.
 */
export const ten03Allow = (p: Project): RegExp[] => [
  file(p, 'core/services/auth.service.ts'),
  file(p, 'core/services/last-tenant.service.ts'),
  file(p, 'core/models/auth.models.ts'),
  file(p, 'core/security/tenant.ts'),
  file(p, 'core/utils/form-validators.ts'),
  under(p, 'features/auth'),
  under(p, 'features/platform'),
];

export function ten03Finder(f: Source): string[] {
  const out: string[] = [];
  for (const id of identifiers(f)) if (id.text === 'tenantSlug') out.push('identifier: tenantSlug');
  for (const k of propertyKeys(f)) if (k.text === 'tenantSlug') out.push('property key: tenantSlug');
  for (const lit of stringLiterals(f)) if (lit.text === 'tenantSlug') out.push('string literal: tenantSlug');
  return out;
}

/** `tenantSlug` is the login/tenant-create contract; it may not leak into any other file. */
export const ten03 = (p: Project): ArchRule =>
  contentRule(
    { id: 'TEN-03', title: 'tenantSlug confined to the login/platform contract (ADR-0062 §3, §7)', mode: 'enforce' },
    p,
    { subject: selectors.appTree(p), except: ten03Allow(p), finder: ten03Finder },
  );

// ── TEN-04 ───────────────────────────────────────────────────────────────────────────────────────

export function ten04Finder(f: Source): string[] {
  const out: string[] = [];
  for (const c of calls(f)) {
    if (!c.isNew && c.name === 'atob') out.push('call: atob(');
    else if (!c.isNew && c.name === 'jwtDecode') out.push('call: jwtDecode(');
    else if (
      !c.isNew &&
      c.name === 'split' &&
      c.args[0] &&
      ts.isStringLiteralLike(c.args[0]) &&
      c.args[0].text === '.' &&
      /(^|\.)token\.split$/i.test(c.callee)
    ) {
      out.push(`call: ${c.callee}('.')`);
    }
  }
  return out;
}

/** Only core/** decodes the access token. Features read identity from AuthService. */
export const ten04 = (p: Project): ArchRule =>
  contentRule(
    { id: 'TEN-04', title: 'only core/** decodes the access token (ADR-0062 §3, ADR-0065 §4)', mode: 'enforce' },
    p,
    { subject: selectors.appTree(p), except: [selectors.core(p)], finder: ten04Finder },
  );

// ── TEN-05 ───────────────────────────────────────────────────────────────────────────────────────

export const ten05Allow = (p: Project): RegExp[] => [
  file(p, 'features/shell/utils/identity.util.ts'),
  file(p, 'features/shell/services/chat-history.store.ts'),
  file(p, 'features/shell/services/chat-blob.service.ts'),
];

export function ten05Finder(f: Source): string[] {
  const out: string[] = [];
  walk(f, (n) => {
    if (ts.isPropertyAccessExpression(n) && n.name.text === 'tid') out.push('property access: .tid');
  });
  return out;
}

/** Only core/** and the named tenant-scoped stores read the `.tid` claim (ADR-0065 keys need it). */
export const ten05 = (p: Project): ArchRule =>
  contentRule(
    { id: 'TEN-05', title: 'only core and named tenant-scoped stores read .tid (ADR-0065 §4-5)', mode: 'enforce' },
    p,
    { subject: selectors.appTree(p), except: [selectors.core(p), ...ten05Allow(p)], finder: ten05Finder },
  );

// ── TEN-06 ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Browser-storage classification table (plan §5.3, §11.4). This is the "classification in
 * support/projects.ts" the plan describes, relocated here because support/projects.ts is owned by
 * another agent's slice of this plan.
 *
 * - Tenant-scoped: keys on both the `tid` and `sub` claims (ADR-0065 §4), so one person signed into
 *   two tenants gets two slots.
 * - Preference: a plain browser convenience, never an input to authorization or a per-tenant key.
 *   Marked in the source with `// arch: non-tenant storage — <reason>` so the marker is the audit
 *   trail, not this table alone.
 */
export const TEN06_TENANT_SCOPED = (p: Project): RegExp[] => [
  file(p, 'core/services/auth.service.ts'),
  file(p, 'features/shell/services/chat-history.store.ts'),
];

export const TEN06_PREFERENCE = (p: Project): RegExp[] => [
  file(p, 'core/services/theme.service.ts'),
  file(p, 'core/services/locale.service.ts'),
  file(p, 'features/shell/services/chat-ui.service.ts'),
  file(p, 'core/services/last-tenant.service.ts'),
  file(p, 'core/router/chunk-error-recovery.ts'),
];

const TEN06_STORAGE_NAMES = new Set(['localStorage', 'sessionStorage', 'indexedDB']);
export const TEN06_MARKER_RE = /\/\/\s*arch:\s*non-tenant storage\s*—/;

export const ten06Finder =
  (p: Project) =>
  (f: Source): string[] => {
    const usesStorage = identifiers(f).some((id) => TEN06_STORAGE_NAMES.has(id.text));
    if (!usesStorage) return [];
    if (TEN06_TENANT_SCOPED(p).some((r) => r.test(f.path))) {
      const out: string[] = [];
      if (!/\btid\b/.test(f.content)) out.push('tenant-scoped storage file must reference tid');
      if (!/\bsub\b/.test(f.content)) out.push('tenant-scoped storage file must reference sub');
      return out;
    }
    if (TEN06_PREFERENCE(p).some((r) => r.test(f.path))) {
      return TEN06_MARKER_RE.test(f.content)
        ? []
        : ['preference storage file missing "// arch: non-tenant storage — <reason>" marker'];
    }
    return ['unclassified storage user: classify in arch/rules/tenancy.rules.ts (TEN-06)'];
  };

/** Every localStorage/sessionStorage/indexedDB user is classified as tenant-scoped or preference. */
export const ten06 = (p: Project): ArchRule =>
  contentRule(
    { id: 'TEN-06', title: 'browser storage is classified tenant-scoped or preference (ADR-0065 §4, §6)', mode: 'enforce' },
    p,
    { subject: selectors.appTree(p), finder: ten06Finder(p) },
  );

// ── TEN-07 ───────────────────────────────────────────────────────────────────────────────────────

/** True when `node` sits inside the `try` block (not the `catch`/`finally`) of some TryStatement. */
export function inTryBlock(node: ts.Node): boolean {
  let cur: ts.Node | undefined = node;
  while (cur) {
    const parent: ts.Node | undefined = cur.parent;
    if (parent && ts.isTryStatement(parent) && parent.tryBlock === cur) return true;
    cur = parent;
  }
  return false;
}

export function ten07Finder(f: Source): string[] {
  const out: string[] = [];
  const allCalls = calls(f);
  for (const c of allCalls) {
    if (c.name === 'setItem' && /\.setItem$/.test(c.callee) && !inTryBlock(c.node)) {
      out.push(`setItem not wrapped in try: ${c.callee}(`);
    }
  }
  for (const c of allCalls) {
    if (c.callee !== 'JSON.parse') continue;
    const fn = enclosing(c.node, (n): n is ts.FunctionLikeDeclaration => ts.isFunctionLike(n));
    if (!fn) continue;
    const readsStorage = allCalls.some(
      (cc) => /\.getItem$/.test(cc.callee) && cc.node.getStart() >= fn.getStart() && cc.node.getEnd() <= fn.getEnd(),
    );
    if (readsStorage && !inTryBlock(c.node)) out.push('JSON.parse of a storage read not wrapped in try');
  }
  return out;
}

/** A storage write must be inside try; JSON.parse of a value that same function read from storage too. */
export const ten07 = (p: Project): ArchRule =>
  contentRule(
    { id: 'TEN-07', title: 'storage setItem/JSON.parse must sit inside try (ADR-0065 §6)', mode: 'enforce' },
    p,
    { subject: selectors.appTree(p), finder: ten07Finder },
  );

// ── TEN-08 ───────────────────────────────────────────────────────────────────────────────────────

export function ten08Finder(f: Source): string[] {
  const out: string[] = [];
  for (const id of identifiers(f)) if (id.text === 'organizationId') out.push('identifier: organizationId');
  for (const k of propertyKeys(f)) if (k.text === 'organizationId') out.push('property key: organizationId');
  return out;
}

/**
 * No `organizationId` field is introduced anywhere (ADR-0062 §4, ADR-0023 §2). The last
 * remnant usages (accounting event list/detail, CRM integration events — display-only,
 * never sent in a request) were removed under issue #339; zero debt promotes this to Enforce.
 */
export const ten08 = (p: Project): ArchRule =>
  contentRule(
    { id: 'TEN-08', title: 'no organizationId field (ADR-0062 §4, ADR-0023 §2)', mode: 'enforce' },
    p,
    { subject: selectors.appTree(p), finder: ten08Finder },
  );
