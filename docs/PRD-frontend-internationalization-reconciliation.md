---
title: "PRD: Frontend Internationalization Reconciliation (ADR-0030)"
owner: "louisburroughs/durion-positivity-frontend"
status: "draft"
last_updated: "2026-03-28"
---

# Product Requirements Document — Frontend Internationalization Reconciliation (ADR-0030)

## 1. Objective

Align `durion-positivity-frontend` with ADR-0030 (`Frontend Internationalization and Localization Policy`) and deliver deterministic multilingual behavior across active Angular features.

This PRD includes implementation of a user-facing language toggle in the app header.

## 2. Scope

In scope:
- Translation key and fallback reconciliation for active domains
- Locale-safe formatting of dates, numbers, and currency
- Language selection UX in shell header
- Persistence of user language preference
- Missing-key and pseudo-localization quality checks

Out of scope:
- Full translation of all future/stub feature domains
- Server-side user profile persistence for locale preference (future phase)

## 3. Current State

- `@ngx-translate` is configured in `app.config.ts`.
- Language files exist at `src/assets/i18n/en-US.json`, `es-US.json`, `fr-CA.json`.
- Language selection currently relies on app bootstrap logic, not explicit user control.
- There is no header language toggle.

## 4. Target Standards

- BCP 47 locale identifiers (`en-US`, `es-US`, `fr-CA`, etc.)
- ICU/messageformat-capable translation patterns for plural/select logic
- Locale-sensitive formatting via Intl/CLDR-backed APIs (never manual formatting)
- Deterministic locale fallback chain and missing-key prevention in production

## 5. Functional Requirements

### FR-1: Header Language Toggle (Required)
- Add a language toggle control in the shell header.
- Control must be keyboard-accessible and screen-reader accessible.
- Supported locales for initial release: `en-US`, `es-US`, `fr-CA`.
- Selecting a language applies it immediately across routed content.

Target files:
- `src/app/features/shell/components/header/header.component.ts`
- `src/app/features/shell/components/header/header.component.html`
- `src/app/features/shell/components/header/header.component.css`

### FR-2: Locale Preference Persistence
- Persist selected locale on the client (localStorage/session-safe strategy).
- On app bootstrap, apply persisted locale before falling back to browser/default locale.
- Fallback order:
  1. persisted user selection
  2. browser/app preferred locale
  3. default locale `en-US`

### FR-3: Translation Key Hygiene
- Remove hard-coded user-facing strings from active features.
- Enforce feature-key namespacing conventions.
- Ensure no raw translation keys render in UI.

### FR-4: Locale-Safe Formatting
- Dates/times/numbers/currency displayed with locale-aware formatting.
- Replace manual formatting with Intl/Angular locale-aware formatting where needed.

### FR-5: Missing-Key and Pseudo-Localization Checks
- Add checks to detect missing keys for release locales.
- Add pseudo-localization pass for layout resilience and truncation detection.

## 6. Non-Functional Requirements

- Locale switching should not require full page reload.
- Language toggle latency must be low enough for immediate UX feedback.
- Translation files and key management should remain maintainable by feature teams.

## 7. Implementation Plan

### Phase A: Locale Service and Bootstrap Reconciliation
- Introduce/standardize locale orchestration service in `src/app/core/services/`.
- Centralize locale resolution and persistence logic.
- Update app bootstrap locale selection to use service-driven fallback order.

### Phase B: Header Toggle Delivery
- Add language selector UI in header (button + menu or select).
- Wire selection to locale service and translation provider.
- Add accessibility semantics and keyboard handling.

### Phase C: Active Feature String Reconciliation
- Reconcile active-domain strings to translation keys.
- Fill gaps in `en-US`, `es-US`, and `fr-CA` resources.

### Phase D: Formatting and Quality Gates
- Reconcile locale-sensitive formatting behavior.
- Add missing-key and pseudo-locale checks to test workflow.
- Implemented quality gate commands:
  - `npm run i18n:check:missing`
  - `npm run i18n:pseudo:generate`
  - `npm run i18n:pseudo:check`
  - `npm run i18n:check`

## 8. Deliverables

- Header language toggle in shell UI
- Locale orchestration/persistence service
- Updated i18n resources for active routes
- Missing-key and pseudo-localization check workflow
- Contributor checklist for ADR-0030 compliance

Quality gate workflow commands:
- `npm run i18n:check:missing` validates `es-US` and `fr-CA` against `en-US` keyspace.
- `npm run i18n:pseudo:generate` regenerates pseudo-locale file `src/assets/i18n/qps-ploc.json`.
- `npm run i18n:pseudo:check` fails if pseudo-locale file is stale.
- `npm run i18n:check` runs missing-key check plus pseudo-locale freshness check.

## 9. Acceptance Criteria

1. User can switch language from the header on any `/app/*` route.
2. Selected language persists across refresh/session restart.
3. App uses deterministic fallback order and defaults to `en-US` when needed.
4. No raw translation keys appear on active feature pages.
5. Locale-sensitive date/number/currency values render correctly by locale.
6. Missing-key checks and pseudo-localization checks are documented and runnable.

## 10. Risks and Mitigations

- Risk: incomplete translation coverage during active feature development.
  - Mitigation: enforce per-PR key completeness for changed copy.
- Risk: layout breakage in non-English locales.
  - Mitigation: pseudo-localization checks and responsive review.
- Risk: conflicting locale logic across components.
  - Mitigation: single locale service as source of truth.

## 11. Dependencies

- ADR-0030 policy baseline
- Existing translation infrastructure (`@ngx-translate`)
- Shell component ownership for header UX updates

## 12. References

- `../durion/docs/adr/0030-frontend-internationalization-localization-policy.adr.md`
- `src/app/app.config.ts`
- `src/app/app.ts`
- `src/assets/i18n/en-US.json`
- `src/assets/i18n/es-US.json`
- `src/assets/i18n/fr-CA.json`
- `src/assets/i18n/qps-ploc.json`
- `scripts/i18n/check-missing-keys.mjs`
- `scripts/i18n/generate-pseudo-locale.mjs`
