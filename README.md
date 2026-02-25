# Durion POS – Positivity Platform Frontend

Angular 21 single-page application for the Durion POS system.

## Quick Start

```bash
npm install
npm start          # dev server → http://localhost:4200
npm run build      # production build → dist/
npm test           # unit tests (Vitest)
```

## Architecture

```
src/
  app/
    core/                          # Singleton services, interceptors, guards
      guards/    auth.guard.ts
      interceptors/ auth.interceptor.ts
      models/    auth.models.ts
      services/  auth.service.ts | api-base.service.ts | theme.service.ts
    features/
      auth/                        # Public auth feature (lazy-loaded)
        login.component.ts/html/css
      shell/                       # Protected app shell (lazy-loaded)
        shell.component.ts/html/css
        components/
          header/                  # Top bar: logo, theme toggle, user/logout
          footer/                  # Bottom bar
          nav/                     # Collapsible left sidebar
          chat-panel/              # Chat UI (message list + input)
          content-panel/           # Router outlet for domain pages
        services/
          chat-state.service.ts    # In-memory chat message store (signals)
          chat-api.service.ts      # Placeholder for LLM/chat backend
        dashboard/
          dashboard.component.ts   # Default /app landing page placeholder
  environments/
    environment.ts          # DEV  – apiBaseUrl: http://localhost:8080/api
    environment.prod.ts     # PROD – apiBaseUrl: /api
  styles.css                # Global CSS theme variables
docs/
  theme-tokens.md           # Full token inventory (raw, semantic, runtime)
```

### Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Component style | Standalone components | Angular 21 best practice; no NgModules |
| State | Angular Signals | Reactive, no Subscription boilerplate |
| Theming | CSS custom properties + `data-theme` on `<html>` | Zero-JS theme switch; SSR-friendly |
| HTTP | Functional `HttpInterceptorFn` | Tree-shakeable; works with `provideHttpClient` |
| Auth | JWT in localStorage | Simple; refresh token stub ready for backend |
| Routing | Lazy-loaded `loadComponent` / `loadChildren` | Each domain loads on demand |

## Routing

| Path | Auth? | Component |
|---|---|---|
| `/login` | Public | `LoginComponent` |
| `/chat` | Public | `ChatPanelComponent` |
| `/app` | Protected | `ShellComponent` → `DashboardComponent` |
| `/app/:domain` | Protected | Future domain modules (register in `app.routes.ts`) |
| `/` | – | Redirects → `/app` (guard sends to `/login` if unauthenticated) |

### Role-based route access

- `/app` remains authenticated via `authGuard`.
- Child routes under `/app` can optionally enforce roles via route metadata:

  ```ts
  {
    path: 'orders',
    data: { roles: ['ROLE_MANAGER', 'ROLE_ADMIN'] },
    loadChildren: () => import('./features/orders/orders.routes').then(m => m.ORDERS_ROUTES)
  }
  ```

- `rolesChildGuard` reads `data.roles` and checks `AuthService.hasAnyRole(...)`.

## Adding a Domain Module

1. Create `src/app/features/<domain>/` with its own `<domain>.routes.ts`.
2. Register in `app.routes.ts` as a child of the `/app` shell:
   ```ts
   { path: 'orders', loadChildren: () => import('./features/orders/orders.routes').then(m => m.ORDERS_ROUTES) }
   ```
3. Add a nav entry in `NavComponent.navItems`.

## Theming

- All colors use CSS variables from `src/styles.css`.
- Toggle: header button or `ThemeService.toggle()` from any component.
- Preference persists in `localStorage` (`durion-theme`).
- Extended tokens documented in `docs/theme-tokens.md`.

## Backend Integration

- Set `apiBaseUrl` in `src/environments/environment.ts` (dev) or `environment.prod.ts` (prod).
- `ApiBaseService` is the HTTP wrapper – inject it in feature services instead of `HttpClient` directly.
- `authInterceptor` attaches `Authorization: Bearer <token>` automatically.
- Refresh token flow is stubbed in `AuthService.refreshTokens()` — wire to `POST /auth/refresh` when backend exposes it.
- Chat backend: implement `ChatApiService.sendMessage()` to connect to the LLM endpoint.

## Environment Variables

| Variable | Default (dev) | Description |
|---|---|---|
| `apiBaseUrl` | `http://localhost:8080/api` | Backend REST API base URL |

