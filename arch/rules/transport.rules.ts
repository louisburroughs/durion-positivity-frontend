import { type Source, calls, importSpecifiers, importedNames, stringLiterals, text, ts, walk } from '../support/ast';
import { type Project, file, selectors, under } from '../support/projects';
import { type ArchRule, type Finder, contentRule, dependencyRule } from '../support/rule';

/** `core/services/api-base.service.ts`, the legacy transport (ADR-0041 §2). */
const apiBaseService = (p: Project): RegExp => file(p, 'core/services/api-base.service.ts');

/** `app.config.ts`, the one place `environment`/`HttpClient` wiring is legitimate (ADR-0041 §3-4). */
const appConfig = (p: Project): RegExp => new RegExp(`^${p.app}/app\\.config`);

/** SDK-01/03/05/06 share this allowlist of files. */
const transportAllowlist = (p: Project): RegExp[] => [appConfig(p), apiBaseService(p), under(p, 'core/interceptors')];

/**
 * [SDK-01] `HttpClient`/`HttpBackend` may be imported only by app.config.ts, api-base.service.ts and
 * core/interceptors/** (ADR-0010 §2, 0041 §2, §4). `HttpErrorResponse`/`HttpParams` stay legal
 * everywhere, since only these two names are checked.
 */
const httpClientFinder: Finder = (f) =>
  importedNames(f, '@angular/common/http')
    .filter((n) => n.name === 'HttpClient' || n.name === 'HttpBackend')
    .map((n) => `'${n.name}'`);

export const sdk01 = (p: Project): ArchRule =>
  contentRule(
    { id: 'SDK-01', title: 'HttpClient/HttpBackend may be imported only by app.config.ts, api-base.service.ts and core/interceptors/** (ADR-0010 §2, 0041 §2, §4)', mode: 'enforce' },
    p,
    { subject: selectors.appTree(p), except: transportAllowlist(p), finder: httpClientFinder },
  );

/** [SDK-02] pages/** and components/** must not depend on ApiBaseService (ADR-0041 §2). */
export const sdk02 = (p: Project): ArchRule =>
  dependencyRule(
    { id: 'SDK-02', title: 'pages/** and components/** must not depend on ApiBaseService (ADR-0041 §2)', mode: 'enforce' },
    p,
    { subject: selectors.ui(p), target: apiBaseService(p) },
  );

/**
 * [SDK-03] Frozen importer list for ApiBaseService (ADR-0041 §2, "legacy migration infrastructure"):
 * no new file may depend on it. Baselined; shrinks with PRD-sdk-migration-completion.md.
 */
export const sdk03 = (p: Project): ArchRule =>
  dependencyRule(
    { id: 'SDK-03', title: 'no new file may depend on ApiBaseService (ADR-0041 §2)', mode: 'ratchet' },
    p,
    { subject: selectors.appTree(p), subjectExcept: [apiBaseService(p)], target: apiBaseService(p) },
  );

/** [SDK-04] No fetch(, XMLHttpRequest or new EventSource( in src/app/** (ADR-0041 §1). */
const rawTransportFinder: Finder = (f) =>
  calls(
    f,
    (c) =>
      (!c.isNew && c.name === 'fetch') ||
      (c.isNew && (c.name === 'XMLHttpRequest' || c.name === 'EventSource')),
  ).map((c) => (c.isNew ? `new ${c.name}(` : `${c.name}(`));

export const sdk04 = (p: Project): ArchRule =>
  contentRule(
    { id: 'SDK-04', title: 'No fetch(, XMLHttpRequest or new EventSource( in src/app/** (ADR-0041 §1)', mode: 'enforce' },
    p,
    { subject: selectors.appTree(p), finder: rawTransportFinder },
  );

/**
 * [SDK-05] No hardcoded backend paths in src/app/**, except app.config.ts (SDK basePath wiring) and
 * api-base.service.ts (ADR-0041 §2). Baselined; shrinks with SDK-03.
 */
