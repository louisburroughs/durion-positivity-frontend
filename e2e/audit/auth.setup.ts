import fs from 'node:fs';
import path from 'node:path';
import { AUDIT_CONFIG, authModePath, authStatePath } from './lib/config';
import { test as setup } from './lib/persona-fixture';

/**
 * Logs in once per persona via the /login form and persists that persona's
 * browser storage state for its crawl. Selectors match
 * src/app/features/auth/login.component.html (#username, #password,
 * button[type=submit]).
 *
 * With AUDIT_SKIP_AUTH=1 or missing credentials, an unauthenticated state is
 * written instead and the crawl covers public pages only.
 */
setup('authenticate against target', async ({ page, persona }) => {
  const statePath = authStatePath(persona.id);
  const modePath = authModePath(persona.id);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });

  if (AUDIT_CONFIG.skipAuth || !persona.configured) {
    if (!AUDIT_CONFIG.skipAuth) {
      console.warn(
        `[${persona.id}] credentials not set — crawling public pages only. ` +
          `Set AUDIT_${persona.id === 'admin' ? '' : persona.id.toUpperCase() + '_'}USERNAME ` +
          'and the matching _PASSWORD to audit the authenticated /app area.',
      );
    }
    await page.context().storageState({ path: statePath });
    fs.writeFileSync(modePath, JSON.stringify({ authenticated: false, persona: persona.id }));
    return;
  }

  await page.goto(AUDIT_CONFIG.baseUrl + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(persona.username);
  await page.locator('#password').fill(persona.password);
  await page.locator('form button[type="submit"]').click();

  // Successful login routes into the authenticated shell.
  await page.waitForURL('**/app**', { timeout: AUDIT_CONFIG.pageTimeoutMs });

  await page.context().storageState({ path: statePath });
  fs.writeFileSync(modePath, JSON.stringify({ authenticated: true, persona: persona.id }));
});
