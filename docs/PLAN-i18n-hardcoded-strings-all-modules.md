# Hardcoded-string guardrail — widened to all modules

`scripts/i18n/check-hardcoded-strings.mjs` originally scanned only
`src/app/features/workexec`. It now scans **every module under `src/app`**
(all `features/*`, plus `core` and `shared`).

```bash
npm run i18n:check:hardcoded                                          # everything
node scripts/i18n/check-hardcoded-strings.mjs src/app/features/crm    # one module
```

The report is grouped by module, with a per-module summary first, so a domain
can be remediated in isolation exactly like the workexec phases were.

> **Heads-up:** `npm run i18n:check` (which chains this script) now **fails**
> repo-wide until the backlog below is cleared. Scope the script to the module
> you are working in to get a green signal for that module.

## Checker changes that came with the widening

The wider corpus exposed patterns workexec never had. These are accuracy fixes,
not relaxations — the check still reports every real literal:

- **`<style>` / `<script>` bodies are ignored.** CSS declarations are not prose.
- **Material Symbols ligatures are ignored.** Text inside an element whose class
  contains `material-symbols` / `material-icons` (`<span …>swap_horiz</span>`)
  is a glyph name, never translated. This accounts for most of `inventory`.
- **Multi-line control-flow headers are handled.** `@for (item of [ {…}, {…} ];
  track item.id) {` is now consumed by a paren-balanced scan rather than a
  single-line regex, and `@else if (…)` no longer leaks its `if (…)` as text.
- **`@let` declarations** are consumed through their terminating `;`.
- **HTML entities** (`&nbsp;`, `&mdash;`, `&#8212;`) are stripped before the
  prose test, so entity-only text nodes are not findings.
- **UTF-16 index fix.** The control-flow blanker indexed a code-point array with
  UTF-16 regex offsets, so any template containing an emoji misaligned every
  subsequent blank. It now uses UTF-16 units throughout.

## Declaring deliberate non-translation

Some literals are proper nouns that must render identically in every locale.
Declare those in the template with a single-line marker carrying a reason:

```html
<!-- i18n-ignore-next-line: "Positivity" is a proper product name -->
<h1 class="brand-name">Positivity</h1>

<!-- i18n-ignore-start: "Positivity" is a proper product name -->
<span class="shell-brand" aria-label="Positivity">…</span>
<!-- i18n-ignore-end -->
```

The hatch is deliberately noisy so it cannot quietly absorb the backlog:

- the reason is **mandatory** — a bare marker is itself a failure;
- a marker that suppresses nothing is a failure, so stale markers cannot linger;
- an `i18n-ignore-start` with no `i18n-ignore-end` is a failure, and suppresses
  nothing in the meantime;
- every run prints how many literals were suppressed, on pass and on fail alike.

Use it only for proper nouns. Anything a translator could legitimately render
differently belongs in `src/assets/i18n/*.json`.

## Backlog — 534 literals across 21 templates in 4 modules

| Module | Literals | Templates |
| --- | ---: | ---: |
| crm | 262 | 9 |
| people | 184 | 8 |
| location | 77 | 3 |
| security | 11 | 1 |

Clean today (no findings): `workexec` (25 templates), `inventory` (26),
`landing`, `shell`, `auth`, `accounting`,
`positivity` (16), `product` (14), `shopmgmt` (14), `bulk-import` (9),
`billing` (4), `order` (3), `shared` (2), `sitemap` (1). `admin`, `system` and
`core` have no external templates to scan.

### Worst offenders

| Literals | Template |
| ---: | --- |
| 48 | `crm/pages/party-contacts/party-contacts.component.html` |
| 43 | `crm/pages/merge-parties/merge-parties.component.html` |
| 41 | `crm/pages/create-commercial-account/create-commercial-account.component.html` |
| 35 | `crm/pages/customer-list/customer-list.component.html` |
| 34 | `people/pages/time-approval/time-approval-page.component.html` |
| 34 | `crm/pages/party-detail/party-detail.component.html` |
| 32 | `people/pages/time-export/time-export-page.component.html` |
| 31 | `location/pages/storage-locations/storage-locations-page.component.html` |
| 30 | `people/pages/person-location-assignments/person-location-assignments-page.component.html` |
| 28 | `location/pages/location-edit/location-edit-page.component.html` |

## Suggested phasing

Mirror the workexec loop (see
[PLAN-workexec-i18n-remediation.md](./PLAN-workexec-i18n-remediation.md),
"Per template (the loop)") — one module per PR, smallest first so the pattern is
settled before the large domains:

1. ~~`auth`, `shell`, `landing`, `accounting` (11 literals)~~ ✅ done
2. `security` (11)
3. `location` (77)
4. `people` (184)
5. `crm` (262)

### Phase 1 notes

- New keys: `LANDING.NAV_ARIA`, `LANDING.FEATURES_GRID_ARIA` and the
  `ACCOUNTING.VENDOR_PAYMENT_NEW.PAYMENT_METHOD.*` enum (`ACH`, `CHECK`, `WIRE`,
  `CREDIT_CARD`, `OTHER`), authored in `en-US` and added to all five authored
  locales.
- The five "Positivity" occurrences (auth, shell ×2, landing ×2) are proper-noun
  markers, not translations — the shell template already carried a comment
  recording that decision, which the marker now makes machine-readable.
- **es-US / es-MX / fr-CA / fr-FR values are machine-assisted and FLAGGED FOR
  NATIVE REVIEW**, per the convention in the workexec plan. Note the adjacent
  `BILLING.PAYMENT.METHOD` block has unaccented French ("Cheque", "Especes",
  "Carte de credit/debit"); the new keys use correct accents rather than
  matching that defect, so the two blocks read inconsistently until `BILLING`
  is corrected separately.

## Removed: `src/app/app.html`

Widening the scope first surfaced 7 literals ("Hello,", "Congratulations! Your
app is running. 🎉", `aria-label="Github"` …) in `src/app/app.html` — the
leftover `ng new` welcome page. `App` declares an inline
`template: '<router-outlet />'` and nothing in the repo referenced the file, so
it was deleted as dead scaffold rather than translated.
