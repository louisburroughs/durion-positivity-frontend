# Durion Positivity Frontend

Angular 21 standalone frontend for the Durion POS platform. This application uses lazy-loaded feature domains, Angular Signals for page state, `@ngx-translate` for localization, and SSR output for production deployment.

## Stack

- Angular `21.1.x`
- TypeScript `5.9.x`
- RxJS `7.8`
- Express `5` (SSR runtime)
- `@ngx-translate/core` `17`
- ESLint + Angular ESLint
- Vitest via Angular test builder

## Core Principles

- Standalone components and route-based lazy loading (no NgModules)
- `ApiBaseService` is the only HTTP abstraction for feature services
- Angular Signals for page/component state
- All user-facing text via translation keys (`TranslatePipe`)
- Accessibility checks included in project workflow

## Prerequisites

- Node.js 22 LTS
- npm 11+ (project uses `npm@11.6.4`)
- Optional sibling checkout: `../durion-positivity-sdk-angular`
- Optional backend running at `http://localhost:8080`

## Install and Run

```bash
npm install
npm start
```

Notes:

- `npm start` runs `sdk:install` first, then serves Angular.
- In development, `proxy.conf.json` proxies backend traffic to `http://localhost:8080`.
- Default dev environment sets `mockAuth: true`.

## Build and SSR

```bash
npm run build
npm run serve:ssr:durion-positivity-frontend
```

- Browser and server bundles are generated in `dist/durion-positivity-frontend/`.
- SSR server listens on port `4000` by default.

## Quality Gates

```bash
# Unit tests (watch by default)
npm test

# Single-run tests
npx ng test --no-watch

# Lint
npm run lint

# Accessibility smoke checks
npm run a11y:smoke
npm run a11y:smoke:strict

# i18n checks
npm run i18n:check
```

## Feature Routing

Public routes:

- `/` -> landing page
- `/login` -> login page
- `/forbidden` -> access denied
- `/not-found` -> 404 page

Protected shell:

- `/app` guarded by `authGuard` and `rolesChildGuard`

Current lazy-loaded feature children under `/app`:

- `admin` (role-gated)
- `crm`
- `workexec`
- `accounting`
- `billing`
- `people`
- `location`
- `inventory`
- `product`
- `order`
- `security` (role-gated)
- `shopmgmt`
- `bulk-import`

## Internationalization

Locales in `src/assets/i18n/`:

- `en-US.json`
- `es-US.json`
- `es-MX.json`
- `fr-CA.json`
- `fr-FR.json`
- `qps-ploc.json`

Use translation keys for all UI text in templates and components.

## Project Layout

```text
durion-positivity-frontend/
├── src/
│   ├── app/
│   │   ├── core/                 # guards, interceptors, app-level services
│   │   ├── features/             # lazy-loaded domain features
│   │   ├── shared/               # shared services/components
│   │   ├── app.routes.ts
│   │   └── app.config.ts
│   ├── assets/i18n/
│   ├── environments/
│   ├── main.ts
│   ├── main.server.ts
│   └── server.ts
├── scripts/                      # sdk, i18n, a11y, icons automation
├── artifacts/                    # generated audit outputs
├── angular.json
├── proxy.conf.json
└── AGENTS.md
```

## CI/CD Workflows

GitHub workflows in `.github/workflows/`:

- `accessibility-gate.yml`
- `build-push-ecr.yml`

## Development Guidance

Read these before non-trivial changes:

- `AGENTS.md`
- relevant ADRs under `../durion/docs/adr/`
- nearest feature-level `README.md` (if present)

Focus areas enforced by policy include i18n, accessibility, state/error conventions, route navigation policy, and test coverage expectations.
