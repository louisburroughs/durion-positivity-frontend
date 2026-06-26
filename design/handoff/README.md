# Durion Brand & Asset Guide — Execution Package

Rollout for the v2 guide. Apply in order — the guardrail (06) goes **last** or it fails on
not-yet-migrated code. All paths are in this `handoff/` folder.

## Order of operations

| # | Step | Files | Risk |
|---|---|---|---|
| 01 | Self-host **Barlow** (display, `--font-primary`) | `01-barlow-font.md`, `fonts/barlow-semi-condensed.css` | low |
| 02 | Self-host **Noto Sans** (body, `--font-body`) | `02-noto-font.md`, `fonts/noto-sans.css` | low |
| 03 | Document **Heritage Gold** token | `03-heritage-gold.md` → `styles.css` + `theme-tokens.md` | low |
| 04 | Rename `.mic-*` → `.dur-*` | `04-mic-to-dur.md`, `scripts/rename-mic-to-dur.sh` | low (mechanical) |
| 05 | Component token cleanup | `06-token-cleanup.md`, `scripts/cleanup-tokens.sh` | **high** |
| 06 | Stylelint guardrail | `05-stylelint-guardrail.md`, `.stylelintrc.json` | low |
| — | Replace the source-of-truth docs | `durion-style-guide.md`, `theme-tokens.md` → `design/source/` | none |

> **Status:** 01 + 02 are done and checked in. 03–06 + the cleanup codemod + docs are staged here.

### Step 05 — component token cleanup (the long pole)
Full procedure in `06-token-cleanup.md`. In short: run the `grep` in step 1 of that doc to
get your authoritative per-file worklist, run `scripts/cleanup-tokens.sh --apply` for the
safe ~80% (mappings taken from each token's existing `var()` fallback), then hand-resolve
the judgment calls (`--surface-container*`, the no-fallback `*-container` status pairs,
`--typescale-*`, `--space-5`). The no-fallback tokens are the ones actually broken in dark
mode — fix those first. Use the guardrail (06) as the worklist:
`npx stylelint "src/**/*.css" | tee drift-report.txt`.

## What each fix corrects

- **Fonts:** Michelin (licensed, never shipped) and unhosted Noto both silently fell back to
  system `sans-serif`. Now both are self-hosted → Barlow display + Noto body.
- **Heritage Gold:** the logo shield gold (`#cc9030`) is now a real token (`--brand-gold`,
  theme-aware `--goldA400`), not undocumented artwork.
- **`mic-`→`dur-`:** reverts upstream-template prefix drift to the canonical Durion prefix.
- **Token cleanup + guardrail:** stops invented token namespaces from rendering broken and
  from creeping back in.
- **Docs:** `durion-style-guide.md` + `theme-tokens.md` now match the code (corrected
  functional hex `#ba1a1a`/`#2e7d32`, gold, extended tokens, sanctioned vocabulary).

## Open items (need a decision / design, not just code)

1. **Reversed / white logo lockup** — none exists. The guide's header currently sits the navy
   mark on a white plaque as a workaround; dark backgrounds need a proper reversed file.
2. **Retire the badge & banner protos** — both redrew the emblem and dropped the gold border;
   rebuild from the supplied icon file.
3. **Delete or regenerate `design/source/durion-theme.css`** — it's a stale divergent copy
   (light `menuBackground:#fff` / `subMenuBackground:grey-100`) that contradicts
   `src/styles.css` (blue-700 / blue-600). Keep one source of truth.
4. **Ratify `--font-primary` weights** — Barlow 500/600/700 are hosted; confirm the heading
   weight scale in the type spec.
