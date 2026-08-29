import { test as base } from '@playwright/test';
import { AuditPersona, personaById } from './config';

/**
 * Carries the persona under audit from the Playwright project into the setup
 * and crawl tests. Declared as an option (not a plain fixture) so each project
 * sets it in `use: { personaId: '...' }`, the same way Playwright's own options
 * are configured.
 */
export interface AuditOptions {
  personaId: string;
}

export const test = base.extend<AuditOptions & { persona: AuditPersona }>({
  personaId: ['admin', { option: true }],

  persona: async ({ personaId }, run) => {
    await run(personaById(personaId));
  },
});

export { expect } from '@playwright/test';
