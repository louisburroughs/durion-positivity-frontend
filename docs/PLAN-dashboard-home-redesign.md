# Plan — Dashboard Home Page Redesign

**Target:** `DashboardComponent` at `/app` (`src/app/features/shell/dashboard/`).
**Source:** `Positivity Home.dc.html` mockup + design agent spec (below).
**Design system:** canonical Tier-3 tokens in `src/styles.css` / `design/source/theme-tokens.md`
(Barlow Semi Condensed + Noto Sans, Blueprint Blue / Electric Teal / Heritage Gold, light+dark).

> **Token decision:** the mockup's hardcoded dark hexes are translated to sanctioned Tier-3
> runtime tokens. `DESIGN.md`'s "Architectural Ledger" (Public Sans/Inter, light-only) is
> aspirational and NOT the shipped system — we follow its *principles* (breathing room, surface
> tonality, editorial type contrast) but use the real Barlow/Noto token set.

## Decisions (confirmed)
- **Data source:** static config in the component — curated action set + favorites with real
  `routerLink`s; "Recently opened" = fixed starter list. No new service, no backend. Personalization
  is a later iteration.
- **Assistant strip:** wired to the existing chat — reuses `ChatStateService` / `ChatApiService`
  and opens/seeds the existing `chat-panel`. No new chat plumbing.

---

## Sections to build (inside shell `<main>`)
1. **Assistant strip** (toggleable) — prompt input; on submit seeds `ChatStateService` + opens chat panel.
2. **Greeting header** — `<h1>` "Welcome back, {firstName}" + subtext + "Customize" button (deferred no-op/tooltip this iteration).
3. **Pinned quick actions** — `<section>`/`<ul>` of 5 `<a routerLink>` cards (tinted icon tile, label, sub-label).
4. **Recently opened + Favorite areas** (toggleable) — 2-col grid; left list (4 rows) + right favorites (4 pill rows).
5. Footer — shell-owned, untouched.

First name source: `AuthService.currentUserClaims` (computed). Fallback "Welcome back" with no trailing comma — never "Welcome back, undefined".

---

## Visual / token spec (from design agent)

### Layout
- Content max-width `72rem`, centered; padding `--space-6` (≥768px) / `--space-4` (<768px); top `--space-7`, bottom `--space-8`.
- Section vertical gap `--space-7`; header→grid gap `--space-4`.
- Quick-actions grid: `repeat(auto-fit, minmax(195px, 1fr))`, gap `--space-4` (self-reflows 5→1).
- Recent+Favorites: `1.55fr 1fr`, gap `--space-5`; **collapse to 1-col `< 880px`**.
- Greeting flex row; "Customize" wraps under greeting `< 560px`.

### Token map (key pairings — ⚠ = AA-sensitive, verify both themes)
| Element | bg | text/icon | border/hover |
|---|---|---|---|
| Cards / lists | `--cardBackground` | label `--currentTextColor`, sub/meta `--text-muted` ⚠ | `--border-color`; hover border `--accentA400` |
| Assistant icon | — | `--accentA700` (teal) ⚠ | — |
| Assistant input | `--surface-2` | placeholder `--text-muted` ⚠ | — |
| Send button | `--accentA700` fill | `--contrastTextColor` (white) ⚠ white-on-teal allowed **only** on A700 | hover `--shadow-card`; disabled bg `--surface-2`/`--text-muted` |
| Customize pin / fav star | — | `--goldA400` ⚠ gold icon token, never raw `#cc9030` | — |
| Recent row icon tile | `--surface-2` | `--accentA700` | hover row `--surface-hover` |
| Favorite pill icon | `--accentA100` | `--accentA700` ⚠ | — |
| "View all" link | — | `--primaryA300` ⚠, underline on hover/focus | — |

### Quick-action tints (icon glyph + tile)
| Action | Symbol | tile bg | glyph |
|---|---|---|---|
| New work order | `assignment_add` | `--accentA100` | `--accentA700` ⚠ |
| Add customer | `person_add` | `--primary50` | `--primaryA400` |
| Take payment | `payments` | `--status-info-bg` | `--status-info-fg` (distinguish from Add customer) |
| Today's schedule | `event` | `--goldA100` | `--goldA400` ⚠ |
| Low stock | `inventory_2` | `--status-error-bg` | `--status-error-fg` |

Routes: New WO→`/app/workexec`, Add customer→`/app/crm`, Take payment→`/app/billing`, Schedule→`/app/shopmgmt/dispatch-board`, Low stock→`/app/inventory`.

### Typography
| Role | Font | Weight | Size/LH |
|---|---|---|---|
| h1 greeting | `--font-primary` | 700 | 29px / 1.15, -0.01em |
| Overline (PINNED…) | `--font-primary` | 500 | 12px, +0.12em uppercase |
| Column `<h2>` | `--font-primary` | 600 | 18px |
| Subtext | `--font-body` | 400 | 16px / 1.5 |
| Card label | `--font-body` | 500 | 15px |
| Sub-label / meta | `--font-body` | 400 | 13px |

