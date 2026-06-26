# Durion POS – Theme Token Inventory

> **v2 · June 2026 — reconciled to `src/styles.css`.** Corrections in this revision:
> `--functional-error-red` `#c84c47 → #ba1a1a`; `--functional-success` `#5bbe72 → #2e7d32`;
> added **Heritage Gold** ramp + `--brand-gold` + `--goldA400` / `--goldA100`; documented the
> previously-unlisted extended tokens (`--surface-variant`, `--surface-2`, `--surface-hover`,
> `--text-muted`); replaced the retired `'Michelin Unit Titling'` display font with
> **Barlow Semi Condensed**.

This file is the canonical token inventory for the Durion frontend design system. It documents every CSS custom property used in the application and should be read alongside `durion-style-guide.md` and `src/styles.css`.

Tokens defined in `src/styles.css` fall into three tiers.

## Tier 1 – Raw Palette Tokens

Defined in `:root` and never changed by theme switching.

| Token | Value | Purpose |
|---|---|---|
| `--durion-blue-800 … 50` | See styles.css | Blueprint Blue ramp |
| `--durion-graphite-800 … 100` | See styles.css | Graphite grey ramp |
| `--durion-teal-600 … 100` | See styles.css | Electric Teal ramp |
| `--durion-grey-900 … 100` | See styles.css | Neutral ramp |
| `--durion-gold-600 … 100` | See styles.css | **Heritage Gold ramp (sampled from the logo shield, #cc9030)** |
| `--functional-error-red` | `#ba1a1a` | Error states |
| `--functional-warning` | `#e6a540` | Warning states |
| `--functional-info-blue` | `#355d92` | Info states |
| `--functional-success` | `#2e7d32` | Success states |

### Heritage Gold ramp

| Token | Hex | Note |
|---|---|---|
| `--durion-gold-600` | `#a06a1a` | Darkest — 4.6:1 on white, AA for text |
| `--durion-gold-500` | `#cc9030` | **Canonical** — matches the shield border |
| `--durion-gold-400` | `#d8a449` | |
| `--durion-gold-300` | `#e3bd78` | |
| `--durion-gold-200` | `#efd6a8` | |
| `--durion-gold-100` | `#f8edd5` | Lightest — soft fill / wash |

### Typography tokens

| Token | Value | Purpose |
|---|---|---|
| `--font-primary` | `'Barlow Semi Condensed', 'Noto Sans', sans-serif` | Display / headings / overlines |
| `--font-body` | `'Noto Sans', sans-serif` | Body & UI |
| `--font-weight-display` | `700` | `h1` / page titles / strong emphasis |
| `--font-weight-heading` | `600` | `h2`–`h4`, card titles, overlines, labels, chips, buttons |
| `--font-weight-medium` | `500` | large / lighter display subheads |

Both faces are self-hosted under `src/assets/fonts/` (`barlow/`, `noto-sans/`). **Only Barlow
500 / 600 / 700 are hosted** — `--font-primary` must use one of those three weights (use the
`--font-weight-*` tokens); any other weight synthesises a faux face and is banned.

### Spacing & radius

| Token | Value |
|---|---|
| `--space-1 / 2 / 3 / 4 / 5 / 6 / 8` | 0.25 / 0.5 / 0.75 / 1 / 1.25 / 1.5 / 2 rem |
| `--radius-sm / md / lg` | 4 / 8 / 16 px |

> `--space-5` (1.25rem) fills the 4 → 6 gap and **is** declared in `styles.css`. It is sanctioned.

## Tier 2 – Brand Semantic Tokens

Stable aliases mapping palette tokens to roles. Shared across light and dark.

| Token | Value | Purpose |
|---|---|---|
| `--brand-primary` | `--durion-blue-700` | Primary actions, nav |
| `--brand-primary-soft` | `--durion-blue-50` | Subtle primary tones |
| `--brand-secondary` | `--durion-graphite-700` | Secondary text/UI |
| `--brand-accent` | `--durion-teal-400` | **UI accent / highlight** |
| `--brand-gold` | `--durion-gold-500` | **Heritage / premium accent — NOT the UI accent** |
| `--brand-background` | `--durion-grey-100` | Page background |
| `--brand-surface` | `#ffffff` | Card / modal surface |

## Tier 3 – Runtime Theme Tokens

These flip when `data-theme` changes on `<html>`. **Consume these in all component styles.**

| Token | Light | Dark |
|---|---|---|
| `--themeBackground` | grey-100 | grey-800 |
| `--navBackground` | blue-800 | grey-900 |
| `--menuBackground` | blue-700 | `#16181c` |
| `--subMenuBackground` | blue-600 | graphite-800 |
| `--cardBackground` | white | grey-700 |
| `--currentTextColor` | grey-900 | `#e8e9eb` |
| `--contrastTextColor` | white | white |
| `--primaryA400` | blue-700 | blue-400 |
| `--primaryA300` | blue-500 | blue-300 |
| `--primaryA100` | blue-100 | blue-700 |
| `--primary50` | blue-50 | blue-800 |
| `--accentA400` | teal-600 | teal-300 |
| `--accentA700` | `#006a6a` | teal-400 |
| `--accentA100` | teal-100 | teal-600 |
| `--goldA400` | gold-600 | gold-300 |
| `--goldA100` | gold-100 | gold-600 |
| `--trackColor` | graphite-200 | grey-700 |
| `--handleColor` | graphite-600 | graphite-200 |

> **Gold text/icons must use `--goldA400`** (theme-aware, AA in both modes). Raw
> `--durion-gold-500` (`#cc9030`) fails AA on white — reserve the raw ramp for fills and
> borders where you control the background.

### Extended Tokens (defined locally — not brand-level)

| Token | Light | Dark | Rationale |
|---|---|---|---|
| `--border-color` | graphite-200 | graphite-700 | Consistent border across components |
| `--input-background` | white | graphite-800 | Form field fill |
| `--input-border` | graphite-200 | graphite-600 | Form field outline |
| `--input-focus-border` | blue-500 | blue-400 | Focus ring color |
| `--input-placeholder-color` | handleColor | handleColor | AA-compliant placeholder text |
| `--shadow-card` | `0 2px 8px rgba(0,0,0,.08)` | `0 2px 8px rgba(0,0,0,.4)` | Card elevation |
| `--shadow-nav` | `2px 0 8px rgba(0,0,0,.12)` | `2px 0 8px rgba(0,0,0,.5)` | Sidebar shadow |
| `--chat-bubble-user-bg` | blue-100 | blue-700 | User message bubble |
| `--chat-bubble-system-bg` | graphite-100 | graphite-700 | System message bubble |
| `--surface-variant` | brand-surface | graphite-800 | Elevated surfaces (dropdowns/popovers/menus) |
| `--surface-2` | brand-surface | cardBackground | Secondary elevated surface |
| `--surface-hover` | `rgba(0,52,111,.06)` | `rgba(255,255,255,.08)` | Hover wash |
| `--text-muted` | handleColor | handleColor | Muted / secondary text |

## Unsanctioned tokens (do NOT use)

Component CSS under `src/app/features` introduced Material-3-style names the system never
defined; several have no fallback and render broken (transparent fills, default text), and
are caught by the stylelint guardrail. Use the sanctioned token instead:

| Unsanctioned | Use instead |
|---|---|
| `--color-primary` / `--color-secondary` / `--color-error` … | `--brand-primary` / `--brand-secondary` / `--functional-error-red` |
| `--surface-container*` / `--surface-2` (M3 sense) / `--on-surface*` | `--cardBackground` / `--currentTextColor` |
| `--secondary-container` / `--error-container` / `--on-*-container` | semantic Durion tokens |
| `--typescale-*` | `--font-primary` / `--font-body` + explicit sizes |
| `--spacing-1 / 2 / 4` | `--space-1 / 2 / 4` |
| `.mic-elevation-*` / `.mic-status` | `.dur-elevation-*` / `.dur-status` |
| `'Michelin Unit Titling'` | `'Barlow Semi Condensed'` |
| literal `#cc9030` for text | `--goldA400` |

## Usage Guidelines

- Always use Tier 3 tokens in component CSS. Fall back to Tier 2 for brand-level decisions.
- Never hardcode hex values in component stylesheets.
- When adding a new runtime token, list it here under "Extended Tokens" with **both** light and dark values, and define it in `styles.css` — never inline an undefined name and rely on a fallback.
- **Contrast Compliance (ADR-0039):** Any token combination used for information-bearing text and its background MUST pass WCAG 2.2 AA (4.5:1 small text < 18pt/14pt bold, 3:1 large text) across all states.
