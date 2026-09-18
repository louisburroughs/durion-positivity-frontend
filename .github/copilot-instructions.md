# Copilot Code Review Instructions

This is the **durion-positivity-frontend** repo: an Angular 22 standalone-components frontend
(no NgModules), state via Angular Signals + RxJS, SSR via @angular/ssr + Express.

## Binding policy documents

Before reviewing, treat these as authoritative:

- `AGENTS.md` (this repo) — PR checklist and the "Common Mistakes" table.
- `docs/EXEMPLARS.md` (this repo) — precedents to reuse; flag new code that duplicates a pattern
  already solved there instead of reusing it.
- Frontend ADRs in the sibling `durion` repo, `docs/adr/`: ADR-0010, 0029, 0030, 0031, 0032, 0033,
  0034, 0035, 0037, 0038, 0039, 0040 §6, 0041, 0062, 0063 (async result ownership), 0064 (read
  outcomes and placeholder copy), 0065 (untrusted content and browser persistence).

**Cite the ADR number in each finding where one applies.**

## Review priorities, in order

1. **Async correctness** — stale or out-of-order async results, guards released early or left
   stranded, controls shown against data that belongs to a different selection key than the one
   currently active.
2. **Error handling honesty** — a failed read collapsed into empty data, and placeholder/empty-state
   copy that names one cause when the underlying sentinel can mean several.
3. **Write permission gating** — write controls (buttons, forms, actions) not gated on the write
   permission from `src/app/core/security/route-permissions.ts`.
4. **Accessibility mechanics** — native `dialog[appModalDialog]` for modals (not a custom overlay),
   the global `.sr-only` utility in `src/styles.css` (never a component-local redefinition),
   `aria-describedby` wiring hints to their control, 24×24 minimum target size, Label in Name
   agreement per locale, and focus moved off a control that gets removed while focused.
5. **Test integrity** — tests that would still pass with the bug present: synchronous `of()` stubs
   in tests that are supposed to prove ordering/async behavior, only the positive half of a
   positive/negative split actually asserted, and UI copy asserted against strings pasted straight
   into the spec (which just echoes the implementation).
6. **i18n** — no `translate.instant()` inside a `computed()`, numbers formatted through pipes (not
   string-built), and any new/changed key present across all six locale files
   (`en-US`, `es-US`, `es-MX`, `fr-CA`, `fr-FR`, `qps-ploc`).
7. **Untrusted model/server text** — URL normalization plus an allowlist before rendering/linking,
   a CSV export prefixes values that could be read as spreadsheet formulas, and any client-side
   storage of such content is keyed by tenant and subject.

## Platform rules to hold the line on

- `workorder` is one word everywhere — code, comments, copy, tests (`workorder`, `Workorder`,
  `workorderId`), never "work order".
- Tenancy comes only from the token's `tid` claim. It must never be sent in a request body, query
  string, header, or route parameter — flag any code that does.
- PR-template accessibility checkboxes must only be checked if that check was actually performed;
  do not let a PR pass review because boxes are ticked without evidence.
