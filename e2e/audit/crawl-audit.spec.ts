import fs from 'node:fs';
import { test } from '@playwright/test';
import { AUDIT_CONFIG, AUTH_MODE_PATH } from './lib/config';
import { attachMonitors, routePattern, visit } from './lib/crawler';
import { monitorFindings, runPageChecks } from './lib/checks';
import { APP_SEEDS, PUBLIC_SEEDS } from './lib/route-seeds';
import { emptyCounts, tallyFindings, writeReports } from './lib/report';
import type { AuditReport, Finding, PageRecord } from './lib/types';

// One long-running test drives the whole crawl; per-page navigation timeouts
// bound each step, and AUDIT_MAX_PAGES bounds the total.
test.describe.configure({ timeout: 0 });

test('crawl site and audit every page', async ({ page }) => {
  const authenticated: boolean = JSON.parse(
    fs.readFileSync(AUTH_MODE_PATH, 'utf8'),
  ).authenticated;

  const seeds = authenticated ? [...PUBLIC_SEEDS, ...APP_SEEDS] : [...PUBLIC_SEEDS];
  const queue: Array<{ path: string; from: string | null }> = seeds.map(s => ({
    path: s,
    from: null,
  }));

  const monitors = attachMonitors(page);
  const visited = new Set<string>();
  const patternCounts = new Map<string, number>();
  const pages: PageRecord[] = [];
  const findings: Finding[] = [];
  const startedAt = new Date().toISOString();

  while (queue.length > 0 && pages.length < AUDIT_CONFIG.maxPages) {
    const { path: target, from } = queue.shift()!;
    if (visited.has(target)) continue;
    visited.add(target);

    const pattern = routePattern(target);
    const seenForPattern = patternCounts.get(pattern) ?? 0;
    // Sample at most N concrete instances of each parameterized route so one
    // long invoice list doesn't consume the whole crawl budget.
    if (pattern.includes('{id}') && seenForPattern >= AUDIT_CONFIG.maxPerPattern) continue;
    patternCounts.set(pattern, seenForPattern + 1);

    const result = await visit(page, monitors, target);
    console.log(
      `[${pages.length + 1}/${AUDIT_CONFIG.maxPages}] ${target} → ${result.outcome}` +
        (result.finalPath !== target ? ` (landed on ${result.finalPath})` : ''),
    );

    const record: PageRecord = {
      path: target,
      pattern,
      finalPath: result.finalPath,
      httpStatus: result.httpStatus,
      outcome: result.outcome,
      title: result.title,
      h1: result.h1,
      discoveredFrom: from,
      loadMs: result.loadMs,
      consoleErrors: result.consoleErrors,
      pageErrors: result.pageErrors,
      failedRequests: result.failedRequests,
      findingCounts: emptyCounts(),
    };
    pages.push(record);

    findings.push(...monitorFindings(result, target));

    if (result.outcome === 'audited') {
      findings.push(...(await runPageChecks(page, target)));
      for (const link of result.links) {
        if (!visited.has(link)) queue.push({ path: link, from: target });
      }
    } else if (result.outcome === 'http-error' || result.outcome === 'load-failed') {
      findings.push({
        ruleId: 'page-unreachable',
        severity: 'critical',
        page: target,
        summary: `Page failed to load (${result.outcome}, HTTP ${result.httpStatus ?? 'n/a'})`,
        evidence: result.pageErrors[0],
        recommendation: 'Investigate the route/server error; every route must render.',
      });
    } else if (result.outcome === 'not-found') {
      findings.push({
        ruleId: 'dangling-route',
        severity: 'high',
        page: target,
        summary: 'Route redirects to /not-found',
        evidence: from ? `Linked from ${from}` : 'Seed route from app.routes.ts',
        recommendation: from
          ? 'Fix or remove the broken link.'
          : 'Route exists in code but is not served — check deployment/routing.',
      });
    }
  }

  tallyFindings(pages, findings);

  const report: AuditReport = {
    baseUrl: AUDIT_CONFIG.baseUrl,
    startedAt,
    finishedAt: new Date().toISOString(),
    authenticated,
    pagesVisited: pages.length,
    pages,
    findings,
    unvisitedSeeds: seeds.filter(s => !visited.has(s)),
  };

  const outDir = writeReports(report);
  console.log(`\nAudit complete: ${pages.length} pages, ${findings.length} findings.`);
  console.log(`Reports written to ${outDir}`);
});
