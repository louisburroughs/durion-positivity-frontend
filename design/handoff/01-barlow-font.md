# Step — Wire Barlow Semi Condensed into the app

Replaces the retired `'Michelin Unit Titling'` as `--font-primary`. Body stays on
Noto Sans (already in the repo). ~15 minutes, no visual risk beyond heading reflow.

---

## 1. Get the font files (binaries can't be generated here)

Barlow Semi Condensed is Open Font License. Fetch the **latin** `.woff2` for weights
**500, 600, 700** by either route:

- **google-webfonts-helper** — https://gwfh.mranftl.com/fonts/barlow-semi-condensed
  → select charset `latin`, styles `500 / 600 / 700`, download, keep the `.woff2`.
- **Fontsource** — `npm i @fontsource/barlow-semi-condensed`, then copy the 500/600/700
  latin `.woff2` out of `node_modules/@fontsource/barlow-semi-condensed/files/`.

Name them to match the `@font-face` in `fonts/barlow-semi-condensed.css`:

```
barlow-semi-condensed-v16-latin-500.woff2
barlow-semi-condensed-v16-latin-600.woff2
barlow-semi-condensed-v16-latin-700.woff2
```

(If the version prefix differs, either rename the files or update the `url()`s — they
just have to agree.)

## 2. Drop the files into the served assets dir

```
src/assets/fonts/barlow/
  ├─ barlow-semi-condensed.css            (from handoff/fonts/)
  ├─ barlow-semi-condensed-v16-latin-500.woff2
  ├─ barlow-semi-condensed-v16-latin-600.woff2
  └─ barlow-semi-condensed-v16-latin-700.woff2
```

Mirror wherever the Noto Sans `.woff` files already live so both faces load the
same way (offline, and in PDF/PNG exports).

## 3. Load the face + retarget the token in `src/styles.css`

At the **top** of `styles.css` (before `:root`), pull in the `@font-face`s:

```css
@import 'assets/fonts/barlow/barlow-semi-condensed.css';
```

Then change the one token (in the `:root` Typography block):

```diff
-  --font-primary: 'Michelin Unit Titling', 'Noto Sans', sans-serif;
+  --font-primary: 'Barlow Semi Condensed', 'Noto Sans', sans-serif;
   --font-body: 'Noto Sans', sans-serif;
```

That's the whole swap — every selector already reads `var(--font-primary)`, so all
headings/overlines pick it up at once.

## 4. Purge the dead reference

```bash
grep -rn "Michelin Unit Titling" src/
```

Expect **zero** results after step 3. If any component hardcodes the family string
instead of the token, replace it with `var(--font-primary)`.

## 5. Verify

- Headings render in Barlow (condensed) at a couple of breakpoints — check the
  longest titles don't clip now that the face is narrower.
- Run an export (PDF/PNG) and confirm the self-hosted face shows, not a fallback.
- Heading contrast still passes WCAG 2.2 AA per ADR-0039.
