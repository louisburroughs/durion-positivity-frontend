import fs from 'node:fs';
import path from 'node:path';
import { test as setup } from '@playwright/test';
import { AUDIT_CONFIG, AUTH_MODE_PATH, AUTH_STATE_PATH } from './lib/config';

/**
 * Logs in once via the /login form and persists the browser storage state for
 * the crawl. Selectors match src/app/features/auth/login.component.html
 * (#username, #password, button[type=submit]).
 *
 * With AUDIT_SKIP_AUTH=1 or missing credentials, an unauthenticated state is
 * written instead and the crawl covers public pages only.
 */
setup('authenticate against target', async ({ page }) => {
  fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });

  const haveCreds = !!AUDIT_CONFIG.username && !!AUDIT_CONFIG.password;
  if (AUDIT_CONFIG.skipAuth || !haveCreds) {
    if (!AUDIT_CONFIG.skipAuth) {
      console.warn(
        'AUDIT_USERNAME / AUDIT_PASSWORD not set — crawling public pages only. ' +
          'Set both env vars to audit the authenticated /app area.',
      );
    }
    await page.context().storageState({ path: AUTH_STATE_PATH });
    fs.writeFileSync(AUTH_MODE_PATH, JSON.stringify({ authenticated: false }));
    return;
  }

  await page.goto(AUDIT_CONFIG.baseUrl + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(AUDIT_CONFIG.username);
  await page.locator('#password').fill(AUDIT_CONFIG.password);
  await page.locator('form button[type="submit"]').click();

  // Successful login routes into the authenticated shell.
  await page.waitForURL('**/app**', { timeout: AUDIT_CONFIG.pageTimeoutMs });

  await page.context().storageState({ path: AUTH_STATE_PATH });
  fs.writeFileSync(AUTH_MODE_PATH, JSON.stringify({ authenticated: true }));
});
