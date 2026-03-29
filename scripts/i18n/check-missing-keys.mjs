import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const i18nDir = path.join(repoRoot, 'src', 'assets', 'i18n');
const baseLocale = 'en-US.json';
const releaseLocales = ['es-US.json', 'fr-CA.json'];

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

function reportKeyDiff(baseMap, targetMap, targetName) {
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

  if (missing.length === 0 && typeMismatches.length === 0 && extras.length === 0) {
    console.log(`PASS ${targetName}: keyset aligned (${targetMap.size} keys).`);
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

const basePath = path.join(i18nDir, baseLocale);
const baseJson = loadJson(basePath);
const baseMap = flattenObject(baseJson);
console.log(`Base locale ${baseLocale}: ${baseMap.size} keys.`);

let allPass = true;
for (const localeFile of releaseLocales) {
  const localePath = path.join(i18nDir, localeFile);
  const localeJson = loadJson(localePath);
  const localeMap = flattenObject(localeJson);
  const ok = reportKeyDiff(baseMap, localeMap, localeFile);
  allPass = allPass && ok;
}

if (!allPass) {
  process.exit(1);
}

