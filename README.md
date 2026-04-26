# Durion Positivity Frontend

An **Angular 21** single-page application (with SSR) for the Durion POS platform. Sixteen lazily-loaded domain modules cover everything from CRM and work-order execution to accounting and shop management. The app ships with dark-mode theming, multi-locale support, role-based access control, and an automated accessibility gate in CI.

---

## Table of Contents

- [Durion Positivity Frontend](#durion-positivity-frontend)
  - [Table of Contents](#table-of-contents)
  - [Architecture Overview](#architecture-overview)
    - [Key design decisions](#key-design-decisions)
  - [Feature Modules](#feature-modules)
  - [Technology Stack](#technology-stack)
  - [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Install \& Run](#install--run)
    - [Build](#build)
  - [Routing \& Access Control](#routing--access-control)
    - [Guard chain](#guard-chain)
    - [Route table](#route-table)
  - [State Management](#state-management)
    - [Page state machine (mandatory pattern)](#page-state-machine-mandatory-pattern)
    - [Global services](#global-services)
  - [API Integration](#api-integration)
    - [`ApiBaseService`](#apibaseservice)
    - [Auth interceptor](#auth-interceptor)
    - [Login flow](#login-flow)
    - [Backend API contract](#backend-api-contract)
  - [Theming \& Styling](#theming--styling)
    - [Three-tier token model (`src/styles.css`)](#three-tier-token-model-srcstylescss)
    - [Theme switching](#theme-switching)
    - [Typography \& spacing](#typography--spacing)
  - [Internationalisation](#internationalisation)
    - [i18n scripts](#i18n-scripts)
  - [Testing](#testing)
    - [Unit tests — Vitest](#unit-tests--vitest)
    - [Accessibility tests — axe-core](#accessibility-tests--axe-core)
  - [Environment Configuration](#environment-configuration)
  - [Project Structure](#project-structure)
  - [CI/CD \& Deployment](#cicd--deployment)
    - [GitHub Actions workflows](#github-actions-workflows)
    - [Docker](#docker)
  - [Contributing](#contributing)
  - [Further Reading](#further-reading)

---

## Architecture Overview

```ascii
Browser / SSR (Express :4000)
        │
        ▼
  Angular Router
  ├── /            → LandingPageComponent        (public)
  ├── /login       → LoginComponent              (public)
  └── /app         → ShellComponent              (authGuard)
       ├── HeaderComponent  (theme toggle, locale picker, user menu)
       ├── NavComponent     (sidebar, role-filtered links)
       ├── ChatPanelComponent  (MCP chat, collapsible)
       └── <router-outlet>  → domain page components
```

### Key design decisions

- **Standalone components throughout** — no NgModules; every component declares its own `imports` array.
- **Angular Signals for state** — no NgRx or Redux. Page state is expressed as `signal<'idle' | 'loading' | 'ready' | 'empty' | 'error'>`.
- **Single HTTP wrapper** — all services call `ApiBaseService`; `HttpClient` is never injected directly.
- **Auth interceptor** handles token attachment and silent refresh transparently.
- **SSR enabled** — the production Docker image runs an Express server that pre-renders pages for improved first-paint and SEO.
- **ADR-driven** — ten mandatory ADRs (documented in `AGENTS.md`) govern patterns for state machines, reactive loading, mutations, testing, error keys, i18n, and accessibility.

---

## Feature Modules

All domain modules are lazy-loaded under the `/app` shell route.

| Module       | Route             | Description                           | Role Gate    |
| ------------ | ----------------- | ------------------------------------- | ------------ |
| `dashboard`  | `/app`            | Default landing page                  | —            |
| `crm`        | `/app/crm`        | Customer accounts, contacts, vehicles | —            |
| `workexec`   | `/app/workexec`   | Work order execution & dispatch       | —            |
| `accounting` | `/app/accounting` | GL posting, financial reporting       | —            |
| `billing`    | `/app/billing`    | Invoice & payment management          | —            |
| `inventory`  | `/app/inventory`  | Parts and supplies stock              | —            |
| `product`    | `/app/product`    | Product catalog management            | —            |
| `order`      | `/app/order`      | Sales order management                | —            |
| `location`   | `/app/location`   | Multi-store location management       | —            |
| `people`     | `/app/people`     | Employee profiles and assignments     | —            |
| `shopmgmt`   | `/app/shopmgmt`   | Shop operations and scheduling        | —            |
| `admin`      | `/app/admin`      | Platform administration               | `ROLE_ADMIN` |
| `security`   | `/app/security`   | Users, roles, and permissions         | `ROLE_ADMIN` |
| `system`     | `/app/system`     | 403 / 404 error pages                 | —            |
| `landing`    | `/`               | Public marketing page                 | —            |
| `auth`       | `/login`          | Login form                            | —            |

---

## Technology Stack

| Layer            | Technology                                                      |
| ---------------- | --------------------------------------------------------------- |
| Framework        | Angular 21.1.0                                                  |
| Language         | TypeScript 5.9.2 (strict mode, ES2022 target)                   |
| State            | Angular Signals + RxJS 7.8                                      |
| Styling          | Plain CSS + CSS custom properties (no Tailwind or preprocessor) |
| i18n             | @ngx-translate/core 17                                          |
| HTTP             | Angular HttpClient + custom `ApiBaseService`                    |
| SSR              | @angular/ssr 21 + Express 5                                     |
| Build            | Angular CLI / `@angular/build` application builder              |
| Unit tests       | Vitest 4 + jsdom 27                                             |
| Accessibility    | axe-core 4.11                                                   |
| Linting          | ESLint 10 + @angular-eslint 21                                  |
| Containerisation | Docker (multi-stage, node:22-alpine)                            |

---

## Getting Started

### Prerequisites

| Tool    | Version | Notes                                                                |
| ------- | ------- | -------------------------------------------------------------------- |
| Node.js | 22 LTS  | Use [mise](https://mise.jdx.dev/): `mise install` reads `.mise.toml` |
| npm     | 11.6.4  | Pinned via corepack                                                  |

### Install & Run

```bash
# Install dependencies
npm install

# Frontend commands auto-install the Angular SDK packages into node_modules
# from one of:
#   1. DURION_SDK_ANGULAR_PATH
#   2. ./.sdk-src
#   3. ../durion-positivity-sdk-angular
#
# The sibling SDK repo must already exist locally unless CI/Docker provides .sdk-src.

# Start the dev server (http://localhost:4200, hot reload)
npm start

# In dev mode the API is proxied to http://localhost:8080
# mockAuth is enabled — a fake JWT is used so no backend is required
```

### Build

```bash
# Production build (outputs to dist/)
npm run build

# If SDK packages are not already installed in node_modules, the build first
# packs and installs them from the configured Angular SDK source checkout.
#
# Run the SSR production server locally
npm run serve:ssr:durion-positivity-frontend   # http://localhost:4000

# Watch build (development, incremental)
npm run watch
```

---

## Routing & Access Control

### Guard chain

1. **`authGuard`** — applied to the entire `/app` tree. Unauthenticated users are redirected to `/login?returnUrl=...`.
2. **`rolesChildGuard`** — applied per-child via `data: { roles: ['ROLE_ADMIN'] }`. Users without the required role land on `/forbidden`.

### Route table

```
/                   → LandingPageComponent         (public)
/login              → LoginComponent               (public)
/app                → ShellComponent               (authGuard)
  /app              → DashboardComponent           (default child)
  /app/crm          → CrmModule (lazy)
  /app/workexec     → WorkexecModule (lazy)
  /app/accounting   → AccountingModule (lazy)
  /app/billing      → BillingModule (lazy)
  /app/inventory    → InventoryModule (lazy)
  /app/product      → ProductModule (lazy)
  /app/order        → OrderModule (lazy)
  /app/location     → LocationModule (lazy)
  /app/people       → PeopleModule (lazy)
  /app/shopmgmt     → ShopmgmtModule (lazy)
  /app/admin        → AdminModule (lazy, ROLE_ADMIN)
  /app/security     → SecurityModule (lazy, ROLE_ADMIN)
/forbidden          → AccessDeniedComponent        (public)
/not-found          → NotFoundComponent            (public)
**                  → redirect → /not-found
```

---

## State Management

Angular Signals are used throughout — no external state library.

### Page state machine (mandatory pattern)

Every routed page component follows the same state machine:

```typescript
readonly state    = signal<'idle' | 'loading' | 'empty' | 'ready' | 'error'>('idle');
readonly errorKey = signal<string | null>(null);
```

Data is loaded inside a reactive `effect()`:

```typescript
effect((onCleanup) => {
  this.state.set('loading');
  const sub = this.myService.getItems().subscribe({
    next: (items) => {
      this.items.set(items);
      this.state.set(items.length ? 'ready' : 'empty');
    },
    error: () => {
      this.state.set('error');
      this.errorKey.set('errors.items.load');
    },
  });
  onCleanup(() => sub.unsubscribe());
});
```

### Global services

| Service            | State held                                                                                           | Storage                        |
| ------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------ |
| `AuthService`      | `accessToken`, `refreshToken`, `roles`, `isAuthenticated` (computed), `currentUserClaims` (computed) | localStorage / sessionStorage  |
| `ThemeService`     | `theme` signal, `isDark` (computed)                                                                  | localStorage (`durion-theme`)  |
| `LocaleService`    | `currentLocale` signal                                                                               | localStorage (`durion.locale`) |
| `ChatStateService` | `messages` signal, `isEmpty` (computed)                                                              | In-memory                      |

---

## API Integration

### `ApiBaseService`

All HTTP calls go through `ApiBaseService`. Domain services must **never** inject `HttpClient` directly.

```typescript
private api = inject(ApiBaseService);

// GET /items → {apiBaseUrl}/items
this.api.get<Item[]>('/items');

// POST /items
this.api.post<Item>('/items', payload);

// PUT / PATCH / DELETE / deleteWithBody also available
```

### Auth interceptor

- Attaches `Authorization: Bearer <token>` to every outbound request.
- On **401**: attempts one silent token refresh, then retries the original request.
- On refresh failure: calls `AuthService.logoutWithRedirect(currentPath)` → `/login?returnUrl=...&sessionExpired=true`.

### Login flow

```http
POST /security-service/v1/auth/login
{ username, password }
  ↓
{ accessToken, refreshToken, tokenType }
  ↓
Tokens stored in localStorage
Roles extracted from JWT `roles` claim → sessionStorage
isAuthenticated computed signal becomes true
```

### Backend API contract

| Purpose        | Method | Path                                 |
| -------------- | ------ | ------------------------------------ |
| Login          | POST   | `/security-service/v1/auth/login`    |
| Token refresh  | POST   | `/security-service/v1/auth/refresh`  |
| Validate token | GET    | `/security-service/v1/auth/validate` |
| MCP chat       | POST   | `/mcp-server/v1/mcp/chat`            |
| Domain APIs    | varies | `/api/...`                           |

In development, the Angular dev server proxies `/api`, `/security-service`, and `/mcp-server` to `http://localhost:8080`.

---

## Theming & Styling

Styling uses **plain CSS with CSS custom properties** — no Tailwind, no SCSS.

### Three-tier token model (`src/styles.css`)

```text
Tier 1 — Raw palette (never reference directly in components)
  --durion-blue-800, --durion-teal-400, ...

Tier 2 — Brand semantic (stable aliases)
  --brand-primary: var(--durion-blue-700)
  --brand-accent:  var(--durion-teal-400)

Tier 3 — Theme-switchable (swap on data-theme attribute)
  [data-theme='light']  { --themeBackground: var(--durion-grey-100); ... }
  [data-theme='dark']   { --themeBackground: var(--durion-grey-900); ... }
```

Component CSS files should reference **Tier 2 or Tier 3 tokens only**.

### Theme switching

`ThemeService` writes `light` or `dark` to `<html data-theme="...">` and persists the choice to localStorage. The header's toggle button calls `themeService.toggle()`.

### Typography & spacing

| Token                                         | Value                 |
| --------------------------------------------- | --------------------- |
| `--font-primary`                              | Michelin Unit Titling |
| `--font-body`                                 | Noto Sans             |
| `--space-1` … `--space-8`                     | 0.25 rem … 2 rem      |
| `--radius-sm` / `--radius-md` / `--radius-lg` | 4 px / 8 px / 16 px   |
| `--transition-fast` / `--transition-base`     | 150 ms / 250 ms       |

Full token inventory: `design/source/theme-tokens.md`.

---

## Internationalisation

Translation is handled by **@ngx-translate/core**. Translation keys live in JSON files under `src/assets/i18n/`.

| Locale            | File                                                 |
| ----------------- | ---------------------------------------------------- |
| English (US)      | `en-US.json`                                         |
| Spanish (US)      | `es-US.json`                                         |
| French (Canadian) | `fr-CA.json`                                         |
| Pseudo locale     | `qps-ploc.json` (generated; used for layout testing) |

**Use `TranslatePipe` in every template** — hardcoded user-facing strings are a lint error.

```html
{{ 'common.save' | translate }}
```

### i18n scripts

```bash
# Check for missing keys across all locales
npm run i18n:check:missing

# Regenerate pseudo locale from en-US
npm run i18n:pseudo:generate

# Verify pseudo locale is up to date
npm run i18n:pseudo:check

# Run both checks at once
npm run i18n:check
```

---

## Testing

### Unit tests — Vitest

```bash
# Watch mode (development)
npm test

# Single pass (CI)
npx ng test --no-watch

# Scope to one domain
npx ng test --include="src/app/features/crm/**/*.spec.ts" --no-watch
```

**Conventions (ADR-0035):**

- Every public service method needs at least one test.
- Fixtures must be explicitly typed — no `any`.
- Error paths must assert both `state()` and `errorKey()`.
- Use `TestBed.configureTestingModule` with real component imports; mock services only at the provider level.

### Accessibility tests — axe-core

```bash
# Audit all routed components (fails on critical violations)
npm run a11y:smoke

# Stricter threshold — also fail on serious violations
npm run a11y:smoke:strict
```

The accessibility gate runs automatically on every PR and push to `main`. Reports are uploaded as CI artifacts.

---

## Environment Configuration

Configuration is TypeScript-based (no `.env` files). Angular CLI swaps the file at build time via `fileReplacements`.

| Key          | Development                 | Production           |
| ------------ | --------------------------- | -------------------- |
| `apiBaseUrl` | `http://localhost:8080/api` | `/api` (same-origin) |
| `mockAuth`   | `true`                      | `false`              |

### Runtime storage keys

| Key                     | Storage        | Content                       |
| ----------------------- | -------------- | ----------------------------- |
| `durion-access-token`   | localStorage   | JWT access token              |
| `durion-refresh-token`  | localStorage   | JWT refresh token             |
| `durion-theme`          | localStorage   | `light` or `dark`             |
| `durion.locale`         | localStorage   | e.g. `en-US`                  |
| `durion-user-roles`     | sessionStorage | Decoded roles array           |
| `durion-user-roles-exp` | sessionStorage | Roles cache expiry (epoch ms) |

---

## Project Structure

```
durion-positivity-frontend/
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── guards/              # authGuard, rolesChildGuard
│   │   │   ├── interceptors/        # authInterceptor
│   │   │   └── services/            # AuthService, ThemeService, LocaleService, ChatStateService
│   │   ├── features/
│   │   │   ├── auth/                # LoginComponent
│   │   │   ├── dashboard/
│   │   │   ├── crm/
│   │   │   │   ├── models/          # TypeScript interfaces
│   │   │   │   ├── services/        # HTTP layer (extends ApiBaseService)
│   │   │   │   ├── pages/           # Routed page components
│   │   │   │   └── components/      # Domain-scoped sub-components
│   │   │   ├── workexec/
│   │   │   ├── accounting/
│   │   │   ├── billing/
│   │   │   ├── inventory/
│   │   │   ├── product/
│   │   │   ├── order/
│   │   │   ├── location/
│   │   │   ├── people/
│   │   │   ├── shopmgmt/
│   │   │   ├── admin/
│   │   │   ├── security/
│   │   │   ├── system/              # 403 / 404 pages
│   │   │   └── landing/             # Public marketing page
│   │   ├── shared/
│   │   │   ├── services/            # ApiBaseService
│   │   │   └── components/          # Shell: Header, Nav, Footer, ChatPanel, ContentPanel
│   │   ├── app.routes.ts
│   │   ├── app.config.ts
│   │   └── app.ts
│   ├── environments/
│   │   ├── environment.ts           # Dev config (mockAuth: true)
│   │   └── environment.prod.ts      # Prod config
│   ├── assets/
│   │   └── i18n/                    # en-US.json, es-US.json, fr-CA.json, qps-ploc.json
│   ├── styles.css                   # Global theme tokens (CSS custom properties)
│   ├── main.ts                      # Browser entry point
│   ├── main.server.ts               # SSR entry point
│   └── server.ts                    # Express SSR server
├── design/
│   └── source/
│       └── theme-tokens.md          # Full CSS token inventory
├── scripts/
│   ├── a11y/                        # axe-core smoke test runner
│   └── i18n/                        # Key-check and pseudo-locale generators
├── artifacts/                       # Generated test/a11y reports
├── angular.json                     # Build, serve, test configuration
├── tsconfig.json                    # TypeScript configuration (strict)
├── package.json
├── Dockerfile
├── AGENTS.md                        # Mandatory ADRs and copilot guide
└── README.md
```

---

## CI/CD & Deployment

### GitHub Actions workflows

| Workflow                 | Trigger                   | Purpose                                                               |
| ------------------------ | ------------------------- | --------------------------------------------------------------------- |
| `accessibility-gate.yml` | PR · push to `main`       | Run `a11y:smoke`, fail on critical violations, upload report artifact |
| `build-push-ecr.yml`     | Release · manual dispatch | Build Docker image, push to AWS ECR                                   |

### Docker

The image is built in two stages:

1. **Builder** (`node:22-alpine`) — installs deps (`npm ci`), runs `npm run build`.
2. **Runtime** (`node:22-alpine`) — copies `dist/` and prod-only deps, runs the SSR server.

```dockerfile
USER node
ENV PORT=4000 NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/durion-positivity-frontend/server/server.mjs"]
```

In production, a reverse proxy routes:

- `/` → frontend SSR container (`:4000`)
- `/api`, `/security-service`, `/mcp-server` → backend API gateway (`:8080`)

---

## Contributing

1. **Node version** — run `mise install` to activate the correct Node.js version.
2. **Lint before committing** — `npx ng lint`.
3. **i18n check** — `npm run i18n:check` (missing keys fail CI).
4. **Accessibility** — `npm run a11y:smoke` must pass before opening a PR.
5. **Tests** — `npx ng test --no-watch`; every new public service method needs a test.
6. **ADRs** — read `AGENTS.md` before adding state, making HTTP calls, or touching the theme system. Ten mandatory ADRs apply.
7. **No hardcoded strings** — all user-facing text must go through `TranslatePipe` and be added to all locale files.

---

## Further Reading

| Document                       | Location                        |
| ------------------------------ | ------------------------------- |
| Mandatory ADRs & copilot guide | `AGENTS.md`                     |
| CSS token inventory            | `design/source/theme-tokens.md` |
| Existing README (v1)           | `README.md`                     |
