# Durion Positivity Design System

Durion Positivity is the shop-management and point-of-sale platform from Durion Support Services. Service shops run their whole day in it: customers and vehicles, estimates and workorders, bays and mobile units, invoices, inventory, payroll and the general ledger. The interface is a dense back-office tool used on a counter PC, a service-advisor laptop and a tablet in the bay, so it favours legibility, predictable layouts and status you can read at a glance over decoration.

The look is a cool industrial palette: **Blueprint Blue** for the brand and navigation, **Graphite** and neutral greys for structure, **Electric Teal** as the UI accent, and **Heritage Gold** taken from the logo shield, used sparingly. Everything ships in a light and a dark theme.

## This folder

| Path | What it is |
| --- | --- |
| `README.md` | This guide: the rules for building UI in Positivity. |
| `tokens.json` | Every design token with a usage note per token, the type scale and the font files. Values are copied from `src/styles.css` and checked against it. |
| `components.css` | The shared component layer: `.btn`, `.badge`, `.field`, `.card`, `.page-header`, `.dialog`, `.state-panel`. Not loaded by the app yet; page stylesheets move onto it. The data table and the listbox already ship to the app as shared stylesheets in `src/app/shared/styles/` (`data-table.css`, `listbox.css`). |
| `components/<Name>/README.md` | Guidelines per component: when to use it, what the page provides, states, and what not to do. |
| `components/<Name>/preview.html` | A static rendition of the component, built from the app's real stylesheets. |
| `preview.css`, `index.html` | The preview harness and a gallery of every preview with a light/dark switch. |

**Sources of truth.** `src/styles.css` holds every token value. `design/source/theme-tokens.md` and `design/source/durion-style-guide.md` hold the long-form token rules this guide condenses. The logo files are in `design/source/images/` and the fonts in `src/assets/fonts/`; this folder points at them rather than copying them.

**Keeping it in sync.**

- `npm run design:tokens:check` fails when `tokens.json` and `src/styles.css` disagree. CI runs it in `frontend-checks.yml`.
- After changing a token in `src/styles.css`, run `npm run design:tokens`. It rewrites the values in `tokens.json`, keeps the usage notes, drops removed tokens and appends new ones with an empty note. Write that note: the check fails until every token has one.
- `npm run lint:css` runs the stylelint guardrail over `components.css` and `preview.css` as well as `src/`.

**Viewing the previews.** The previews import `src/styles.css`, so serve the repository root rather than opening files directly: `npx http-server -c-1 .`, then open `/design/system/` for the gallery or any `components/<Name>/preview.html`. Add `?theme=dark` to a preview's URL for the dark theme.

## Using this system

- Theme with `data-theme="light"` or `data-theme="dark"` on `<html>`. Light is the default.
- Tokens come in three tiers. **Tier 1** is the raw palette (`--durion-blue-700`, `--durion-teal-400` …) and never changes with the theme. **Tier 2** is brand semantics (`--brand-primary`, `--accent-strong`, `--brand-gold`). **Tier 3** is the runtime set (`--themeBackground`, `--cardBackground`, `--currentTextColor`, `--link-color`, `--status-*` …), which flips per theme. Component CSS consumes Tier 3; Tier 2 only for brand-level fills; Tier 1 never as text or as a surface.
- Write bare `var(--token)`. Fallbacks (`var(--x, #hex)`) are banned: they hide an undefined name and paint the light value in both themes. A new token is defined for both themes in `src/styles.css`, listed in `design/source/theme-tokens.md`, and given a usage note in `tokens.json`.
- Use the classes in `components.css` and the globals in `src/styles.css` before writing page CSS.
- Don't use Material-3 names (`--color-*`, `--surface-container-*`, `--on-*`), `--spacing-*`, `--typescale-*`, the `.mic-*` prefix, `'Inter'` / `'Public Sans'`, or a literal `#cc9030`. The stylelint guardrail rejects them.

## Content fundamentals

Positivity talks to shop owners, service advisors and technicians. It speaks plainly, in the second person, and names things the way a shop does.

