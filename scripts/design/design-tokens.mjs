#!/usr/bin/env node
/**
 * Keep design/system/tokens.json in step with src/styles.css.
 *
 * src/styles.css is the source of truth for every token value. tokens.json is
 * the design system's machine-readable copy: the same values plus a usage note
 * per token, the type scale and the font files. This script reads the three
 * token blocks of styles.css (`:root`, `:root, [data-theme='light']`,
 * `[data-theme='dark']`) and compares them with tokens.json:
 *
 *   node scripts/design/design-tokens.mjs           rewrite values, keep notes
 *   node scripts/design/design-tokens.mjs --check   fail on any drift (CI)
 *
 * A token new in styles.css is appended with an empty usage note, which
 * --check then reports until someone writes one. A token gone from styles.css
 * is dropped. `var(--x)` becomes the alias "{x}"; a `color-mix(in srgb, …)` is
 * stored as the hex it resolves to in each theme. `--transition-*` goes in the
 * `transition` family.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const STYLES = resolve(root, 'src/styles.css');
const TOKENS = resolve(root, 'design/system/tokens.json');
const CHECK = process.argv.includes('--check');

// ── Read the token blocks of styles.css ──────────────────────────────────────

function readBlocks(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = { base: new Map(), light: new Map(), dark: new Map() };
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = rule.exec(text))) {
    const selector = m[1].replace(/@import[^;]*;/g, '').replace(/"/g, "'").replace(/\s+/g, ' ').trim();
    const target =
      selector === ':root'
        ? blocks.base
        : selector === ":root, [data-theme='light']"
          ? blocks.light
          : selector === "[data-theme='dark']"
            ? blocks.dark
            : null;
    if (!target) continue;
    for (const decl of m[2].split(';')) {
      const d = /^\s*--([\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(decl);
      if (d) target.set(d[1], norm(d[2]));
    }
  }
  return blocks;
}

function norm(value) {
  return value.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
}

// ── Resolve values the way the browser would, per theme ─────────────────────

function effective(blocks, name, theme) {
  if (theme === 'dark' && blocks.dark.has(name)) return blocks.dark.get(name);
  if (blocks.light.has(name)) return blocks.light.get(name);
  return blocks.base.get(name);
}

function toHex(blocks, value, theme, depth = 0) {
  if (depth > 16) throw new Error(`alias chain too deep at ${value}`);
  const v = /^var\(--([\w-]+)\)$/.exec(value);
  if (v) {
    const target = effective(blocks, v[1], theme);
    if (target === undefined) throw new Error(`var(--${v[1]}) is not defined in styles.css`);
    return toHex(blocks, target, theme, depth + 1);
  }
  if (/^#[0-9a-f]{3}$/i.test(value)) return `#${[...value.slice(1)].map((c) => c + c).join('')}`.toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const mix = /^color-mix\(in srgb, (.+?) (\d+(?:\.\d+)?)%, (.+)\)$/.exec(value);
  if (mix) {
    const a = rgb(toHex(blocks, mix[1], theme, depth + 1));
    const b = rgb(toHex(blocks, mix[3], theme, depth + 1));
    const p = Number(mix[2]) / 100;
    return `#${a.map((x, i) => Math.round(p * x + (1 - p) * b[i]).toString(16).padStart(2, '0')).join('')}`;
  }
  throw new Error(`cannot resolve "${value}" to a hex colour`);
}

function rgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/** A styles.css value as tokens.json stores it. */
function toToken(blocks, value, theme) {
  const alias = /^var\(--([\w-]+)\)$/.exec(value);
  if (alias) return `{${alias[1]}}`;
  if (value.startsWith('color-mix(')) return toHex(blocks, value, theme);
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return value.toLowerCase();
  return value;
}

// ── What tokens.json should hold ─────────────────────────────────────────────

