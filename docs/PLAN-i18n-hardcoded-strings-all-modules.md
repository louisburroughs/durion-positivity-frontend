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

## Backlog — 545 literals across 25 templates in 8 modules

| Module | Literals | Templates |
| --- | ---: | ---: |
| crm | 262 | 9 |
| people | 184 | 8 |
| location | 77 | 3 |
| security | 11 | 1 |
| accounting | 4 | 1 |
| landing | 4 | 1 |
| shell | 2 | 1 |
| auth | 1 | 1 |

Clean today (no findings): `workexec` (25 templates), `inventory` (26),
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

1. `auth`, `shell`, `landing`, `accounting` (11 literals total)
2. `security` (11)
3. `location` (77)
4. `people` (184)
5. `crm` (262)

## Removed: `src/app/app.html`

Widening the scope first surfaced 7 literals ("Hello,", "Congratulations! Your
app is running. 🎉", `aria-label="Github"` …) in `src/app/app.html` — the
leftover `ng new` welcome page. `App` declares an inline
`template: '<router-outlet />'` and nothing in the repo referenced the file, so
it was deleted as dead scaffold rather than translated.
