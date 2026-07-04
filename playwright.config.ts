import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { AUDIT_CONFIG, AUTH_STATE_PATH } from './e2e/audit/lib/config';

/**
 * Playwright config for the site audit crawl (e2e/audit).
 *
 *   AUDIT_BASE_URL=https://durionpos.org AUDIT_USERNAME=... AUDIT_PASSWORD=... npm run audit:site
 *
 * The crawl is strictly read-only (GET navigations only), so it is safe to
 * point at production. See docs/testing/frontend-audit-test-plan.md.
 */

// Prefer Playwright's own browser install; fall back to a system-provided
// chromium (e.g. sandboxed CI images that pre-install one) when absent.
function chromiumExecutablePath(): string | undefined {
  if (process.env['AUDIT_CHROMIUM_PATH']) return process.env['AUDIT_CHROMIUM_PATH'];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { chromium } = require('playwright-core');
    if (fs.existsSync(chromium.executablePath())) return undefined;
  } catch {
    return undefined;
  }
  for (const candidate of ['/opt/pw-browsers/chromium', '/usr/bin/chromium']) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

export default defineConfig({
  testDir: 'e2e/audit',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: AUDIT_CONFIG.baseUrl,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    trace: 'off',
    launchOptions: { executablePath: chromiumExecutablePath() },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: chromiumExecutablePath() } },
    },
    {
      name: 'audit',
      testMatch: /crawl-audit\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: AUTH_STATE_PATH,
        launchOptions: { executablePath: chromiumExecutablePath() },
      },
    },
  ],
});
