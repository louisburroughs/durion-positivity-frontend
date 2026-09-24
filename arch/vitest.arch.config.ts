import { defineConfig } from 'vitest/config';

/**
 * Plain-node Vitest run for the architecture suite (docs/PLAN-archunit-architecture-tests.md).
 * ArchUnitTS reads the filesystem, so it must never run under the browser-mode `ng test` builder.
 * `globals: true` is required by ArchUnitTS's `toPassAsync()` matcher.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['arch/**/*.arch.spec.ts'],
    // Share ArchUnitTS's graph cache and the AST caches across spec files: halves the run (§11.2).
    isolate: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
