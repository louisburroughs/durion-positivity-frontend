import fs from 'node:fs';
import { AUDIT_CONFIG, authModePath, personaOutDir } from './lib/config';
import { test } from './lib/persona-fixture';
import { attachMonitors, routePattern, visit } from './lib/crawler';
import { monitorFindings, runPageChecks } from './lib/checks';
import { attachIdHarvester, fillTemplates, templateCoverage, templateFields } from './lib/id-harvest';
import { APP_SEEDS, PARAM_TEMPLATES, PUBLIC_SEEDS } from './lib/route-seeds';
import { applyAcceptedFindings } from './lib/accepted-findings';
import { emptyCounts, tallyFindings, writeReports } from './lib/report';
import type { AuditReport, Finding, PageRecord } from './lib/types';

// One long-running test drives the whole crawl; per-page navigation timeouts
// bound each step, and AUDIT_MAX_PAGES bounds the total.
test.describe.configure({ timeout: 0 });

test('crawl site and audit every page', async ({ page, persona }) => {
  const authenticated: boolean = JSON.parse(
    fs.readFileSync(authModePath(persona.id), 'utf8'),
  ).authenticated;

  const seeds = authenticated ? [...PUBLIC_SEEDS, ...APP_SEEDS] : [...PUBLIC_SEEDS];
  const queue: Array<{ path: string; from: string | null }> = seeds.map(s => ({
    path: s,
    from: null,
  }));

  const monitors = attachMonitors(page);
  // Refill only makes sense when /app pages (and their API calls) are reachable.
  const harvester = authenticated
    ? attachIdHarvester(page, templateFields(PARAM_TEMPLATES))
    : null;
  const generatedByTemplate = new Map<string, Set<string>>();
  const visited = new Set<string>();
  const patternCounts = new Map<string, number>();
  const pages: PageRecord[] = [];
  const findings: Finding[] = [];
  const startedAt = new Date().toISOString();

  // When anchor-based discovery runs dry, fill parameterized route templates
  // with entity ids harvested from the API responses already observed.
  const refillFromHarvest = (): boolean => {
    if (!harvester) return false;
    const fresh = fillTemplates(
      PARAM_TEMPLATES,
      harvester.harvest,
      AUDIT_CONFIG.maxPerPattern,
      generatedByTemplate,
    ).filter(p => !visited.has(p));
    for (const p of fresh) queue.push({ path: p, from: '(api id harvest)' });
    return fresh.length > 0;
  };

  while (pages.length < AUDIT_CONFIG.maxPages) {
    if (queue.length === 0) {
      if (!harvester) break;
      // Body parsing runs detached; wait for in-flight responses before
      // deciding the harvest has nothing more to offer.
      await harvester.idle();
      if (!refillFromHarvest()) break;
      continue;
    }
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
      `[${persona.id}] [${pages.length + 1}/${AUDIT_CONFIG.maxPages}] ${target} → ${result.outcome}` +
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

  const finalFindings = applyAcceptedFindings(findings);
  tallyFindings(pages, finalFindings);

  const report: AuditReport = {
    baseUrl: AUDIT_CONFIG.baseUrl,
    persona: { id: persona.id, label: persona.label },
    startedAt,
    finishedAt: new Date().toISOString(),
    authenticated,
    pagesVisited: pages.length,
    pages,
    findings: finalFindings,
    unvisitedSeeds: seeds.filter(s => !visited.has(s)),
    templateCoverage: templateCoverage(
      PARAM_TEMPLATES,
      harvester?.harvest ?? new Map(),
      generatedByTemplate,
    ),
  };

  const outDir = writeReports(report, personaOutDir(persona.id));
  console.log(
    `\n[${persona.id}] Audit complete: ${pages.length} pages, ${findings.length} findings.`,
  );
  console.log(`Reports written to ${outDir}`);
});
