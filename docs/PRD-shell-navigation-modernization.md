# PRD: Shell + Navigation Modernization

## Status

- Draft
- Date: 2026-04-11
- Scope: `src/app/features/shell/**`, `src/app/app.routes.ts`, cross-feature navigation contracts

## Problem Statement

The current shell and shell subcomponents were built earlier than most feature pages and now diverge from the frontend ADR/design baseline used by newer modules. This creates inconsistent UX, route confusion, and avoidable accessibility/i18n debt.

## Hypothesis Check (Confirmed)

The hypothesis is correct: shell styling and navigation behavior are materially inconsistent with newer feature implementation patterns.

### Evidence

1. Route contract drift (`/chat` vs `/app`)

- `app.routes.ts` uses `/chat` as the protected shell root, with `/app` as a redirect alias.
- ADR-0010 states canonical protected routes under `/app/**`.
- Shell docs/comments still reference `/app/:domain` while implementation centers `/chat`.

1. Navigation inconsistency and incomplete IA

- `NavComponent` has mixed route roots (`/chat`, `/app/...`), duplicate intent (`Dashboard` and `Chat` both point to `/chat`), and only a few entries while many feature modules are available.
- Nav is not role-aware; admin destination is always shown even when protected by role metadata.

1. ADR-0030 (i18n) violations in shell UX copy

- Hard-coded user-facing strings exist in shell areas (dashboard text, chat empty state, placeholders, some ARIA labels, default username fallback).
- Newer features consistently use translation keys.

1. Styling pattern divergence from newer feature pages

- Shell uses a mix of inline component styles, bespoke class conventions, and emoji-based iconography.
- Newer pages typically follow common page/card/table/button semantics with token-driven styling and consistent visual language.

1. ADR-0029 (accessibility) partial gaps

- Mobile overlay uses non-semantic interactive markup (`div` behaving like a button).
- Shell has some accessibility strengths (skip link, landmarks), but interaction semantics should be normalized to native controls.

## Goals

1. Align shell and subcomponents with current ADRs and design-token usage.
2. Make route and navigation contracts unambiguous and internally consistent.
3. Provide complete, role-aware navigation to active feature areas.
4. Remove hard-coded shell UI strings and enforce translation usage.
5. Improve accessibility parity with newer feature screens.

## Non-Goals

1. Full redesign of each feature page.
2. Backend/API changes.
3. Chat backend implementation beyond shell UI contract updates.

## Standards and Constraints

- ADR-0010: canonical frontend architecture and route ownership.
- ADR-0029: semantic controls, keyboard/focus, skip-to-content continuity.
- ADR-0030: no hard-coded user-facing strings.
- ADR-0037: SPA navigation semantics (`routerLink` / `router.navigate`) for in-app routes.
- Maintain token-first styling (`src/styles.css`, `design/source/theme-tokens.md`).

## Target Architecture

### A. Route Topology Decision

Configure one canonical root and keep one alias only for backward compatibility.

Recommended:

1. Canonicalize to `/app/**` (ADR-0010 alignment).
2. Keep `/chat/** -> /app/**` redirect for compatibility window.
3. Update shell docs/comments to only describe canonical route contracts.

## B. Navigation Contract

Create a typed shell navigation registry as the single source of truth.

Proposed model:

- `NavLink { key, icon, route, exact?, roles?, featureFlag?, order, group }`
- Keys map to translation entries under `SHELL.NAV.*`.
- `roles` integrates with existing claims checks for visibility filtering.
- Route constants built from canonical root (`/app`).

Required nav behavior:

1. No duplicate destinations.
2. Active-state handling for deep routes.
3. Collapsed mode still keyboard/screen-reader friendly.
4. Render only links the user can access.

## C. Shell Component Modernization

### 1) `ShellComponent`

- Keep skip-link pattern.
- Replace overlay `div` interaction with semantic button behavior (or non-focusable presentation-only overlay + explicit close button).
- Normalize mobile nav open/close states with ARIA (`aria-expanded`, `aria-controls`).

