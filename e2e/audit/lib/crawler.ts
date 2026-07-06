import type { Page, Response } from '@playwright/test';
import { AUDIT_CONFIG } from './config';
import { LONG_HEX_SEGMENT, NUMERIC_SEGMENT, PREFIXED_ID_SEGMENT, UUID_SEGMENT } from './id-patterns';
import type { FailedRequest, PageOutcome } from './types';

/** File extensions the crawler must never navigate to. */
const SKIP_EXTENSIONS =
  /\.(pdf|csv|xlsx?|docx?|zip|tar|gz|png|jpe?g|gif|svg|webp|ico|mp4|webm|json|xml|txt)$/i;

/** Hrefs that would mutate state or leave the app — never followed. */
const SKIP_HREF = /(logout|signout|sign-out|log-out)/i;

/** Collapse id-like path segments so /invoices/123 and /invoices/456 count as one pattern. */
export function routePattern(pathname: string): string {
  return pathname
    .split('/')
    .map(seg =>
      UUID_SEGMENT.test(seg) ||
      NUMERIC_SEGMENT.test(seg) ||
      PREFIXED_ID_SEGMENT.test(seg) ||
      LONG_HEX_SEGMENT.test(seg)
        ? '{id}'
        : seg,
    )
    .join('/');
}

/** Normalize an absolute or relative href to an in-app path, or null if out of scope. */
export function normalizeHref(href: string, baseUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(href, baseUrl + '/');
  } catch {
    return null;
  }
  if (url.origin !== new URL(baseUrl).origin) return null;
  if (SKIP_EXTENSIONS.test(url.pathname) || SKIP_HREF.test(url.pathname)) return null;
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  // Query strings are dropped: Angular routes here are path-based, and keeping
  // queries would let filter/pagination params explode the crawl frontier.
  return pathname;
}

export interface VisitResult {
  finalPath: string;
  httpStatus: number | null;
  outcome: PageOutcome;
  title: string;
  h1: string | null;
  loadMs: number;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: FailedRequest[];
  /** In-app paths harvested from anchors on the page (only when audited). */
  links: string[];
}

export interface PageMonitors {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: FailedRequest[];
  reset(): void;
}

/**
 * Attach console / uncaught-exception / failed-request listeners once per Page.
 * Call reset() before each navigation; read the arrays after the page settles.
 */
export function attachMonitors(page: Page): PageMonitors {
  const monitors: PageMonitors = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    reset() {
      this.consoleErrors.length = 0;
      this.pageErrors.length = 0;
      this.failedRequests.length = 0;
    },
  };

  page.on('console', msg => {
    if (msg.type() === 'error') monitors.consoleErrors.push(msg.text().slice(0, 500));
  });
  page.on('pageerror', err => {
    monitors.pageErrors.push(String(err.message ?? err).slice(0, 500));
  });
  page.on('response', (res: Response) => {
    if (res.status() >= 400) {
      monitors.failedRequests.push({
        url: res.url().slice(0, 300),
        status: res.status(),
        resourceType: res.request().resourceType(),
      });
    }
  });
  page.on('requestfailed', req => {
    // Aborted requests are routine in SPAs (cancelled inflight calls); skip them.
    const failure = req.failure()?.errorText ?? '';
    if (failure.includes('ERR_ABORTED')) return;
    monitors.failedRequests.push({
      url: req.url().slice(0, 300),
      status: 'failed',
      resourceType: req.resourceType(),
    });
  });

  return monitors;
}

function classifyOutcome(requestedPath: string, finalPath: string, status: number | null): PageOutcome {
  if (status !== null && status >= 400) return 'http-error';
  if (finalPath.startsWith('/login') && !requestedPath.startsWith('/login')) return 'auth-required';
  if (finalPath.startsWith('/forbidden') && !requestedPath.startsWith('/forbidden')) return 'forbidden';
  if (finalPath.startsWith('/not-found') && !requestedPath.startsWith('/not-found')) return 'not-found';
  return 'audited';
}

/**
 * Navigate to one path and observe it. Read-only by design: the crawler only
 * issues GET navigations and never clicks, types, or submits anything.
 */
export async function visit(page: Page, monitors: PageMonitors, targetPath: string): Promise<VisitResult> {
  monitors.reset();
  const started = Date.now();
  let httpStatus: number | null;

  try {
    const response = await page.goto(AUDIT_CONFIG.baseUrl + targetPath, {
      waitUntil: 'domcontentloaded',
      timeout: AUDIT_CONFIG.pageTimeoutMs,
    });
    httpStatus = response?.status() ?? null;
  } catch (err) {
    return {
      finalPath: targetPath,
      httpStatus: null,
      outcome: 'load-failed',
      title: '',
      h1: null,
      loadMs: Date.now() - started,
      consoleErrors: [...monitors.consoleErrors],
      pageErrors: [String(err).slice(0, 500), ...monitors.pageErrors],
      failedRequests: [...monitors.failedRequests],
      links: [],
    };
  }

  // Let lazy chunks, effects and API calls settle.
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(AUDIT_CONFIG.settleMs);

  const loadMs = Date.now() - started;
  const finalPath = new URL(page.url()).pathname.replace(/\/+$/, '') || '/';
  const outcome = classifyOutcome(targetPath, finalPath, httpStatus);

  const { title, h1, hrefs } = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector('h1')?.textContent?.trim() ?? null,
    hrefs: Array.from(document.querySelectorAll('a[href]')).map(
      a => (a as HTMLAnchorElement).getAttribute('href') ?? '',
    ),
  }));

  const links =
    outcome === 'audited'
      ? [...new Set(hrefs.map(h => normalizeHref(h, AUDIT_CONFIG.baseUrl)).filter((p): p is string => !!p))]
      : [];

  return {
    finalPath,
    httpStatus,
    outcome,
    title,
    h1,
    loadMs,
    consoleErrors: [...monitors.consoleErrors],
    pageErrors: [...monitors.pageErrors],
    failedRequests: [...monitors.failedRequests],
    links,
  };
}
