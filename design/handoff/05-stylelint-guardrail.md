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
