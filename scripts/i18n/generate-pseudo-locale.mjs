import fs from 'node:fs';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');

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
    .replace(/[aeiouAEIOU]/g, (v) => `${v}${v}`);
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

const baseJson = JSON.parse(fs.readFileSync(basePath, 'utf8'));
const pseudoJson = pseudoValue(baseJson);
const nextContent = `${JSON.stringify(pseudoJson, null, 2)}\n`;

if (checkOnly) {
  if (!fs.existsSync(outputPath)) {
    console.error('FAIL pseudo-locale check: qps-ploc.json is missing.');
    console.error('Run: npm run i18n:pseudo:generate');
    process.exit(1);
  }
  const currentContent = fs.readFileSync(outputPath, 'utf8');
  if (currentContent !== nextContent) {
    console.error('FAIL pseudo-locale check: qps-ploc.json is stale.');
    console.error('Run: npm run i18n:pseudo:generate');
    process.exit(1);
  }
  console.log('PASS pseudo-locale check: qps-ploc.json is up to date.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, nextContent, 'utf8');
console.log(`Generated ${path.relative(repoRoot, outputPath)} from en-US.json.`);
