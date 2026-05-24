# Durion Positivity Frontend overview

- Purpose: Angular 21 single-page app with SSR for the Durion POS platform.
- Main capabilities: lazily loaded business domains (CRM, work execution, accounting, billing, inventory, product, order, location, people, shop management, admin, security), auth-protected shell, role-gated routes, i18n, dark mode, accessibility checks.
- Tech stack: Angular 21 standalone components, TypeScript 5.9 strict mode, Angular Signals, RxJS, @ngx-translate, SSR via @angular/ssr + Express 5, ESLint, Vitest, axe-core.
- Architecture rules: do not inject HttpClient directly in feature services; use ApiBaseService. Use TranslatePipe for all user-facing strings. Feature pages use the state/errorKey signal state machine.
- Repo layout: src/app/core for shared infrastructure, src/app/features for domain areas, public/ and src/assets for assets, scripts/ for SDK, a11y, and i18n utilities, design/ for theme docs.
- Important guidance lives in AGENTS.md and the frontend ADRs it references.