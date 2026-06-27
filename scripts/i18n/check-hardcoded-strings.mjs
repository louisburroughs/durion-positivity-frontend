#!/usr/bin/env node
/**
 * Guardrail: fail when a workexec template carries user-visible hardcoded text
 * instead of routing it through the `| translate` pipe (ADR-0030).
 *
 * Scans src/app/features/workexec for *.html and reports:
 *   1. Static localizable attributes  -- placeholder/aria-label/title/alt="Literal text"
 *      (an interpolated [placeholder]="... | translate" binding is fine and ignored).
 *   2. Visible text nodes            -- prose left over once tags, interpolations,
 *      HTML comments and Angular control-flow tokens are removed.
 *
 * Conservative: punctuation, numbers, &entities;, and ALL_CAPS enum tokens are
 * ignored to avoid false positives. Tags (incl. multi-line ones) are blanked out
 * with their newlines preserved so reported line numbers stay accurate.
 *
 * Exit 1 on any finding. Run: `node scripts/i18n/check-hardcoded-strings.mjs`
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src/app/features/workexec';

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

// Replace every regex match with a run of spaces/newlines of equal length so that
// byte offsets and line numbers of the surviving text are unchanged.
function blank(src, re) {
  return src.replace(re, (m) => m.replace(/[^\n]/g, ' '));
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

const ATTR_RE = /\s(placeholder|aria-label|title|alt)="([^"{}]*[A-Za-z]{2,}[^"{}]*)"/g;

function isProse(t) {
  t = t.trim();
  if (!t) return false;
  if (!/[A-Za-z]{2,}/.test(t)) return false;
  if (/^[\s\d.,:;!?%$#@/\\|()[\]{}+\-*=<>•·—–…✓✗✕⚠●&'"]+$/.test(t)) return false;
  if (/^&[a-z]+;$/i.test(t)) return false;
  if (/^[A-Z][A-Z0-9_]+$/.test(t)) return false;   // ALL_CAPS enum token
  return true;
}

const findings = [];
const files = htmlFiles(ROOT);

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

  // 2) visible text: strip comments, interpolations, then tags (all newline-safe),
  // then control-flow tokens. Whatever prose is left is an un-translated literal.
  let stripped = blank(raw, /<!--[\s\S]*?-->/g);
  stripped = blank(stripped, /\{\{[\s\S]*?\}\}/g);
  stripped = blankTags(stripped);
  stripped = stripped.replace(/@(if|else|for|switch|case|default|empty)\b[^{\n]*\{?/g, (m) => m.replace(/[^\n]/g, ' '));
  stripped = stripped.replace(/[{}]/g, ' ');

  stripped.split('\n').forEach((line, i) => {
    if (isProse(line)) {
      findings.push({ file, lineNo: i + 1, kind: 'text', text: line.trim().replace(/\s+/g, ' ').slice(0, 80) });
    }
  });
}

if (findings.length) {
  console.error(`FAIL hardcoded-string check: ${findings.length} user-visible literal(s) in workexec templates.\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.lineNo}  [${f.kind}]  "${f.text}"`);
  }
  console.error('\nWrap each in the | translate pipe with a key in src/assets/i18n/*.json (ADR-0030).');
  process.exit(1);
}

console.log(`PASS hardcoded-string check: no user-visible literals in workexec templates (${files.length} files scanned).`);
