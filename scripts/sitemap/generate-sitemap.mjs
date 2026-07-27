/**
 * Generate the public `sitemap.json` build artifact from the single source of
 * truth (`src/app/features/sitemap/site-map.data.json`).
 *
 * This is the decoupled contract consumed by the backend `pos-mcp-server`:
 *   - The frontend OWNS the site structure and publishes it as a read-only,
 *     versioned JSON artifact served at `/sitemap.json`.
 *   - `pos-mcp-server` PULLS that artifact (or bakes it in at deploy time).
 *   - Neither repo imports the other; the only shared thing is the JSON schema
 *     documented in `docs/sitemap/`.
 *
 * i18n title/description keys are resolved to the base (en-US) locale so the
 * artifact is self-contained — the key is preserved alongside the resolved text
 * so consumers can re-localize if they choose.
 *
 * Usage: node scripts/sitemap/generate-sitemap.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const sourcePath = path.join(
  repoRoot,
  'src',
  'app',
  'features',
  'sitemap',
  'site-map.data.json',
);
const baseLocalePath = path.join(repoRoot, 'src', 'assets', 'i18n', 'en-US.json');
const outputPath = path.join(repoRoot, 'public', 'sitemap.json');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Resolve a dotted translation key (e.g. `SHELL.NAV.CRM`) against a locale tree. */
function resolveKey(tree, key) {
  const value = key.split('.').reduce((node, part) => {
    if (node && typeof node === 'object' && part in node) {
      return node[part];
    }
    return undefined;
  }, tree);
  return typeof value === 'string' ? value : null;
}

/** Group precedence — must match GROUP_ORDER in sitemap-page.component.ts. */
const GROUP_ORDER = ['main', 'admin'];

const source = loadJson(sourcePath);
const baseLocale = loadJson(baseLocalePath);

const missingKeys = [];

const sections = source.sections.map(section => {
  const title = resolveKey(baseLocale, section.titleKey);
  const description = resolveKey(baseLocale, section.descriptionKey);
  if (title === null) missingKeys.push(section.titleKey);
  if (description === null) missingKeys.push(section.descriptionKey);

  return {
    route: section.route,
    titleKey: section.titleKey,
    title: title ?? section.titleKey,
    descriptionKey: section.descriptionKey,
    description: description ?? section.descriptionKey,
    ...(section.roles ? { roles: section.roles } : {}),
    group: section.group,
    order: section.order,
  };
});

if (missingKeys.length > 0) {
  console.error('FAIL sitemap generation: missing i18n keys in en-US.json:');
  for (const key of missingKeys) {
    console.error(`  - ${key}`);
  }
  process.exit(1);
}

const artifact = {
  application: source.application,
  version: source.version,
  generatedAt: new Date().toISOString(),
  // Serialize by (group, order) so the artifact ordering matches the rendered
  // page, which groups main before admin then sorts by order within each group.
  sections: sections.sort((a, b) => {
    const byGroup = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
    return byGroup !== 0 ? byGroup : a.order - b.order;
  }),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(
  `Generated ${path.relative(repoRoot, outputPath)} (${sections.length} sections) from site-map.data.json.`,
);
