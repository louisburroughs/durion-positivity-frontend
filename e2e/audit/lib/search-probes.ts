import type { Page } from '@playwright/test';
import { AUDIT_CONFIG } from './config';

/**
 * Search probes: type a generic term into landing-page record finders.
 *
 * Workorder, estimate and invoice lists only load through a typed search, so
 * the passive harvester (id-harvest.ts) never sees their ids unless some other
 * page happens to surface them (today's shop dashboard, dispatch board, WIP).
 * When the tenant has no work scheduled for today, every detail route behind
 * those ids goes unvisited.
 *
 * A probe navigates to a landing page, types each term into every search-mode
 * finder, and waits for the GET search response. The harvester already attached
 * to the page records the ids; the probe itself parses nothing. Searches are
 * read-only projections (the backend emits a search audit event, nothing else),
 * and the probe never selects a result, presses Enter, or submits a form.
 */

/**
 * Landing pages whose record finders return ids a PARAM_TEMPLATES entry accepts.
 * `/app/people` is deliberately absent: its finder rows identify people by a bare
 * `id` from people-contact, which no template takes, so probing it would add
 * requests and no routes.
 */
export const SEARCH_PROBE_PATHS: readonly string[] = ['/app/workexec', '/app/billing', '/app/crm'];

/** Search-mode finder inputs only; id-mode finders do no lookup. */
const FINDER_INPUT = 'input.landing-finder__input[role="combobox"]';

/** Covers the finder's 250 ms debounce plus a slow search round trip. */
const SEARCH_RESPONSE_TIMEOUT_MS = 8_000;

/**
 * True for an API request carrying `term` as a query value. Finders call
 * different endpoints (`/search?q=`, `/people?search=`), so match on the term
 * rather than the path.
 */
export function isSearchFor(url: string, term: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!parsed.pathname.includes('/api/')) return false;
  return [...parsed.searchParams.values()].includes(term);
}

export interface SearchProbeResult {
  path: string;
  /** Finder inputs found on the landing page. */
  finders: number;
  /** Searches that returned a 2xx response within the timeout. */
  responses: number;
}

/**
 * Probe one landing page. Pages the persona cannot open (redirect to
 * /forbidden or /login) report zero finders and are otherwise skipped.
 */
export async function probeSearch(
  page: Page,
  path: string,
  terms: readonly string[],
  options: { responseTimeoutMs?: number } = {},
): Promise<SearchProbeResult> {
  const responseTimeoutMs = options.responseTimeoutMs ?? SEARCH_RESPONSE_TIMEOUT_MS;
  const result: SearchProbeResult = { path, finders: 0, responses: 0 };
  try {
    await page.goto(AUDIT_CONFIG.baseUrl + path, {
      waitUntil: 'domcontentloaded',
      timeout: AUDIT_CONFIG.pageTimeoutMs,
    });
  } catch {
    return result;
  }
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);

  const inputs = page.locator(FINDER_INPUT);
  result.finders = await inputs.count();

  for (let i = 0; i < result.finders; i++) {
    const input = inputs.nth(i);
    for (const term of terms) {
      const response = page
        .waitForResponse(res => res.request().method() === 'GET' && isSearchFor(res.url(), term), {
          timeout: responseTimeoutMs,
        })
        .catch(() => null);
      await input.fill(term).catch(() => undefined);
      const res = await response;
      if (res?.ok()) result.responses++;
    }
    await input.fill('').catch(() => undefined);
  }
  return result;
}
