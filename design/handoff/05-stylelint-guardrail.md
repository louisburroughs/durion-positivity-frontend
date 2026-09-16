# Step — Stylelint guardrail (stop the drift from coming back)

A lint rule that fails CI when component CSS reaches for the names this audit flagged.
This is what keeps phases 1–4 from silently reverting.

## What it catches

- **`.mic-*` classes** → use `.dur-*`.
- **Undefined Material-3 tokens** — `--surface-container-*`, `--secondary-container`,
  `--on-surface*`, `--on-(secondary|error)-container`, `--error-container`,
  `--color-(primary|secondary|error|warning|success|on-*)`, `--surface-2`.
- **Wrong spacing tokens** — `--spacing-N` (use `--space-N`) and `--space-5` (never declared).
- **Invented type tokens** — `--typescale-*`.
- **Retired font** — `'Michelin Unit Titling'`.
- **Raw heritage gold** — literal `#cc9030` in a value (use the theme-aware `--goldA400`).

Each violation prints the documented replacement.

## Role rules (theme-aware colours)

A token can be sanctioned and still be wrong for the property it sits on. The Tier-2
brand and functional tokens carry **one value used in both themes**, so they are fills,
not text: `color: var(--brand-primary)` is 7.8:1 in light and 1.3:1 on the dark card.
The same goes for raw Tier-1 ramp values, and for light fills such as
`--brand-primary-soft`, which stay near-white in dark mode.

The root config therefore adds a second, per-property set of restrictions:

| Property | Rejected | Use instead |
|---|---|---|
| `color` | `--brand-primary` / `-secondary` / `-accent` / `-gold`, `--functional-*`, any raw `--durion-*-N` | `--link-color`, `--text-muted`, `--accentA700`, `--goldA400`, `--status-<kind>-fg`, `--currentTextColor` |
| `background` / `background-color` | `--brand-primary-soft` / `-surface` / `-background`, raw `--durion-*-(50\|100\|200)` | `--primary50`, `--cardBackground`, `--surface-inset`, `--surface-variant`, `--status-<kind>-bg` |

`background: var(--brand-primary)` stays legal — a filled button is what that token is for.

These rules are **scoped to the directories already swept onto theme-aware tokens**, listed
in `SWEPT` in `.stylelintrc.js`. Add a directory to that array as you sweep it, so the
guardrail hardens incrementally instead of failing the build on pre-existing drift. The
root config is `.stylelintrc.js` rather than `.stylelintrc.json` so the drift list can be
shared between the base rule and the scoped one without being copied.

## Install

```bash
npm i -D stylelint
```

If you already have a `.stylelintrc*`, merge the two `rules` blocks from
`handoff/.stylelintrc.json` into it. Otherwise copy that file to the repo root.

## Run

```bash
npx stylelint "src/**/*.css"
```

Wire it into CI / the lint script (e.g. `package.json` → `"lint:css": "stylelint \"src/**/*.css\""`)
so PRs fail on reintroduced drift.

## Sequencing

Run this **after** phases 1–4 (font swap, mic→dur, token cleanup, gold), or it will
fail on the existing violations you haven't migrated yet. Use it first as a worklist:

```bash
npx stylelint "src/**/*.css" | tee drift-report.txt
```

…then clear the report file by file. Once it's green, it stays green.

> Note: this catches the *known* drift vocabulary by name. It does not verify that an
> arbitrary `var(--x)` is defined — for that, a fuller setup would add
> `stylelint-value-no-unknown-custom-properties` pointed at `styles.css`. Optional, but
> it generalizes the guard beyond this specific list.
