# Step — Add Heritage Gold as a documented token

Ratifies the logo's shield gold (`#cc9030`, sampled from the primary lockup) as a real
token. Three tiers, mirroring the existing system: raw ramp → brand alias → theme-aware
runtime token. All edits are in `src/styles.css`; the inventory update is in
`design/source/theme-tokens.md`.

> **Scope (enforce in review):** the logo artwork is locked — never recolor it. Outside
> the logo, gold is a *sparing* heritage/premium accent; it does **not** replace Electric
> Teal as the UI accent. For text, only `--durion-gold-600` (light) / the `--goldA400`
> runtime token is contrast-safe — `#cc9030` and lighter fail AA on white.

---

## 1. `styles.css` — Tier 1 raw ramp

In the `:root` raw-palette section, after the Electric Teal ramp:

```css
  /* Heritage Gold — sampled from the primary logo shield (#cc9030) */
  --durion-gold-600: #a06a1a;  /* darkest — 4.6:1 on white, AA for text */
  --durion-gold-500: #cc9030;  /* canonical — matches the shield border */
  --durion-gold-400: #d8a449;
  --durion-gold-300: #e3bd78;
  --durion-gold-200: #efd6a8;
  --durion-gold-100: #f8edd5;  /* lightest — soft fill / wash */
```

## 2. `styles.css` — Tier 2 brand alias

In the `/* Brand Semantic */` block in `:root`, alongside `--brand-accent`:

```css
  --brand-gold: var(--durion-gold-500);
```

## 3. `styles.css` — Tier 3 runtime tokens (theme-aware)

So heritage accents stay AA in both themes. In the light block (`:root, [data-theme='light']`):

```css
  --goldA400: var(--durion-gold-600);  /* heritage accent text/icon — 4.6:1 on white */
  --goldA100: var(--durion-gold-100);  /* soft gold fill / wash */
```

In the dark block (`[data-theme='dark']`):

```css
  --goldA400: var(--durion-gold-300);  /* lighter so it reads on dark surfaces (6.3:1) */
  --goldA100: var(--durion-gold-600);  /* deep gold wash on dark */
```

**Use `--goldA400` for any gold text or icon** — it flips per theme. Reserve the raw
`--durion-gold-*` for fills/borders where you control the background contrast yourself.

---

## 4. `theme-tokens.md` — register it

**Tier 1** table, add:

| `--durion-gold-600 … 100` | See styles.css | Heritage Gold ramp (from logo shield) |

**Tier 2** table, add:

| `--brand-gold` | `--durion-gold-500` | Heritage / premium accent (not the UI accent) |

**Tier 3** table, add:

| Token | Light | Dark |
|---|---|---|
| `--goldA400` | gold-600 | gold-300 |
| `--goldA100` | gold-100 | gold-600 |

Note in the prose that gold is heritage-only and does not replace `--brand-accent`
(teal) for interactive UI.

---

## 5. Verify

- `--brand-gold` and `--goldA400` resolve in DevTools under both `data-theme` values.
- Any gold text uses `--goldA400` and passes WCAG 2.2 AA (4.5:1) in light **and** dark.
- The logo file is untouched — gold there is baked artwork, not a token.
