# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Authoritative guides

`AGENTS.md` is the canonical agent guide — read it first. It holds the ADR-driven coding
patterns (state machine, effect cleanup, mutation error handling, typed fixtures), the PR
checklist, and the "Common Mistakes" table. The ADRs it references live in the sibling
`../durion/docs/adr/` repo. `README.md` covers architecture, routing, theming, and i18n in depth.
Do not duplicate those here — follow them.

## Cross-Repo Resources (`../durion`)

The sibling `durion` orchestration repo holds the platform knowledge and tooling this repo depends
on. Start at the knowledge catalog to locate a domain, ADR, or backend module before reading it.

| Path | What it holds |
| ---- | ------------- |
| `../durion/knowledge-catalog/` | Workspace navigation layer — `domains/`, `adr/`, and `backend/` pointer entries |
| `../durion/docs/adr/` | The ADRs themselves (frontend: ADR-0010, 0029–0035, 0037, 0038, 0062) |
| `../durion/domains/` | Domain business rules and capability definitions |
| `../durion/.claude/skills/` | Frontend workflow skills (below) |
| `../durion/.claude/agents/` | Agent definitions the orchestrator skills delegate to |
| `../durion/AGENTS.md`, `../durion/CLAUDE.md` | Cross-repo platform rules — closer scope wins on conflict |

Frontend-relevant skills: `/frontend-story`, `/ui-orchestrate`, `/angular-orchestrate`,
`/freestyle-orchestrate`, `/story-update`, `/pr-review`, `/pull-request`, `/capability-completion`.

**Those skills and agents load only when `durion` is also a session root** — a session opened on this
repo alone sees none of them, and this repo defines no skills of its own. Open
`../durion/durion.code-workspace`, or add the `durion` repo to the session, before relying on them.

## Commands

```bash
npm start                            # dev server → localhost:4200 (proxies API to :8080, mockAuth on)
npm run build                        # prod build → dist/
npm test                             # what CI runs: contract tests + arch suite + full suite in headless Chromium
npm run test:arch                    # architecture rules (ArchUnitTS, plain node) — arch/README.md
npx ng test --no-watch --browsers=ChromiumHeadless --runner-config vitest.config.ts   # single CI pass (real Chromium, as CI runs it)
npx ng test --include="src/app/features/<domain>/**/*.spec.ts" --no-watch --browsers=ChromiumHeadless --runner-config vitest.config.ts   # one domain suite
npx ng test --no-watch --browsers=ChromiumHeadless --runner-config vitest.config.ts --coverage   # coverage → coverage/durion-positivity-frontend/lcov.info; floors in angular.json (nightly Sonar)
npm run lint                         # ESLint via @angular-eslint
npm run lint:css                     # stylelint src/**/*.css + design/system/**/*.css
npm run i18n:check                   # missing-keys + pseudo-locale check
npm run a11y:smoke                   # axe-core route scan (a11y:smoke:strict fails on serious)
npm run audit:site                   # Playwright crawl+audit of deployed site (docs/testing/frontend-audit-test-plan.md)
npm run serve:ssr:durion-positivity-frontend   # run SSR server locally → :4000
```

Without `--browsers`, `ng test` falls back to jsdom, which lacks `matchMedia`, `DragEvent`, `CSS.escape`,
`Blob.text()` and native `<dialog>` modality — ~22 shell/dispatch-board specs then fail spuriously.

`npm run lint` runs ESLint via @angular-eslint (same as `npx ng lint`); CI runs it in `frontend-checks.yml`.

## SDK dependency (critical)

`@durion-sdk/*` packages are not npm dependencies. `scripts/sdk/install-sdk-packages.mjs` unpacks them
into `node_modules` on every `start`/`build`/`test`/`watch` (and on `postinstall`) from the committed
`.sdk-tarballs/`. The backend's API Artifacts Sync workflow updates those through
"chore(sdk): import Angular SDK" PRs. Local dev, CI, and the Docker/ECR image all build that
pinned version. Set `DURION_SDK_ANGULAR_PATH` to an SDK checkout only to try unreleased SDK changes;
that also repacks `.sdk-tarballs/`, so `git restore .sdk-tarballs` before committing. The nightly
`sdk-head-canary` job builds and tests against the SDK repo's HEAD to flag breaking changes early.

## Architecture

- **Angular 22**, standalone components only (no NgModules), strict TS, SSR via @angular/ssr + Express.
- **State = Angular Signals + RxJS** — no NgRx/Redux. Every routed page uses the two-signal state
  machine (`state` + `errorKey`) with reactive `effect()` data loading. See AGENTS.md for exact rules
  (`state.set('error')` always precedes `errorKey.set(...)`; `onCleanup()` for effect subscriptions).
- **HTTP** — backend calls go through the generated `@durion-sdk/*` Angular services, injected into a
  feature `services/` class (ADR-0041). `core/services/api-base.service.ts` is legacy transport for domains
  with no SDK package yet; never inject `HttpClient` directly in features. `auth.interceptor.ts` handles
  token attachment + silent refresh.
- **Routing** — `/` landing + `/login` public; everything under `/app` is gated by `authGuard`
  (`core/guards/auth.guard.ts`), with per-route `rolesChildGuard` via `data: { roles: [...] }`.
  Domain modules lazy-load under `/app`. Route tree in `src/app/app.routes.ts`.
- **i18n** — all UI strings via `| translate`; keys must exist in all 6 locale files under
  `src/assets/i18n/` (`en-US`, `es-US`, `es-MX`, `fr-CA`, `fr-FR`, `qps-ploc`; the pseudo-locale is
  regenerated by `npm run i18n:pseudo:generate`, never hand-edited).
- **Precedent catalog** — read `docs/EXEMPLARS.md` and the sibling services/pages of the domain before
  writing new code.
- **Styling** — plain CSS + CSS custom-property token model in `src/styles.css`; dark mode via
  `ThemeService`. No Tailwind/preprocessor.

## Feature module layout

Each domain under `src/app/features/<domain>/`: `<domain>.routes.ts`, `models/` (interfaces only),
`services/` (feature services wrapping the generated `@durion-sdk/*` facades, or `ApiBaseService` only where
no SDK package exists yet; each with co-located `*.service.spec.ts` — required), `pages/`
(routed components, 4 files each: ts/html/css/spec), optional `components/`. Global state services
(`AuthService`, `ThemeService`, `LocaleService`) live in `src/app/core/services/`; the chat panel's
`ChatStateService` lives with the shell in `src/app/features/shell/services/`.