function expected(blocks) {
  const color = new Map();
  const shadow = new Map();
  const families = new Map();
  const scalar = { spacing: new Map(), radius: new Map(), fontWeight: new Map(), transition: new Map() };
  for (const [name, value] of blocks.base) {
    if (name.startsWith('transition-')) scalar.transition.set(name, value);
    else if (name.startsWith('font-weight-')) scalar.fontWeight.set(name, value);
    else if (name.startsWith('font-')) families.set(name.slice('font-'.length), value);
    else if (name.startsWith('space-')) scalar.spacing.set(name, value);
    else if (name.startsWith('radius-')) scalar.radius.set(name, value);
    else color.set(name, toToken(blocks, value, 'light'));
  }
  for (const name of new Set([...blocks.light.keys(), ...blocks.dark.keys()])) {
    const themed = {
      light: toToken(blocks, effective(blocks, name, 'light'), 'light'),
      dark: toToken(blocks, effective(blocks, name, 'dark'), 'dark'),
    };
    (name.startsWith('shadow-') ? shadow : color).set(name, themed);
  }
  return { color, shadow, families, ...scalar };
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function stack(value) {
  return norm(value.replace(/'/g, '"'));
}

// ── Compare (and rewrite) ────────────────────────────────────────────────────

const blocks = readBlocks(readFileSync(STYLES, 'utf8'));
const want = expected(blocks);
const doc = JSON.parse(readFileSync(TOKENS, 'utf8'));
const problems = [];

function syncList(label, list, wanted) {
  const kept = [];
  for (const token of list) {
    if (!wanted.has(token.name)) {
      problems.push(`${label} "${token.name}" is not defined in src/styles.css`);
      continue;
    }
    const value = wanted.get(token.name);
    if (!same(token.value, value)) {
      problems.push(`${label} "${token.name}" is ${JSON.stringify(token.value)}, styles.css has ${JSON.stringify(value)}`);
      token.value = value;
    }
    if (!token.usage?.trim()) problems.push(`${label} "${token.name}" has no usage note`);
    kept.push(token);
  }
  const present = new Set(list.map((t) => t.name));
  for (const [name, value] of wanted) {
    if (present.has(name)) continue;
    problems.push(`${label} "${name}" is in src/styles.css but not in tokens.json`);
    kept.push({ name, value, usage: '' });
  }
  return kept;
}

doc.color.tokens = syncList('colour', doc.color.tokens, want.color);
doc.shadow.tokens = syncList('shadow', doc.shadow.tokens, want.shadow);
doc.spacing.tokens = syncList('spacing', doc.spacing.tokens, want.spacing);
doc.radius.tokens = syncList('radius', doc.radius.tokens, want.radius);
doc.fontWeight.tokens = syncList('font weight', doc.fontWeight.tokens, want.fontWeight);
doc.transition ??= { tokens: [] };
doc.transition.tokens = syncList('transition', doc.transition.tokens, want.transition);

for (const [key, value] of want.families) {
  if (stack(doc.type.families[key] ?? '') !== stack(value)) {
    problems.push(`font family "${key}" is ${JSON.stringify(doc.type.families[key])}, styles.css has ${JSON.stringify(value)}`);
    doc.type.families[key] = stack(value);
  }
}
for (const key of Object.keys(doc.type.families)) {
  if (want.families.has(key)) continue;
  problems.push(`font family "${key}" has no --font-${key} in src/styles.css`);
  delete doc.type.families[key];
}
for (const font of doc.type.fonts) {
  if (!existsSync(resolve(root, font.file))) problems.push(`font file ${font.file} does not exist`);
}

if (CHECK) {
  if (problems.length) {
    console.error(`design/system/tokens.json is out of step with src/styles.css:\n  - ${problems.join('\n  - ')}`);
    console.error('Run: npm run design:tokens  (then write a usage note for any new token)');
    process.exit(1);
  }
  console.log(`design/system/tokens.json matches src/styles.css (${doc.color.tokens.length} colours).`);
} else {
  writeFileSync(TOKENS, `${JSON.stringify(doc, null, 2)}\n`);
  for (const p of problems) console.log(`- ${p}`);
  console.log(problems.length ? 'Wrote design/system/tokens.json.' : 'design/system/tokens.json already matches.');
}
