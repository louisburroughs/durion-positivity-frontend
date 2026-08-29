import fs from 'node:fs';
import path from 'node:path';
import { AUDIT_CONFIG } from './config';
import { AuditReport, Finding, PageRecord, SEVERITY_ORDER, Severity } from './types';

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

function md(text: string | null | undefined): string {
  return (text ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function countsCell(c: Record<Severity, number>): string {
  const parts = SEVERITY_ORDER.filter(s => c[s] > 0).map(s => `${c[s]}${s[0].toUpperCase()}`);
  return parts.length ? parts.join(' ') : '—';
}

function sitemapMarkdown(report: AuditReport): string {
  const lines: string[] = [
    '# Site Map — audit crawl',
    '',
    `- **Target:** ${report.baseUrl}`,
    `- **Persona:** ${report.persona.label} (\`${report.persona.id}\`)`,
    `- **Crawled:** ${report.startedAt} → ${report.finishedAt}`,
    `- **Authenticated:** ${report.authenticated ? 'yes' : 'no (public pages only)'}`,
    `- **Pages visited:** ${report.pagesVisited}`,
    '',
    'Finding counts are abbreviated by severity: C critical · H high · M medium · L low · I info.',
    '',
    '| Path | Pattern | Outcome | HTTP | Title | Load (ms) | Findings | Discovered from |',
    '|---|---|---|---|---|---|---|---|',
  ];
  const sorted = [...report.pages].sort((a, b) => a.path.localeCompare(b.path));
  for (const p of sorted) {
    lines.push(
      `| ${md(p.path)} | ${md(p.pattern)} | ${p.outcome} | ${p.httpStatus ?? '—'} | ` +
        `${md(p.title)} | ${p.loadMs} | ${countsCell(p.findingCounts)} | ${md(p.discoveredFrom) || 'seed'} |`,
    );
  }
  if (report.unvisitedSeeds.length > 0) {
    lines.push('', '## Seeds not visited (crawl cap reached)', '');
    for (const s of report.unvisitedSeeds) lines.push(`- ${s}`);
  }

  if (report.templateCoverage.length > 0) {
    const outcomeByPath = new Map(report.pages.map(p => [p.path, p.outcome]));
    lines.push(
      '',
      '## Parameterized route coverage (api-harvested ids)',
      '',
      'Detail routes are filled with real entity ids observed in the API responses',
      'the crawled pages made. "no ids observed" means no page the crawl reached',
      'returned data for that entity — the route needs a manual seed or test data.',
      '',
      '| Route template | Instances audited | Notes |',
      '|---|---|---|',
    );
    for (const t of [...report.templateCoverage].sort((a, b) => a.template.localeCompare(b.template))) {
      const visitedInstances = t.instances.filter(i => outcomeByPath.has(i));
      const note =
        t.missingParams.length > 0
          ? `no ids observed for :${t.missingParams.join(', :')}`
          : t.instances.length > visitedInstances.length
            ? 'instances skipped (pattern already sampled via links, or crawl cap)'
            : '';
      lines.push(`| ${md(t.template)} | ${visitedInstances.length} | ${md(note)} |`);
    }
  }
  return lines.join('\n') + '\n';
}

function findingsMarkdown(report: AuditReport): string {
  const lines: string[] = [
    '# Recommended Changes — by severity',
    '',
    `Target: ${report.baseUrl} · persona ${report.persona.label} (\`${report.persona.id}\`) · ` +
      `${report.findings.length} findings across ${report.pagesVisited} pages.`,
    '',
  ];

  for (const severity of SEVERITY_ORDER) {
    const group = report.findings.filter(f => f.severity === severity);
    if (group.length === 0) continue;
    lines.push(`## ${SEVERITY_LABEL[severity]} (${group.length})`, '');
    lines.push('| Page | Rule | Finding | Evidence | Recommendation | Reference |');
    lines.push('|---|---|---|---|---|---|');
    const sorted = [...group].sort(
      (a, b) => a.ruleId.localeCompare(b.ruleId) || a.page.localeCompare(b.page),
    );
    for (const f of sorted) {
      lines.push(
        `| ${md(f.page)} | \`${f.ruleId}\` | ${md(f.summary)} | ${md(f.evidence).slice(0, 160)} | ` +
          `${md(f.recommendation)} | ${md(f.reference)} |`,
      );
    }
    lines.push('');
  }

  // Rollup: which rules fire most, to guide systemic fixes over page-by-page ones.
  const byRule = new Map<string, { count: number; severity: Severity }>();
  for (const f of report.findings) {
    const entry = byRule.get(f.ruleId) ?? { count: 0, severity: f.severity };
    entry.count += 1;
    byRule.set(f.ruleId, entry);
  }
  lines.push('## Rule rollup', '', '| Rule | Severity | Occurrences |', '|---|---|---|');
  for (const [rule, { count, severity }] of [...byRule.entries()].sort((a, b) => b[1].count - a[1].count)) {
    lines.push(`| \`${rule}\` | ${SEVERITY_LABEL[severity]} | ${count} |`);
  }
  return lines.join('\n') + '\n';
}

function errorPagesMarkdown(report: AuditReport): string {
  const broken = report.pages.filter(
    p =>
      p.outcome === 'http-error' ||
      p.outcome === 'load-failed' ||
      p.outcome === 'not-found' ||
      p.pageErrors.length > 0 ||
      p.consoleErrors.length > 0 ||
      p.failedRequests.length > 0,
  );
  const lines: string[] = [
    '# Pages with Errors',
    '',
    broken.length === 0
      ? 'No pages with errors were observed. ✅'
      : `${broken.length} of ${report.pagesVisited} visited pages showed errors.`,
    '',
  ];
  for (const p of [...broken].sort((a, b) => a.path.localeCompare(b.path))) {
    lines.push(`## ${p.path}`, '');
    lines.push(`- Outcome: **${p.outcome}** (HTTP ${p.httpStatus ?? 'n/a'}, final path \`${p.finalPath}\`)`);
    for (const e of p.pageErrors) lines.push(`- Uncaught exception: \`${md(e).slice(0, 200)}\``);
    for (const e of p.consoleErrors) lines.push(`- console.error: \`${md(e).slice(0, 200)}\``);
    for (const r of p.failedRequests) lines.push(`- ${r.resourceType} ${r.status}: ${md(r.url)}`);
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

function summaryMarkdown(report: AuditReport): string {
  const bySeverity = Object.fromEntries(SEVERITY_ORDER.map(s => [s, 0])) as Record<Severity, number>;
  for (const f of report.findings) bySeverity[f.severity] += 1;
  const errorPages = report.pages.filter(
    p => p.outcome !== 'audited' || p.pageErrors.length > 0 || p.failedRequests.length > 0,
  ).length;

  const coveredTemplates = report.templateCoverage.filter(t => t.instances.length > 0).length;

  return [
    '# Frontend Audit Summary',
    '',
    `- **Target:** ${report.baseUrl}`,
    `- **Persona:** ${report.persona.label} (\`${report.persona.id}\`)`,
    `- **Run:** ${report.startedAt} → ${report.finishedAt}`,
    `- **Pages visited:** ${report.pagesVisited} (authenticated: ${report.authenticated ? 'yes' : 'no'})`,
    `- **Detail-route templates covered:** ${coveredTemplates}/${report.templateCoverage.length} (see sitemap.md)`,
    `- **Pages with problems:** ${errorPages}`,
    '',
    '| Severity | Findings |',
    '|---|---|',
    ...SEVERITY_ORDER.map(s => `| ${SEVERITY_LABEL[s]} | ${bySeverity[s]} |`),
    '',
    'Details:',
    '',
    '- [sitemap.md](./sitemap.md) — every page reached, outcome and finding counts',
    '- [findings.md](./findings.md) — recommended changes ranked by severity',
    '- [error-pages.md](./error-pages.md) — pages with HTTP/JS/API errors',
    '- [report.json](./report.json) — full machine-readable results',
    '',
  ].join('\n');
}

export function writeReports(report: AuditReport, targetDir?: string): string {
  const outDir = path.resolve(targetDir ?? AUDIT_CONFIG.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, 'sitemap.md'), sitemapMarkdown(report));
  fs.writeFileSync(path.join(outDir, 'findings.md'), findingsMarkdown(report));
  fs.writeFileSync(path.join(outDir, 'error-pages.md'), errorPagesMarkdown(report));
  fs.writeFileSync(path.join(outDir, 'summary.md'), summaryMarkdown(report));
  return outDir;
}

export function emptyCounts(): Record<Severity, number> {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

export function tallyFindings(pages: PageRecord[], findings: Finding[]): void {
  const byPage = new Map<string, PageRecord>(pages.map(p => [p.path, p]));
  for (const f of findings) {
    const rec = byPage.get(f.page);
    if (rec) rec.findingCounts[f.severity] += 1;
  }
}
