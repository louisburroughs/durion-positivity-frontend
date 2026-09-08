#!/usr/bin/env node
/**
 * Guardrail: fail when a component or service carries user-visible English in a
 * TypeScript string literal instead of a translation key (ADR-0030).
 *
 * This is the companion to `check-hardcoded-strings.mjs`, which reads templates
 * only. A string assigned to a signal in `.ts` and rendered through
 * `{{ signal() }}` is invisible to that checker -- which is how ~67 literals
 * survived the module-by-module template remediation.
 *
 * Scope: every `.ts` under `src/app` except specs, test helpers and `*.generated.ts`
 * (generated output is fixed in its generator, not in place). Pass one or more
 * paths to narrow it, exactly like the template checker:
 *
 *   node scripts/i18n/check-hardcoded-ts-strings.mjs                        # everything
 *   node scripts/i18n/check-hardcoded-ts-strings.mjs src/app/features/crm   # one module
 *
 * A finding is a string literal that reads as prose (two or more words) once
 * developer-facing context has been removed:
 *
 *   - comments are stripped (they also break naive quote matching: an apostrophe
 *     in "the platform's own" opens a phantom string);
 *   - `console.*(...)` and `throw new *Error(...)` arguments are blanked, since
 *     those are diagnostics rather than UI;
 *   - `${...}` holes inside template literals are blanked, but the surrounding
 *     text is still scanned -- `` `Hello ${name}` `` is user-visible prose;
 *   - dotted ALL_CAPS tokens are translation keys, not prose;
 *   - lowercase token lists without sentence punctuation (`noopener noreferrer`,
 *     CSS class lists) are markup values, not prose;
 *   - inline `styles:` is CSS, and inline `template:` is markup that neither
 *     guardrail reads -- so a template carrying prose is reported as
 *     `inline-template`, pointing at the real fix (move it to a `.html` file).
 *
 * Some prose genuinely is not user-visible -- a value posted to an API, a canvas
 * font spec. Declare those in place, with a reason:
 *
 *   // i18n-ignore-next-line: posted to the API as an audit reason, never rendered
 *   const reason = 'Declined by customer';
 *
 *   // i18n-ignore-start: canvas font shorthand, not UI copy
 *   ...
 *   // i18n-ignore-end
 *
 * Same contract as the template checker: the reason is mandatory, a marker that
 * suppresses nothing is itself a failure, an unterminated block is a failure and
 * suppresses nothing, and every run prints the suppression count.
 *
 * Exit 1 on any finding. Run: `npm run i18n:check:ts`
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DEFAULT_ROOT = 'src/app';
const SKIP_DIRS = new Set(['testing', 'node_modules']);

function tsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(name)) out.push(...tsFiles(p));
    } else if (
      name.endsWith('.ts') &&
      !name.endsWith('.spec.ts') &&
      !name.endsWith('.d.ts') &&
      !name.endsWith('.generated.ts') &&
      !name.includes('.spec-helper')
    ) {
      out.push(p);
    }
  }
  return out;
}

function collect(target) {
  if (!existsSync(target)) {
    console.error(`No such path: ${target}`);
    process.exit(2);
  }
  return statSync(target).isDirectory() ? tsFiles(target) : [target];
}

function moduleOf(file) {
  const parts = relative(DEFAULT_ROOT, file).split(sep);
  if (parts[0] === '..') return parts.slice(0, -1).join('/') || '.';
  if (parts[0] === 'features' && parts.length > 1) return parts[1];
  return parts.length > 1 ? parts[0] : 'app';
}

// Replace a match with spaces/newlines of equal length so line numbers hold.
const blank = (src, re) => src.replace(re, (m) => m.replace(/[^\n]/g, ' '));

/**
 * Remove comments without disturbing string contents. A hand-rolled scan is
 * needed because `//` inside a string ("https://…") is not a comment, and an
 * apostrophe inside a comment is not a quote.
 */
function stripComments(src) {
  // UTF-16 units, not code points: the loop below indexes `src[i]` (UTF-16), so
  // `[...src]` would misalign `out` from the first astral char (an emoji) on.
  const out = src.split('');
  let i = 0;
  const n = out.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') { out[i] = ' '; i++; }
    } else if (c === '/' && d === '*') {
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] !== '\n') out[i] = ' ';
        i++;
      }
      if (i < n) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
    } else if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') i++;
        i++;
      }
      i++;
    } else {
      i++;
    }
  }
  return out.join('');
}

