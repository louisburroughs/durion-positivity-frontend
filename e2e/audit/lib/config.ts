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

/**
 * Route access is role-gated (`data: { roles: [...] }` + rolesChildGuard), so a
 * crawl only covers what its account can reach. Each persona is audited as its
 * own Playwright project with its own login, storage state and report.
 *
 * Credentials come from `AUDIT_<PREFIX>USERNAME` / `AUDIT_<PREFIX>PASSWORD`,
 * falling back to the matching `ITEST_*` names so an existing integration-test
 * env file can be sourced as-is:
 *
 *   set -a; . ~/path/.env.itest; set +a; AUDIT_PERSONAS=all npm run audit:site
 *
 * `admin` deliberately reads the unprefixed `AUDIT_USERNAME`/`AUDIT_PASSWORD`,
 * so single-persona runs keep working exactly as before.
 */
export interface AuditPersona {
  id: string;
  label: string;
  username: string;
  password: string;
  /** False when this persona's credentials are absent from the environment. */
  configured: boolean;
}

const PERSONA_DEFS: ReadonlyArray<{ id: string; label: string; envPrefix: string }> = [
  { id: 'admin', label: 'Administrator', envPrefix: '' },
  { id: 'advisor', label: 'Service advisor', envPrefix: 'ADVISOR_' },
  { id: 'tech', label: 'Technician', envPrefix: 'TECH_' },
  { id: 'manager', label: 'Shop manager', envPrefix: 'MANAGER_' },
  { id: 'acct', label: 'Accounting', envPrefix: 'ACCT_' },
  { id: 'parts', label: 'Parts', envPrefix: 'PARTS_' },
  { id: 'controller', label: 'Controller', envPrefix: 'CONTROLLER_' },
];

function credential(envPrefix: string, field: 'USERNAME' | 'PASSWORD'): string {
  return (
    process.env[`AUDIT_${envPrefix}${field}`] ??
    process.env[`ITEST_${envPrefix}${field}`] ??
    ''
  );
}

export const AUDIT_PERSONAS: readonly AuditPersona[] = PERSONA_DEFS.map(def => {
  const username = credential(def.envPrefix, 'USERNAME');
  const password = credential(def.envPrefix, 'PASSWORD');
  return {
    id: def.id,
    label: def.label,
    username,
    password,
    configured: !!username && !!password,
  };
});

export function personaById(id: string): AuditPersona {
  const persona = AUDIT_PERSONAS.find(p => p.id === id);
  if (!persona) {
    throw new Error(
      `Unknown audit persona '${id}'. Known personas: ${AUDIT_PERSONAS.map(p => p.id).join(', ')}`,
    );
  }
  return persona;
}

/**
 * `AUDIT_PERSONAS` selects which personas to crawl: a comma-separated list of
 * ids, or `all` for every persona with credentials present. Defaults to `admin`,
 * which is the pre-persona behaviour.
 */
export function selectedPersonas(): AuditPersona[] {
  const raw = (process.env['AUDIT_PERSONAS'] ?? 'admin').trim();

  if (raw.toLowerCase() === 'all') {
    return AUDIT_PERSONAS.filter(p => p.configured);
  }

  return raw
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
    .map(personaById);
}

/**
 * Reports are written per persona so one persona's crawl never overwrites
 * another's. A run of `admin` alone lands in `artifacts/audit/admin/`.
 */
export function personaOutDir(personaId: string): string {
  return path.join(AUDIT_CONFIG.outDir, personaId);
}

export function authStatePath(personaId: string): string {
  return path.join(personaOutDir(personaId), '.auth', 'state.json');
}

export function authModePath(personaId: string): string {
  return path.join(personaOutDir(personaId), '.auth', 'mode.json');
}
