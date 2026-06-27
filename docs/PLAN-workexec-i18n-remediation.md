# Plan — Workexec Templates i18n Remediation

**Audit date:** 2026-06-27 · **Scope:** `src/app/features/workexec/**/*.html` (27 templates, ~2,973 lines).

## Headline finding

**Missing i18n keys: 0.** Every `| translate` key referenced in workexec templates
(61 distinct) exists in `en-US.json`. The real problem is the inverse: **21 of 27
templates contain zero `| translate` usage** — they were never internationalized.
~**563 hardcoded user-facing strings** (≈483 text nodes + 80 static attributes;
heuristic upper bound) violate ADR-0030.

The `WORKEXEC` namespace in the locale files only covers the 6 already-localized
areas (`ESTIMATE_LIST`, `WIP`, `INVOICE_FINALIZATION`, `OPERATIONAL_COST`,
`LANDING`, `FINDERS`). The 21 un-localized pages have **no namespace** yet.

## Inventory

### ✅ Localized (6) — no action
| Template | translate uses |
|---|---|
| pages/landing | 25 |
| pages/wip-status | 20 |
| pages/invoice-finalization | 19 |
| pages/estimate-list | 12 |
| components/operational-cost | 6 |
| components/search-typeahead | 5 |

### ❌ Un-localized (21) — hardcoded strings (attr + text, heuristic)
| Template | static attrs | text nodes | ~total |
|---|---|---|---|
| pages/workorder-detail | 11 | 74 | 85 |
| pages/estimate-parts | 9 | 35 | 44 |
| pages/estimate-labor | 9 | 31 | 40 |
| pages/workorder-parts | 5 | 35 | 40 |
| pages/estimate-detail | 3 | 37 | 40 |
| pages/approval-digital | 7 | 21 | 28 |
| pages/approval-submit | 1 | 27 | 28 |
| pages/estimate-create | 7 | 20 | 27 |
| pages/workorder-change-requests | 6 | 21 | 27 |
| pages/workorder-labor | 2 | 23 | 25 |
| pages/approval-partial | 5 | 17 | 22 |
| pages/approval-detail | 0 | 20 | 20 |
| pages/workorder-finalize | 2 | 18 | 20 |
| pages/timer-widget | 0 | 19 | 19 |
| pages/approval-in-person | 2 | 17 | 19 |
| pages/estimate-summary | 1 | 17 | 18 |
| pages/workorder-assign | 4 | 13 | 17 |
| pages/estimate-revise | 0 | 16 | 16 |
| pages/travel-time | 6 | 7 | 13 |
| pages/operational-context | 0 | 9 | 9 |
| pages/estimate-from-appointment | 0 | 6 | 6 |

Representative strings (workorder-detail): `Retry`, `Work Order`, `Technician`,
`Unassigned`, `Started`, `Approve Work Order`, `Start Work`, `Record Labor`,
`Manage Parts`, `Finalize for Billing`, `Reopen`; aria-labels `Work Order sections`,
`CRM references`, and interpolated `aria-label="Status: {{ … }}"`.

## Categories of fix (per template)

1. **Visible text nodes** → `{{ 'WORKEXEC.<PAGE>.<KEY>' | translate }}`.
2. **Static attributes** (`placeholder`, `title`, `alt`, `aria-label`) →
   `[attr.aria-label]="'…' | translate"` / `[placeholder]="'…' | translate"`.
3. **Interpolated attributes/text** (`Status: {{ x }}`) → `translate` with params:
   `{{ 'WORKEXEC.…' | translate: { status: x } }}`.
4. **Pluralization / counts** (`{{ n }} pending`) → ICU or param key.
5. **Component wiring**: add `TranslatePipe` to each standalone component's
   `imports`; some need `TranslateService` for `errorKey` paths in `.ts`.

## Execution plan (phased by domain)

Group the 21 files so each PR is reviewable and independently shippable.

- **Phase 1 — Approval (5):** approval-detail, -digital, -in-person, -partial, -submit
- **Phase 2 — Estimate (7):** estimate-create, -detail, -labor, -parts, -summary, -revise, -from-appointment
- **Phase 3 — Workorder (6):** workorder-detail, -parts, -labor, -change-requests, -finalize, -assign
- **Phase 4 — Misc (3):** travel-time, timer-widget, operational-context

Per template (the loop):
1. Extract every user-facing string; design a `WORKEXEC.<PAGE>.*` key tree
   (mirror the existing localized pages' structure: `TITLE`, `COLUMN.*`,
   `ACTION.*`, `ARIA.*`, `ERROR.*`, `STATUS.*`).
2. Add keys to **en-US** (authored), **es-US** + **fr-CA** (translated), then
   `npm run i18n:pseudo:generate` to refresh `qps-ploc`.
3. Wrap template strings (categories 1–4 above); add `TranslatePipe` to imports.
4. Update the page's `*.spec.ts`: render under `TranslateModule.forRoot()`, assert
   no raw literals remain for key elements; keep existing behavior tests green.
5. Verify: `npm run i18n:check`, `npx ng test --include=…<page>…`, `npm run lint:css` (n/a), `npm run a11y:smoke` for the route.

## Guardrail (recommended, Phase 0 or last)

Add a workexec **hardcoded-string guard** so this can't regress:
- A test (or lint script) that scans `workexec/**/*.html` for literal text nodes
  and static text attributes outside an allowlist, failing CI when found.
- Mirrors the spirit of the existing `i18n:check` (which only catches *missing*
  keys, not *un-wrapped* strings — that blind spot is exactly how 21 pages drifted).

## Effort & sequencing notes

- ~400–450 real translatable strings after de-duping the heuristic count.
- Translation: en-US authored in-repo; es-US/fr-CA need real translations
  (Canadian-French conventions per the #108 work: `courriel`, `nom d'utilisateur`).
  If professional translation isn't immediately available, author en-US + a
  documented machine-assisted es/fr pass, and track review — do **not** ship
  English strings under es/fr keys silently (that hides the gap from `i18n:check`).
- Recommend one PR per phase (4 PRs) to keep review tractable; the guardrail can
  land first (failing-allowlisted) or last (enforce after cleanup).

## Open question for the owner

- Translation source for es-US / fr-CA: in-repo authored, professional vendor,
  or machine-assisted-with-review? Determines whether this is 4 PRs or 4 PRs + a
  translation-review loop.
