#!/usr/bin/env node
/**
 * Generate the msIcon name->glyph map from the vendored `.codepoints` file.
 *
 * The `.codepoints` file is extracted from the actual woff2 (see
 * extract-codepoints.py), so the generated map has full icon coverage and can
 * never drift from the font. Run with `--check` in CI to fail if the committed
 * generated file is stale.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const FONT_DIR = 'src/assets/fonts/material-symbols';
const CODEPOINTS = resolve(root, `${FONT_DIR}/material-symbols-rounded.codepoints`);
const WOFF2 = resolve(root, `${FONT_DIR}/material-symbols-rounded.woff2`);
const WOFF2_HASH = resolve(root, `${FONT_DIR}/material-symbols-rounded.woff2.sha256`);
const OUT = resolve(root, 'src/app/shared/material-symbols-glyphs.generated.ts');

/**
 * Verify the committed `.codepoints` was extracted from the current woff2.
 * `.codepoints` -> generated.ts drift is caught by the file diff below; this
 * catches the other half: a font swapped without rerunning extract-codepoints.py.
 */
function checkFontPin() {
  const actual = createHash('sha256').update(readFileSync(WOFF2)).digest('hex');
  const pinned = readFileSync(WOFF2_HASH, 'utf8').trim().split(/\s+/)[0];
  if (actual !== pinned) {
    console.error(
      'woff2 changed since the codepoint map was extracted.\n' +
      'Rerun: pip install fonttools brotli && python scripts/icons/extract-codepoints.py && npm run icons:generate',
    );
    process.exit(1);
  }
}

function build() {
  const lines = readFileSync(CODEPOINTS, 'utf8').split('\n');
  const entries = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [name, hex] = trimmed.split(/\s+/);
    if (!name || !/^[0-9a-f]+$/i.test(hex ?? '')) continue;
    entries.push([name, hex.toLowerCase()]);
  }
  entries.sort((a, b) => a[0].localeCompare(b[0]));

  const body = entries.map(([name, hex]) => `  '${name}': '\\u${hex}',`).join('\n');
  return `// GENERATED — do not edit by hand.
// Source: src/assets/fonts/material-symbols/material-symbols-rounded.codepoints
// Regenerate: npm run icons:generate
//
// Material Symbols Rounded name -> glyph codepoint, extracted from the vendored
// woff2 (full coverage, no drift). Consumed by material-symbol.pipe.ts.

export const GLYPHS: Readonly<Record<string, string>> = {
${body}
};
`;
}

const generated = build();

if (process.argv.includes('--check')) {
  checkFontPin();
  let current = '';
  try { current = readFileSync(OUT, 'utf8'); } catch { /* missing */ }
  if (current !== generated) {
    console.error('material-symbols-glyphs.generated.ts is stale. Run: npm run icons:generate');
    process.exit(1);
  }
  console.log('glyph map + font pin up to date.');
} else {
  writeFileSync(OUT, generated);
  const count = generated.match(/^\s{2}'[^']+': '/gm)?.length ?? 0;
  console.log(`wrote ${count} icons -> src/app/shared/material-symbols-glyphs.generated.ts`);
}
