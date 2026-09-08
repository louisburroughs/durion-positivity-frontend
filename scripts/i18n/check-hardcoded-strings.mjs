#!/usr/bin/env node
/**
 * Guardrail: fail when a template carries user-visible hardcoded text instead of
 * routing it through the `| translate` pipe (ADR-0030).
 *
 * Scope: every module under `src/app` (all `features/*`, plus `core` and
 * `shared`). Pass one or more paths to narrow it, which is how a domain is
 * remediated one phase at a time:
 *
 *   node scripts/i18n/check-hardcoded-strings.mjs                        # everything
 *   node scripts/i18n/check-hardcoded-strings.mjs src/app/features/crm   # one module
 *
 * Reports, per template:
 *   1. Static localizable attributes  -- placeholder/aria-label/title/alt="Literal text"
 *      (an interpolated [placeholder]="... | translate" binding is fine and ignored).
 *   2. Visible text nodes            -- prose left over once tags, interpolations,
 *      HTML comments, <style>/<script> blocks, Material Symbols icon ligatures and
 *      Angular control-flow tokens are removed.
 *
 * Conservative: punctuation, numbers, &entities;, and ALL_CAPS enum tokens are
 * ignored to avoid false positives. Blanked spans keep their newlines so reported
 * line numbers stay accurate.
 *
 * Exit 1 on any finding. Run: `npm run i18n:check:hardcoded`
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DEFAULT_ROOT = 'src/app';

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

function collect(target) {
  if (!existsSync(target)) {
    console.error(`No such path: ${target}`);
    process.exit(2);
  }
  return statSync(target).isDirectory() ? htmlFiles(target) : [target];
}

// Module label used to group the report: features/<name> -> <name>, otherwise the
// first path segment under src/app (core, shared) or `app` for root-level files.
function moduleOf(file) {
  const parts = relative(DEFAULT_ROOT, file).split(sep);
  if (parts[0] === '..') return parts.slice(0, -1).join('/') || '.';
  if (parts[0] === 'features' && parts.length > 1) return parts[1];
  return parts.length > 1 ? parts[0] : 'app';
}

// Replace every regex match with a run of spaces/newlines of equal length so that
// byte offsets and line numbers of the surviving text are unchanged.
function blank(src, re) {
  return src.replace(re, (m) => m.replace(/[^\n]/g, ' '));
}

// Same, but only for one capture group inside a larger match.
function blankGroup(src, re, groupIndex) {
  return src.replace(re, (...args) => {
    const groups = args.slice(1, -2);
    const target = groups[groupIndex - 1] ?? '';
    return groups
      .map((g, i) => (i === groupIndex - 1 ? target.replace(/[^\n]/g, ' ') : (g ?? '')))
      .join('');
  });
}

// Quote-aware tag blanker: blanks out <...> spans while ignoring `>` that sit
// inside attribute string values (e.g. [disabled]="a > b"). Newlines preserved.
function blankTags(src) {
  const chars = [...src];
  let inTag = false, quote = null;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (!inTag) {
      if (c === '<') { inTag = true; chars[i] = ' '; }
    } else {
      if (quote) {
        if (c === quote) quote = null;
        if (c !== '\n') chars[i] = ' ';
      } else if (c === '"' || c === "'") {
        quote = c; chars[i] = ' ';
      } else if (c === '>') {
        inTag = false; chars[i] = ' ';
      } else if (c !== '\n') {
        chars[i] = ' ';
      }
    }
  }
  return chars.join('');
}

const CONTROL_FLOW = /@(if|else|for|switch|case|default|empty|defer|placeholder|loading|error|let)\b/g;

// Blank Angular control-flow headers, including multi-line ones such as
// `@for (item of [ {..}, {..} ]; track item.id) {`, whose parenthesised
// expression may itself contain braces, quotes and newlines.
function blankControlFlow(src) {
  // UTF-16 units, not code points: `m.index` from the regex below is a UTF-16
  // offset, so a template containing an astral char (an emoji) would otherwise
  // shift every subsequent index and blank the wrong span.
  const chars = src.split('');
  let m;
  CONTROL_FLOW.lastIndex = 0;
  while ((m = CONTROL_FLOW.exec(src))) {
    let i = m.index + m[0].length;
    if (m[1] === 'let') {
      // `@let name = expr;` -- consume through the terminating semicolon.
      while (i < chars.length && chars[i] !== ';') i++;
      if (i < chars.length) i++;
    } else {
      while (i < chars.length && /\s/.test(chars[i])) i++;
      // `@else if (...)` -- the `if` belongs to the header, not to the body text.
      if (m[1] === 'else' && chars.slice(i, i + 2).join('') === 'if') {
        i += 2;
        while (i < chars.length && /\s/.test(chars[i])) i++;
      }
      if (chars[i] === '(') {
        let depth = 0, quote = null;
        for (; i < chars.length; i++) {
          const c = chars[i];
          if (quote) { if (c === quote) quote = null; continue; }
          if (c === '"' || c === "'") quote = c;
          else if (c === '(') depth++;
          else if (c === ')' && --depth === 0) { i++; break; }
        }
      }
      while (i < chars.length && /[\s]/.test(chars[i])) i++;
      if (chars[i] === '{') i++;
    }
    for (let j = m.index; j < i; j++) if (chars[j] !== '\n') chars[j] = ' ';
    CONTROL_FLOW.lastIndex = i;
  }
  return chars.join('');
}

const ATTR_RE = /\s(placeholder|aria-label|title|alt)="([^"{}]*[A-Za-z]{2,}[^"{}]*)"/g;

// Text inside a Material Symbols/Icons element is a glyph ligature name
// (`swap_horiz`), not prose -- never translated, so never a finding here.
const ICON_TEXT_RE = /(<[a-zA-Z][^>]*class="[^"]*material-(?:symbols|icons)[^"]*"[^>]*>)([^<]*)/g;

function isProse(t) {
  // Named/numeric entities are layout glue (&nbsp;, &mdash;), never prose.
  t = t.replace(/&(?:[a-z]+|#\d+|#x[0-9a-f]+);/gi, ' ').trim();
  if (!t) return false;
  if (!/[A-Za-z]{2,}/.test(t)) return false;
  if (/^[\s\d.,:;!?%$#@/\\|()[\]{}+\-*=<>•·—–…✓✗✕⚠●&'"]+$/.test(t)) return false;
  if (/^[A-Z][A-Z0-9_]+$/.test(t)) return false;   // ALL_CAPS enum token
  return true;
}

const targets = process.argv.slice(2);
const files = [...new Set(targets.length ? targets.flatMap(collect) : collect(DEFAULT_ROOT))].sort();
const findings = [];

for (const file of files) {
  const raw = readFileSync(file, 'utf8');

  // 1) static localizable attributes (scan raw so we keep them in context)
  raw.split('\n').forEach((line, i) => {
    let m;
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(line))) {
      findings.push({ file, lineNo: i + 1, kind: `attr ${m[1]}`, text: m[2].trim() });
    }
  });

  // 2) visible text: strip comments, <style>/<script> bodies, icon ligatures,
  // interpolations, then tags and control-flow tokens (all newline-safe).
  // Whatever prose is left is an un-translated literal.
  let stripped = blank(raw, /<!--[\s\S]*?-->/g);
  stripped = blank(stripped, /<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi);
  stripped = blankGroup(stripped, ICON_TEXT_RE, 2);
  stripped = blank(stripped, /\{\{[\s\S]*?\}\}/g);
  stripped = blankTags(stripped);
  stripped = blankControlFlow(stripped);
  stripped = stripped.replace(/[{}]/g, ' ');

  stripped.split('\n').forEach((line, i) => {
    if (isProse(line)) {
      findings.push({ file, lineNo: i + 1, kind: 'text', text: line.trim().replace(/\s+/g, ' ').slice(0, 80) });
    }
  });
}

const scope = targets.length ? targets.join(', ') : `${DEFAULT_ROOT} (all modules)`;

if (findings.length) {
  const byModule = new Map();
  for (const f of findings) {
    const mod = moduleOf(f.file);
    if (!byModule.has(mod)) byModule.set(mod, []);
    byModule.get(mod).push(f);
  }
  const ranked = [...byModule].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  console.error(
    `FAIL hardcoded-string check: ${findings.length} user-visible literal(s) ` +
    `across ${byModule.size} module(s) in ${scope}.\n`,
  );
  for (const [mod, list] of ranked) {
    const fileCount = new Set(list.map((f) => f.file)).size;
    console.error(`  ${mod}: ${list.length} literal(s) in ${fileCount} template(s)`);
  }
  console.error('');

  for (const [mod, list] of ranked) {
    console.error(`${mod}`);
    for (const f of list) {
      console.error(`  ${f.file}:${f.lineNo}  [${f.kind}]  "${f.text}"`);
    }
    console.error('');
  }
  console.error('Wrap each in the | translate pipe with a key in src/assets/i18n/*.json (ADR-0030).');
  console.error(`Remediate one module at a time: node ${relative('.', process.argv[1])} src/app/features/<module>`);
  process.exit(1);
}

console.log(`PASS hardcoded-string check: no user-visible literals in ${scope} (${files.length} files scanned).`);
