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

## Backlog — 262 literals across 9 templates in 1 module

| Module | Literals | Templates |
| --- | ---: | ---: |
| crm | 262 | 9 |

Clean today (no findings): `workexec` (25 templates), `inventory` (26),
`landing`, `shell`, `auth`, `accounting`, `security` (7), `location` (9), `people` (16),
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
| 34 | `crm/pages/party-detail/party-detail.component.html` |

## Suggested phasing

Mirror the workexec loop (see
[PLAN-workexec-i18n-remediation.md](./PLAN-workexec-i18n-remediation.md),
"Per template (the loop)") — one module per PR, smallest first so the pattern is
settled before the large domains:

1. ~~`auth`, `shell`, `landing`, `accounting` (11 literals)~~ ✅ done
2. ~~`security` (11)~~ ✅ done
3. ~~`location` (77)~~ ✅ done
4. ~~`people` (184)~~ ✅ done
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

### Phase 2 notes — `security/user-provision`

The one template in `security` needed more than the 11 flagged literals, because
the guardrail cannot see inside interpolations or `.ts` files:

- **4 strings the checker never reported.** Two literal fallbacks inside
  interpolations (`{{ fieldErrors()['username'] || 'A valid username email is
  required.' }}` and the role equivalent) and two English sentences set in the
  component (`this.error.set('Failed to load roles.')`,
  `'Failed to provision user.'`). All four are now keys.
- **`error` → `errorKey`.** The page held rendered English in a signal; it now
  holds a translation key and the template pipes it, matching the state-machine
  convention already used by `audit-logs.component.ts` in the same module.
- **Two messages became parameterised** rather than concatenated:
  `LINKED_PERSON` (`{{personId}}`) and `SUCCESS` (`{{userId}}`).
- **Spec updated** to render under `TranslateModule.forRoot()` with a
  `setTranslation` fixture, so the existing assertions on `person-001` / `u-999`
  now also prove the interpolation params are wired. The two error tests assert
  the key, not the sentence.

Server-supplied `fieldErrors` values stay untranslated — they arrive as text
from the API and there is no key to map them to.

### Phase 3 notes — `location`

Three templates carried the 77 flagged literals; the module also had 18 English
strings in `.ts` files that the guardrail cannot see, across **four** pages —
`location-sync` had none flagged but its error fallbacks were hardcoded too.

Two shapes of error state, handled differently on purpose:

- **Always a key → `errorKey` + `| translate`.** `location-edit`'s `error`
  signal only ever held one of two English sentences, so it became `errorKey`
  and the template pipes it. Locale changes re-render it.
- **May hold a server message → `translate.instant`.** The `errorMessage(err,
  fallback)` helper in `location-defaults`, `storage-locations` and
  `location-sync` prefers the API's own message and falls back to local text.
  That fallback is now a key resolved through `translate.instant`, so the signal
  still holds display text either way. `location-edit`'s `conflictError` is the
  same shape. `translate.instant` follows existing use in `shell`, `billing`
  and `shopmgmt`.

Other notable conversions:

- **Concatenated aria-label → params.** `(isExpanded(…) ? 'Hide contents, ' :
  'Show contents, ') + count + ' on hand'` became
  `ARIA.SHOW_CONTENTS` / `ARIA.HIDE_CONTENTS` with a `{{count}}` param.
- **Pagination sentence → one key.** `Page {{n}} of {{t}} ({{c}} total)` is now
  `PAGE_STATUS` with three params rather than four text nodes around two
  interpolations.
- **Sentences split across markup lines** (`Name is` / `required.` in
  `location-edit`) are single keys now, so translators get whole sentences.
- Ternaries in interpolations (`{{ saving() ? 'Saving...' : 'Save' }}`) became
  key ternaries piped once: `{{ (saving() ? 'X.SAVING' : 'X.SAVE') | translate }}`.

Specs: `location-defaults` and `location-edit` needed `TranslateModule.forRoot()`
(they were injecting `TranslateService` through the component); `storage-locations`
already had it and gained a `setTranslation` fixture so its `No storage locations
found.` and `Page 1 of 3` assertions keep testing rendered output. The
`Load failed` assertion still passes unchanged — it exercises the server-message
passthrough, which is the point of that branch.

### Phase 4 notes — `people`

The largest phase: 184 flagged literals across 8 templates, plus 25 English
strings in 7 `.ts` files. Five new key trees (`WORK_SESSION_SUBMIT`, `OFFBOARD`,
`DISCREPANCY`, `EMPLOYEE_PROFILE`, `LOCATION_ASSIGNMENTS`) and extensions to
three existing ones (`TIME_APPROVAL`, `TIME_EXPORT`, `DIRECTORY.PAGINATION`).

The same two error shapes as phase 3 apply — `errorKey` + `| translate` where
the signal only ever holds a key (`employee-offboard`, `employee-profile`,
`person-location-assignments`), `translate.instant` where a server message can
replace it (`time-approval`, `time-export`, `discrepancy-report`, and
`work-session-submit`'s `toUserError` code mapping).

Conversions worth noting:

- **Label + `<code>` pairs.** `Session ID: <code>{{ sessionId() }}</code>` keeps
  the label as its own key rather than folding the id into a param, because the
  id is marked up separately.
- **`{{ status }} - {{ start }} to {{ end }}`** in the pay-period `<option>` had
  untranslatable glue between three interpolations; it is now one
  `PERIOD_OPTION` key with three params.
- **Sort-header text** (`Technician {{ sortIndicator(…) }}`) keeps the indicator
  outside the key, so translators get the word alone.
- **Boolean cells** (`{{ x ? 'Yes' : 'No' }}`) became key ternaries.

Pre-existing dead keys: `PEOPLE.TIME_APPROVAL` and `PEOPLE.TIME_EXPORT` already
held a handful of keys (`APPROVE`, `EMPTY`, `LOAD_EXPORT`, …) that **no template
references** — leftovers from earlier versions of those pages. The new keys were
added alongside them rather than reusing them, because their en-US wording does
not match what the current templates render. Worth deleting separately.

Specs: seven needed `TranslateModule.forRoot()`; four also needed a
`setTranslation` fixture for assertions that read rendered English back
(`Technician`, `Unavailable`, `Submit Job Time`, and the two offboard error
messages).

## Removed: `src/app/app.html`

Widening the scope first surfaced 7 literals ("Hello,", "Congratulations! Your
app is running. 🎉", `aria-label="Github"` …) in `src/app/app.html` — the
leftover `ng new` welcome page. `App` declares an inline
`template: '<router-outlet />'` and nothing in the repo referenced the file, so
it was deleted as dead scaffold rather than translated.
