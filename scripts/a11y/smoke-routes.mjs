#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

const BASE_URL = process.env.A11Y_BASE_URL ?? 'http://127.0.0.1:4200';
const FAIL_ON_IMPACT = process.env.A11Y_FAIL_ON_IMPACT ?? 'critical';
const USE_EXISTING_SERVER = process.env.A11Y_USE_EXISTING_SERVER === '1';
const START_TIMEOUT_MS = Number(process.env.A11Y_START_TIMEOUT_MS ?? 120000);

const ROUTES = [
  '/app',
  '/app/crm',
  '/app/workexec/estimates/new',
  '/app/workexec/workorders/WO-123',
  '/app/accounting/events',
  '/app/accounting/vendor-payments',
  '/app/people/employees/EMP-123',
  '/app/location/locations',
];

const IMPACT_RANK = {
  critical: 4,
  serious: 3,
  moderate: 2,
  minor: 1,
  null: 0,
};

const reportDir = path.join(process.cwd(), 'artifacts', 'a11y');
const reportPath = path.join(reportDir, 'smoke-report.json');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status >= 200 && response.status < 500) {
        return;
      }
    } catch {
      // Keep waiting.
    }

    await sleep(1500);
  }

  throw new Error(`Timed out waiting for app server at ${url} after ${timeoutMs}ms.`);
}

function shouldFail(impact) {
  const threshold = IMPACT_RANK[FAIL_ON_IMPACT] ?? IMPACT_RANK.critical;
  const score = IMPACT_RANK[impact ?? 'null'] ?? 0;
  return score >= threshold;
}

async function scanRoute(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, {
    url,
    runScripts: 'outside-only',
    contentType: 'text/html',
  });

  dom.window.eval(axe.source);
  const results = await dom.window.axe.run(dom.window.document, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'],
    },
  });

  return {
    url,
    violations: results.violations.map(v => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      helpUrl: v.helpUrl,
      nodeCount: v.nodes.length,
    })),
    passes: results.passes.length,
    incomplete: results.incomplete.length,
    inapplicable: results.inapplicable.length,
  };
}

function startDevServer() {
  return spawn('npm', ['run', 'start', '--', '--host', '127.0.0.1', '--port', '4200'], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
}

async function stopDevServer(devServer) {
  if (!devServer?.pid) {
    return;
  }

  try {
    process.kill(-devServer.pid, 'SIGTERM');
  } catch {
    return;
  }

  await sleep(1200);

  try {
    process.kill(-devServer.pid, 0);
    process.kill(-devServer.pid, 'SIGKILL');
  } catch {
    // Process group already gone.
  }
}

async function main() {
  let devServer;

  try {
    if (!USE_EXISTING_SERVER) {
      devServer = startDevServer();
      devServer.stdout.on('data', chunk => process.stdout.write(`[dev-server] ${chunk}`));
      devServer.stderr.on('data', chunk => process.stderr.write(`[dev-server] ${chunk}`));

      await waitForServer(BASE_URL, START_TIMEOUT_MS);
    }

    const routeReports = [];
    for (const route of ROUTES) {
      const routeUrl = `${BASE_URL}${route}`;
      process.stdout.write(`Scanning ${routeUrl}\n`);
      routeReports.push(await scanRoute(routeUrl));
    }

    const allViolations = routeReports.flatMap(report =>
      report.violations.map(violation => ({
        route: report.url,
        ...violation,
      })),
    );

    const failingViolations = allViolations.filter(v => shouldFail(v.impact));
    const summary = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      routesScanned: ROUTES.length,
      failOnImpact: FAIL_ON_IMPACT,
      totalViolations: allViolations.length,
      failingViolations: failingViolations.length,
    };

    await mkdir(reportDir, { recursive: true });
    await writeFile(
      reportPath,
      JSON.stringify(
        {
          summary,
          routeReports,
          failingViolations,
        },
        null,
        2,
      ),
      'utf8',
    );

    process.stdout.write(`Accessibility smoke report written to ${reportPath}\n`);

    if (failingViolations.length > 0) {
      process.stderr.write(
        `Found ${failingViolations.length} accessibility violation(s) at or above ${FAIL_ON_IMPACT}.\n`,
      );
      process.exitCode = 1;
      return;
    }

    process.stdout.write('Accessibility smoke scan passed configured threshold.\n');
  } finally {
    await stopDevServer(devServer);
  }
}

main().catch(async error => {
  process.stderr.write(`a11y smoke run failed: ${error.message}\n`);

  await mkdir(reportDir, { recursive: true });
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        error: error.message,
      },
      null,
      2,
    ),
    'utf8',
  );

  process.exitCode = 2;
});
