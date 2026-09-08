#!/usr/bin/env node
/**
 * generate-permission-catalog.mjs
 * -------------------------------
 * Regenerates `src/app/core/security/permission-catalog.ts` from the backend's
 * `PermissionCode` enum, which is the authoritative bit-index → permission-code
 * mapping used to encode the JWT `perm_bits` claim (ADR-0040).
 *
 * The frontend cannot derive this mapping at runtime: the security service
 * exposes `GET /v1/permissions/catalog-version` and `POST /v1/permissions/decode`,
 * but no endpoint that returns the whole catalog. So the mapping is vendored and
 * refreshed with this script whenever the backend catalog version changes.
 *
 * Usage:
 *   node scripts/security/generate-permission-catalog.mjs [path-to-backend-repo]
 *
 * Backend source resolved in order:
 *   DURION_BACKEND_PATH env → argv[2] → ../durion-positivity-backend
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

const ENUM_RELATIVE_PATH = join(
  'pos-security-service', 'src', 'main', 'java', 'com', 'positivity',
  'securityservice', 'internal', 'enums', 'PermissionCode.java',
);
const OUTPUT_PATH = join(REPO_ROOT, 'src', 'app', 'core', 'security', 'permission-catalog.ts');

const backendRoot = resolve(
  process.env['DURION_BACKEND_PATH'] ?? process.argv[2] ?? join(REPO_ROOT, '..', 'durion-positivity-backend'),
);
const enumPath = join(backendRoot, ENUM_RELATIVE_PATH);

if (!existsSync(enumPath)) {
  console.error(`[permission-catalog] PermissionCode.java not found at ${enumPath}`);
  console.error('[permission-catalog] Pass the backend repo path as argv[2] or set DURION_BACKEND_PATH.');
  process.exit(1);
}

const source = readFileSync(enumPath, 'utf8');

const versionMatch = source.match(/CATALOG_VERSION\s*=\s*(\d+)/);
if (!versionMatch) {
  console.error('[permission-catalog] Could not find CATALOG_VERSION in PermissionCode.java');
  process.exit(1);
}
const catalogVersion = Number(versionMatch[1]);

// Enum constants look like:  ACCOUNTING__JE__VIEW(0, "accounting:je:view"),
const entries = [...source.matchAll(/^\s{4}[A-Za-z0-9_]+\(\s*(\d+)\s*,\s*"([^"]+)"\s*\)/gm)]
  .map(([, bitIndex, code]) => ({ bitIndex: Number(bitIndex), code }));

if (!entries.length) {
  console.error('[permission-catalog] No permission constants parsed — enum format may have changed.');
  process.exit(1);
}

const byBit = [];
for (const { bitIndex, code } of entries) {
  if (byBit[bitIndex] !== undefined) {
    console.error(`[permission-catalog] Duplicate bit index ${bitIndex}: ${byBit[bitIndex]} and ${code}`);
    process.exit(1);
  }
  byBit[bitIndex] = code;
}

const missing = [];
for (let i = 0; i < byBit.length; i += 1) {
  if (byBit[i] === undefined) missing.push(i);
}
if (missing.length) {
  console.error(`[permission-catalog] Bit indexes are not contiguous; missing: ${missing.join(', ')}`);
  process.exit(1);
}

const lines = byBit.map(code => `  '${code}',`).join('\n');

const output = `/**
 * permission-catalog.ts
 * ---------------------
 * GENERATED FILE — do not edit by hand.
 *
 * Regenerate with:
 *   node scripts/security/generate-permission-catalog.mjs [path-to-backend-repo]
 *
 * Mirrors the backend's \`PermissionCode\` enum (pos-security-service), which
 * assigns each permission code a permanent bit index. Those indexes are the
 * encoding of the JWT \`perm_bits\` claim (ADR-0040) and are never reused or
 * renumbered — retired permissions keep their index and are marked deprecated
 * on the backend. That permanence is what lets the frontend decode a token
 * issued under a different catalog version than the one vendored here.
 *
 * Source of truth: durion-positivity-backend
 *   pos-security-service/.../enums/PermissionCode.java
 * Cross-checked against the gateway's own copy of the same ordering:
 *   pos-api-gateway/.../config/GatewayPermissionCatalog.java
 */

/** Backend \`PermissionCode.CATALOG_VERSION\` this file was generated from. */
export const PERMISSION_CATALOG_VERSION = ${catalogVersion};

/**
 * Permission code by \`perm_bits\` bit index. The array index IS the bit index.
 */
export const PERMISSION_BY_BIT: readonly string[] = [
${lines}
];
`;

writeFileSync(OUTPUT_PATH, output, 'utf8');
console.log(
  `[permission-catalog] Wrote ${byBit.length} permission codes (catalog version ${catalogVersion}) to ${OUTPUT_PATH}`,
);
