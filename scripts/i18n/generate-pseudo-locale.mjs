import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const basePath = path.join(repoRoot, 'src', 'assets', 'i18n', 'en-US.json');
const outputPath = path.join(repoRoot, 'src', 'assets', 'i18n', 'qps-ploc.json');

const charMap = {
  A: 'A', B: 'Ɓ', C: 'Ç', D: 'Đ', E: 'Ë', F: 'Ƒ', G: 'Ğ', H: 'Ħ', I: 'Ï', J: 'Ĵ', K: 'Ҡ', L: 'Ŀ', M: 'Ḿ',
  N: 'Ň', O: 'Ø', P: 'Ṕ', Q: 'Q', R: 'Ŕ', S: 'Š', T: 'Ŧ', U: 'Ü', V: 'Ṽ', W: 'Ŵ', X: 'Ẍ', Y: 'Ŷ', Z: 'Ž',
  a: 'à', b: 'ƀ', c: 'ç', d: 'đ', e: 'ë', f: 'ƒ', g: 'ğ', h: 'ħ', i: 'ï', j: 'ĵ', k: 'ķ', l: 'ľ', m: 'ḿ',
  n: 'ñ', o: 'ø', p: 'ṕ', q: 'q', r: 'ŕ', s: 'š', t: 'ŧ', u: 'ü', v: 'ṽ', w: 'ŵ', x: 'ẍ', y: 'ÿ', z: 'ž',
};

const tokenPattern = /(\{\{[^}]+\}\}|<[^>]+>|%\w|\{[\w.-]+\})/g;
const exactTokenPattern = /^(\{\{[^}]+\}\}|<[^>]+>|%\w|\{[\w.-]+\})$/;

function expandToken(text) {
  const transformed = [...text]
    .map((ch) => charMap[ch] ?? ch)
    .join('')
    .replace(/[aeiouAEIOUàëïøüÀËÏØÜ]/g, (v) => `${v}${v}`);
  return `[!! ${transformed} !!]`;
}

function pseudoValue(value) {
  if (typeof value === 'string') {
    const parts = value.split(tokenPattern);
    return parts
      .map((part) => {
        if (!part) {
          return part;
        }
        if (exactTokenPattern.test(part)) {
          return part;
        }
        return expandToken(part);
      })
      .join('');
  }

  if (Array.isArray(value)) {
    return value.map((item) => pseudoValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, pseudoValue(child)]),
    );
  }

  return value;
}

/** Pure: the pseudo-locale content generate-pseudo-locale would write, from `en-US.json`. */
export function computePseudoLocale() {
  const baseJson = JSON.parse(fs.readFileSync(basePath, 'utf8'));
  const pseudoJson = pseudoValue(baseJson);
  return `${JSON.stringify(pseudoJson, null, 2)}\n`;
}

/**
 * Pure check: is `qps-ploc.json` up to date with `en-US.json`? No printing, no `process.exit`.
 * Mirrors `--check`'s two failure shapes so the CLI shim can reproduce its messages exactly.
 */
export function checkPseudoLocale() {
  if (!fs.existsSync(outputPath)) {
    return { ok: false, reason: 'missing' };
  }
  const currentContent = fs.readFileSync(outputPath, 'utf8');
  if (currentContent !== computePseudoLocale()) {
    return { ok: false, reason: 'stale' };
  }
  return { ok: true, reason: null };
}

function main() {
  const checkOnly = new Set(process.argv.slice(2)).has('--check');

  if (checkOnly) {
    const result = checkPseudoLocale();
    if (!result.ok) {
      console.error(
        result.reason === 'missing'
          ? 'FAIL pseudo-locale check: qps-ploc.json is missing.'
          : 'FAIL pseudo-locale check: qps-ploc.json is stale.',
      );
      console.error('Run: npm run i18n:pseudo:generate');
      process.exit(1);
    }
    console.log('PASS pseudo-locale check: qps-ploc.json is up to date.');
    process.exit(0);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, computePseudoLocale(), 'utf8');
  console.log(`Generated ${path.relative(repoRoot, outputPath)} from en-US.json.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
