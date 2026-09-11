/**
 * Generate the public `sitemap.json` build artifact (contract v2).
 *
 * Combines two sources:
 *   - `site-map.data.json` — curated top-level sections (translated titles,
 *     descriptions, grouping, order).
 *   - the Angular route tree (via extract-routes.mjs) — every reachable page
 *     under `/app`, attached to its section as `pages[]` (including dynamic
 *     `:param` routes as patterns, with required roles).
 *
 * This is the decoupled contract consumed by the backend `pos-mcp-server`:
 *   - The frontend OWNS the site structure and publishes it as a read-only,
 *     versioned JSON artifact served at `/sitemap.json`.
 *   - `pos-mcp-server` PULLS that artifact (or bakes it in at deploy time).
 *   - Neither repo imports the other; the only shared thing is the JSON schema
 *     documented in `docs/sitemap/`.
 *
 * i18n title/description keys are resolved to the base (en-US) locale so the
 * artifact is self-contained; the key is preserved alongside the resolved text.
 *
 * The artifact itself is assembled by `build-sitemap.mjs`; this script only
 * writes it. `public-sitemap.spec.ts` asserts the redaction invariant on the
 * builder's output.
 *
 * Usage: node scripts/sitemap/generate-sitemap.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from './extract-routes.mjs';
import { buildSitemap } from './build-sitemap.mjs';

const outputPath = path.join(repoRoot, 'public/sitemap.json');

let built;
try {
  built = buildSitemap();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const { artifact, stats } = built;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(
  `Generated ${path.relative(repoRoot, outputPath)} ` +
    `(${stats.sections} sections, ${stats.pages} pages; ` +
    `redacted ${stats.redactedSections} gated sections + ${stats.redactedPages} gated pages) ` +
    `from site-map.data.json + route tree.`,
);
