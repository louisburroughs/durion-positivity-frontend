# Durion Style Guide

> **v2 · June 2026 — reconciled to `src/styles.css`.** Changes in this revision: functional
> error/success hex corrected (`#ba1a1a` / `#2e7d32`); **Heritage Gold** added as a documented
> token; display font moved from the retired `'Michelin Unit Titling'` to **Barlow Semi
> Condensed**; both fonts now self-hosted; utility prefix confirmed as **`.dur-*`** (the shipped
> `.mic-*` is drift and is being renamed back). See `theme-tokens.md` for the full token inventory.

This guide is derived from `src/styles.css` and the asset folders under `src/assets/` and
`design/source/`.

## 1. Brand Foundation

Durion uses a cool industrial palette:

- **Blueprint Blues** — primary brand actions and navigation
- **Graphite + neutral greys** — structure and UI chrome
- **Electric Teal** — the UI accent and secondary emphasis (UI only; never in the logo)
- **Heritage Gold** — the logo shield border, and sparing heritage/premium accent
- **Functional colors** — alerts and status semantics

## 2. Typography

- **Display / headings (`--font-primary`):** `Barlow Semi Condensed` → falls back to `Noto Sans`, `sans-serif`.
- **Body & UI (`--font-body`):** `Noto Sans` (400, 400i, 500, 600, 700, 700i) → `sans-serif`.
- **Icon fonts:** `Material Symbols Round`, `Material Icons Two Tone`.

Both text faces are **self-hosted** under `src/assets/fonts/` and loaded via `@font-face`
(`@import`ed at the top of `styles.css`). Do not rely on system-installed fonts.

### Ratified Barlow display weight scale

Only **three** Barlow Semi Condensed weights are hosted: **500 / 600 / 700**. These are the
**only** valid weights for `--font-primary`. Requesting any other weight (100–400, 800, 900)
has no matching `@font-face`, so the browser **synthesises** a faux weight — banned.

| Token | Weight | Role |
|---|---|---|
| `--font-weight-display` | **700** (Bold) | `h1`, page titles, strong display emphasis |
| `--font-weight-heading` | **600** (SemiBold) | `h2`–`h4`, card/section titles, overlines, labels, status chips, buttons |
| `--font-weight-medium`  | **500** (Medium) | large or lighter display subheads where 600 is too heavy |

Use the tokens (defined in `styles.css` / `durion-theme.css`) rather than raw numbers, and
never pair `--font-primary` with a weight outside {500, 600, 700}. Body text keeps the full
Noto Sans range (400–700).

> `'Michelin Unit Titling'` is **retired** — it is licensed to Michelin and was never shipped,
> so it silently fell back to Noto Sans. Removed from the stack.

## 3. Core Color Tokens

See `theme-tokens.md` for full ramps. Canonical values (matching `styles.css`):

### Blueprint Blues
`800 #1c2e48 · 700 #2b4c78 · 600 #355d92 · 500 #4d76b2 · 400 #668fc2 · 300 #7fa4d1 · 200 #aac4e4 · 100 #d3e3f6 · 50 #f4f8fe`

### Graphite
`800 #333842 · 700 #444a55 · 600 #5a616e · 500 #727986 · 200 #d7d9dd · 100 #e7e8eb`

### Electric Teal (UI accent)
`600 #158f83 · 500 #1fa497 · 400 #2bbbad · 300 #55d7cc · 200 #a4e9e1 · 100 #d7f3f0`

### Heritage Gold (logo + heritage accent)
`600 #a06a1a · 500 #cc9030 (canonical) · 400 #d8a449 · 300 #e3bd78 · 200 #efd6a8 · 100 #f8edd5`

### Neutrals
`900 #121213 · 800 #1f2022 · 700 #3a3a3e · 500 #707078 · 100 #f2f2f4`

### Functional
`error #ba1a1a · warning #e6a540 · info #355d92 · success #2e7d32`

