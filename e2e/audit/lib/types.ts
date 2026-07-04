/**
 * Shared types for the site audit crawl.
 *
 * Severity model (used to rank the findings inventory):
 *   critical — page is broken for users (uncaught JS error, 5xx, document failed to load)
 *   high     — policy violation with direct user impact (UUID on screen, ID-keyed search,
 *              raw i18n key rendered, failed API call, axe "critical" a11y violation)
 *   medium   — convention/ADR violation or degraded UX (ADR-0037 anchor-as-action,
 *              axe "serious", suspicious rendered tokens, 404 assets)
 *   low      — polish / drift from design guidelines (fonts, theme tokens, missing h1)
 *   info     — advisory only
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export const SEVERITY_ORDER: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export interface Finding {
  /** Stable rule identifier, e.g. "uuid-on-screen". */
  ruleId: string;
  severity: Severity;
  /** Path of the page the finding was observed on, e.g. "/app/crm/customers". */
  page: string;
  /** One-line statement of the defect. */
  summary: string;
  /** Concrete evidence: matched text, selector, URL, etc. */
  evidence?: string;
  /** What to change. */
  recommendation: string;
  /** ADR / design-guideline reference, if any. */
  reference?: string;
}

export type PageOutcome =
  | 'audited' // page loaded and all checks ran
  | 'auth-required' // redirected to /login (crawler not authenticated for it)
  | 'forbidden' // redirected to /forbidden (role-gated for current user)
  | 'not-found' // redirected to /not-found
  | 'http-error' // document response was >= 400
  | 'load-failed'; // navigation threw (timeout, net error)

export interface FailedRequest {
  url: string;
  status: number | 'failed';
  resourceType: string;
}

export interface PageRecord {
  /** Normalized path that was requested (no origin, no query, no hash). */
  path: string;
  /** Path with id-like segments collapsed, e.g. "/app/billing/invoices/{id}". */
  pattern: string;
  /** Path the browser ended up on after client/server redirects. */
  finalPath: string;
  httpStatus: number | null;
  outcome: PageOutcome;
  title: string;
  h1: string | null;
  /** Page that linked to this one; null for seed routes. */
  discoveredFrom: string | null;
  loadMs: number;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: FailedRequest[];
  /** Finding counts by severity for the sitemap table. */
  findingCounts: Record<Severity, number>;
}

export interface AuditReport {
  baseUrl: string;
  startedAt: string;
  finishedAt: string;
  authenticated: boolean;
  pagesVisited: number;
  pages: PageRecord[];
  findings: Finding[];
  /** Seed routes that were never reached (crawl cap hit, etc.). */
  unvisitedSeeds: string[];
}
