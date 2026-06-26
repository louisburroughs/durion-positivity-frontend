# Step 05 — Component token cleanup

The `src/app/features` stylesheets reference tokens the design system never defined.
Some carry a `var(--x, fallback)` so they merely render the fallback (untidy); others
have **no fallback**, so they resolve to nothing and render broken — transparent fills,
default/again-inherited text — most visibly in **dark mode**.

This is the highest-risk step. Work it per feature, verify dark mode, finish green on the
stylelint guard.

---

## 1. Generate the authoritative report (run in your checkout)

`grep -r` in the real repo is collision-free and instant — it's the source of truth:

```bash
# every offending line, grouped
grep -rnE '\-\-(spacing-[0-9]|space-5|color-(primary|secondary|error|warning|success|on-[a-z-]+)|surface-container[a-z-]*|on-surface[a-z-]*|secondary-container|error-container|on-(secondary|error)-container|typescale-[a-z-]+)' src --include='*.css' | tee drift-report.txt

# just the file list (your worklist)
grep -rlE '\-\-(spacing-|space-5|color-|surface-container|on-surface|secondary-container|error-container|typescale-)' src --include='*.css'
```

## 2. Auto-fix the safe ~80%

```bash
bash handoff/scripts/cleanup-tokens.sh            # preview
bash handoff/scripts/cleanup-tokens.sh --apply    # rewrite
```

These mappings are **unambiguous** — each is the value the token's own `var()` fallback
already pointed at:

| Drift token | → Replace with | Why |
|---|---|---|
| `--spacing-1 / 2 / 4 …` | `--space-1 / 2 / 4 …` | Same scale, wrong name |
| `--color-primary` | `--brand-primary` | matches existing fallback |
| `--color-secondary` | `--brand-secondary` | matches existing fallback |
| `--color-error` | `--functional-error-red` | matches existing fallback |
| `--color-warning` | `--functional-warning` | matches existing fallback |
| `--color-success` | `--functional-success` | matches existing fallback |
| `--color-on-surface` | `--currentTextColor` | theme text token |
| `--color-on-surface-variant` | `--text-muted` | muted text token (defined) |

## 3. Resolve the judgment calls (manual)

Not auto-fixed — each needs a per-use decision. Recommended mappings:

| Drift token | Recommended | Note |
|---|---|---|
| `--surface-container`, `-lowest`, `-highest` | `--cardBackground` | Theme-aware surface. If you truly need distinct elevation tiers, define them in `styles.css` (light+dark) rather than the M3 names. |
| `--on-surface` | `--currentTextColor` | (only where the safe pass didn't catch a non-`--color-` form) |
| `--on-surface-variant` | `--text-muted` | already defined |
| `--secondary-container` / `--on-secondary-container` | status-badge pair, e.g. `--primary50` bg / `--brand-primary` fg, or `#edfaef` / `#2e7d3a` for the "paid/valid" case | **no fallback today → currently broken.** Pick the semantic pair per badge. |
| `--error-container` / `--on-error-container` | `color-mix(in srgb, var(--functional-error-red) 12%, transparent)` bg / `--functional-error-red` fg | **no fallback today → broken.** Matches the `.alert-error` treatment. |
| `--typescale-title-sm-size` | `0.875rem` | Use the literal (it was the fallback). Or define a type scale in `styles.css` if you want tokens. |
| `--typescale-label-sm-size` | `0.75rem` | same |
| `--typescale-body-sm-size` | `0.875rem` | same |

### `--space-5` (referenced, never declared)
The usages assume `1.25rem`. Cleanest fix is to **add it to the scale** in `styles.css`
rather than rewrite call sites:

```css
  --space-5: 1.25rem;   /* fills the 4 → 6 gap */
```

Then `--space-5` becomes sanctioned — remove it from the stylelint deny list if you do this.

## 4. Verify (per feature)

- Toggle `data-theme="dark"` and confirm the previously-broken surfaces/badges now have
  real backgrounds and AA text (ADR-0039).
- Re-run `npx stylelint "src/**/*.css"` — drive it to **zero**.
- The no-fallback tokens (`*-container`) are the ones to eyeball first; they were the
  actual breakage, not just untidiness.

---

> **Note on the audit:** the per-file list must come from `grep` in your checkout (step 1).
> Trying to enumerate it from outside the repo is unreliable — directory listings truncate
> and a stripped-prefix import collapses every feature's `pages/` onto one path. The codemod
> + your local grep together are exhaustive and collision-free.