- **Address the user as "you".** "Run your shop with confidence." "Your team, organized."
- **Sentence case** for every in-app label, title and button: "Create service area", "Save billing rules", "Assign role". Title Case is reserved for the landing page's marketing headlines ("Run Your Shop With Confidence").
- **Buttons start with a verb** and name the object: "Create credit memo", not "Submit". A confirm button repeats the action it confirms: "Remove Alignment", "Close pay period".
- **Errors say what to do.** "Enter a number of 0 or more, with at most two decimals." "Last name is required." Avoid "Failed to …" with no next step; never blame the user, never apologise.
- **Empty states name what's missing**: "No employees match your filters." "No rules for this price book."
- **Consequences are stated before the action**: "Closing payroll for Sept 1 to Sept 14 is final. Its time entries can no longer be approved or changed."
- **In-progress text ends with an ellipsis character**: "Searching…", "Saving…".
- **Placeholders show the format**: "Enter appointment id (e.g. APT-1234)", "Search by customer, invoice #, or workorder #".
- **`workorder` is one word** everywhere: copy, code, logs. Also: estimate, bay, mobile unit, service area, price book, credit memo, putaway task.
- **No emoji.** Icons carry meaning only beside a word.
- **Every string is an i18n key** present in all six locales (`en-US`, `es-US`, `es-MX`, `fr-CA`, `fr-FR`, and the generated pseudo-locale `qps-ploc`). Leave room: French and Spanish run 20–35% longer.

## Visual foundations

### Colour

- Pages sit on `--themeBackground`; content sits on `--cardBackground`. Body text is `--currentTextColor` (18.7:1 on the light card, 9.3:1 on the dark one).
- Secondary text, hints and metadata use `--text-muted` (6.2:1 light, 8.0:1 dark). **Never mute text with `opacity`**: it multiplies contrast and fails in dark. `opacity` is for disabled controls and decoration only.
- Link and interactive text uses `--link-color`, never `--brand-primary` or `--primaryA400` (fill colours that fail as text in dark). A link inside running text or a table keeps its underline: `--link-color` is only 2.2:1 against body text in light and 1.5:1 in dark, so colour alone cannot mark it (WCAG 1.4.1).
- Brand fills: `--brand-primary` for primary actions, hovering to `--brand-primary-deep`; `--accent-strong` for a teal button with white text (6.4:1), hovering to `--accent-strong-deep`. `--brand-accent` (teal-400) is for borders, icons and small fills and never carries white text (2.4:1); text on it is `--on-accent-fill`.
- Heritage Gold is not the UI accent. Use `--brand-gold` for a fill or border and `--goldA400` for gold text or icons. The logo's gold is locked artwork.
- Selected and hover fills: `--primaryA100` for a selected option or chip, `--surface-hover` for a row or item hover.
- Insets inside a card (filter bars, toolbars, zebra rows, notices) use `--surface-inset`; loading placeholders use `--skeleton-bg`. Both follow the theme.
- **Borders by role.** A border that is a control's only boundary (field, outline button, dropzone, step indicator) uses `--input-border` (3:1 or better against fill and surface). A border that only groups content (card, table, divider, dropdown edge) uses `--border-color`, deliberately quiet.
- **Status is always a pair.** Chips, badges, alerts and banners use `--status-<kind>-bg` with `--status-<kind>-fg` for error, warning, success, info, ready and neutral. Both themes pass AA. The raw `--functional-*` colours are for borders, icons and solid fills where you control the background; `--functional-warning` and `--functional-success` fail as text, and `--functional-error-red` fails on any dark surface.
- Theme-independent exceptions: `--logo-plate` (the white plate behind the mark), `--on-brand-band` (text on the fixed blue landing band) and `--on-accent-fill`.

### Typography

- **Barlow Semi Condensed** (`--font-primary`) is the display face: page titles, section and card titles, overlines, the brand name. It is hosted at **500, 600 and 700 only**; use `--font-weight-display` (700) for h1, `--font-weight-heading` (600) for h2–h4, overlines and labels, `--font-weight-medium` (500) for lighter subheads. Any other weight synthesises a faux face.
- **Noto Sans** (`--font-body`) is everything else: body, fields, tables, buttons, nav. 400, 400 italic, 500, 600, 700, 700 italic.
- **Mono** (`--font-mono`, the system stack) is for identifiers, SKUs and codes: `WO-2026-004812`, `205/55R16`.
- The root size is 16px with a 1.5 line height. Steps (named in `tokens.json`): `page-title` 1.5rem, `section-title` 1.25rem, `card-title` 1.125rem, `body` 1rem, `field` 0.9375rem, `body-sm` and `button` 0.875rem, `table-header` 0.8125rem uppercase, `chip`, `caption` and `overline` 0.75rem. Set sizes in rem; there are no type-scale variables.
- Numbers that line up in columns use `font-variant-numeric: tabular-nums`.

### Spacing and layout

- Spacing runs `--space-1` to `--space-8` (4, 8, 12, 16, 20, 24, 32px). Lay out siblings with flex or grid and `gap`, not per-element margins.
- **The shell**: a 56px header on `--navBackground`; a 220px nav rail on `--menuBackground` that collapses to 56px; content on `--themeBackground`; a 36px footer. Below 768px the rail becomes an overlay.
- A routed page opens with `.page-header`: optional `.overline`, the h1, an optional `.standfirst` (60ch max), and `.header-actions` on the right that wrap below on narrow screens.
- Forms stack `.field` blocks with `--space-4` between them, grouped in fieldsets with an overline legend and `--space-6` between groups. `.field-row` puts short fields side by side and drops to one column.
- Dense lists alternate `--surface-inset` rows or use `.data-table`; don't add rules between every row inside an inset.