// console.error('…') and Error messages are diagnostics, not UI. `new Error(…)`
// is blanked wherever it appears, not just after `throw`: the rejection path
// `throwError(() => new Error('No refresh token'))` is just as much a diagnostic.
function blankDevSinks(src) {
  let s = blank(src, /console\.\w+\s*\([\s\S]*?\)\s*;/g);
  s = blank(s, /new \w*Error\s*\([\s\S]*?\)/g);
  return s;
}

/**
 * Blank inline `styles:` (CSS, never prose). Inline `template:` is blanked too,
 * but its presence is reported: markup inside a .ts file is scanned by neither
 * guardrail, so the fix is to move it to a .html file (the repo convention) and
 * let the template checker see it.
 */
function blankComponentMetadata(src) {
  const inlineTemplates = [];
  let s = blank(src, /styles\s*:\s*\[[\s\S]*?\]/g);
  s = blank(s, /styles\s*:\s*`[\s\S]*?`/g);
  s = s.replace(/template\s*:\s*(`[\s\S]*?`|'[^'\n]*'|"[^"\n]*")/g, (m, value, offset) => {
    const copy = templateCopy(value.slice(1, -1));
    // Most inline templates are `<router-outlet />` shells with no copy at all;
    // only one carrying prose is worth reporting.
    if (copy) {
      inlineTemplates.push({ lineNo: src.slice(0, offset).split('\n').length, copy });
    }
    return m.replace(/[^\n]/g, ' ');
  });
  return { src: s, inlineTemplates };
}

/** Prose left in an inline template once markup, interpolations and control flow go. */
function templateCopy(tpl) {
  let t = tpl.replace(/<!--[\s\S]*?-->/g, ' ');
  t = t.replace(/\{\{[\s\S]*?\}\}/g, ' ');
  // Static localizable attributes are copy too, and dropping tags would take
  // them with it -- an inline template whose only English is aria-label="Not
  // found" still needs reporting. A bound `[attr.aria-label]="…"` is preceded
  // by `.`, not whitespace, so it does not match.
  const attrs = [...t.matchAll(/\s(?:placeholder|aria-label|title|alt)="([^"{}]*[A-Za-z]{2,}[^"{}]*)"/g)]
    .map((m) => m[1].trim());
  t = t.replace(/<[^>]*>/g, ' ');
  t = t.replace(/@\w+\s*\([^)]*\)?/g, ' ');
  t = t.replace(/[{}]/g, ' ').replace(/\s+/g, ' ').trim();
  const copy = [t, ...attrs].filter(Boolean).join(' · ');
  return isProse(copy) ? copy.slice(0, 90) : null;
}

const IGNORE_NEXT_RE = /\/\/\s*i18n-ignore-next-line\b\s*(?::\s*)?(.*?)\s*$/;
const IGNORE_START_RE = /\/\/\s*i18n-ignore-start\b\s*(?::\s*)?(.*?)\s*$/;
const IGNORE_END_RE = /\/\/\s*i18n-ignore-end\b\s*$/;

function parseSuppressions(file, raw) {
  const coverage = new Map();
  const markers = [];
  let open = null;

  raw.split('\n').forEach((line, idx) => {
    const lineNo = idx + 1;
    const cover = (from, to, marker) => {
      for (let n = from; n <= to; n++) if (!coverage.has(n)) coverage.set(n, marker);
    };
    let m;
    if ((m = IGNORE_NEXT_RE.exec(line))) {
      const marker = { file, lineNo, reason: m[1].trim(), kind: 'i18n-ignore-next-line', used: false };
      markers.push(marker);
      cover(lineNo + 1, lineNo + 1, marker);
    } else if ((m = IGNORE_START_RE.exec(line))) {
      if (open) markers.push({ ...open, unterminated: true });
      open = { file, lineNo, reason: m[1].trim(), kind: 'i18n-ignore-start', used: false };
    } else if (IGNORE_END_RE.test(line)) {
      if (open) { markers.push(open); cover(open.lineNo, lineNo, open); open = null; }
    }
  });

  if (open) markers.push({ ...open, unterminated: true });
  return { coverage, markers };
}

