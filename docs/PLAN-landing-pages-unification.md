# PLAN — Positivity Landing Pages Unification

**Status:** Waves 0–4 complete (all 11 domain landings migrated)
**Branch:** `feat/landing-pages-unification` (Wave 0) → `feat/landing-wave1-billing-crm` (Waves 1–4, contains all)
**Design source:** `../durion/Positivity Landing Pages.dc.html` (data-driven comp, 10 domain "pages")
**Owner:** frontend

---

## 1. Goal

Refactor all 11 domain landing pages onto a **single shared landing kit** that reproduces the
design comp exactly: hero + 3 stat cards + type legend + sections, each section fronted by **one
gated "Find a record" selector** that locks its guided cards until a record is selected.

Confirmed decisions:

- **Fidelity:** full rewrite onto a shared kit (pixel + structural).
- **Gating model:** one section-level selector per section that gates (locks) guided cards — all
  domains, including reworking workexec's current per-card model.
- **Architecture:** shared component kit; all 11 domains consume it via data config.
- **Backend scope:** CRM + People + Billing search verified/extended (see §4 — most already done).

The standalone marketing `landing-page.component` (locale/theme splash) is **out of scope** —
different purpose.

---

## 2. Design comp structure (target)

Each landing page = fixed structure:

1. **Hero card** — eyebrow, title, description, primary + secondary CTA.
2. **3 stat cards** — Total Pages / Direct Pages / Guided Launches (counts derived from config).
3. **Type legend** — Direct (teal `#55d7cc`, opens immediately) vs Guided (gold `#e3bd78`, needs a
   record). Shown only when the page has guided cards.
4. **Sections** — heading + description + card grid.
5. **Per-section "Find a record" selector** — one search box at the top of a section that **gates**
   every guided card in it (lock icon + disabled CTA until a record is picked).
6. **Cards** — icon, title, hover tooltip, info icon, CTA.

Theme tokens (comp is dark-only): bg `#1f2022`, accent teal `#55d7cc`, gold `#e3bd78`, fonts
Barlow Semi Condensed + Noto Sans. **Map to existing CSS custom properties / `ThemeService` — do
not hardcode hex** so light mode keeps working.

---

## 3. Shared landing kit (`src/app/shared/landing/`)

Config-driven components consumed by every domain:

| Component | Responsibility |
|---|---|
| `LandingPageComponent` | Top-level layout; takes a `LandingPageConfig`; renders hero/legend/sections; owns selector state + gating. |
| `LandingHeroComponent` | eyebrow, title, description, primary/secondary CTA. |
| `LandingStatsComponent` | 3 stat cards; counts derived from config (total / direct / guided). |
| `LandingTypeLegendComponent` | Direct vs Guided dots; only when a page has guided cards. |
| `LandingSectionComponent` | heading + description + optional selector + card grid. |
| `LandingCardComponent` | icon, title, hover tooltip, info icon, gated CTA (lock when pending). |
| `LandingRecordFinderComponent` | The selector. Generalizes existing `workexec-search-typeahead` + `billing-invoice-finder` into one accessible combobox; takes injected `search: (q) => Observable<RecordHit[]>` + `placeholder`. |

### Config model (mirrors comp `PAGES` data)

```ts
interface LandingPageConfig {
  eyebrow: string; title: string; description: string;
  primaryCta?: LandingCta; secondaryCta?: LandingCta;
  sections: LandingSection[];
}
interface LandingSection {
  heading: string; description: string;
  recordKind?: RecordKind;   // present => section gets a gated selector
  searchHint?: string;       // overrides default placeholder
  cards: LandingCard[];
}
interface LandingCard {
  kind: 'direct' | 'guided';
  icon: string; title: string; description: string; cta: string; ctaIcon?: string;
  route?: string;                          // direct
  buildCommands?: (recordId: string) => string[]; // guided, fed by the section selector
}
```

### Gating logic (from comp `renderVals`)

A `guided` card is `pending` (lock icon, `cursor:not-allowed`, `opacity .4`) until its section's
selector holds a selected record id; then its CTA builds the route from that id. One selector per
section keyed by `RecordKind`.

`RecordKind` set: name-search kinds (`estimate`, `workorder`, `approval`, `customer`, `invoice`,
`employee`, `person`) + ID-only kinds (`appointment`, `ledger`, `po`, `event`, `ruleset`,
`location`, `role`, `payment`, `receipt`, `session`, `putaway`). ID-only kinds reuse the same
finder component in a plain "enter id" mode (no backend call) — one code path.

---

## 4. Backend status (verify/extend only — no net-new endpoints expected)

Reality from code is better than the comp placeholders implied:

