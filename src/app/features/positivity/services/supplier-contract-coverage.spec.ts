/**
 * Supplier contract guard (#201).
 *
 * Every positivity service must reach the backend through the generated
 * `@durion-sdk/supplier` client. A hand-written `/supplier/v1/**` URL is a
 * guessed contract: it 404s in production and manufactures audit errors the
 * frontend owns. This test reads the service sources and fails on any
 * executable occurrence of such a path.
 *
 * Runs under plain `vitest` (node): `npx vitest run <this file>`. It reads
 * the filesystem, so it is excluded from the browser-built `ng test` run in
 * angular.json and has no place in the Angular type-check.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SERVICES_DIR = join(process.cwd(), 'src/app/features/positivity/services');

/** Strip block and line comments so only executable source is inspected. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

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
