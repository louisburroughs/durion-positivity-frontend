import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const i18nDir = path.join(repoRoot, 'src', 'assets', 'i18n');
const baseLocale = 'en-US.json';
// qps-ploc is generated from en-US and validated by generate-pseudo-locale.mjs --check.
const generatedLocales = new Set(['qps-ploc.json']);

// Derived from disk rather than hardcoded: every shipped locale file is a release
// locale, so adding a new one to src/assets/i18n automatically puts it under this
// check. A hardcoded list previously let es-MX and fr-FR ship 412 keys short.
function listReleaseLocales(dir) {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .filter((file) => file !== baseLocale && !generatedLocales.has(file))
    .sort();
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Failed to parse JSON: ${filePath}`);
    throw error;
  }
}

function flattenObject(value, prefix = '', out = new Map()) {
  if (typeof value === 'string') {
    out.set(prefix, value);
    return out;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (prefix) {
      out.set(prefix, value);
    }
    return out;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = prefix ? `${prefix}.${key}` : key;
    flattenObject(child, childPath, out);
  }

  return out;
}

/** Pure diff between the base locale and one target locale. No I/O, no printing. */
function diffLocale(baseMap, targetMap, targetName) {
  const missing = [];
  const extras = [];
  const typeMismatches = [];

  for (const [key, baseValue] of baseMap.entries()) {
    if (!targetMap.has(key)) {
      missing.push(key);
      continue;
    }
    const targetValue = targetMap.get(key);
    if (typeof targetValue !== typeof baseValue) {
      typeMismatches.push(`${key} (expected ${typeof baseValue}, got ${typeof targetValue})`);
    }
  }

  for (const key of targetMap.keys()) {
    if (!baseMap.has(key)) {
      extras.push(key);
    }
  }

  return { locale: targetName, keyCount: targetMap.size, missing, extras, typeMismatches };
}

/** Prints one locale's diff exactly as the original inline report did. Returns pass/fail. */
function reportKeyDiff(d) {
  const { locale: targetName, keyCount, missing, typeMismatches, extras } = d;

  if (missing.length === 0 && typeMismatches.length === 0 && extras.length === 0) {
    console.log(`PASS ${targetName}: keyset aligned (${keyCount} keys).`);
    return true;
  }

  console.error(`FAIL ${targetName}: keyset issues detected.`);
  if (missing.length > 0) {
    console.error(`  Missing keys (${missing.length}):`);
    for (const key of missing) {
      console.error(`    - ${key}`);
    }
  }
  if (typeMismatches.length > 0) {
    console.error(`  Type mismatches (${typeMismatches.length}):`);
    for (const item of typeMismatches) {
      console.error(`    - ${item}`);
    }
  }
  if (extras.length > 0) {
    console.error(`  Extra keys (${extras.length}) [non-blocking]:`);
    for (const key of extras) {
      console.error(`    - ${key}`);
    }
  }

  return missing.length === 0 && typeMismatches.length === 0;
}

/**
 * Pure scan: base-locale key set against every release locale's key set. No printing, no
 * `process.exit`. `options.i18nDir` overrides the locale directory (used by the arch suite's
 * fixtures / self-tests); default is `src/assets/i18n` under the repo root.
 */
export function scan(options = {}) {
  const dir = options.i18nDir ?? i18nDir;
  const baseMap = flattenObject(loadJson(path.join(dir, baseLocale)));
  const diffs = listReleaseLocales(dir).map((localeFile) =>
    diffLocale(baseMap, flattenObject(loadJson(path.join(dir, localeFile))), localeFile),
  );
  return { baseLocale, baseKeyCount: baseMap.size, diffs };
}

function main() {
  const result = scan();
  console.log(`Base locale ${result.baseLocale}: ${result.baseKeyCount} keys.`);

  let allPass = true;
  for (const d of result.diffs) {
    const ok = reportKeyDiff(d);
    allPass = allPass && ok;
  }

  if (!allPass) {
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