### 2) `HeaderComponent`

- Externalize remaining copy (`Durion POS`, fallback username text, labels/titles if any hard-coded).
- Keep locale + theme controls but align icon treatment with app-wide icon strategy.

### 3) `NavComponent`

- Replace in-component static list with typed navigation registry service or constants file.
- Use canonical route root only.
- Add role-based visibility.
- Add translation keys for all labels and ARIA strings.

### 4) `DashboardComponent`

- Replace placeholder copy and emoji cards with token-consistent cards/actions and translated text.
- Convert inline template/styles to dedicated `.html/.css` files for consistency with current feature patterns.

### 5) `FooterComponent` and `ContentPanelComponent`

- Move inline templates/styles to dedicated files for maintainability and style consistency.
- Externalize footer text.

### 6) `ChatPanelComponent`

- Externalize all visible strings and ARIA labels.
- Replace hard-coded fallback system message with translation key.
- Ensure controls match common button/input semantics used in modern screens.

## D. Styling Convergence Rules

1. Use token-based values only (no new hard-coded colors).
2. Adopt consistent shell utility patterns used by newer features:

- card surfaces
- page header spacing rhythm
- focus ring treatment
- table/form/button conventions where applicable

1. Replace emoji nav/status icons with the approved icon system for visual consistency and localization resilience.
2. Respect reduced-motion preferences for chat typing animation and panel transitions.

## E. Documentation Alignment

Update:

1. `README.md` shell routing section to match canonical route decision.
2. Shell comments/TODOs that still reference legacy route assumptions.
3. If canonical route differs from ADR-0010, create ADR update.

## Acceptance Criteria

1. Route consistency

- Exactly one canonical shell root is documented and implemented.
- Alias path (if retained) redirects correctly and is documented as compatibility behavior.

1. Navigation correctness

- All active major feature entry points reachable from shell nav (or intentionally excluded with documented rationale).
- No broken links, duplicates, or mixed canonical/alias roots.
- Role-restricted links hidden for unauthorized users.

1. ADR compliance

- No hard-coded user-facing shell text.
- In-app navigation uses `routerLink`/`router.navigate` only.
- Shell interactions use semantic controls and pass keyboard-only traversal.

1. Visual consistency

- Shell uses current token-driven style language and aligns with modern page composition patterns.

1. Test coverage

- Unit tests for nav registry filtering (role + flags + route activation logic).
- Component tests for shell a11y interactions (skip link focus target, nav toggle state, translated labels rendered).
- Route tests for canonical + alias behavior.

## Delivery Plan (Phased)

### Phase 1: Architecture & Route Contract

- Decide canonical root (`/app` recommended).
- Implement route normalization and compatibility redirects.
- Update docs/comments.

### Phase 2: Navigation Registry + RBAC

- Introduce typed nav registry.
- Add translation keys and role filtering.
- Replace static `navItems`.

### Phase 3: Shell UI Convergence

- Refactor dashboard/footer/content-panel to dedicated files.
- Remove remaining hard-coded strings from shell and chat panel.
- Align styling with current design language and accessibility semantics.

### Phase 4: Validation

- Add/expand tests.
- Run accessibility smoke checks and keyboard walkthrough.
- Verify route + nav behavior across roles and locales.

## Risks and Mitigations

1. Risk: role-based nav filtering can hide needed links due to claim mismatch.

- Mitigation: test matrix with admin/non-admin accounts and explicit fallback destinations.

1. Risk: translation key churn across four locale files.

- Mitigation: add shell key namespace and enforce missing-key checks in CI/test workflows.

## Improvements Beyond Scope

1. Add a shared shell layout primitive library (`page-header`, `surface-card`, `state-panel`) to reduce CSS drift across all domains.
2. Introduce a central route metadata map (title, icon, roles, nav group) to power nav, breadcrumbs, and page titles from one source.
3. Add lightweight telemetry for shell nav usage to prioritize menu ordering and discoverability improvements.
4. Add E2E checks for role-based nav visibility and route guards to prevent regressions.