### Shape, elevation and motion

- Radii: `--radius-sm` (4px) for controls (buttons, fields, square badges, dropdowns, alerts); `--radius-md` (8px) for cards and dialogs; `--radius-lg` (16px) for table wraps and state panels. Status chips are full pills (`999px`); there is no pill token.
- Elevation is light: `--shadow-card` lifts a card (`.dur-elevation-2`), `--shadow-nav` edges the header and rail. `.dur-elevation-1`, `-3` and `-4` are fixed shadows for resting tiles, popovers and floating panels. Dropdowns and dialogs carry their own shadow over the blue backdrop (`rgb(28 46 72 / 32%)`). Most cards need no shadow at all on `--themeBackground`.
- Motion is short and functional: `--transition-fast` (150ms ease) for hover, border and colour changes; `--transition-base` (250ms ease) for the theme switch and the nav rail collapsing. Honour `prefers-reduced-motion` by removing transitions.

### States and focus

- Keyboard focus is always visible: a 2px solid outline. On surfaces it is `--input-focus-border`; fields also get a 3px halo of the same colour at 20%. In the nav rail the outline is `--contrastTextColor` (white), because teal on the blue-700 rail is only 2.2:1. Header controls use `--accentA400`, which holds 3.5:1 on `--navBackground` in light and 10.7:1 in dark.
- Disabled controls drop to 60% opacity with a not-allowed cursor; they keep `aria-disabled` when they must stay focusable.
- Invalid fields set `aria-invalid="true"`, switch their border to `--status-error-fg` and show a `.field-error` line in the same colour.
- Every routed page has four states: idle, loading (skeletons on `--skeleton-bg`), ready, and error (a `.state-panel--error` with the message and a retry).
- Contrast follows ADR-0039: WCAG 2.2 AA in both themes and every state, 4.5:1 for text, 3:1 for large text, control boundaries, focus rings and meaningful icons.

## Iconography

- Icons are **Material Symbols Rounded**, self-hosted as one static instance (optical size 24, weight 400, unfilled, grade 0). Write the ligature name inside a span: `<span class="material-symbols-rounded" aria-hidden="true">build</span>`.
- 24px by default; 22px in the nav rail; 18px inside buttons; 14px inside status chips; 32px in a state panel.
- Icons are decoration beside a visible word, so they are `aria-hidden="true"`. An icon-only button carries an `aria-label` (or an `.sr-only` label) in the user's language.
- Icons take the colour of their text; accent icons use `--accentA400`, gold icons `--goldA400`.
- Until the icon font loads the nav rail shows the label's first letter, so navigation never depends on the font.

## Logo

- Three lockups in `design/source/images/`: the **primary** (shield over the DURION wordmark and SUPPORT SERVICES), the **emblem** (shield only, `…_Icon_Only`) and the **wordmark** (type only, `…_only_words`). Each has a PNG for screens and the vector PDF master.
- Place the supplied files. Never redraw, retrace or regenerate the emblem, and never recolour it; the gold border is locked artwork.
- Clear space is at least half the shield's height on every side. Minimum sizes: primary 120px wide, emblem 32px tall.
- There is no reversed (white) lockup yet. On a dark surface (the header, the dark theme) place the mark on a `--logo-plate` white plaque, as the login and landing pages do.
- The in-app header pairs the 26px emblem with "Positivity" set in `--font-primary` 700 at 1.125rem, 0.03em tracking, in `--contrastTextColor`.
- `durion_badge_proto.png` and `durion_banner_proto.png` are retired: they redrew the emblem without its gold border.

## Known gaps

- **Buttons.** The app has several local vocabularies (`.btn-primary`, `.btn--accent`, radii from 2px to 0.9rem). `components.css` sets one `.btn` with modifiers; `components/Button/README.md` maps the old names. Pages adopt it as they are touched.
- **`color-mix()` tokens** (`--accentA100` in dark, `--surface-inset`, `--skeleton-bg`) appear in `tokens.json` as the hex they resolve to; `npm run design:tokens` recomputes them.
- **Material Icons Two Tone**, named in the old style guide, is not hosted and is not part of the system.
- **`design/DESIGN.md`**'s "Architectural Ledger" direction (Public Sans, Inter, gradients, glass) conflicts with the token inventory and is not part of this system.
- **`design/source/durion-theme.css`** is a stale copy that disagrees with `src/styles.css`; ignore it.
