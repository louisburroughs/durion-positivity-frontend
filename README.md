# Durion Positivity Frontend

![Angular](https://img.shields.io/badge/Angular-21.1.x-dd0031)
![Node](https://img.shields.io/badge/Node-22_LTS-339933)
![Branch](https://img.shields.io/badge/branch-master-brightgreen)

## Overview

Angular 21 standalone frontend for the Durion POS platform. The app uses
lazy-loaded feature domains, Angular Signals for page state, `@ngx-translate`
for localization, and SSR output for production runtime.

## Tech Stack

- Angular `21.1.x`
- TypeScript `5.9.x`
- RxJS `7.8`
- Express `5` (SSR runtime)
- `@ngx-translate/core` `17`
- ESLint + Angular ESLint
- Angular test builder (`ng test`)

## Prerequisites

- Node.js 22 LTS
- npm 11+ (project uses `npm@11.6.4`)
- Optional sibling checkout: `../durion-positivity-sdk-angular`
- Optional backend at `http://localhost:8080`

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server
npm start
```

Development notes:

- `npm start` runs `sdk:install` before serving.
- `proxy.conf.json` proxies backend traffic to `http://localhost:8080`.
- `mockAuth` defaults to `true` in the development environment.

## Common Commands

```bash
# Build browser + server bundles
npm run build

# Run SSR server locally
npm run serve:ssr:durion-positivity-frontend

# Lint
npm run lint

# Unit tests
npm test
npx ng test --no-watch

# Accessibility checks
npm run a11y:smoke
npm run a11y:smoke:strict

# Localization checks
npm run i18n:check
```

## Repository Layout

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

## Standards and Workflow

Core frontend standards:

- Standalone components and route-based lazy loading
- `ApiBaseService` as the only feature HTTP abstraction
- Signals-based state in pages/components
- All user-facing strings localized via translation keys
- Accessibility checks and i18n validation in standard workflow

Current routing model:

- Public routes: `/`, `/login`, `/forbidden`, `/not-found`
- Protected shell: `/app` with `authGuard` and `rolesChildGuard`
- Lazy children under `/app`: `admin`, `crm`, `workexec`, `accounting`,
  `billing`, `people`, `location`, `inventory`, `product`, `order`,
  `security`, `shopmgmt`, `bulk-import`

Locale files in `src/assets/i18n/`:

- `en-US.json`
- `es-US.json`
- `es-MX.json`
- `fr-CA.json`
- `fr-FR.json`
- `qps-ploc.json`

CI workflows in `.github/workflows/`:

- `accessibility-gate.yml`
- `build-push-ecr.yml`

## References

- `AGENTS.md`
- `../durion/docs/adr/`
- `README.v1.md`
