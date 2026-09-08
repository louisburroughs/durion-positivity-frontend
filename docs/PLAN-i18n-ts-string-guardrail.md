# The `.ts` blind spot — a second guardrail

`scripts/i18n/check-hardcoded-strings.mjs` reads **templates only**. A string
assigned to a signal in TypeScript and rendered through `{{ signal() }}` is
invisible to it:

```ts
this.error.set('Failed to load roles.');   // never reported
```
```html
{{ error() }}                              <!-- passes the template check -->
```

That is not hypothetical. Clearing the template backlog
([PLAN-i18n-hardcoded-strings-all-modules.md](./PLAN-i18n-hardcoded-strings-all-modules.md))
turned up **67 such strings** — every phase found more in `.ts` than the report
showed, and one module (`location-sync`) had *nothing* flagged while hardcoding
every one of its error fallbacks.

`scripts/i18n/check-hardcoded-ts-strings.mjs` closes that gap.

```bash
npm run i18n:check:ts                                              # everything
node scripts/i18n/check-hardcoded-ts-strings.mjs src/app/features/crm   # one module
```

## What counts as a finding

A string or template literal that reads as prose — two or more words — once
developer-facing context is removed. Output is grouped by module and the
`i18n-ignore` markers work exactly as in the template checker (mandatory reason,
a marker suppressing nothing is a failure, an unterminated block is a failure
and suppresses nothing, suppression count printed on pass and fail).

## What it deliberately ignores

Precision matters more than recall here: a checker that cries wolf gets
ignored. Each exclusion below removed real noise from the first run.

| Ignored | Why |
| --- | --- |
| Comments | Not copy — and an apostrophe in `the platform's own` opens a phantom string, which is what produced the first prototype's strangest false positives |
| `console.*(…)` | Diagnostics |
| `new *Error(…)` | Diagnostics. Blanked wherever it appears, not only after `throw`: `throwError(() => new Error('No refresh token'))` is equally a diagnostic |
| `${…}` holes | Code. The surrounding text is still scanned, so `` `Mechanic ID: ${id}` `` is caught |
| Dotted ALL_CAPS | Translation keys, not prose |
| Lowercase token lists with no sentence punctuation | `noopener noreferrer`, CSS class lists |
| `*.spec.ts`, `*.spec-helper.ts`, `testing/` | Test copy |
| `*.generated.ts` | Generated output is fixed in its generator, not in place |
| Inline `styles:` | CSS |

**Inline `template:`** is a third blind spot: markup inside a `.ts` file is read
by neither guardrail. It is blanked before the string scan, but a template that
carries prose is reported as `inline-template`, pointing at the real fix — move
it to a `.html` file, per the repo's four-file page convention. Gating on prose
matters: 24 components have inline templates, but 23 are `<router-outlet />`
shells with no copy at all.

Static localizable attributes inside an inline template count as copy: dropping
tags to find text would take `aria-label="Not found"` with them. That is how
`access-denied.component.ts` and `not-found.component.ts` are caught — their
visible text is already translated and only the `aria-label` is English. A bound
`[attr.aria-label]="'KEY' | translate"` is not matched, since the attribute name
is preceded by `.` rather than whitespace.

## Baseline — 124 findings

| Module | Findings |
| --- | ---: |
| `workexec` | 110 |
| `crm` | 7 |
| `system` | 2 |
| `accounting`, `admin`, `location`, `people`, `shopmgmt` | 1 each |

One literal is suppressed by a marker: the CSS Font Loading API probe in
`core/services/icon-font.service.ts`.

**`workexec` is the headline.** Its template remediation was signed off as
complete across four phases — and it is the one module the original guardrail
watched. Every one of these 110 strings sat behind that green check: expiry
notices, permission denials, concurrency warnings, and the entire failure
vocabulary of the estimate and work-order flows
(`'You are not authorized to approve this estimate.'`,
`'Completion blocked. Please resolve all issues below.'`,
`'This action may have already succeeded. Check your work orders list before
retrying to avoid creating a duplicate.'`). A user switching to `es-US` sees
every one of them in English.

## Why this is not wired into `npm run i18n:check` yet

`i18n:check` is currently green and guards against regression. Chaining a check
with a 122-item backlog into it would make the aggregate command permanently
red, and a permanently red gate is one people learn to ignore — which is how
this class of drift starts. `i18n:check:ts` therefore runs on its own until the
backlog is cleared, at which point it should join the chain.

## Suggested phasing

Same shape as the template remediation — smallest first so the pattern settles
before the large domain:

1. `accounting`, `admin`, `location`, `people`, `shopmgmt` (5 findings, one each)
   and `system` (2 inline-template `aria-label`s)
2. `crm` (7)
3. `workexec` (110)

The conversions are the ones established in the template work:

- a signal that only ever holds a key → rename to `errorKey`, pipe it in the
  template, and it re-renders on locale change;
- a fallback a server message can replace → `this.translate.instant('KEY')`, so
  the signal still holds display text either way;
- `admin.component.ts` → move the inline template to `admin.component.html`;
  `system`'s two components need only their `aria-label` bound to a key.
