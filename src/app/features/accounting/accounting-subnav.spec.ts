import { Route } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { ACCOUNTING_ROUTES } from './accounting.routes';
import { ACCOUNTING_SUBNAV } from './accounting-subnav';

/**
 * A sub-navigation entry is an offer to open a page, so it has to answer to the
 * same gate as the route behind it: an entry looser than its route moves the
 * dead end to a /forbidden redirect, and a stricter one hides a page the
 * session can open (§5.0, §8.1).
 */
describe('ACCOUNTING_SUBNAV', () => {
  const children: readonly Route[] = ACCOUNTING_ROUTES[0].children ?? [];

  it.each(ACCOUNTING_SUBNAV.map(entry => [entry.route || '(home)', entry] as const))(
    '%s points at a route in ACCOUNTING_ROUTES with the same permissions',
    (_name, entry) => {
      const route = children.find(child => child.path === entry.route && !child.redirectTo);

      expect(route, `no accounting route at '${entry.route}'`).toBeDefined();
      expect(entry.permissions ?? []).toEqual(route?.data?.['permissions'] ?? []);
    },
  );

  it('lists the phase-1 entries in §5.0 order', () => {
    expect(ACCOUNTING_SUBNAV.map(entry => entry.route)).toEqual([
      '',
      'payables/vendor-invoices',
      'bank-accounts',
      'periods',
    ]);
  });

  it('keeps every label under ACCOUNTING.SHELL.NAV', () => {
    for (const entry of ACCOUNTING_SUBNAV) {
      expect(entry.labelKey.startsWith('ACCOUNTING.SHELL.NAV.')).toBe(true);
    }
  });
});
