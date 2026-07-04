import path from 'node:path';

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * All knobs are environment variables so the same suite runs against
 * durionpos.org, a staging host, or a local dev server without code changes.
 *
 *   AUDIT_BASE_URL         target origin        (default https://durionpos.org)
 *   AUDIT_USERNAME         login username       (required unless AUDIT_SKIP_AUTH=1)
 *   AUDIT_PASSWORD         login password       (required unless AUDIT_SKIP_AUTH=1)
 *   AUDIT_SKIP_AUTH=1      crawl public pages only
 *   AUDIT_MAX_PAGES        crawl cap            (default 200)
 *   AUDIT_MAX_PER_PATTERN  instances of one route pattern to sample (default 2)
 *   AUDIT_SETTLE_MS        extra wait after network idle for signals/effects (default 1200)
 *   AUDIT_PAGE_TIMEOUT_MS  per-page navigation timeout (default 30000)
 *   AUDIT_OUT_DIR          report output dir    (default artifacts/audit)
 */
export const AUDIT_CONFIG = {
  baseUrl: (process.env['AUDIT_BASE_URL'] ?? 'https://durionpos.org').replace(/\/+$/, ''),
  username: process.env['AUDIT_USERNAME'] ?? '',
  password: process.env['AUDIT_PASSWORD'] ?? '',
  skipAuth: process.env['AUDIT_SKIP_AUTH'] === '1',
  maxPages: intEnv('AUDIT_MAX_PAGES', 200),
  maxPerPattern: intEnv('AUDIT_MAX_PER_PATTERN', 2),
  settleMs: intEnv('AUDIT_SETTLE_MS', 1200),
  pageTimeoutMs: intEnv('AUDIT_PAGE_TIMEOUT_MS', 30_000),
  outDir: process.env['AUDIT_OUT_DIR'] ?? path.join('artifacts', 'audit'),
} as const;

export const AUTH_STATE_PATH = path.join(AUDIT_CONFIG.outDir, '.auth', 'state.json');
export const AUTH_MODE_PATH = path.join(AUDIT_CONFIG.outDir, '.auth', 'mode.json');