| Selector | Backend | Action |
|---|---|---|
| Estimate / Workorder (workexec) | `EstimateSearchService`, `WorkorderSearchService` | ✅ done |
| Invoice (billing) | `invoiceSearch.searchInvoices(q)` matches invoice # + customer + workorder # | ✅ verify display fields, likely no-op |
| Customer (crm) | `crm.service.searchParties` → `browseParties({name})` = commercial + individual (issue #59) | ✅ verify typeahead latency, likely no-op |
| Employee / Person (people) | `PersonLookupComponent` (EMPLOYEE/ALL), `personsApi.searchPersons` | ⚠️ **confirm matches employee ID as well as name** — only likely real change |
| Approval (workexec) | none dedicated | reuse estimate + workorder search |
| appointment / ledger / po / event / ruleset / location / role / payment / receipt / session / putaway | ID only | no backend |

**Any backend change triggers the mandatory contract chain** (CLAUDE.md): controller OpenAPI
annotations → regenerate `OpenAPI.yaml` → update Angular SDK → consume in frontend. Expect this
only for People, if at all. Land SDK before the FE PR (FE CI builds SDK from `.sdk-src` main).

---

## 5. Per-domain migration (11 pages)

Each domain shrinks to a **config file + thin component** supplying its `LandingPageConfig` and a
`search` fn per record kind. Delete bespoke hero/stat/card markup; keep routing/CTAs in config.

| Domain | Selector kinds | Search source |
|---|---|---|
| workexec | estimate, workorder, approval | `EstimateSearchService`, `WorkorderSearchService` |
| billing | invoice | `invoiceSearch.searchInvoices` |
| crm | customer | `crm.service.searchParties` |
| people | employee, person | people lookup (verify employee-ID match) |
| accounting, inventory, location, product, admin, shopmgmt | ID-only | plain id input |

---

## 6. Cross-cutting

- **i18n:** every string a translate key. Shared keys under `LANDING.*`; domain copy under
  `<DOMAIN>.LANDING.*`. Add en-US/es-US/fr-CA per `angular-i18n.md`.
- **Theme:** derive light mode from tokens; no hardcoded hex. Define component-scoped styles —
  don't assume global `.btn`/`.card` (shared-CSS scoping gotcha).
- **A11y:** finder is a WAI-ARIA combobox/listbox (preserve keyboard nav from existing finders).
  Gated cards get `aria-disabled` + "select a record first" hint.
- **Tests:** shared kit unit specs (gating, count derivation, finder debounce/select/keyboard);
  each domain a thin spec asserting config renders + routes. Rewrite existing
  `*-landing-page.component.spec.ts` against the kit.

---

## 7. Sequencing

- **Wave 0** — build + test shared kit against workexec config (richest: gating + name search). ← current
- **Wave 1** — migrate name-search domains (workexec, billing, crm).
- **Wave 2** — people (after confirming/extending people lookup endpoint + SDK).
- **Wave 3** — 6 ID-only domains (mechanical config conversion).
- **Wave 4** — i18n sweep, light-theme pass, a11y audit, spec cleanup.

---

## 8. Open risks

- **Per-card → per-section regression:** workexec currently lets each card carry its own id;
  consolidating to one section selector changes behavior. Confirm no workflow relied on two
  different ids in the same section.
- **People SDK regen timing:** if People needs a backend change, land SDK on `.sdk-src` main first
  or the FE PR fails (FE CI SDK-precedence gotcha).
- **Theme:** comp is dark-only; light mode must be derived, not dropped.

---

## 9. Progress log

- **Wave 0** (`5905455`): shared kit (models, record-kind registry, `LandingRecordFinder`,
  `LandingPageComponent`) + workexec migrated. Kit maps comp hex to existing theme tokens
  (`--brand-accent`, `--durion-gold-300`, …) so light mode is preserved.
- **Wave 1** (`09b9e99`): billing + crm. Kit gained an optional per-card **secondary input**
  (two-id cards: void/refund payment id, receipt id). CRM adapts `PartyDetail → RecordHit`.
- **Wave 2** (`b08294e`): people. Backend question closed — the people directory `q` matches
  name/email/username only (no employee-number search); section hints say "Search by name".
  No backend/SDK change needed; the whole effort is frontend-only.
- **Wave 3** (`ad0f190`): accounting, admin, inventory, location, product, shopmgmt. Kit gained
  per-section `idMode` (inventory workorder) + `vendorPayment` record kind. Accounting Payments
  split into two single-kind sections.
- **Wave 4** (this commit): restored accounting Credit Memos (+ `creditMemo` kind/i18n);
  removed 3 now-orphaned finder components (`person-lookup`, `workexec-search-typeahead`,
  `billing-invoice-finder`); regenerated `qps-ploc` pseudo-locale; `i18n:check` passes
  (en/es/fr aligned at 3316 keys). All 11 domain landings + kit: 39 specs pass.

### Deliberate deviations from prior behaviour
- Bulk-import "active import" live badges dropped on crm/people/product/location (not in comp).
- `PersonLookup`'s paste-a-raw-id-then-launch path not reproduced (finder commits on selection).

### Known pre-existing (not introduced here)
- Full-project `ng lint` reports ~145 errors (unused `idempotencyKey`/`partId` args, etc.) in
  unrelated services/specs/templates. All landing files added/changed in this work lint clean.

### Remaining (optional follow-ups)
- a11y audit pass on the kit in a real browser (keyboard nav verified by unit tests only).
- Consolidate the two branches into one PR; the marketing `landing-page.component` stays as-is.
