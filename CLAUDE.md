# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Authoritative guides

`AGENTS.md` is the canonical agent guide — read it first. It holds the ADR-driven coding
patterns (state machine, effect cleanup, mutation error handling, typed fixtures), the PR
checklist, and the "Common Mistakes" table. The ADRs it references live in the sibling
`../durion/docs/adr/` repo. `README.md` covers architecture, routing, theming, and i18n in depth.
Do not duplicate those here — follow them.

## Commands

```bash
npm start                            # dev server → localhost:4200 (proxies API to :8080, mockAuth on)
npm run build                        # prod build → dist/
npm test                             # Vitest suite (watch mode)
npx ng test --no-watch               # single CI pass
npx ng test --include="src/app/features/<domain>/**/*.spec.ts" --no-watch   # one domain suite
npm run lint:css                     # stylelint src/**/*.css
npm run i18n:check                   # missing-keys + pseudo-locale check
npm run a11y:smoke                   # axe-core route scan (a11y:smoke:strict fails on serious)
npm run audit:site                   # Playwright crawl+audit of deployed site (docs/testing/frontend-audit-test-plan.md)
npm run serve:ssr:durion-positivity-frontend   # run SSR server locally → :4000
```

No JS/TS lint script — ESLint is configured via @angular-eslint; run `npx ng lint` if needed.

## SDK dependency (critical)

`@durion-sdk/*` packages are refreshed into `node_modules` from a local checkout on every
`start`/`build`/`test`/`watch` via `scripts/sdk/install-sdk-packages.mjs` (also runs on `postinstall`).
Source resolved in order: `DURION_SDK_ANGULAR_PATH` env → `./.sdk-src` → `../durion-positivity-sdk-angular`.
The sibling SDK repo must exist locally unless CI/Docker supplies `.sdk-src` or prepacked tarballs
(`.sdk-tarballs/`). If a build fails on missing `@durion-sdk/*`, that source is the cause.

## Architecture

- **Angular 21**, standalone components only (no NgModules), strict TS, SSR via @angular/ssr + Express.
- **State = Angular Signals + RxJS** — no NgRx/Redux. Every routed page uses the two-signal state
  machine (`state` + `errorKey`) with reactive `effect()` data loading. See AGENTS.md for exact rules
  (`state.set('error')` always precedes `errorKey.set(...)`; `onCleanup()` for effect subscriptions).
- **HTTP** — all domain services call `core/services/api-base.service.ts`; never inject `HttpClient`
  directly in features. `auth.interceptor.ts` handles token attachment + silent refresh.
- **Routing** — `/` landing + `/login` public; everything under `/app` is gated by `authGuard`
  (`core/guards/auth.guard.ts`), with per-route `rolesChildGuard` via `data: { roles: [...] }`.
  Domain modules lazy-load under `/app`. Route tree in `src/app/app.routes.ts`.
- **i18n** — all UI strings via `| translate`; keys must exist in all 4 locale files under
  `src/assets/i18n/` (`en-US`, `es-US`, `fr-CA`, `qps-ploc`).
- **Styling** — plain CSS + CSS custom-property token model in `src/styles.css`; dark mode via
  `ThemeService`. No Tailwind/preprocessor.

## Feature module layout

Each domain under `src/app/features/<domain>/`: `<domain>.routes.ts`, `models/` (interfaces only),
`services/` (ApiBaseService wrappers, each with co-located `*.service.spec.ts` — required), `pages/`
(routed components, 4 files each: ts/html/css/spec), optional `components/`. Global state services
(`AuthService`, `ThemeService`, `LocaleService`, `ChatStateService`) live in `src/app/core/services/`.
