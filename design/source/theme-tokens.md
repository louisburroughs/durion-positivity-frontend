# Durion POS – Theme Token Inventory

This file is the canonical token inventory for the Durion frontend design system. It documents every CSS custom property used in the application and should be read alongside `durion-style-guide.md` and `durion-theme.css`.

Tokens defined in `src/styles.css` fall into three tiers:

## Tier 1 – Raw Palette Tokens

Defined in `:root` and never changed by theme switching. Sourced directly from the Durion style guide.

| Token | Value | Purpose |
|---|---|---|
| `--durion-blue-800 … 50` | See styles.css | Blueprint Blue ramp |
| `--durion-graphite-800 … 100` | See styles.css | Graphite grey ramp |
| `--durion-teal-600 … 100` | See styles.css | Electric Teal ramp |
| `--durion-grey-900 … 100` | See styles.css | Neutral ramp |
| `--functional-error-red` | `#c84c47` | Error states |
| `--functional-warning` | `#e6a540` | Warning states |
| `--functional-info-blue` | `#355d92` | Info states |
| `--functional-success` | `#5bbe72` | Success states |

## Tier 2 – Brand Semantic Tokens

Stable aliases that map palette tokens to semantic roles. Shared across light and dark.

| Token | Light value | Purpose |
|---|---|---|
| `--brand-primary` | `--durion-blue-700` | Primary actions, nav |
| `--brand-primary-soft` | `--durion-blue-50` | Subtle primary tones |
| `--brand-secondary` | `--durion-graphite-700` | Secondary text/UI |
| `--brand-accent` | `--durion-teal-400` | Accent / highlight |
| `--brand-background` | `--durion-grey-100` | Page background |
| `--brand-surface` | `#ffffff` | Card / modal surface |

## Tier 3 – Runtime Theme Tokens

These tokens flip when `data-theme` attribute changes on `<html>`. Consume these in all component styles.

### From Durion Style Guide
| Token | Light | Dark |
|---|---|---|
| `--themeBackground` | grey-100 | grey-800 |
| `--navBackground` | blue-800 | grey-900 |
| `--menuBackground` | blue-700 | `#16181c` |
| `--subMenuBackground` | blue-600 | graphite-800 |
| `--cardBackground` | white | grey-700 |
| `--currentTextColor` | grey-900 | `#e8e9eb` |
| `--contrastTextColor` | white | white |
| `--primaryA400` | blue-500 | blue-400 |
| `--primaryA300` | blue-400 | blue-300 |
| `--primaryA100` | blue-100 | blue-700 |
| `--primary50` | blue-50 | blue-800 |
| `--accentA400` | teal-400 | teal-300 |
| `--accentA700` | teal-600 | teal-400 |
| `--accentA100` | teal-100 | teal-600 |
| `--trackColor` | graphite-200 | grey-700 |
| `--handleColor` | graphite-500 | graphite-500 |

### Extended Tokens (not in style guide – defined locally)
| Token | Light | Dark | Rationale |
|---|---|---|---|
| `--border-color` | graphite-200 | graphite-700 | Consistent border across all components |
| `--input-background` | white | graphite-800 | Form field fill |
| `--input-border` | graphite-200 | graphite-600 | Form field outline |
| `--input-focus-border` | blue-500 | blue-400 | Focus ring color |
| `--shadow-card` | rgba(0,0,0,0.08) | rgba(0,0,0,0.4) | Card elevation |
| `--shadow-nav` | rgba(0,0,0,0.12) | rgba(0,0,0,0.5) | Sidebar shadow |
| `--chat-bubble-user-bg` | blue-100 | blue-700 | User message bubble |
| `--chat-bubble-system-bg` | graphite-100 | graphite-700 | System message bubble |

## Usage Guidelines

- Always use Tier 3 tokens in component CSS. Fall back to Tier 2 for brand-level decisions.
- Never hardcode hex values in component stylesheets.
- When adding new runtime tokens, list them in this file under "Extended Tokens", providing both light and dark values.
