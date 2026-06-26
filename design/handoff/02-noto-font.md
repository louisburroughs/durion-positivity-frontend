# Step — Self-host Noto Sans (body / `--font-body`)

`--font-body: 'Noto Sans', sans-serif` is the body face, but Noto Sans is **not
installed in the app** — no `@font-face` declares it, and the `.woff` files live
only in `design/source/fonts/` (a design-reference folder, not built/served). On any
machine without Noto Sans installed, body text silently falls back to the OS default
`sans-serif`. Same trap as Michelin. Fix it the same way as Barlow.

---

## 1. Move the font files into the served assets dir

The four `.woff` files already exist in the repo. Copy them out of
`design/source/fonts/noto-sans/` into:

```
src/assets/fonts/noto-sans/
  ├─ noto-sans.css                       (from handoff/fonts/)
  ├─ noto-sans-v12-latin-regular.woff
  ├─ noto-sans-v12-latin-italic.woff
  ├─ noto-sans-v12-latin-700.woff
  └─ noto-sans-v12-latin-700italic.woff
```

(Optional: `.woff2` is ~30% smaller. If you want it, grab Noto Sans 400/400i/700/700i
latin `.woff2` from https://gwfh.mranftl.com/fonts/noto-sans and add a `woff2` source
line above each `woff` line. The `.woff` alone works everywhere current.)

## 2. `@import` it from `src/styles.css`

Next to the Barlow import at the top of the file:

```css
@import 'assets/fonts/noto-sans/noto-sans.css';
@import 'assets/fonts/barlow/barlow-semi-condensed.css';
```

No token change needed — `--font-body` already names `'Noto Sans'`; it just had
nothing to resolve to.

## 3. Verify

- In DevTools, inspect a paragraph → Computed → it should report the rendered font as
  **Noto Sans**, not a fallback.
- Test on a machine that does NOT have Noto Sans installed (or disable it) to confirm
  it now loads from assets rather than falling back.

---

### Note on the extra Barlow file
`src/assets/fonts/barlow/` also has `…-regular.woff2` (weight 400). The titling stack
only uses 500/600/700, so that 400 file is currently unused — harmless to keep, or
drop it. Don't use Barlow for body; body is Noto Sans.
