# Architecture tests with ArchUnitTS

**Status:** accepted; Phase 0 complete (§11) · **Owner:** frontend · **Created:** 2026-09-24

The architecture rules in this repo exist only as prose, in the ADRs, `AGENTS.md` and `CLAUDE.md`.
Nothing mechanical stops a page from composing a backend URL, a feature from importing another
feature's models, or a request from carrying a tenant id. ESLint runs only the stock presets, with no
`no-restricted-imports` and no boundaries plugin. The only guard outside ESLint is the one-off
node spec `supplier-contract-coverage.spec.ts`.

This plan adds an **executable architecture suite** built on
[ArchUnitTS](https://github.com/LukasNiessen/ArchUnitTS) (`archunit` on npm, 2.5.x). The suite does
three things:

- It encodes the enforceable parts of the accepted frontend ADRs, plus rules for tenancy, SDK
  transport and i18n.
- It fails CI on any **new** violation.
- It keeps today's debt in explicit, shrink-only baselines, so the codebase ratchets toward
  compliance instead of needing a big-bang cleanup.

---

## 1. Scope and non-goals

**In scope**
- Structural and dependency rules: layers, feature isolation, cycles, and file placement.
- TS content rules that need project-wide context, such as allowlists, baselines and cross-file
  facts. Examples: "only these files may touch `localStorage`", or "the tenant header never appears
  in a string literal".
- Template (`*.html`) and locale-file rules that belong to the same ADRs, run from the same suite
  (see §3.4).
- Wrapping the existing i18n checkers so i18n is gated from the suite (§5.7).

**Out of scope**
- **Rules ESLint already owns**, for example `@typescript-eslint/no-explicit-any` (ADR-0032) from
  `typescript-eslint` recommended, and the angular-eslint template a11y preset. The suite never
  duplicates a rule that ESLint reports.
- **Runtime or behavioural ADR clauses** that no static check can prove, for example ADR-0063 §2
  (one counter per writer), ADR-0064 §6 (403 polling stop) and ADR-0035 §5 (load-bearing tests).
  They stay in the PR checklist.
- **CSS rules** (ADR-0029 §8.2 `.sr-only`, §8.11 focus ring, ADR-0039 tokens). They belong in
  stylelint; §9 lists them as a follow-up.

## 2. Tool facts that shape the design

Each of these was verified against `archunit@2.5.4`'s published typings and README.

| Fact | Consequence |
| --- | --- |
| `projectFiles(tsConfigPath?)` builds its graph from a tsconfig. | Point it at **`tsconfig.app.json`**. The root `tsconfig.json` is a solution file (`files: []`) and would yield an empty graph, and `tsconfig.app.json` already excludes specs. A second instance on `tsconfig.spec.json` serves the spec-side rules. |
| `dependOnFiles()` "only checks internal dependencies… and ignores external libraries". | Imports of **packages** (`@angular/common/http`, `@durion-sdk/*`) can't be expressed as dependency rules. They are written as `adhereTo(FileInfo)` content rules (§3.2). |
| `adhereTo(fn, message)` receives `FileInfo { path, name, directory, content, linesOfCode }`. | Content rules parse `content` with the TypeScript compiler API (§3.2), which strips comments and avoids regex false positives. For example, two positivity files mention `ApiBaseService` only in comments. |
| `inFolder(..., { except: {...} })` is supported on both the subject and the dependency side. | "Feature A must not depend on any other feature" can be one rule per domain, generated from the folder list. |
| `toPassAsync()` needs Vitest `globals: true`. `.check()` returns `Violation[]` (`ViolatingFileDependency`, `ViolatingCycle`, `CustomFileViolation`, …). | Rules without debt use `toPassAsync()` for readable failures. Baselined rules use `.check()` and diff the result against the baseline (§3.3). |
| Since 2.5.0 a broken *referenced* tsconfig throws `TechnicalError`. | That behaviour is wanted, so leave `ignoreReferencedConfigErrors` off. |
| `archunit` has a hard dependency on `typescript ^5.9.3`. The repo pins `~6.0.3`. | npm nests a private TS 5.9 for ArchUnitTS. **Confirmed in Phase 0** (§11.1): it reads the same 382 files as TS 6, so no `overrides` is needed. A self-test guards file-set parity from here on. Our own AST helpers import the root `typescript` 6. |
| The Angular `ng test` builder runs specs in Chromium (browser mode). | ArchUnitTS reads the filesystem, so it **must not** run under `ng test`. It runs in plain-node Vitest, like the existing `test:contracts` precedent. |

## 3. Harness design

### 3.1 Layout and wiring

```
arch/                                  # outside src/ → invisible to ng test, tsconfig.app/spec globs
  vitest.arch.config.ts                # environment: 'node', globals: true, include arch/**/*.arch.spec.ts
  tsconfig.json                        # typechecks the arch suite itself (node types, root typescript)
  support/
    projects.ts                        # APP = 'tsconfig.app.json', SPEC = 'tsconfig.spec.json', featureDomains()
    ast.ts                             # parse(FileInfo) → imports, string literals, calls, property keys (comments stripped)
    baseline.ts                        # expectWithinBaseline(ruleId, violations) — the ratchet
    templates.ts                       # templateFiles(glob) → { path, content } for *.html rules
    violation-key.ts                   # stable string key per Violation subtype
  baselines/
    <RULE-ID>.json                     # [{ "key": "...", "reason": "...", "tracking": "#issue" }]
  rules/
    layers.arch.spec.ts                # §5.1
    transport.arch.spec.ts             # §5.2
    tenancy.arch.spec.ts               # §5.3
    security.arch.spec.ts              # §5.4
    conventions.arch.spec.ts           # §5.5
    patterns.arch.spec.ts              # §5.6
    i18n.arch.spec.ts                  # §5.7
    reports.arch.spec.ts               # §5.8 (non-gating)
  README.md                            # how to read a failure, add a rule, and shrink a baseline
```

Wiring changes:

- `package.json`:
  - add `"test:arch": "vitest run --config arch/vitest.arch.config.ts"`;
  - chain it into `test`, after `test:contracts` and before `ng test`, so the fast structural gate
    fails first;
  - add `archunit` to `devDependencies`, pinned to an exact version. Pre-2.x releases changed
    violation shapes, and the baseline keys depend on them.
- `.github/workflows/frontend-checks.yml`: no new step is needed, because `npm test` already runs.
  Upload `reports/arch/**` as a CI artifact (§5.8).
- Placing the suite in `arch/` rather than `src/**/arch` avoids the two excludes a `src/` placement
  would force: `angular.json` `test.options.exclude` and `tsconfig.spec.json`. It follows the
  `scripts/sitemap/public-sitemap.spec.ts` precedent.
- Update `AGENTS.md`: add `npm run test:arch` to Quick Start and "Validation commands run locally",
  and a Common-Mistakes row saying "adding a baseline entry to make the suite pass".
  Update `CLAUDE.md` Commands the same way.

### 3.2 Content rules through the TS compiler, not regex

`support/ast.ts` wraps `ts.createSourceFile(file.path, file.content, ScriptTarget.Latest, true)`. It
exposes small, cached queries:

- `importSpecifiers(f)`: module specifiers from `import` and `export … from`, including type-only
  imports, flagged as such.
- `importedNames(f, module)`: the named bindings from one module, for example `HttpClient` from
  `@angular/common/http`.
- `stringLiterals(f)`: string and no-substitution template literals, plus the static heads and tails
  of template expressions. Comments are never included.
- `propertyKeys(f)`: object-literal keys, for request-payload checks.
- `calls(f, predicate)`: call expressions with the callee text and argument nodes, for example
  `effect(`, `computed(`, `catchError(`, `new Date(`.
- `enclosing(node, kind)`: walks up the tree, for rules like "a `.subscribe(` inside an `effect(`
  callback".

This is the same precision-over-recall stance as `PLAN-i18n-ts-string-guardrail.md`: a checker that
cries wolf gets ignored.

### 3.3 The ratchet: shrink-only baselines

Today's code violates several rules, for example 33 cross-feature importers, 13 `ApiBaseService`
importers and about 35 hardcoded backend paths. Two naive options both fail. Turning those rules off
means they never bite. Turning them on red means nobody can merge. So:

- Each baselined rule runs `.check()`. Violations are mapped to **stable keys**, for example
  `src/app/features/workexec/pages/x.ts -> src/app/features/crm/components/customer-lookup/…` or
  `src/app/features/billing/services/billing-transport.service.ts :: '/v1/billing/…'`.
  Keys never include line numbers, so unrelated edits don't churn the baseline.
- `expectWithinBaseline(ruleId, violations)`:
  - fails on **new** keys and prints them with the rule's ADR reference;
  - fails on **stale** keys, where a baseline entry no longer occurs, and says "delete this entry".
    This mirrors the i18n checker's "a marker suppressing nothing is a failure". Fixed debt must
    leave the baseline in the same PR, so the baseline can only shrink.
- `ARCH_BASELINE_PRUNE=1 npm run test:arch` deletes stale entries automatically. **There is no
  "record" mode that adds entries.** A new entry is a hand edit with a mandatory `reason`, visible in
  review as a baseline diff. `AGENTS.md` gets a Common-Mistakes row for it.
- Rules with zero current violations have **no baseline file** and use `toPassAsync()` directly.
  A baseline file is never created for a rule that starts clean.
- Each rule ID's baseline count is printed on pass, so the suite output doubles as a debt report.

### 3.4 Rules that aren't TypeScript

ArchUnitTS only sees files in the tsconfig program. Some rules come from the same ADRs but live in
`*.html`: `[innerHTML]` (ADR-0065), bare in-app `href` (ADR-0037), and `aria-modal` on a `div`
(ADR-0029). Others live in `src/assets/i18n/*.json`: keys referenced in code must exist.

- These run in the same suite through `support/templates.ts`, a glob plus Angular's template parser
  from `@angular/compiler` (`parseTemplate`, which is already a dependency), rather than regex.
- They use the same baseline and ratchet.
- Each one is labelled **suite-hosted** in the catalog below, so nobody expects ArchUnitTS itself to
  report it.

## 4. Rule ID conventions

`<SUITE>-<nn>`, where SUITE is one of LAY, SDK, TEN, SEC, CON, PAT, I18N or RPT. Each test title
reads `"[SDK-02] pages and components must not depend on ApiBaseService (ADR-0041 §2)"`, so a
CI failure names the rule and the ADR without anyone opening the file.

Modes:
- **Enforce**: zero violations today, and it must stay zero.
- **Ratchet**: baselined, shrink-only.
- **Warn**: runs and prints, never fails. Used for SHOULD-level ADR text; it can be promoted later.

The **Today** column comes from the 2026-09-24 survey of `master` (`e4def8d`). Phase 0 re-measures
each number before any baseline is committed.

## 5. Rule catalog

### 5.1 Layers and feature isolation (`layers.arch.spec.ts`)

| ID | Rule | ADR | Construct | Today | Mode |
| --- | --- | --- | --- | --- | --- |
| LAY-01 | `core/**` must not depend on `features/**` | 0010 §2 | `inFolder('src/app/core/**').shouldNot().dependOnFiles().inFolder('src/app/features/**')` | 0 | Enforce |
| LAY-02 | `shared/**` must not depend on `features/**` | 0010 | same, for `shared` | 0 | Enforce |
| LAY-03 | A feature must not depend on another feature | 0010 §3, 0036 §2 | one rule per domain from `featureDomains()`: `inFolder(\`features/${d}/**\`).shouldNot().dependOnFiles().inFolder('src/app/features/**', { except: { inFolder: \`features/${d}/**\` } })` | 33 files / 102 edges; 0 cross-feature dynamic `import()` | Ratchet |
| LAY-04 | A feature must not import another feature's `models/` (the stricter subset of LAY-03, called out separately so it can reach zero first) | 0036 §2 | as LAY-03, with dependency side `features/*/models/**` | 17 files / 17 edges (bulk-import models ×8, workexec models ×5, product models ×2, crm, security) | Ratchet |
| LAY-05 | `models/**` must not depend on `services/`, `pages/` or `components/`, and must not import `@angular/*` or `rxjs` at runtime (type-only imports allowed) | 0010 §5 | dependency rule + `adhereTo` on `importSpecifiers` | 0 (planted violation caught) | Enforce |
| LAY-06 | `services/**` must not depend on `pages/**` or `components/**` | 0010 §5 | dependency rule | 0 (planted violation caught) | Enforce |
| LAY-07 | No import cycles within `src/app/**` | best practice | `inFolder('src/app/**').should().haveNoCycles()` | 0 (planted cycle caught) | Enforce |
| LAY-08 | Only `core/**`, `app.config*.ts` and `main*.ts` may import `src/environments/**` | 0041 §3–4 (transport config belongs to core) | dependency rule | 4 feature files (accounting, billing page, bulk-import, shell) | Ratchet |

**The LAY-03 debt has a design answer, not just a cleanup answer.** Three features are de facto
shared libraries: bulk-import (imported by crm, product, inventory, location and people),
`crm/components/customer-lookup`, and `location/components/location-picker`. §8 raises promoting
them to `shared/` as a decision. Until that is decided they stay in the baseline, not in a
permanent allowlist.

### 5.2 SDK transport and hardcoded paths (`transport.arch.spec.ts`)

| ID | Rule | ADR | Construct | Today | Mode |
| --- | --- | --- | --- | --- | --- |
| SDK-01 | `HttpClient`/`HttpBackend` may be imported only by `app.config.ts`, `core/services/api-base.service.ts` and `core/interceptors/**`. `HttpErrorResponse`/`HttpParams` stay legal everywhere. | 0010 §2, 0041 §2, §4 | `adhereTo` on `importedNames(f, '@angular/common/http')` | 0 outside allowlist | Enforce |
| SDK-02 | `pages/**` and `components/**` must not depend on `ApiBaseService` | 0041 §2 | `inFolder('**/{pages,components}/**').shouldNot().dependOnFiles().inPath('src/app/core/services/api-base.service.ts')` | 0 | Enforce |
| SDK-03 | **Frozen importer list** for `ApiBaseService`: no new file may depend on it | 0041 §2 ("legacy migration infrastructure") | dependency rule, baselined | 13 services | Ratchet, tracked by `PRD-sdk-migration-completion.md` |
| SDK-04 | No `fetch(`, `XMLHttpRequest` or `new EventSource(` in `src/app/**`, except an explicit allowlist | 0041 §1 | `adhereTo` on `calls`/`new` expressions | 0 | Enforce |
| SDK-05 | **No hardcoded backend paths.** No string or template literal in `src/app/**` matching `^/?(api/)?[a-z][a-z-]*/v\d+(/|$)` or `^/v\d+/`, except `app.config.ts` (SDK `basePath` wiring) and `api-base.service.ts` | 0041 §2 | `adhereTo` on `stringLiterals` (comments excluded) | 44 literals in 13 files (12 `ApiBaseService`-backed services + `invoice-detail-page`) | Ratchet; shrinks with SDK-03 |
| SDK-06 | `environment.apiBaseUrl` may be read only in `app.config.ts` and `api-base.service.ts` | 0041 §3–4 | `adhereTo`: property-access `apiBaseUrl` | 5 reads in 4 files (bulk-import tus URL, invoice-detail page, accounting export, shell `GATEWAY_BASE_URL`) | Ratchet |
| SDK-07 | No absolute `http(s)://` literals in `src/app/**` (`server.ts` is out of scope) | 0041 | `adhereTo` on `stringLiterals` | 0 | Enforce |
| SDK-08 | `@durion-sdk/*` is imported from the package root only, with no deep `@durion-sdk/x/…` paths | 0041 §1 (generated surface is the contract) | `adhereTo` on `importSpecifiers` | 0 | Enforce |
| SDK-09 | `@durion-sdk/*` in `pages/**`/`components/**` means page-level SDK injection is a "temporary shortcut" | 0041 §3 (SHOULD) | `adhereTo` | 20 files (25 imports) | **Warn** until SDK-03 < 5, then Ratchet (§8.2) |
| SDK-10 | `@durion-sdk/tenant` may be imported only under `features/platform/**` | 0062 §7 | `adhereTo` | 0 | Enforce |
| SDK-11 | `window.location.origin` must not be used to build URLs | 0041 §2 | `adhereTo` | 2 in 1 file (`bulk-import.service`) | Ratchet |

### 5.3 Tenancy (`tenancy.arch.spec.ts`)

ADR-0062 **supersedes** ADR-0023. The tenant is not removed from the frontend. It exists as the JWT
`tid` claim, and it must reach the backend **only** through the token. From ADR-0062 §3: "Clients,
request bodies, and query parameters never carry a tenant identifier". The gateway strips inbound
`X-Tenant-Id`/`X-Tenant-Slug` and injects its own. These rules encode that, together with the ADR-0065
storage-keying rules. None of them bans the word "tenant". The platform-admin registry, where a tenant
is the resource being administered, and the login `tenantSlug` are legitimate carve-outs.

| ID | Rule | ADR | Construct | Today | Mode |
| --- | --- | --- | --- | --- | --- |
| TEN-01 | No string literal equal to `X-Tenant-Id`, `X-Tenant-Slug`, `X-Loc-Fin-Bits`, `X-Loc-Oth-Bits` or `X-Loc-Scope` (case-insensitive) in `src/app/**` production code. Specs may keep them, to assert absence. | 0062 §3, 0061 §3 | `adhereTo` on `stringLiterals` (comment mentions in `tenant.ts:8` and `auth.service.ts:84` are correctly ignored) | 0 | Enforce |
| TEN-02 | Outside `core/**` and `features/platform/**`, no identifier, property key or string literal named `tenantId`, `tenant_id`, `tenantID` or `tid`. This covers payload keys, `HttpParams.set('tenantId', …)`, `paramMap.get('tenantId')` and SDK argument objects. | 0062 §3 ("never read one from a route"; never in body/query/header) | `adhereTo` on identifiers + `propertyKeys` + `stringLiterals` | 0 | Enforce |
| TEN-03 | `tenantSlug` may appear only in `core/services/auth.service.ts`, `core/services/last-tenant.service.ts`, `core/models/auth.models.ts`, `core/security/tenant.ts` and `features/auth/**` (the login contract) | 0062 §3 | `adhereTo` | 0 once `features/platform/**` is allowlisted (tenant-create sets a new tenant's slug) | Enforce |
| TEN-04 | Only `core/**` decodes the access token. `atob(`, `jwtDecode`, and splitting a token on `.` are allowed only in `core/services/auth.service.ts` and `core/security/**`. Features get identity from `AuthService` (`tenantId`, `claims`). | 0062 §3, 0065 §4 | `adhereTo` on `calls` | 0 outside (measure) | Enforce |
| TEN-05 | Reading the `.tid` claim is allowed only in `core/**` and a named allowlist of tenant-scoped stores (`shell/services/chat-history.store.ts`, `chat-blob.service.ts`, `chat-state.service.ts`), which need `tid` for ADR-0065 keys | 0065 §4–5 | `adhereTo` on property access | 0 once the allowlist is `shell/util/identity.util.ts`, `chat-history.store.ts`, `chat-blob.service.ts` | Enforce |
| TEN-06 | **Browser-storage allowlist.** `localStorage`/`sessionStorage`/`indexedDB` may be used only in classified files. **Tenant-scoped** files (`chat-history.store.ts`, `auth.service.ts`) must reference both `tid` and `sub`. **Preference** files (`theme.service.ts`, `chat-ui.service.ts`, `last-tenant.service.ts`, `router/chunk-error-recovery.ts`) must carry an `// arch: non-tenant storage — <reason>` marker. A new storage user fails until it is classified. | 0065 §4, §6 | `adhereTo` + classification table in `support/projects.ts` | 7 files: tenant-scoped 2 (`auth.service`, `chat-history.store`, both key on `tid`+`sub`); preference 5 (`theme`, `locale`, `chat-ui`, `last-tenant`, `chunk-error-recovery`) | Enforce, after classifying in Phase 1 |
| TEN-07 | A storage `setItem(` call must sit inside a `try` block, and a `JSON.parse(` of a storage read must too | 0065 §6 | `adhereTo` + `enclosing(TryStatement)` | 7 unguarded `setItem` in 3 core files (`auth.service` ×5, `locale`, `theme`) | Ratchet |
| TEN-08 | **No new `organizationId`** (ADR-0062 §4: "no new `organizationId` field is introduced anywhere") | 0062 §4, 0023 §2 | `adhereTo` on identifiers and property keys | 4 files (accounting, crm-integration models + services) | Ratchet |

TEN-02 and TEN-05 are deliberately separate. TEN-02 stops the tenant going **out** in a request.
TEN-05 limits who reads it **in** from the token, which is how you'd end up putting it in a request
in the first place.

### 5.4 Security and navigation (`security.arch.spec.ts`)

| ID | Rule | ADR | Construct | Today | Mode |
| --- | --- | --- | --- | --- | --- |
| SEC-01 | No `.innerHTML =`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `DomSanitizer` or `bypassSecurityTrust*` in `src/app/**` production TS | 0065 §1 | `adhereTo` | 0 | Enforce |
| SEC-02 | No `[innerHTML]`/`[outerHTML]` binding in any template | 0065 §1 | suite-hosted template rule | 0 | Enforce |
| SEC-03 | No `eval(` or `new Function(` | best practice / OWASP | `adhereTo` | 0 | Enforce |
| SEC-04 | No assignment to `location`/`location.href`, and no `location.assign`/`replace`, except `core/router/chunk-error-recovery.ts` (the full-reload recovery) | 0037 | `adhereTo` | 1 (allowlisted) | Enforce |
| SEC-05 | In-app navigation in templates is `routerLink`. No bare `href="/…"` or relative `href`. An external `href` carries `rel` containing `noopener` and `noreferrer`. | 0037 §1, §4 | suite-hosted template rule | 0 bare in-app `href`; 0 external links missing `rel` | Enforce |
| SEC-06 | An `<a>` with a `(click)` handler and neither `href` nor `routerLink` must become a `<button>` | 0037 §3 | suite-hosted template rule | 0 | Enforce |
| SEC-07 | URL scheme validation lives only in `features/shell/util/markdown.util.ts` (`normaliseHref`/`isSafeHref`). No other file declares a scheme-allowlist regex (`/^(https?|mailto)…/`). | 0065 §2 | `adhereTo` on regex literals | 0 | Enforce |
| SEC-08 | `URL.revokeObjectURL(` must run inside a `setTimeout` callback, never synchronously after `.click()` | 0065 §3 | `adhereTo` + `enclosing` | 1 (`shell/services/chat-blob.service.ts`) | Ratchet |
| SEC-09 | `aria-modal`/`role="dialog"` only on `<dialog appModalDialog>`, never on a `div` | 0029 §8.1 | suite-hosted template rule | 7 `role="dialog"`/`aria-modal` on `div`/`section` in 6 files, + 4 `<dialog open>` without `appModalDialog` | Ratchet |

### 5.5 Conventions and placement (`conventions.arch.spec.ts`)

| ID | Rule | ADR | Construct | Today | Mode |
| --- | --- | --- | --- | --- | --- |
| CON-01 | A `*.service.ts` under `features/**` lives in a `services/` folder | 0010 §5 | `withName('*.service.ts').should().beInFolder('**/services')` scoped to features | 1 (`auth/organization-search.service.ts`) | Ratchet |
| CON-02 | Every `*.service.ts`/`*.store.ts` in `features/**` and `core/**` has a co-located `*.spec.ts` | 0032 §3, 0035 §1, §4 | `adhereTo(f => existsSync(spec(f)))` | 1 (`core/services/theme.service.ts`) | Ratchet |
| CON-03 | Every **public** method of a `*Service` class is named in a `describe`/`it` title or called in its sibling spec (the stronger version of CON-02) | 0035 §1 | `adhereTo` + AST on both files | not measured (Phase 4) | Warn first, then Ratchet |
| CON-04 | Every `@Component` under `pages/**` or `components/**` follows the four-file convention (`.ts`/`.html`/`.css`/`.spec.ts`) | CLAUDE.md feature layout, 0035 | `adhereTo` | 10 missing specs. The 10 `*-landing-page` shells use a one-element inline template and are exempt (same rule as the i18n TS checker) | Ratchet |
| CON-05 | The four security-audit interfaces (`AuditEventFilter`, `AuditEventDetail`, `AuditEventPageResponse`, `AuditExportJob`) are declared only in `features/security/models/security-audit.models.ts` | 0036 §1 | `adhereTo` on exported declarations | 0 | Enforce |
| CON-06 | No `@NgModule` and no `standalone: false` | Angular 22 standalone-only (CLAUDE.md) | `adhereTo` | 0 | Enforce |
| CON-07 | Server-generated timestamp fields (`createdAt`, `updatedAt`, `requestedAt`, `approvedAt`, `issuedAt`, `completedAt`, `cancelledAt`) in `models/**` interfaces are `readonly` and optional and carry `@serverGenerated` | 0034 §1, §3 | `adhereTo` on interface members | 38 members not `readonly`/optional in 13 files; 21 more lack `@serverGenerated` | Ratchet |
| CON-08 | A server-generated key must not appear in an object literal passed to an SDK `create*`/`update*` method or an `ApiBaseService` `post`/`put`/`patch` | 0034 §2 | `adhereTo` on call arguments | 0 (approximate: server-field keys in args to `post`/`put`/`patch`/`create*`/`update*`) | Enforce |
| CON-09 | Only one of `util/` and `utils/`: pick one name | hygiene | `beInFolder` | 2 `util/` folders (crm, shell) against 4 `utils/` | Ratchet: rename to `utils/` (§8.4) |

### 5.6 Reactive-state and date patterns (`patterns.arch.spec.ts`)

These are the AST-heavy rules. Each is scoped narrowly and ships with fixture tests (§6) proving it
fires and doesn't misfire.

| ID | Rule | ADR | Today | Mode |
| --- | --- | --- | --- | --- |
| PAT-01 | An `effect(` callback that calls `.subscribe(` must declare `onCleanup` and call it | 0033 §1, §3 | 0: all 28 subscribing effects (of 40) register `onCleanup` | Enforce |
| PAT-02 | No `takeUntilDestroyed` inside an `effect(` callback | 0033 §2 | 1 (`shell/directives/authed-image.directive.ts`) | Ratchet |
| PAT-03 | In one block, `errorKey.set(<non-null>)` is immediately preceded by `state.set('error')`, and `state` is written before `errorKey` when clearing. `dispatch-board-page` (the §4 carve-out) is allowlisted with a reason. | 0031 §1, §5 | 22 in 18 files when scoped to `subscribe({ error })` callbacks (44 unscoped). About 11 remain once a computed `state.set(… 'forbidden' : 'error')` is accepted | Ratchet |
| PAT-04 | Inside `catchError(` in `features/**/services/**`, never return `of([])`, `of(new Map())`, `of(new Set())`, `of({})` or `EMPTY` | 0064 §1 | 4 in 2 files (3 in `chat-state.service` need human review) | Ratchet |
| PAT-05 | No `new Date('YYYY-MM-DD')` literal, `.toISOString().slice(0, 10)`/`.substring(0, 10)`, `86400000`/`86_400_000`/`24 * 60 * 60 * 1000`, and no class field `today = new Date()` | 0038 §1, §6, §8 | 4 `toISOString().slice(0, 10)` in 3 files; 0 of the other shapes | Ratchet |
| PAT-06 | (spec project) no literal-date `new Date('2026-…')` in date-comparison specs | 0038 §7 | 21 in 3 shell specs | Warn, since it's broad |
| PAT-07 | No parameter default that reads a live signal in an `apply*` method (`key = this.requestKey()`) | 0063 §1 | 0 | Enforce |
| PAT-08 | No `console.*` in `src/app/**` production code except an allowlisted logger location | best practice | 12 in 7 files | Ratchet |

### 5.7 i18n (`i18n.arch.spec.ts`)

ADR-0030 is already partly gated by `npm run i18n:check`, whose four checkers are plain `.mjs` CLIs.
Today they execute at import time and read `process.argv`, so they can't be called from a test.
The plan brings i18n under the same suite without forking the logic.

**Step 1: make the checkers importable (no behaviour change).** Split each of
`check-missing-keys.mjs`, `check-hardcoded-strings.mjs`, `check-hardcoded-ts-strings.mjs` and
`generate-pseudo-locale.mjs --check` into:
- an exported pure `scan(options) → Finding[]` (the `i18n-ignore` marker semantics stay unchanged);
- a thin CLI shim guarded by `if (import.meta.url === pathToFileURL(process.argv[1]).href)`.

`npm run i18n:check`, its per-module targeting and its output stay byte-identical. Prove that in the
PR by diffing CLI output before and after on `master`.

**Step 2: gate from the suite.**

| ID | Rule | ADR | Construct | Today | Mode |
| --- | --- | --- | --- | --- | --- |
| I18N-01 | Every release locale has exactly the `en-US` key set | 0030 | wraps `check-missing-keys` `scan()` | 0 | Enforce |
| I18N-02 | `qps-ploc` is in sync with `en-US` (regenerated, never hand-edited) | 0030 | wraps pseudo-locale `--check` | 0 | Enforce |
| I18N-03 | No hardcoded copy in templates | 0030 §1 | wraps `check-hardcoded-strings` `scan()` | 0 (post-remediation) | Enforce |
| I18N-04 | No hardcoded prose in TS, including prose-bearing inline `template:` | 0030 §1 | wraps `check-hardcoded-ts-strings` `scan()` | 0 | Enforce |
| I18N-05 | **New: referenced keys exist.** Every static key used in code or templates exists in `en-US.json`. Static keys are: literal `'A.B' \| translate` pipes in templates; literal args to `translate.instant/get/stream`; `errorKey.set('A.B')`; and literals typed as a key. Today's `check-missing-keys` only checks locale **parity**, so a typo'd key renders raw in production (ADR-0030 "no raw key leakage"). Dynamic keys (template literals) are skipped and counted. | 0030 | suite-hosted: template AST + `ast.ts` | 0. All 58 template keys and 4 TS keys were missing from **every** locale (not just `en-US`); fixed before Phase 1, see §11.5 | Enforce |
| I18N-06 | No `translate.instant(` inside a `computed(` callback, a class field initializer, or a memoised `effect(` (the locale isn't a signal dependency, so the value freezes) | 0030 (AGENTS.md Common Mistakes) | `adhereTo` + `enclosing` | 0 | Enforce |
| I18N-07 | No manual locale formatting (`toLocaleString`/`toLocaleDateString`/`toLocaleTimeString`, `new Intl.*`, `.toFixed(` feeding display) in `pages/**`/`components/**`. Use the `number`/`date`/`currency` pipes or a single allowlisted core formatter. | 0030 (Intl/CLDR only via the framework) | `adhereTo` | 2 in 2 files | Ratchet |
| I18N-08 | No hardcoded `dir="ltr"`/`dir="rtl"` in templates | 0030 (direction is locale-driven) | suite-hosted template rule | 0 | Enforce |
| I18N-09 | Unused `en-US` keys: keys no static reference reaches | hygiene | same index as I18N-05 | not measured | Warn (report only; dynamic keys make it unprovable) |

**What happens to `i18n:check` in CI.**
- Keep the `i18n:check` CI step until I18N-01…04 have run green alongside it for one release cycle.
- Then remove the separate step, since `npm test` already gates it.
- The `npm run i18n:check` CLI stays as the developer tool for per-module remediation.

### 5.8 Reports (`reports.arch.spec.ts`, non-gating)

- `projectGraph().collapseToFolderDepth(4).exportAsMermaid('reports/arch/features.mmd')`: the
  feature-to-feature graph, to see LAY-03 debt at a glance.
- `metrics().count().linesOfCode()` and `metrics().lcom().lcom96b()` as HTML, under `reports/arch/`.
  There are no thresholds; this is trend data only.
- A `baseline-summary.json` counting entries per rule ID, which is the debt burndown.
- CI uploads `reports/arch/**` as an artifact. Add `reports/` to `.gitignore`.

## 6. Testing the tests

A rule that can't fail is worse than no rule. Each content or AST rule gets fixture coverage:

- `arch/fixtures/<RULE-ID>/{violating,compliant}/*.ts`, plus a `tsconfig.fixtures.json` that
  includes only `arch/fixtures/**`.
- `arch/rules/__self__/<suite>.self.arch.spec.ts` runs each rule factory against the fixture project.
  It asserts that the violating files are reported and the compliant files aren't. The compliant set
  includes the known false-positive shapes: comment mentions, spec files, the platform-admin
  `tenantId`, and `HttpErrorResponse` imports.
- To make this possible, **rules are factories**: `sdk01(project = APP) → rule`. The same definition
  runs against `src` and against fixtures.
- For the dependency rules, run a mutation check once per rule in its introducing PR: add a violating
  import, show the failure, and revert. Record it in the PR description, following the ADR-0035 §5
  habit.

## 7. Phased rollout

Each phase is one PR. Every phase leaves `npm test` green.

| Phase | Deliverable | Exit criterion |
| --- | --- | --- |
| **0: Spike** (½ day) | Install `archunit` (exact pin). Confirm the nested TS 5.9 parses our TS 6 sources and `tsconfig.app.json`, or add an `overrides` pin. Run LAY-01 and LAY-03 against `master` and time them. Record the Violation object shapes for `violation-key.ts`. Re-measure every "measure" cell in §5. | Written spike notes appended to this plan: runtime, version decision, measured counts |
| **1: Harness + Enforce rules** | `arch/` scaffolding, `vitest.arch.config.ts`, `test:arch` chained into `test`, `ast.ts`, `baseline.ts`, `templates.ts`. Every rule that is 0 today: LAY-01/02/05/06, SDK-01/02/04/07/08/10, TEN-01/02/03/04/05, SEC-01/02/03/04, CON-05/06. TEN-06 with the storage classification. Self-tests for each, plus the §11.3 guards: selector-count parity, ArchUnitTS/TS 6 file-set parity, and the dynamic-`import()` supplement to LAY-03. ESLint mirrors of SDK-01, SEC-01 and SEC-03 (§8.3). `AGENTS.md`/`CLAUDE.md` updates. `arch/README.md`. | All green on `master`; each rule shown to fail on a planted violation |
| **2: Ratchets** | Baselines for LAY-03/04/08, SDK-03/05/06/11, TEN-08, CON-01/02/04, PAT-08. Stale-entry and new-entry failure paths self-tested. | `baseline-summary.json` published; the prune mode works |
| **3: i18n** | Refactor the four checkers to `scan()` + CLI shim (CLI output diffed identical). I18N-01…04 wrapping. I18N-05/06/07/08 new rules with baselines. I18N-09 report. | `i18n:check` CLI unchanged; the suite catches a planted typo'd key and a planted `instant()` in `computed()` |
| **4: Pattern rules** | PAT-01…07, SEC-05…09, CON-03/07/08, measured first, each Enforce or Ratchet per its count, with fixture self-tests including the false-positive shapes. | False-positive rate reviewed on real code: every baseline entry read by a human and confirmed genuine |
| **5: Reports + CI cleanup** | `reports.arch.spec.ts`, CI artifact upload. Drop the separate `i18n:check` CI step after the parity window. Promote Warn rules whose §8 decisions are made. | Artifacts visible on a PR run |

Debt burn-down, as separate PRs driven by the baselines:
- SDK-03/05/06 shrink with `PRD-sdk-migration-completion.md`; platform moves to `@durion-sdk/tenant` and shell stays on MCP.
- LAY-03 shrinks with the §8 shared-promotion decision.
- CON-04 shrinks by writing the 10 missing specs.

## 8. Decisions (settled 2026-09-24)

1. **De facto shared features move to `shared/`.** bulk-import (5 importers), `crm/customer-lookup`
   and `location/location-picker` are imported across features. Their reusable parts get promoted,
   for example `shared/bulk-import/` for the upload/progress components and job models; the
   bulk-import *pages* stay in the feature. LAY-03 then reaches zero for them without an allowlist.
   There is no permanent `SHARED_FEATURES` allowlist. The edges stay in the LAY-03 baseline until
   the promotion PRs land.
2. **Page-level SDK injection (SDK-09) stays Warn** until SDK-03 is under 5 importers, then becomes
   a Ratchet. It covers 20 files today.
3. **The suite is authoritative. ESLint mirrors the three cheapest rules for in-editor feedback:**
   SDK-01 (`no-restricted-imports` for `HttpClient`/`HttpBackend`), SEC-01 and SEC-03
   (`no-restricted-syntax`). The ESLint copies land in Phase 1 alongside the suite rules, and
   `arch/README.md` names them as mirrors.
4. **`utils/` is the folder name.** CON-09 becomes a Ratchet, and `crm/util/` and `shell/util/` are
   renamed in a follow-up PR.
5. **`CLAUDE.md` corrected** in the Phase 0 PR: `ChatStateService` lives in
   `features/shell/services`, not `core/services`.

## 9. Follow-ups outside this plan

- **stylelint** rules for ADR-0029 §8.2 (no local `.sr-only`), §8.11 (`outline: none` needs a
  replacement ring) and ADR-0039 (no raw colour literals).
- A durion-side ADR recording "frontend architecture rules are executable in `arch/`". Consider
  whether to name the new suite in ADR-0010 or ADR-0041 as their enforcement mechanism.
- Add a knowledge-catalog entry for this plan (via `scripts/generate-knowledge-catalog.py`), so agents
  find the rule catalog in one hop.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| ArchUnitTS pins TS 5.9 while the repo is on TS 6 | Phase 0 spike; `overrides` fallback; our AST helpers use the root TS |
| Suite runtime inflates `npm test` | The graph is cached across rules in one process. Budget ≤ 30 s, measured in Phase 0. Split out `test:arch` in CI if it is exceeded. |
| Baselines become a dumping ground | No record mode, a mandatory `reason`, stale entries fail, a Common-Mistakes row, and a visible burndown |
| AST heuristics misfire and lose trust | Fixture self-tests with known false-positive shapes; Warn before Ratchet for the noisier rules (CON-03, PAT-06) |
| Pre-2.x API churn in ArchUnitTS | Exact version pin; violation keys go through one adapter (`violation-key.ts`) |

## 11. Phase 0 spike results (2026-09-24)

Run against `master` at `e4def8d` on Node 22.23.2, with `archunit@2.5.4` pinned exactly in
`devDependencies`. The catalog in §5 now carries the measured counts. This section records what the
spike found about the tool itself, since that changes how Phase 1 is built.

### 11.1 TypeScript 6 compatibility: no `overrides` needed

- npm nests `typescript@5.9.3` under `archunit`; the repo keeps `6.0.3`. No `overrides` pin is
  required today.
- **Completeness:** TS 5.9 and TS 6 parse `tsconfig.app.json` to the same 382 files with 0
  diagnostics. ArchUnitTS sees all 382 plus one JSON module import (`site-map.data.json`). No
  files are dropped.
- **Guard for the future:** Phase 1 adds a self-test asserting that ArchUnitTS's file set equals
  the TS 6 `tsconfig.app.json` file list. If the codebase adopts TS 6-only syntax that 5.9 can't
  read, the suite fails loudly instead of silently analysing fewer files. That is when the
  `overrides` fallback gets revisited.

### 11.2 Runtime

| Step | Time |
| --- | --- |
| First ArchUnitTS graph build (382 files) | ≈ 2.5 s |
| Each further dependency rule (graph cached) | 5–25 ms |
| All 20 per-domain LAY-03 rules + LAY-04…08 + SDK-02/03 | ≈ 2.3 s total |
| TS-AST + Angular-template content pass (373 app + 285 spec + 194 templates) | ≈ 2.6 s |

The whole suite should land well under the 30 s budget (§10). No CI split is needed.

### 11.3 Tool behaviour Phase 1 must design around

1. **Globs with an interior `**` don't match nested folders.** `inFolder('src/app/**/pages/**')`
   matched **1 of 170** page files, and `src/app/**/components/**` matched 0 of 37. Leading-`**`
   globs (`'**/pages/**'`: 170) and anchored ones (`'src/app/features/**'`: 347) are correct, as
   are regexes (`/\/(pages|components)(\/|$)/`: 207).
   - Such a rule under-covers silently. It still "passes", because it matched *some* files.
   - Phase 1 rule: selectors live only in `support/projects.ts`, as regexes or leading-`**` globs.
     A self-test asserts each selector's match count equals a filesystem count for the same
     folders.
   - Worth an upstream issue on ArchUnitTS.
2. **An empty match reports a violation, not a silent pass,** on both the subject and the
   dependency side ("No files found matching pattern(s) …"). That is good. But per-domain loops
   need `allowEmptyTests: true` for domains with no subfolder, and those rules then depend on
   11.3.1's self-test for coverage.
3. **Dynamic `import()` edges are not in the graph.** `app.routes.ts` shows 0 edges to the
   features it lazy-loads. LAY-03 therefore gets an AST supplement over `import('…')` specifiers.
   Today it finds 0 cross-feature dynamic imports, so it ships as Enforce.
4. **Self-edges appear.** `api-base.service.ts` was reported as depending on itself under a broad
   `inPath('src/**')` subject. `violation-key.ts` drops edges where source equals target.
5. **Type-only imports are distinguishable.** Each edge carries `importKinds` (`value`, `named`,
   `type`, `default`); 16 `type` edges exist today. So LAY-05's "type-only imports allowed" can be
   expressed exactly.
6. **Violation shapes** for the baseline keys:
   - `ViolatingFileDependency { dependency: { sourceLabel, targetLabel, cumulatedEdges[{ source,
     target, external, importKinds }] }, isNegated }` → key `source -> target`
   - `ViolatingCycle { cycle: ProjectedEdge[] }` → key: the sorted member list
   - `CustomFileViolation { message, fileInfo, rule }` → key `path :: <finding>`, where the
     finding comes from our AST pass and never includes a line number

### 11.4 Heuristic tuning found by the spike

- **PAT-03** is scoped to `subscribe({ error })` callbacks, which drops it from 44 hits to 22. A
  computed `state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error')` directly before
  `errorKey.set` counts as compliant: it is the ADR-0064 forbidden split. That leaves about 11.
- **I18N-05 (TS side)** must read only translation call sites (`instant`/`get`/`stream`,
  `errorKey.set`) and key-typed fields. A bare "looks like a key" literal matched 4 permission
  codes (`INVENTORY.VIEW` …) as false positives.
- **CON-04** exempts components whose inline `template:` is a single element (the 10
  `*-landing-page` shells), matching the i18n TS checker's `inline-template` rule.
- **TEN-03** allowlists `features/platform/**`: tenant-create sets a *new* tenant's slug, which is
  the administered resource (ADR-0062 §7), not request tenancy.
- **TEN-06** classification needs `core/services/locale.service.ts` as a preference store. It was
  missing from §5.3's first list.

### 11.5 Real defects the spike surfaced (not fixed in Phase 0)

- **58 translation keys used in 8 templates, and 4 used in TS, rendered as raw keys.** They were
  missing from **all six** locale files, not just `en-US`, which is why `i18n:check` stayed green:
  it only checks parity *between* locale files, and they were consistently absent. **Fixed after
  Phase 0, before Phase 1:**
  - `INVENTORY.LEDGER.LIST.STATE.EMPTY` → the template now uses the existing, already-translated
    and previously orphaned `INVENTORY.LEDGER.LIST.EMPTY`;
  - 61 new keys in every hand-maintained locale, with `qps-ploc` regenerated:
    - `COMMON.{ADD, ALL, APPROVE, BREADCRUMB, DEACTIVATE, END, NEW, REASON, REJECT, SAVE, UPDATE}`
    - `PRODUCT.PRICING.LOCATION_OVERRIDES.STATE.EMPTY`
    - the `SHOPMGMT.APPOINTMENT_EDIT` and `SHOPMGMT.APPOINTMENT_RESCHEDULE` blocks.

  I18N-05 therefore starts at zero and ships as Enforce.
- **4 `<dialog open>` without `appModalDialog`** (storage-locations, person-location-assignments,
  role-detail, roles-list), plus **7 `role="dialog"`/`aria-modal` on `div`/`section`**
  (ADR-0029 §8.1).
- **7 unguarded `localStorage`/`sessionStorage.setItem`** in `auth.service`, `locale.service` and
  `theme.service` (ADR-0065 §6: a quota failure must be caught).

### 11.6 Environment notes

- A plain `npm install` prunes the `@durion-sdk/*` packages that `sdk:install` placed in
  `node_modules`, so run `npm run sdk:install` afterwards. The `start`/`build`/`test` scripts
  already do this.
- The spike scripts were throwaway probes and are not committed. Phase 1 re-implements their
  queries as `arch/support/ast.ts`.