> **Functional colours are surface/icon colours, not text colours.** `--functional-warning`
> (#e6a540) and `--functional-success` (#2e7d32) **fail WCAG AA as text** on white or on
> their own light tint. When a status word/number must be coloured text, use the AA-dark
> values: **error `#ba1a1a` · warning `#8a5e0a` · success `#1b5e20`** (or `info #355d92`).
> See §8.

### Brand Semantic Tokens
- `--brand-primary: var(--durion-blue-700)`
- `--brand-primary-soft: var(--durion-blue-50)`
- `--brand-secondary: var(--durion-graphite-700)`
- `--brand-accent: var(--durion-teal-400)` — UI accent (borders, icons, small fills)
- `--accent-strong: #006a6a` — **filled accent button with white text.** `--brand-accent`
  (teal-400) is only 2.4:1 against white and **must not** carry white text; `--accent-strong`
  is 5.8:1. Use it for any solid teal button/CTA.
- `--brand-gold: var(--durion-gold-500)` — heritage accent (not the UI accent)
- `--brand-background: var(--durion-grey-100)`
- `--brand-surface: #ffffff`

## 4. Theme Mapping

Applied via `[data-theme="light"]` (default) and `[data-theme="dark"]` on `<html>`.
Runtime tokens (`--themeBackground`, `--navBackground`, `--cardBackground`,
`--currentTextColor`, `--primaryA*`, `--accentA*`, `--goldA*`, `--trackColor`,
`--handleColor`, and the extended set) flip per theme — consume these in components, never
raw palette tokens. Full light/dark table in `theme-tokens.md`.

## 5. Component Styling Patterns

### Elevation
Utility classes `.dur-elevation-1` … `.dur-elevation-4`.
> The shipped code currently uses `.mic-elevation-*` (upstream-template drift) — rename to `.dur-*`.

### Alerts
`.alert` with `.alert-info`, `.alert-success`, `.alert-warning`, `.alert-error`,
`.alert-critical`, `.alert-soft`.

### Links
Underline-style border (`border-bottom: 2px`) using theme colors. Variants `.accent`, `.white`.

### Navigation & Sidebar
`.dur-navbar` (themed nav background; `.white` for light menu). `.dur-sidebar` primary item
state uses the `primary` token mapping.

### Status Chips
`.dur-status` base + `.primary`, `.valid`, `.warn`, `.error`; dark-theme override present.
> Shipped as `.mic-status` (drift) — rename to `.dur-status`.

### Content, Scrollbars, Tables, Timeline
Follow theme background/text tokens; custom scrollbar track/thumb; table focus + row hover
mapped to primary tokens; timeline dots use primary/accent colors.

## 6. Asset Expectations

### Fonts
Self-hosted under `src/assets/fonts/` — `barlow/` and `noto-sans/`, each with its own
`@font-face` CSS. Keep `@import`s at the top of `styles.css`.

### Logo & brand assets
- Place from the **supplied logo files** — never redraw, re-trace, or AI-regenerate the emblem.
- Three approved lockups: **primary** (shield + wordmark), **icon/emblem**, **wordmark**.
- **Clear space** ≥ ½ shield height on all sides. **Minimum size:** primary ≥ 120px wide, icon ≥ 32px.
- Gold in the logo is **locked artwork** — do not recolor; do not sample it for UI (use `--goldA400`).
- **Gap:** no reversed/white lockup exists yet. On dark backgrounds, place the mark on a light
  plaque until a reversed version is produced. (The badge/banner protos are off-brand — they
  redrew the emblem and dropped the gold border; retire them.)

See the **Brand & Asset Guide** for full logo anatomy, misuse, and the pre-ship checklist.

## 7. Implementation Notes

- **Contrast (ADR-0039):** all information-bearing elements meet WCAG 2.2 AA (4.5:1 small text
  < 18pt/14pt bold; 3:1 large) across all states (normal, hover, focus, disabled, validation).
- Keep token usage semantic (`--brand-*`, `--primary*`, `--accent*`, `--goldA*`) over hardcoded hex.
- Support light **and** dark by consuming runtime variables (`--themeBackground`,
  `--currentTextColor`, etc.).
- **Do not** introduce Material-3 token names (`--color-*`, `--surface-container-*`, `--on-*`),
  `--spacing-*`, `--typescale-*`, the `.mic-*` prefix, or literal `#cc9030` — these
  are caught by the stylelint guardrail. Use the sanctioned equivalents (see `theme-tokens.md`).
- Never reference an **undefined** custom property (even with a fallback) — the
  `value-no-unknown-custom-properties` guard fails CI. Define new runtime tokens in `styles.css`.
- Reuse existing utilities (`.dur-elevation-*`, status/link variants) before adding new ones.

## 8. Colour Contrast Rules (AA, ADR-0039)

Every information-bearing text/background pair must meet WCAG 2.2 AA (4.5:1 normal, 3:1 large).
Recurring traps and their fixes:

| Situation | Wrong | Right |
|---|---|---|
| White text on a teal button | `background: var(--brand-accent)` (teal-400, 2.4:1) | `background: var(--accent-strong)` (#006a6a, 5.8:1) |
| Coloured **status text** | `--functional-warning` / `--functional-success` as `color:` | warning `#8a5e0a`, success `#1b5e20`, error `#ba1a1a` |
| Status **chip / badge** | hardcoded pastel + a mid-tone text (e.g. `#f57f17` on `#fff8e1`) | darken the text (`#8a5e0a`); keep the light pastel fill |
| Status **alert/banner** | `color-mix(--functional-x 12%) ` fill + the same functional colour as text | fill stays; text = the AA-dark value above |
| Form field | hardcoded `background: #fff` | `var(--input-background)` (theme-aware) so dark mode flips to graphite |

> **Known dark-mode gap (tracked):** status **tint** badges/alerts built with
> `color-mix(--functional-x N%, transparent)` over the card sit on a dark tint in dark mode,
> where the AA-dark text above no longer passes. A proper fix needs theme-aware status tokens
> (lighter functional shades in dark). Until then, prefer fixed light pastel fills + AA-dark
> text for status chips, which pass in both themes.
