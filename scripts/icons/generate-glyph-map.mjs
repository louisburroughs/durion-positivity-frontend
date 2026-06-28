#!/usr/bin/env node
/**
 * Generate the msIcon name->glyph map from the vendored `.codepoints` file.
 *
 * The `.codepoints` file is extracted from the actual woff2 (see
 * extract-codepoints.py), so the generated map has full icon coverage and can
 * never drift from the font. Run with `--check` in CI to fail if the committed
 * generated file is stale.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const CODEPOINTS = resolve(root, 'src/assets/fonts/material-symbols/material-symbols-rounded.codepoints');
const OUT = resolve(root, 'src/app/shared/material-symbols-glyphs.generated.ts');

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
  let current = '';
  try { current = readFileSync(OUT, 'utf8'); } catch { /* missing */ }
  if (current !== generated) {
    console.error('material-symbols-glyphs.generated.ts is stale. Run: npm run icons:generate');
    process.exit(1);
  }
  console.log('glyph map up to date.');
} else {
  writeFileSync(OUT, generated);
  const count = generated.match(/^\s{2}'[^']+': '/gm)?.length ?? 0;
  console.log(`wrote ${count} icons -> src/app/shared/material-symbols-glyphs.generated.ts`);
}
