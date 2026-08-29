# Frontend Site Audit — Test Plan

Playwright-based crawl of every reachable page on the deployed frontend
(default target: **https://durionpos.org**), checking each page against our
ADRs, the Durion design guidelines, and product UI rules. Output is a **site
map**, a **severity-ranked inventory of recommended changes**, and a list of
**pages with errors**.

Suite location: `e2e/audit/` · Config: `playwright.config.ts` · Runner: `npm run audit:site`

---

## 1. Objectives

1. Enumerate every page reachable from the route table and in-app links (site map).
2. Verify page-level conformance to:
   - **ADR-0029 / ADR-0039** — accessibility baseline + WCAG 2.2 AA contrast (axe-core scan)
   - **ADR-0030** — i18n: no raw translation keys rendered to users
   - **ADR-0031** — failed API calls should surface handled error states, not silent breakage
   - **ADR-0037** — SPA navigation: no anchors as action/retry controls, no dead `href="#"` links,
     no untyped buttons inside forms
   - **ADR-0038** — no `Invalid Date` / `NaN` date-formatting artifacts
   - **Durion style guide / theme tokens** — expected font stacks, `data-theme` attribute,
     core `--brand-*` / theme custom properties present
   - **UI rule: no UUIDs published on screen** — visible text, input values, picker options
   - **UI rule: human-readable search** — searches must accept customer names, phone numbers,
     invoice numbers, employee names/numbers — never internal UUIDs/IDs
3. Record every page that errors: HTTP failures, uncaught JS exceptions, console errors,
   failed API/asset requests, routes that dead-end in `/not-found` or `/forbidden`.

## 2. Safety: read-only by design

The crawl is safe to run against **production**:

- Navigation is **GET-only** (`page.goto`). The crawler never clicks buttons, fills forms
  (other than the one login form), or submits anything.
- Links whose path contains `logout`/`signout` are never followed.
- Links to file downloads (`.pdf`, `.csv`, `.xlsx`, …) are never followed.
- Query strings are stripped, so no action-style query URLs are triggered.

The only mutating interaction is the initial login (`/login` form), using the audit account.

> Use a **dedicated, least-privilege audit account** — ideally read-only. Give it
> `ROLE_ADMIN` only if you want `/app/admin` and `/app/security` covered.

## 3. How to run

```bash
npm install                        # once; installs @playwright/test
npx playwright install chromium    # once per machine (skip if a chromium is provided)

AUDIT_BASE_URL=https://durionpos.org \
AUDIT_USERNAME=<audit-user> \
AUDIT_PASSWORD=<audit-pass> \
npm run audit:site
```

Public-pages-only run (no credentials): `npm run audit:site:public`

### Personas

Route access is role-gated, so a crawl only covers what its account can reach — an
admin sees `/app/admin`, a technician gets redirected to `/forbidden`. The suite runs
one login + crawl per persona, each with its own storage state and report directory.

| Persona | Env prefix | Credentials read from |
|---|---|---|
| `admin` | *(none)* | `AUDIT_USERNAME` / `AUDIT_PASSWORD` |
| `advisor` | `ADVISOR_` | `AUDIT_ADVISOR_USERNAME` / `AUDIT_ADVISOR_PASSWORD` |
| `tech` | `TECH_` | `AUDIT_TECH_USERNAME` / `AUDIT_TECH_PASSWORD` |
| `manager` | `MANAGER_` | `AUDIT_MANAGER_USERNAME` / `AUDIT_MANAGER_PASSWORD` |
| `acct` | `ACCT_` | `AUDIT_ACCT_USERNAME` / `AUDIT_ACCT_PASSWORD` |
| `parts` | `PARTS_` | `AUDIT_PARTS_USERNAME` / `AUDIT_PARTS_PASSWORD` |
| `controller` | `CONTROLLER_` | `AUDIT_CONTROLLER_USERNAME` / `AUDIT_CONTROLLER_PASSWORD` |

Each name falls back to the matching `ITEST_*` variable, so an existing integration-test
env file can be sourced as-is without remapping:

```bash
set -a; . ~/IdeaProjects/durion-positivity-sdk/.env.itest; set +a
AUDIT_PERSONAS=all npm run audit:site        # every persona with credentials
AUDIT_PERSONAS=manager,tech npm run audit:site
npm run audit:site -- --project=audit:manager  # one persona; its setup runs as a dependency
```

`AUDIT_PERSONAS` defaults to `admin`, so a run with only `AUDIT_USERNAME`/`AUDIT_PASSWORD`
set behaves exactly as it did before personas existed.

Personas are crawled sequentially (`workers: 1`), so `AUDIT_PERSONAS=all` takes roughly
seven times a single run — scope it with `AUDIT_MAX_PAGES` when iterating.

| Env var | Default | Purpose |
|---|---|---|
| `AUDIT_BASE_URL` | `https://durionpos.org` | Target origin |
| `AUDIT_USERNAME` / `AUDIT_PASSWORD` | — | `admin` persona account for `/app` (omit → public-only + warning) |
| `AUDIT_PERSONAS` | `admin` | Personas to crawl: comma-separated ids, or `all` for every configured one |
| `AUDIT_SKIP_AUTH` | — | `1` = public pages only |
| `AUDIT_MAX_PAGES` | `200` | Total crawl cap |
| `AUDIT_MAX_PER_PATTERN` | `2` | Concrete instances sampled per parameterized route (e.g. two invoices) |
| `AUDIT_SETTLE_MS` | `1200` | Extra wait after network idle for signals/effects to settle |
| `AUDIT_PAGE_TIMEOUT_MS` | `30000` | Per-page navigation timeout |
| `AUDIT_OUT_DIR` | `artifacts/audit` | Report output directory |
| `AUDIT_CHROMIUM_PATH` | — | Explicit chromium binary (sandboxed/CI images) |
| `AUDIT_BROWSER_ARGS` | — | Extra chromium flags, whitespace-separated (e.g. `--ssl-version-max=tls1.2` when an egress proxy resets Chromium's TLS 1.3 ClientHello) |

Proxied environments: `HTTPS_PROXY`/`https_proxy` is honored automatically — the config passes
it to Chromium at launch (Chromium does not read it from the environment on its own), and
`NO_PROXY`/`no_proxy` becomes the bypass list so localhost/intranet targets are not tunneled.

## 4. Crawl strategy

1. **Seeds** — every concrete (non-parameterized) route from `app.routes.ts` and all feature
   `*.routes.ts` files, checked into `e2e/audit/lib/route-seeds.ts`. Public seeds (`/`, `/login`,
   `/forbidden`, `/not-found`) always run; `/app/**` seeds run when authenticated.
2. **Discovery** — on each audited page, all same-origin `<a href>` targets are harvested and
   queued (BFS). This is how parameterized routes (`/app/billing/invoices/:invoiceId`, …) get
   covered with *real* entity ids, without the audit inventing or mutating data.
3. **API id harvesting** — most list pages navigate via click handlers, not anchors, so link
   discovery alone misses nearly all detail routes. The crawler therefore also *observes* the
   JSON API responses each page already makes, remembers id-like field values (`invoiceId`,
   `partyId`, `workorderId`, …), and when the link queue runs dry fills the route templates in
   `route-seeds.ts` (`PARAM_TEMPLATES`) with those real ids — only the field names the
   templates reference are harvested, and bare `id` fields are scoped per API resource
   (`id@locations`). Still zero extra requests and
   GET-only. Mutation-flow pages (order cancel, approval submit, offboard, …) are deliberately
   excluded from auto-visitation. Coverage per template is reported in `sitemap.md`.
4. **Pattern sampling** — id-like path segments (UUIDs, numbers, `WO-123`-style) are collapsed
   into a `{id}` pattern; at most `AUDIT_MAX_PER_PATTERN` concrete instances of each pattern are
   visited so long lists don't exhaust the `AUDIT_MAX_PAGES` budget.
5. **Outcome classification** — each visit is recorded as `audited`, `auth-required`,
   `forbidden` (role-gated), `not-found`, `http-error`, or `load-failed`. Checks only run on
   `audited` pages; the rest still appear in the site map and error report.

## 5. Rule matrix

| Rule id | Checks | Severity | Reference |
|---|---|---|---|
| `uncaught-exception` | `pageerror` during load | Critical | — |
| `page-unreachable` | document 4xx/5xx or navigation failure | Critical | — |
| `failed-api-request` | XHR/fetch 5xx (Critical) or 4xx/network-fail (High) | Critical/High | ADR-0031 |
| `uuid-on-screen` | UUID in visible text or rendered input values (checkbox/radio/hidden values are wiring and excluded; button/submit values ARE their visible label and stay in scope) | High | UI rule |
| `uuid-in-picker-options` | UUIDs as select/option labels | High | UI rule |
| `search-by-internal-id` | search field labeled UUID/GUID | High | UI rule |
| `search-possibly-id-keyed` | search field labeled bare "ID" with no human-readable term | Medium | UI rule |
| `raw-i18n-key` | `DOMAIN.SECTION.KEY`-shaped text rendered (occurrences inside `<code>`/`<pre>` count as intentional data; a key shown as code AND rendered raw elsewhere still flags) | High | ADR-0030 |
| `rendering-artifact` | `Invalid Date`, `NaN`, `[object Object]`, stray `undefined` | High/Medium | ADR-0038 |
| `console-error` | `console.error` during load | High | — |
| `dangling-route` | route/link lands on `/not-found` | High | — |
| `a11y/<axe-rule>` | axe-core WCAG 2.0/2.1/2.2 A+AA violations | High→Info by impact | ADR-0029, ADR-0039 |
| `anchor-as-action` | `<a>` used for Retry/Reload/Save-style actions | Medium | ADR-0037 |
| `dead-anchor-href` | `href="#"` / `javascript:` anchors | Medium | ADR-0037 |
| `untyped-form-button` | `<button>` in form without `type` | Medium | ADR-0037 |
| `failed-asset-request` | 404/failed images, fonts, scripts | Medium | — |
| `missing-theme-attribute` | `html[data-theme]` absent | Low | Style guide §4 |
| `missing-theme-tokens` | core `--brand-*`/theme tokens absent on `:root` | Low | theme-tokens.md |
| `body-font-drift` / `heading-font-drift` | computed fonts outside the approved stacks | Low | Style guide §2 |
| `missing-h1` | no `<h1>` landmark | Low | ADR-0029 |

axe impact mapping: `critical→High`, `serious→Medium`, `moderate→Low`, `minor→Info`.
(Severity `Critical` is reserved for pages that are actually broken for users.)

## 6. Outputs (`artifacts/audit/<persona>/`)

Each persona writes its own set, e.g. `artifacts/audit/admin/summary.md` and
`artifacts/audit/tech/summary.md`, so one persona's crawl never overwrites another's.
`summary.md`, `sitemap.md` and `findings.md` each name the persona in their header.

| File | Contents |
|---|---|
| `summary.md` | Run metadata + findings-by-severity table |
| `sitemap.md` | Every page reached: pattern, outcome, HTTP status, title, load time, finding counts, discovered-from |
| `findings.md` | **Recommended changes ranked by severity**, each with evidence + concrete fix + ADR reference, plus a per-rule rollup for systemic fixes |
| `error-pages.md` | Pages with HTTP/JS/API errors, with the specific errors |
| `report.json` | Full machine-readable results (pages + findings) |

## 7. Triage workflow

1. Start at `summary.md`; anything **Critical** is a broken page — fix first.
2. Work `findings.md` top-down. Use the **rule rollup**: a rule firing on 30 pages is usually
   one shared component/layout fix, not 30 fixes.
3. Cross-check `error-pages.md` against backend logs for failed API calls — decide whether the
   fix is frontend (wrong URL/contract) or backend, and confirm the page shows its ADR-0031
   error state either way.
4. `dangling-route` on a *seed* means a route in code isn't deployed/served; on a *discovered
   link* it means a broken link on the source page (listed in "Discovered from").
5. Re-run after fixes and diff `report.json` finding counts.
6. A finding verified as intentional (e.g. an admin-only exact-id lookup) is recorded in
   `e2e/audit/lib/accepted-findings.ts` with its rationale. Accepted findings are downgraded
   to Info and prefixed `[accepted]` — they stay visible in every report rather than being
   silenced, and the entry is removed when the underlying behavior changes.

## 8. Known limitations

- **Heuristic search rule** — `search-possibly-id-keyed` flags candidates from
  placeholder/label text; a human confirms whether the backing query is actually id-only.
  `search-by-internal-id` (explicit UUID/GUID wording) is high-confidence.
- **Roles** — routes gated above the audit account's roles are recorded as `forbidden`, not
  audited. Run twice (standard + admin account) for full coverage.
- **Static routerLink vs `href`** (ADR-0037) — at runtime `routerLink` renders as `href`, so
  full-page-reload links can't be reliably detected in the deployed DOM. Covered instead by the
  action-anchor/dead-anchor checks here plus code review; a repo-side template grep is the
  reliable enforcement point.
- **Detail-route coverage depends on data** — parameterized routes are filled with ids
  harvested from API responses (`PARAM_TEMPLATES` in `route-seeds.ts`). If no crawled page
  returns data for an entity (empty environment, wrong field name in the template's `params`),
  that template reports "no ids observed" in `sitemap.md` — fix by seeding test data or adding
  the actual response field name. Mutation-flow pages (cancel, approval submit, offboard, …)
  are excluded by design and stay uncovered unless added as explicit seeds with known ids.
- **Seeds drift** — `e2e/audit/lib/route-seeds.ts` must be updated when routes change
  (`grep "path:" src/app/features/*/*.routes.ts`).

## 9. CI integration (suggested)

Nightly job against durionpos.org:

```yaml
- run: npm ci && npx playwright install chromium --with-deps
- run: npm run audit:site
  env:
    AUDIT_BASE_URL: https://durionpos.org
    AUDIT_PERSONAS: all
    AUDIT_USERNAME: ${{ secrets.AUDIT_USERNAME }}
    AUDIT_PASSWORD: ${{ secrets.AUDIT_PASSWORD }}
    AUDIT_MANAGER_USERNAME: ${{ secrets.AUDIT_MANAGER_USERNAME }}
    AUDIT_MANAGER_PASSWORD: ${{ secrets.AUDIT_MANAGER_PASSWORD }}
- uses: actions/upload-artifact@v4
  with: { name: site-audit, path: artifacts/audit }
```

The suite currently **reports** rather than fails the build. To gate, add a threshold step that
parses `report.json` and fails on `severity in (critical, high)` counts above an agreed budget —
recommended only after the initial backlog is burned down.