const BACKEND_PATH_RE = [/^\/?(api\/)?[a-z][a-z-]*\/v\d+(\/|$)/, /^\/v\d+\//];
const backendPathFinder: Finder = (f) =>
  stringLiterals(f)
    .filter((l) => BACKEND_PATH_RE.some((re) => re.test(l.text)))
    .map((l) => `'${l.text}'`);

export const sdk05 = (p: Project): ArchRule =>
  contentRule(
    { id: 'SDK-05', title: 'No hardcoded backend paths in src/app/** (ADR-0041 §2)', mode: 'ratchet' },
    p,
    { subject: selectors.appTree(p), except: [appConfig(p), apiBaseService(p)], finder: backendPathFinder },
  );

/**
 * [SDK-06] `environment.apiBaseUrl` may be read only in app.config.ts and api-base.service.ts
 * (ADR-0041 §3-4). Baselined.
 */
const apiBaseUrlFinder: Finder = (f) => {
  const out: string[] = [];
  walk(f, (n) => {
    if (ts.isPropertyAccessExpression(n) && n.name.text === 'apiBaseUrl') out.push("'apiBaseUrl'");
  });
  return out;
};

export const sdk06 = (p: Project): ArchRule =>
  contentRule(
    { id: 'SDK-06', title: 'environment.apiBaseUrl may be read only in app.config.ts and api-base.service.ts (ADR-0041 §3-4)', mode: 'ratchet' },
    p,
    { subject: selectors.appTree(p), except: [appConfig(p), apiBaseService(p)], finder: apiBaseUrlFinder },
  );

/** [SDK-07] No absolute http(s):// literals in src/app/** (server.ts is out of scope) (ADR-0041). */
const absoluteUrlFinder: Finder = (f) => stringLiterals(f).filter((l) => /^https?:\/\//.test(l.text)).map((l) => `'${l.text}'`);

export const sdk07 = (p: Project): ArchRule =>
  contentRule(
    { id: 'SDK-07', title: 'No absolute http(s):// literals in src/app/** (ADR-0041)', mode: 'enforce' },
    p,
    { subject: selectors.appTree(p), finder: absoluteUrlFinder },
  );

/** [SDK-08] @durion-sdk/* is imported from the package root only, no deep @durion-sdk/x/… paths (ADR-0041 §1). */
/**
 * The one sanctioned subpath is `@durion-sdk/<pkg>/configuration`, and only in `app.config.ts`: that
 * secondary entry point exists so startup can provide `Configuration` without pulling the package's
 * services into `main` (#334).
 */
const deepSdkImportFinder: Finder = (f) =>
  importSpecifiers(f)
    .filter((i) => /^@durion-sdk\/[^/]+\/.+/.test(i.module))
    .filter((i) => !(/^src\/app\/app\.config\.ts$/.test(f.path) && /^@durion-sdk\/[^/]+\/configuration$/.test(i.module)))
    .map((i) => `'${i.module}'`);

export { deepSdkImportFinder };

export const sdk08 = (p: Project): ArchRule =>
  contentRule(
    {
      id: 'SDK-08',
      title: '@durion-sdk/* is imported from the package root only, except the /configuration entry point in app.config.ts (ADR-0041 §1)',
      mode: 'enforce',
    },
    p,
    { subject: selectors.appTree(p), finder: deepSdkImportFinder },
  );

/**
 * [SDK-09] `@durion-sdk/*` in pages/** or components/** means page-level SDK injection, a "temporary
 * shortcut" (ADR-0041 §3, SHOULD). Warn until SDK-03 < 5 importers (plan §8.2).
 */
const sdkImportFinder: Finder = (f) =>
  importSpecifiers(f).filter((i) => i.module.startsWith('@durion-sdk/')).map((i) => `'${i.module}'`);

export const sdk09 = (p: Project): ArchRule =>
  contentRule(
    { id: 'SDK-09', title: 'pages/** and components/** should not inject @durion-sdk/* directly (ADR-0041 §3)', mode: 'warn' },
    p,
    { subject: selectors.ui(p), finder: sdkImportFinder },
  );

/** [SDK-10] @durion-sdk/tenant may be imported only under features/platform/** (ADR-0062 §7). */
const tenantSdkFinder: Finder = (f) => importSpecifiers(f).filter((i) => i.module === '@durion-sdk/tenant').map(() => "'@durion-sdk/tenant'");

export const sdk10 = (p: Project): ArchRule =>
  contentRule(
    { id: 'SDK-10', title: '@durion-sdk/tenant may be imported only under features/platform/** (ADR-0062 §7)', mode: 'enforce' },
    p,
    { subject: selectors.appTree(p), except: [selectors.feature(p, 'platform')], finder: tenantSdkFinder },
  );

/**
 * [SDK-11] window.location.origin must not be used to build URLs (ADR-0041 §2). The one
 * offender (bulk-import.service.ts's tus upload URL) now uses `document.baseURI` plus the
 * injected SDK Configuration's basePath instead; zero debt promotes this to Enforce.
 */
const windowLocationOriginFinder: Finder = (f: Source) => {
  const out: string[] = [];
  walk(f, (n) => {
    if (!ts.isPropertyAccessExpression(n) || n.name.text !== 'origin') return;
    const obj = text(n.expression);
    if (obj === 'window.location' || obj === 'location') out.push(`'${obj}.origin'`);
  });
  return out;
};

export const sdk11 = (p: Project): ArchRule =>
  contentRule(
    { id: 'SDK-11', title: 'window.location.origin must not be used to build URLs (ADR-0041 §2)', mode: 'enforce' },
    p,
    { subject: selectors.appTree(p), finder: windowLocationOriginFinder },
  );