Only Barlow 500/600/700 hosted — never request other Barlow weights; body always Noto.

### States
- `:focus-visible` ring: `outline: 2px solid var(--accentA400); outline-offset: 2px` (never `:focus`).
- Card hover: `translateY(-2px)` + border `--accentA400` + deeper `--shadow-card`; row hover: `--surface-hover` (no lift); active: remove lift.
- `@media (prefers-reduced-motion: reduce)`: drop transforms/shimmer, keep color transitions.

### Page state machine (static data → trivial, but wire for future)
`state = signal<'idle'|'loading'|'ready'|'empty'|'error'>('ready')`, `errorKey = signal<string|null>(null)`.
Static config means `ready` immediately; structure left in place so a future data service slots in.
Empty/error copy keys defined now (unused path) per ADR-0031 convention. Greeting/assistant are static (not state-gated).

---

## Accessibility (ADR-0029)
- One `<h1>` (greeting). Section headings `<h2>` ("Pinned quick actions" overline IS a real h2, visually uppercased; "Recently opened"; "Favorite areas"; assistant region `aria-label`). No skipped levels.
- Do NOT add a second `<main>` (shell owns it). Each block = `<section aria-labelledby>`.
- Quick actions / lists = `<ul>`/`<li>`; cards are `<a routerLink>` (navigation), "Customize"/send/"View all"(retry-style) are `<button type="button">`.
- Decorative Material Symbols `aria-hidden="true"`; text label carries meaning.
- Assistant input `aria-label`; send `<button aria-label>`; toggles `aria-expanded`/`aria-controls`.
- Focus order = DOM = visual; 1-col collapse keeps Recent before Favorites (already correct in source order).

## SPA navigation (ADR-0037)
- All cards/favorites use `routerLink` (+ `RouterLink` in `imports`). Retry/toggle/customize/send are `<button type="button">`. No bare `href`.

## i18n (ADR-0030)
- Every string via `| translate`. Extend `SHELL.DASHBOARD` namespace and add keys to **all 4** locale files
  (`en-US`, `es-US`, `fr-CA`, `qps-ploc`): greeting heading/subtext, `CUSTOMIZE`, overline labels,
  `QUICK_ACTION.*` (label+sub for 5), `RECENT.*` (title, View all, meta is data), `FAVORITES.*` (title),
  `ASSISTANT.*` (placeholder, hint, send aria), empty/error keys.
- Run `npm run i18n:check` (missing-keys + pseudo-locale) before commit.

---

## Files to change
| File | Change |
|---|---|
| `dashboard.component.ts` | Inject `AuthService` (firstName), `ChatStateService`/`ChatApiService` (assistant) + Router. Add `state`/`errorKey` signals, static config arrays (actions, recent, favorites), toggle signals, `submitAssistant()`, `openChat()`. Imports: `RouterLink`, `TranslatePipe`. |
| `dashboard.component.html` | Full rewrite → 4 sections per spec, semantic `<section>/<ul>/<a>/<button>`, all strings `| translate`, Material Symbol spans `aria-hidden`. |
| `dashboard.component.css` | Full rewrite → token-only styles, grids, states, focus-visible, reduced-motion. No hardcoded hex. |
| `dashboard.component.spec.ts` | New/expanded: renders sections, cards have correct `routerLink`, greeting uses claim + fallback, assistant submit calls chat service, a11y (single h1, button types), state machine defaults. |
| `src/assets/i18n/{en-US,es-US,fr-CA,qps-ploc}.json` | Add `SHELL.DASHBOARD.*` keys (4 files). |

Verify Material Symbols font is loaded by the shell (mockup uses `Material Symbols Rounded`); if not already self-hosted/linked, reuse the existing icon mechanism the shell/nav uses rather than adding a Google Fonts link (CSP/offline). Confirm during impl.

## Verification
1. `npx ng test --include="src/app/features/shell/dashboard/**/*.spec.ts" --no-watch` — green.
2. `npm run lint:css` — no token violations.
3. `npm run i18n:check` — no missing keys / pseudo drift.
4. `npm run a11y:smoke:strict` — `/app` passes (no serious axe violations).
5. Manual: toggle light/dark, verify ⚠ pairings legible; keyboard-tab full focus order; `prefers-reduced-motion` kills lift.

## Out of scope (future)
- Real personalization (pins/favorites/recents persistence) — would add a signal+localStorage service with Router `NavigationEnd` recents tracking.
- Backend endpoints for dashboard data.
- "Customize" editing flow (button present, no-op/tooltip this iteration).
