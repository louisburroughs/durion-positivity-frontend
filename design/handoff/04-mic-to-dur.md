# Step — Rename `.mic-*` utilities to `.dur-*`

`mic-` is upstream-template drift; `dur-` is the canonical Durion prefix. Only two
utilities are affected: `.mic-elevation-1…4` and `.mic-status` (+ its `.primary /
.valid / .warn / .error` variants). Pure rename — no visual change.

## 1. Dry run

```bash
bash handoff/scripts/rename-mic-to-dur.sh
```

Lists every hit across `src/**/*.{css,html,ts}` (definitions in `styles.css`, plus
template class names and any `class="..."` / class bindings). Review the list.

## 2. Apply

```bash
bash handoff/scripts/rename-mic-to-dur.sh --apply
```

The script is **word-boundary scoped** (`\bmic-(elevation|status)\b`) so it rewrites
only the real classes — it will NOT touch substrings like `dynamic-`, `atomic-`,
`ceramic-`, or the word "Michelin". It handles GNU and BSD/macOS `sed` automatically.

## 3. Confirm

```bash
grep -rnE '\bmic-(elevation|status)\b' src/
```

Expect zero matches. Build and spot-check a page that uses elevation/status chips to
confirm styles still apply under the new names.

> If `grep` finds other `mic-` prefixed classes beyond elevation/status, they weren't
> in the original audit — list them and extend the alternation in the script
> (`mic-(elevation|status|<new>)`) rather than doing a blanket replace.
