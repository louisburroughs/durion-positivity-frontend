/**
 * Supplier contract guard (#201).
 *
 * Every positivity service must reach the backend through the generated
 * `@durion-sdk/supplier` client. A hand-written `/supplier/v1/**` URL is a
 * guessed contract: it 404s in production and manufactures audit errors the
 * frontend owns. This test reads the service sources and fails on any
 * executable occurrence of such a path.
 *
 * Only executable source is inspected: block comments and line comments
 * (including trailing `// ...` after code) are stripped first, with the
 * line count preserved so reported line numbers match the file on disk.
 *
 * Runs under plain `vitest` (node) via `npm run test:contracts`, which
 * `npm test` invokes before `ng test`. It reads the filesystem, so it is
 * excluded from the browser-built `ng test` run in angular.json and has no
 * place in the Angular type-check.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SERVICES_DIR = join(process.cwd(), 'src/app/features/positivity/services');

/**
 * Strip block and line comments so only executable source is inspected.
 *
 * Pure. Every `/* ... *\/` block is replaced by the newlines it contained and
 * every `// ...` is cut to the end of its line, so the output has exactly the
 * same number of lines as the input and line numbers stay meaningful. Comment
 * markers inside single-, double- or backtick-quoted strings are left alone
 * (so `'https://x'` survives), as is any backslash-escaped character.
 */
function stripComments(source: string): string {
  let out = '';
  let quote: '"' | "'" | '`' | null = null;
  let i = 0;

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === '\\' && next !== undefined) {
      out += ch + next;
      i += 2;
      continue;
    }

    if (quote) {
      if (ch === quote) {
        quote = null;
      }
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2);
      const end = close === -1 ? source.length : close + 2;
      const newlines = source.slice(i, end).split('\n').length - 1;
      out += '\n'.repeat(newlines);
      i = end;
      continue;
    }

    if (ch === '/' && next === '/' && source[i - 1] !== ':') {
      const eol = source.indexOf('\n', i);
      i = eol === -1 ? source.length : eol;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

describe('stripComments', () => {
  it('removes a full-line comment but keeps its line', () => {
    const stripped = stripComments("const a = 1;\n// GET /supplier/v1/x\nconst b = 2;");

    expect(stripped.split('\n')).toEqual(['const a = 1;', '', 'const b = 2;']);
  });

  it('removes a trailing comment after code on the same line', () => {
    const stripped = stripComments('const a = 1; // was /supplier/v1/x');

    expect(stripped).toBe('const a = 1; ');
  });

  it('leaves :// inside a string alone while still cutting the trailing comment', () => {
    const stripped = stripComments("const url = 'https://x'; // old path /supplier/v1/y");

    expect(stripped).toBe("const url = 'https://x'; ");
  });

  it('replaces a multi-line block comment with the same number of lines', () => {
    const source = '/**\n * Talks to /supplier/v1/x\n * and more\n */\nconst live = 1;';
    const stripped = stripComments(source);
    const lines = stripped.split('\n');

    expect(lines).toHaveLength(source.split('\n').length);
    expect(lines[4]).toBe('const live = 1;');
    expect(stripped).not.toContain('/supplier/v1/');
  });

  it('keeps a real supplier path string literal', () => {
    const stripped = stripComments("const path = '/supplier/v1/x'; // literal\nconst other = \"//not-a-comment\";");

    expect(stripped).toBe("const path = '/supplier/v1/x'; \nconst other = \"//not-a-comment\";");
  });
});

describe('supplier contract coverage', () => {
  const serviceFiles = readdirSync(SERVICES_DIR).filter(
    name => name.endsWith('.service.ts') && !name.endsWith('.spec.ts'),
  );

  it('finds the positivity services to guard', () => {
    expect(serviceFiles.length).toBeGreaterThan(0);
  });

  for (const file of serviceFiles) {
    it(`${file} spells out no executable /supplier/v1/ URL`, () => {
      const source = stripComments(readFileSync(join(SERVICES_DIR, file), 'utf8'));
      const offending = source
        .split('\n')
        .map((line, index) => ({ line, number: index + 1 }))
        .filter(({ line }) => /\/supplier\/v1\//.test(line));

      expect(offending, offending.map(o => `${file}:${o.number}: ${o.line.trim()}`).join('\n')).toEqual([]);
    });

    it(`${file} does not call ApiBaseService with a supplier path`, () => {
      const source = stripComments(readFileSync(join(SERVICES_DIR, file), 'utf8'));
      const usesApiBase = /ApiBaseService/.test(source);
      const hasSupplierPath = /['"`]\/supplier\//.test(source);

      expect(usesApiBase && hasSupplierPath).toBe(false);
    });
  }
});
