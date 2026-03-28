---
title: "PRD: Frontend Accessibility Reconciliation (ADR-0029)"
owner: "louisburroughs/durion-positivity-frontend"
status: "draft"
last_updated: "2026-03-28"
---

# Product Requirements Document — Frontend Accessibility Reconciliation (ADR-0029)

## 1. Objective

Align `durion-positivity-frontend` with ADR-0029 (`Frontend Accessibility Baseline Policy`) by implementing a measurable WCAG 2.2 AA baseline across the Angular app.

Success means accessibility is part of delivery quality gates, not one-off remediation.

## 2. Scope

In scope:
- Shell navigation and layout primitives (`header`, `nav`, `content`, `footer`)
- Feature pages currently implemented and in active wave execution
- Core interaction patterns: forms, tables, dialogs, alerts, loading/error states
- Accessibility testing and quality gates in CI-ready form

Out of scope:
- Full legacy parity audit of screens that are not yet active in execution waves
- Design-system visual refresh unrelated to accessibility

## 3. Current State

- Accessibility behavior is partially present (landmarks, some labels, focus styles).
- Standards are not yet consistently enforced app-wide.
- No single reconciliation backlog ties implementation to ADR-0029 acceptance criteria.

## 4. Target Standards

- WCAG 2.2 Level AA (minimum baseline)
- WAI-ARIA Authoring Practices for advanced widgets
- Keyboard-only operability for all interactive flows
- Deterministic focus management for overlays/dialogs
- Programmatic form labels and assistive error messaging

## 5. Functional Requirements

### FR-1: Semantic and ARIA Baseline
- Use native interactive elements first.
- Eliminate non-semantic clickable containers where present.
- Ensure each interactive control has an accessible name.

### FR-2: Keyboard and Focus
- Every route-level screen is fully usable with keyboard only.
- Ensure visible focus indicator on all focusable controls.
- No keyboard traps.
- Dialog/modal patterns must trap focus and restore focus on close.

### FR-3: Forms and Errors
- All form inputs have label association.
- Invalid/required states are exposed to assistive tech.
- Error summaries/messages are announced and linked to controls.
- No error communication by color alone.

### FR-4: Structure and Navigation
- Consistent heading hierarchy per page.
- Shell includes skip-to-content behavior.
- Landmark usage remains correct (`banner`, `main`, `navigation`, `contentinfo`).

### FR-5: Visual and Motion
- Contrast ratios meet AA requirements.
- Motion respects `prefers-reduced-motion`.
- Icon-only actions include accessible labels.

### FR-6: Accessibility Quality Gates
- Add automated axe-based checks for critical routes.
- Add keyboard smoke test checklist for each changed feature page.
- Add manual screen-reader smoke verification checklist.

## 6. Non-Functional Requirements

- Accessibility checks must run in local dev and CI workflows.
- New critical accessibility violations block merge/release.
- Reusable accessibility fixes must be implemented at component/pattern level first.

## 7. Implementation Plan

### Phase A: Baseline Audit and Backlog
- Build a route-by-route accessibility checklist for active pages.
- Prioritize shell and shared patterns before individual page fixes.

### Phase B: Shell and Shared Pattern Hardening
- Update shell/header/nav patterns for keyboard and landmark reliability.
- Introduce reusable helpers for focus and assistive announcements.

### Phase C: Feature Reconciliation
- Reconcile high-traffic features first (`workexec`, `crm`, `accounting`, `shopmgmt`, `location`).
- Reconcile forms/tables/alerts with standardized pattern usage.

### Phase D: Quality Gate Integration
- Add automated accessibility checks to CI.
- Document exception process and severity model.

## 8. Deliverables

- Accessibility reconciliation backlog with issue ownership
- Updated shared UI patterns and shell behavior
- Automated accessibility checks for critical flows
- Updated contributor checklist with ADR-0029 DoD gates

## 9. Acceptance Criteria

1. Critical routes pass automated accessibility checks with zero critical findings.
2. Keyboard-only navigation works end-to-end for shell + top features.
3. Forms in active features expose validation/accessibility semantics correctly.
4. Skip-to-content and focus restoration behavior are implemented and verified.
5. Accessibility checks are documented and executable by engineers and QA.

## 10. Risks and Mitigations

- Risk: scope creep from app-wide audit.
  - Mitigation: phase by active domains and shared patterns first.
- Risk: conflicting UX changes while feature work continues.
  - Mitigation: centralize accessibility pattern updates in shared components.
- Risk: incomplete manual verification.
  - Mitigation: enforce checklist artifacts in PR reviews.

## 11. Dependencies

- ADR-0029 policy baseline
- Active feature owners for each domain
- QA bandwidth for keyboard/screen-reader smoke validation

## 12. References

- `/home/louis-burroughs/IdeaProjects/durion/docs/adr/0029-frontend-accessibility-baseline-policy.adr.md`
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- WAI-ARIA APG: https://www.w3.org/WAI/ARIA/apg/