function isProse(t) {
  const text = t.trim();
  if (!/[A-Za-z]{2,}\s+[A-Za-z]/.test(text)) return false;          // needs two words
  if (/^[A-Z][A-Z0-9_]*(\.[A-Z][A-Z0-9_]*)+$/.test(text)) return false; // translation key
  if (/^[a-z-]+(\s+[a-z-]+)*$/.test(text) && !/[.!?…]$/.test(text)) return false; // token list
  return true;
}

/** Yield [lineNo, text] for every string / template literal in the source. */
function* literals(src) {
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\[\s\S])*)`/g;
  // Matches arrive in order, so the line counter advances incrementally rather
  // than re-slicing the file per literal (which was O(n^2) over src/app).
  let line = 1, scanned = 0, m;
  while ((m = re.exec(src))) {
    for (let i = scanned; i < m.index; i++) if (src[i] === '\n') line++;
    scanned = m.index;
    const body = m[1] ?? m[2] ?? m[3] ?? '';
    // a template literal's ${…} holes are code, not copy
    const text = m[3] !== undefined ? body.replace(/\$\{[^}]*\}/g, ' ') : body;
    yield [line, text];
  }
}

const targets = process.argv.slice(2);
const files = [...new Set(targets.length ? targets.flatMap(collect) : collect(DEFAULT_ROOT))].sort();
const findings = [];
let suppressed = 0;

for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  const { coverage, markers } = parseSuppressions(file, raw);
  const meta = blankComponentMetadata(stripComments(raw));
  const scanned = blankDevSinks(meta.src);
  const candidates = [];

  for (const t of meta.inlineTemplates) {
    candidates.push({ file, lineNo: t.lineNo, kind: 'inline-template', text: t.copy });
  }

  for (const [lineNo, text] of literals(scanned)) {
    if (isProse(text)) {
      candidates.push({ file, lineNo, kind: 'string', text: text.trim().replace(/\s+/g, ' ').slice(0, 90) });
    }
  }

  for (const c of candidates) {
    const marker = coverage.get(c.lineNo);
    if (marker) { marker.used = true; suppressed++; } else { findings.push(c); }
  }

  for (const marker of markers) {
    if (marker.unterminated) {
      findings.push({ file, lineNo: marker.lineNo, kind: 'i18n-ignore', text: 'i18n-ignore-start without a matching i18n-ignore-end' });
    } else if (!marker.reason) {
      findings.push({ file, lineNo: marker.lineNo, kind: 'i18n-ignore', text: `${marker.kind} needs a reason: // ${marker.kind}: why this is not UI copy` });
    } else if (!marker.used) {
      findings.push({ file, lineNo: marker.lineNo, kind: 'i18n-ignore', text: `${marker.kind} suppresses nothing — delete it` });
    }
  }
}

const scope = targets.length ? targets.join(', ') : `${DEFAULT_ROOT} (all modules)`;
const suppressedNote = suppressed ? `  (${suppressed} literal(s) suppressed by i18n-ignore markers)` : '';

if (findings.length) {
  const byModule = new Map();
  for (const f of findings) {
    const mod = moduleOf(f.file);
    if (!byModule.has(mod)) byModule.set(mod, []);
    byModule.get(mod).push(f);
  }
  const ranked = [...byModule].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  console.error(
    `FAIL hardcoded-ts-string check: ${findings.length} user-visible literal(s) ` +
    `across ${byModule.size} module(s) in ${scope}.\n`,
  );
  for (const [mod, list] of ranked) {
    const fileCount = new Set(list.map((f) => f.file)).size;
    console.error(`  ${mod}: ${list.length} literal(s) in ${fileCount} file(s)`);
  }
  console.error('');
  for (const [mod, list] of ranked) {
    console.error(`${mod}`);
    for (const f of list) console.error(`  ${f.file}:${f.lineNo}  [${f.kind}]  "${f.text}"`);
    console.error('');
  }
  if (suppressedNote) console.error(`${suppressedNote.trim()}\n`);
  console.error('Replace each with a translation key in src/assets/i18n/*.json (ADR-0030):');
  console.error('  - a signal that only ever holds a key  -> rename to `errorKey` and pipe it in the template');
  console.error('  - a fallback a server message can replace -> `this.translate.instant(\'KEY\')`');
  console.error('  - genuinely not UI copy -> // i18n-ignore-next-line: <reason>');
  process.exit(1);
}

console.log(
  `PASS hardcoded-ts-string check: no user-visible literals in ${scope} ` +
  `(${files.length} files scanned).${suppressedNote}`,
);
